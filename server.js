const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'arena_stats_secret_key_2024';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Создание таблиц
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                discord VARCHAR(100),
                game_nick VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                username VARCHAR(100),
                game_nick VARCHAR(100),
                kills INTEGER DEFAULT 0,
                damage INTEGER DEFAULT 0,
                kill_percent DECIMAL(10,2),
                damage_percent DECIMAL(10,2),
                video_link TEXT,
                screenshot TEXT,
                server VARCHAR(100),
                verified BOOLEAN DEFAULT false,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Создаём админа, если нет
        const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO users (username, password, role, game_nick) VALUES ($1, $2, $3, $4)',
                ['admin', hash, 'admin', 'Admin']
            );
            console.log('✅ Админ создан: admin / admin123');
        }

        console.log('✅ Таблицы созданы');
    } catch (err) {
        console.error('❌ Ошибка инициализации:', err.message);
    }
}

initDb();

// ========== API РОУТЫ ==========

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, discord, gameNick } = req.body;
        
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, discord, game_nick) VALUES ($1, $2, $3, $4) RETURNING id, username, discord, game_nick',
            [username, hashedPassword, discord, gameNick || username]
        );
        
        res.json({ message: 'Регистрация успешна', user: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                discord: user.discord,
                gameNick: user.game_nick,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверка токена
const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Нет токена' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Неверный токен' });
    }
};

// Получить профиль
app.get('/api/profile', auth, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, discord, game_nick, role FROM users WHERE id = $1', [req.user.id]);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Обновить профиль
app.put('/api/profile', auth, async (req, res) => {
    try {
        const { discord, gameNick } = req.body;
        await pool.query('UPDATE users SET discord = $1, game_nick = $2 WHERE id = $3', [discord, gameNick, req.user.id]);
        res.json({ message: 'Профиль обновлен' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Добавить статистику
app.post('/api/stats', auth, async (req, res) => {
    try {
        const { kills, damage, killPercent, damagePercent, videoLink, screenshot, server } = req.body;
        
        const userResult = await pool.query('SELECT username, game_nick FROM users WHERE id = $1', [req.user.id]);
        const user = userResult.rows[0];
        
        await pool.query(
            `INSERT INTO stats (user_id, username, game_nick, kills, damage, kill_percent, damage_percent, video_link, screenshot, server)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [req.user.id, user.username, user.game_nick, kills || 0, damage || 0, killPercent, damagePercent, videoLink, screenshot, server]
        );
        
        res.json({ message: 'Статистика добавлена' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Получить свою статистику
app.get('/api/stats/my', auth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM stats WHERE user_id = $1 ORDER BY date DESC', [req.user.id]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Получить всю статистику (админ)
app.get('/api/stats/all', auth, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows[0]?.role !== 'admin') {
            return res.status(403).json({ error: 'Нет прав' });
        }
        const result = await pool.query('SELECT * FROM stats ORDER BY date DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Подтвердить статистику (админ)
app.put('/api/stats/:id/verify', auth, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows[0]?.role !== 'admin') {
            return res.status(403).json({ error: 'Нет прав' });
        }
        await pool.query('UPDATE stats SET verified = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Подтверждено' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Удалить статистику (админ)
app.delete('/api/stats/:id', auth, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows[0]?.role !== 'admin') {
            return res.status(403).json({ error: 'Нет прав' });
        }
        await pool.query('DELETE FROM stats WHERE id = $1', [req.params.id]);
        res.json({ message: 'Удалено' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Лидерборд (только подтверждённые)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                user_id as id,
                username,
                game_nick,
                SUM(kills) as kills,
                SUM(damage) as damage,
                COUNT(*) as stats_count,
                MAX(video_link) as video_link
            FROM stats
            WHERE verified = true
            GROUP BY user_id, username, game_nick
            ORDER BY SUM(kills) DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.json([]);
    }
});

// Проверка статуса
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📱 Сайт доступен: http://localhost:${PORT}`);
});
