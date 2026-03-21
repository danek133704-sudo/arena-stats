const express = require('express');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Подключение к базе
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Простая проверка подключения
pool.connect((err) => {
    if (err) console.error('❌ Ошибка БД:', err.message);
    else console.log('✅ База данных подключена');
});

// Создание таблиц (если нет)
async function init() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                game_nick TEXT,
                role TEXT DEFAULT 'user'
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                username TEXT,
                kills INTEGER,
                damage INTEGER,
                verified BOOLEAN DEFAULT false
            )
        `);
        console.log('✅ Таблицы готовы');
    } catch(e) { console.error('Ошибка таблиц:', e.message); }
}
init();

// API для регистрации
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, gameNick } = req.body;
        const hash = require('bcryptjs').hashSync(password, 10);
        await pool.query(
            'INSERT INTO users (username, password, game_nick) VALUES ($1, $2, $3)',
            [username, hash, gameNick || username]
        );
        res.json({ success: true });
    } catch(e) {
        res.status(400).json({ error: e.message });
    }
});

// API для входа
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) throw new Error('Нет пользователя');
        const user = result.rows[0];
        const valid = require('bcryptjs').compareSync(password, user.password);
        if (!valid) throw new Error('Неверный пароль');
        const token = require('jsonwebtoken').sign({ id: user.id, username: user.username }, 'secret');
        res.json({ token, user: { id: user.id, username: user.username, gameNick: user.game_nick, role: user.role } });
    } catch(e) {
        res.status(400).json({ error: e.message });
    }
});

// API для статистики
app.post('/api/stats', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Нет токена');
        const decoded = require('jsonwebtoken').verify(token, 'secret');
        const { kills, damage } = req.body;
        await pool.query(
            'INSERT INTO stats (user_id, username, kills, damage) VALUES ($1, $2, $3, $4)',
            [decoded.id, decoded.username, kills, damage]
        );
        res.json({ success: true });
    } catch(e) {
        res.status(400).json({ error: e.message });
    }
});

// API для лидерборда
app.get('/api/leaderboard', async (req, res) => {
    const result = await pool.query(`
        SELECT username, game_nick, SUM(kills) as kills, SUM(damage) as damage
        FROM stats WHERE verified = true
        GROUP BY username, game_nick
        ORDER BY kills DESC LIMIT 20
    `);
    res.json(result.rows);
});

// Главная
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

app.listen(PORT, () => console.log(`✅ Сервер на порту ${PORT}`));
