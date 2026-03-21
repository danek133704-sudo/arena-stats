const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Файл для хранения данных
const DATA_FILE = path.join(__dirname, 'data.json');

// Инициализация данных
let data = { users: [], stats: [] };

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } else {
            // Создаём админа по умолчанию
            data = {
                users: [{ id: 1, username: 'admin', password: 'admin123', gameNick: 'Admin', role: 'admin' }],
                stats: []
            };
            saveData();
        }
    } catch(e) { console.log('Ошибка загрузки:', e); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API
app.get('/api/leaderboard', (req, res) => {
    const leaderboard = {};
    data.stats.forEach(stat => {
        if (!stat.verified) return;
        if (!leaderboard[stat.username]) {
            leaderboard[stat.username] = { username: stat.username, gameNick: stat.gameNick, kills: 0, damage: 0 };
        }
        leaderboard[stat.username].kills += stat.kills || 0;
        leaderboard[stat.username].damage += stat.damage || 0;
    });
    res.json(Object.values(leaderboard).sort((a,b) => b.kills - a.kills));
});

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
        role: 'user'
    });
    saveData();
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверный логин или пароль' });
    res.json({ success: true, user: { id: user.id, username: user.username, gameNick: user.gameNick, role: user.role } });
});

app.post('/api/stats', (req, res) => {
    const { username, kills, damage, videoLink, screenshot } = req.body;
    const user = data.users.find(u => u.username === username);
    data.stats.push({
        id: Date.now(),
        username,
        gameNick: user?.gameNick || username,
        kills: kills || 0,
        damage: damage || 0,
        videoLink,
        screenshot,
        verified: username === 'admin' ? true : false,
        date: new Date().toISOString()
    });
    saveData();
    res.json({ success: true });
});

app.get('/api/stats/my', (req, res) => {
    const username = req.headers.username;
    const myStats = data.stats.filter(s => s.username === username);
    res.json(myStats);
});

app.get('/api/stats/all', (req, res) => {
    res.json(data.stats);
});

app.put('/api/stats/:id/verify', (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) stat.verified = true;
    saveData();
    res.json({ success: true });
});

app.delete('/api/stats/:id', (req, res) => {
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData();
    res.json({ success: true });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Загружаем данные и запускаем
loadData();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`👑 Админ: admin / admin123`);
    console.log(`📁 Данные сохраняются в файл data.json`);
});
