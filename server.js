const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data.json');

let data = { users: [], stats: [] };

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } else {
            data = {
                users: [{ id: 1, username: 'admin', password: 'admin123', gameNick: 'Admin', role: 'admin' }],
                stats: []
            };
            saveData();
        }
    } catch(e) {}
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

loadData();

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password, gameNick } = req.body;
    if (data.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    data.users.push({
        id: Date.now(),
        username,
        password,
        gameNick: gameNick || username,
        role: username === 'admin' ? 'admin' : 'user'
    });
    saveData();
    res.json({ success: true });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверный логин или пароль' });
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            gameNick: user.gameNick,
            role: user.role
        }
    });
});

// Обновить профиль
app.put('/api/profile', (req, res) => {
    const { username, gameNick } = req.body;
    const user = data.users.find(u => u.username === username);
    if (user) {
        if (gameNick) user.gameNick = gameNick;
        saveData();
        res.json({ success: true, user: { username: user.username, gameNick: user.gameNick, role: user.role } });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// Добавить статистику
app.post('/api/stats', (req, res) => {
    const { username, kills, killPercent, hsPercent, damage, videoLink, screenshot } = req.body;
    const user = data.users.find(u => u.username === username);
    const newStat = {
        id: Date.now(),
        username,
        gameNick: user?.gameNick || username,
        kills: kills || 0,
        killPercent: killPercent || 0,
        hsPercent: hsPercent || 0,
        damage: damage || 0,
        videoLink: videoLink || '',
        screenshot: screenshot || '',
        verified: user?.role === 'admin' ? true : false,
        date: new Date().toISOString()
    };
    data.stats.push(newStat);
    saveData();
    res.json({ success: true });
});

// Моя статистика
app.get('/api/stats/my', (req, res) => {
    const username = req.headers.username;
    const myStats = data.stats.filter(s => s.username === username);
    res.json(myStats);
});

// Вся статистика (админ)
app.get('/api/stats/all', (req, res) => {
    res.json(data.stats);
});

// Подтвердить статистику
app.put('/api/stats/:id/verify', (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) {
        stat.verified = true;
        saveData();
    }
    res.json({ success: true });
});

// Удалить статистику
app.delete('/api/stats/:id', (req, res) => {
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData();
    res.json({ success: true });
});

// Лидерборд
app.get('/api/leaderboard', (req, res) => {
    const leaderboard = {};
    data.stats.forEach(stat => {
        if (!stat.verified) return;
        if (!leaderboard[stat.username]) {
            leaderboard[stat.username] = {
                username: stat.username,
                gameNick: stat.gameNick,
                kills: 0,
                damage: 0
            };
        }
        leaderboard[stat.username].kills += stat.kills;
        leaderboard[stat.username].damage += stat.damage;
    });
    res.json(Object.values(leaderboard).sort((a, b) => b.kills - a.kills));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`👑 Админ: admin / admin123`);
});
