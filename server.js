const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const SECRET = 'super_secret_key';

const pool = new Pool({
    connectionString: 'postgresql://postgres:1234@localhost:5432/arena'
});

/// REGISTER
app.post('/api/register', async (req, res) => {
    const { username, password, gameNick } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Заполни все поля' });
    }

    try {
        const hash = bcrypt.hashSync(password, 10);

        await pool.query(
            'INSERT INTO users(username,password,game_nick) VALUES($1,$2,$3)',
            [username, hash, gameNick || username]
        );

        res.json({ success: true });

    } catch {
        res.status(400).json({ error: 'Пользователь уже существует' });
    }
});

/// LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const result = await pool.query(
        'SELECT * FROM users WHERE username=$1',
        [username]
    );

    if (!result.rows.length) {
        return res.status(400).json({ error: 'Нет пользователя' });
    }

    const user = result.rows[0];

    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ error: 'Неверный пароль' });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        SECRET
    );

    res.json({ token, user });
});

/// ADD STATS
app.post('/api/stats', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.sendStatus(401);

    let user;
    try {
        user = jwt.verify(token, SECRET);
    } catch {
        return res.sendStatus(401);
    }

    const { kills, killPercent, hsPercent, damage, videoLink, screenshot } = req.body;

    await pool.query(
        `INSERT INTO stats(user_id,kills,kill_percent,hs_percent,damage,video_link,screenshot)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [user.id, kills, killPercent, hsPercent, damage, videoLink, screenshot]
    );

    res.json({ success: true });
});

/// MY STATS
app.get('/api/stats/my', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.sendStatus(401);

    const user = jwt.verify(token, SECRET);

    const result = await pool.query(`
        SELECT s.*, u.game_nick 
        FROM stats s
        JOIN users u ON u.id=s.user_id
        WHERE user_id=$1
    `, [user.id]);

    res.json(result.rows);
});

/// ADMIN
app.get('/api/stats/all', async (req, res) => {
    const token = req.headers.authorization;
    const user = jwt.verify(token, SECRET);

    if (user.role !== 'admin') return res.sendStatus(403);

    const result = await pool.query(`
        SELECT s.*, u.game_nick 
        FROM stats s
        JOIN users u ON u.id=s.user_id
    `);

    res.json(result.rows);
});

app.put('/api/stats/:id/verify', async (req, res) => {
    const user = jwt.verify(req.headers.authorization, SECRET);
    if (user.role !== 'admin') return res.sendStatus(403);

    await pool.query('UPDATE stats SET verified=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
});

app.delete('/api/stats/:id', async (req, res) => {
    const user = jwt.verify(req.headers.authorization, SECRET);
    if (user.role !== 'admin') return res.sendStatus(403);

    await pool.query('DELETE FROM stats WHERE id=$1', [req.params.id]);
    res.json({ success: true });
});

/// LEADERBOARD
app.get('/api/leaderboard', async (req, res) => {
    const result = await pool.query(`
        SELECT u.game_nick,
               SUM(kills) as kills,
               SUM(damage) as damage
        FROM stats s
        JOIN users u ON u.id=s.user_id
        WHERE verified=true
        GROUP BY u.game_nick
        ORDER BY kills DESC
    `);

    res.json(result.rows);
});

app.listen(3000, () => console.log('🚀 Server started'));
