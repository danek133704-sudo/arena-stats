const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'arena_stats_secret_key_2024';

console.log('🚀 Запуск сервера...');
console.log('📦 Версия Node:', process.version);
console.log('🔧 Переменная DATABASE_URL:', process.env.DATABASE_URL ? '✅ установлена' : '❌ ОТСУТСТВУЕТ');

// Проверка, что папка public существует
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.error('❌ Папка public не найдена! Создаю...');
    fs.mkdirSync(publicPath, { recursive: true });
}
console.log('📁 Папка public:', fs.existsSync(publicPath) ? '✅ существует' : '❌ не найдена');

// Проверяем index.html
const indexPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error('❌ Файл index.html не найден в папке public!');
    // Создаём простой index.html если нет
    fs.writeFileSync(indexPath, '<!DOCTYPE html><html><head><title>Arena Stats</title></head><body><h1>Arena Stats</h1><p>Loading...</p></body></html>');
    console.log('📄 Создан временный index.html');
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Простая проверка подключения
if (!process.env.DATABASE_URL) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: DATABASE_URL не задана!');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Тест подключения
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Ошибка подключения к базе:', err.message);
        console.error('❌ Полная ошибка:', err);
    } else {
        console.log('✅ База данных подключена');
        release();
    }
});

// Простой маршрут для проверки
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// API маршруты
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, discord, gameNick } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, discord, game_nick, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username',
            [username, hashedPassword, discord, gameNick || username, 'user']
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error('Register error:', err);
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'Пользователь не найден' });
        
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Неверный пароль' });
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, discord: user.discord, gameNick: user.game_nick, role: user.role } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, game_nick, SUM(kills) as kills FROM stats WHERE verified = true GROUP BY username, game_nick ORDER BY kills DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.json([]);
    }
});

// ГЛАВНОЕ: простой ответ на корень
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Создание таблиц
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                discord TEXT,
                game_nick TEXT,
                role TEXT DEFAULT 'user'
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                username TEXT,
                game_nick TEXT,
                kills INTEGER,
                damage INTEGER,
                verified BOOLEAN DEFAULT false
            )
        `);
        
        // Создаём админа
        const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query('INSERT INTO users (username, password, role, game_nick) VALUES ($1, $2, $3, $4)', ['admin', hash, 'admin', 'Admin']);
            console.log('✅ Админ создан: admin / admin123');
        }
        console.log('✅ Таблицы готовы');
    } catch (err) {
        console.error('❌ Ошибка инициализации:', err.message);
    }
}

initDb();

// ЗАПУСК
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Сайт доступен: http://localhost:${PORT}`);
    console.log(`🔑 Админ: admin / admin123`);
});
