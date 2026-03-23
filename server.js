import express from 'express';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const SECRET = 'supersecret';

// ================= AUTH =================

app.post('/api/register', async (req, res) => {
  const { username, password, gameNick } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Нет данных' });
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const user = await pool.query(
      `INSERT INTO users (username, password, game_nick)
       VALUES ($1,$2,$3) RETURNING *`,
      [username, hash, gameNick]
    );

    res.json(user.rows[0]);
  } catch (e) {
    res.status(400).json({ error: 'Пользователь уже существует' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await pool.query(
    `SELECT * FROM users WHERE username=$1`,
    [username]
  );

  if (!user.rows.length) {
    return res.status(400).json({ error: 'Нет пользователя' });
  }

  const valid = await bcrypt.compare(password, user.rows[0].password);
  if (!valid) return res.status(400).json({ error: 'Неверный пароль' });

  const token = jwt.sign(user.rows[0], SECRET);

  res.json({
    token,
    user: user.rows[0]
  });
});

// ================= MIDDLEWARE =================

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(401);

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

// ================= STATS =================

app.post('/api/stats', auth, async (req, res) => {
  const { kills, damage, videoLink, screenshot } = req.body;

  await pool.query(
    `INSERT INTO stats (user_id, kills, damage, video_link, screenshot)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.user.id, kills, damage, videoLink, screenshot]
  );

  res.json({ ok: true });
});

app.get('/api/stats/my', auth, async (req, res) => {
  const data = await pool.query(
    `SELECT * FROM stats WHERE user_id=$1 ORDER BY id DESC`,
    [req.user.id]
  );

  res.json(data.rows);
});

app.get('/api/stats/all', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  const data = await pool.query(`
    SELECT s.*, u.game_nick
    FROM stats s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.id DESC
  `);

  res.json(data.rows);
});

app.put('/api/stats/:id/verify', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  await pool.query(
    `UPDATE stats SET verified=true WHERE id=$1`,
    [req.params.id]
  );

  res.json({ ok: true });
});

app.delete('/api/stats/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  await pool.query(
    `DELETE FROM stats WHERE id=$1`,
    [req.params.id]
  );

  res.json({ ok: true });
});

// ================= LEADERBOARD =================

app.get('/api/leaderboard', async (req, res) => {
  const data = await pool.query(`
    SELECT u.game_nick,
           MAX(s.kills) as kills,
           MAX(s.damage) as damage
    FROM stats s
    JOIN users u ON u.id = s.user_id
    WHERE s.verified=true
    GROUP BY u.game_nick
    ORDER BY kills DESC
  `);

  res.json(data.rows);
});

// ================= START =================

app.listen(3000, () => {
  console.log('Server running on 3000');
});
