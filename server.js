const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

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
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                game_nick TEXT,
                role TEXT DEFAULT 'user'
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                username TEXT,
                game_nick TEXT,
                kills INTEGER,
                kill_percent DECIMAL,
                hs_percent DECIMAL,
                damage INTEGER,
                video_link TEXT,
                screenshot TEXT,
                verified BOOLEAN DEFAULT false,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            const hash = await bcrypt.hash('gtafak', 10);
            await pool.query(
                'INSERT INTO users (username, password, game_nick, role) VALUES ($1, $2, $3, $4)',
                ['admin', hash, 'Admin', 'admin']
            );
            console.log('✅ Админ создан');
        } else {
            // Обновляем пароль админа на всякий случай
            const hash = await bcrypt.hash('gtafak', 10);
            await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hash, 'admin']);
            console.log('✅ Пароль админа обновлён');
        }
        console.log('✅ База готова');
    } catch (err) {
        console.error('Ошибка БД:', err);
    }
}
initDb();

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, gameNick } = req.body;
        const exist = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exist.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password, game_nick) VALUES ($1, $2, $3)',
            [username, hash, gameNick || username]
        );
        res.json({ success: true });
    } catch (e) {
        console.error(e);
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
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                gameNick: user.game_nick,
                role: user.role
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

// Обновление профиля (меняет ник везде)
app.put('/api/profile', async (req, res) => {
    try {
        const { username, gameNick } = req.body;
        
        // Обновляем ник в таблице users
        await pool.query('UPDATE users SET game_nick = $1 WHERE username = $2', [gameNick, username]);
        
        // Обновляем ник во всей статистике пользователя
        await pool.query('UPDATE stats SET game_nick = $1 WHERE username = $2', [gameNick, username]);
        
        console.log(`✅ Ник обновлён: ${username} -> ${gameNick}`);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка обновления' });
    }
});

// Добавление статистики
app.post('/api/stats', async (req, res) => {
    try {
        const { username, kills, killPercent, hsPercent, damage, videoLink, screenshot } = req.body;
        const userRes = await pool.query('SELECT id, role, game_nick FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        const userId = userRes.rows[0].id;
        const isAdmin = userRes.rows[0].role === 'admin';
        const gameNick = userRes.rows[0].game_nick;
        
        await pool.query(
            `INSERT INTO stats (user_id, username, game_nick, kills, kill_percent, hs_percent, damage, video_link, screenshot, verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [userId, username, gameNick, kills, killPercent, hsPercent, damage, videoLink, screenshot, isAdmin]
        );
        console.log(`✅ Статистика добавлена: ${username} -> ${kills} убийств, ${damage} урона`);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

// Моя статистика
app.get('/api/stats/my', async (req, res) => {
    const username = req.headers.username;
    const result = await pool.query('SELECT * FROM stats WHERE username = $1 ORDER BY date DESC', [username]);
    res.json(result.rows);
});

// Вся статистика (для админа)
app.get('/api/stats/all', async (req, res) => {
    const result = await pool.query('SELECT * FROM stats ORDER BY date DESC');
    res.json(result.rows);
});

// Подтвердить статистику
app.put('/api/stats/:id/verify', async (req, res) => {
    await pool.query('UPDATE stats SET verified = true WHERE id = $1', [req.params.id]);
    console.log(`✅ Статистика ${req.params.id} подтверждена`);
    res.json({ success: true });
});

// Удалить статистику
app.delete('/api/stats/:id', async (req, res) => {
    await pool.query('DELETE FROM stats WHERE id = $1', [req.params.id]);
    console.log(`🗑️ Статистика ${req.params.id} удалена`);
    res.json({ success: true });
});

// Лидерборд (только подтверждённые)
app.get('/api/leaderboard', async (req, res) => {
    const result = await pool.query(`
        SELECT username, game_nick, SUM(kills) as kills, SUM(damage) as damage
        FROM stats
        WHERE verified = true
        GROUP BY username, game_nick
        ORDER BY kills DESC
        LIMIT 50
    `);
    res.json(result.rows);
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`👑 Админ: admin / gtafak`);
});
