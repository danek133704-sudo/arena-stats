const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'arena_stats_secret_key_2024';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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
                kills INTEGER,
                kill_percent DECIMAL(10,2),
                damage_percent DECIMAL(10,2),
                damage INTEGER,
                video_link TEXT,
                screenshot TEXT,
                server VARCHAR(100),
                verified BOOLEAN DEFAULT false,
                verified_by INTEGER,
                verified_at TIMESTAMP,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO users (username, password, role, game_nick) VALUES ($1, $2, $3, $4)',
                ['admin', hash, 'admin', 'Admin']
            );
            console.log('Admin created');
        }
        
        console.log('Database OK');
    } catch (err) {
        console.error('DB Error:', err.message);
    }
}

initDb();

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

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

app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                user_id as id,
                username,
                game_nick,
                SUM(kills) as total_kills,
                SUM(damage) as total_damage
            FROM stats
            WHERE verified = true
            GROUP BY user_id, username, game_nick
            ORDER BY total_kills DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/stats', async (req, res) => {
    try {
        const { kills, killPercent, damagePercent, damage, videoLink, screenshot, server } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Нет токена' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query('SELECT username, game_nick FROM users WHERE id = $1', [decoded.id]);
        const user = userResult.rows[0];
        
        await pool.query(
            `INSERT INTO stats (user_id, username, game_nick, kills, kill_percent, damage_percent, damage, video_link, screenshot, server)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [decoded.id, user.username, user.game_nick, kills, killPercent, damagePercent, damage, videoLink, screenshot, server]
        );
        res.json({ message: 'OK' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
