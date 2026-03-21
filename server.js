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

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`
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
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
                verified_by INTEGER REFERENCES users(id),
                verified_at TIMESTAMP,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const adminExists = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (adminExists.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await client.query(
                'INSERT INTO users (username, password, discord, game_nick, role) VALUES ($1, $2, $3, $4, $5)',
                ['admin', hashedPassword, 'admin@arena', 'Admin', 'admin']
            );
            console.log('Admin user created: admin / admin123');
        }
        
        console.log('Database initialized');
    } catch (err) {
        console.error('Database init error:', err.message);
    } finally {
        client.release();
    }
}

initDb();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный токен' });
        req.user = user;
        next();
    });
};

const authenticateAdmin = async (req, res, next) => {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows[0]?.role !== 'admin') {
        return res.status(403).json({ error: 'Требуются права администратора' });
    }
    next();
};

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, discord, gameNick } = req.body;
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, discord, game_nick) VALUES ($1, $2, $3, $4) RETURNING id, username, discord, game_nick, role',
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
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
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
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, discord, game_nick, role FROM users WHERE id = $1', [req.user.id]);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { discord, gameNick } = req.body;
        await pool.query('UPDATE users SET discord = $1, game_nick = $2 WHERE id = $3', [discord, gameNick, req.user.id]);
        res.json({ message: 'Профиль обновлен' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/stats', authenticateToken, async (req, res) => {
    try {
        const { kills, killPercent, damagePercent, damage, videoLink, screenshot, server } = req.body;
        const userResult = await pool.query('SELECT username, game_nick FROM users WHERE id = $1', [req.user.id]);
        const user = userResult.rows[0];
        const result = await pool.query(
            `INSERT INTO stats (user_id, username, game_nick, kills, kill_percent, damage_percent, damage, video_link, screenshot, server)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [req.user.id, user.username, user.game_nick, kills, killPercent, damagePercent, damage, videoLink, screenshot, server]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/stats/my', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM stats WHERE user_id = $1 ORDER BY date DESC', [req.user.id]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/stats/all', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT s.*, u.username as uploader FROM stats s LEFT JOIN users u ON s.user_id = u.id ORDER BY date DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/stats/:id/verify', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE stats SET verified = true, verified_by = $1, verified_at = CURRENT_TIMESTAMP WHERE id = $2', [req.user.id, id]);
        res.json({ message: 'Статистика подтверждена' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/stats/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM stats WHERE id = $1', [req.params.id]);
        res.json({ message: 'Статистика удалена' });
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
                SUM(damage) as total_damage,
                AVG(kill_percent) as avg_kill_percent,
                AVG(damage_percent) as avg_damage_percent,
                COUNT(*) as stats_count,
                (SELECT video_link FROM stats s2 WHERE s2.user_id = stats.user_id AND s2.verified = true ORDER BY date DESC LIMIT 1) as latest_video
            FROM stats
            WHERE verified = true
            GROUP BY user_id, username, game_nick
            ORDER BY total_kills DESC
            LIMIT 50
        `);
        const formatted = result.rows.map(row => ({
            _id: row.id,
            username: row.username,
            gameNick: row.game_nick,
            totalKills: parseInt(row.total_kills),
            totalDamage: parseInt(row.total_damage),
            avgKillPercent: parseFloat(row.avg_kill_percent),
            avgDamagePercent: parseFloat(row.avg_damage_percent),
            statsCount: parseInt(row.stats_count),
            latestVideo: row.latest_video
        }));
        res.json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
