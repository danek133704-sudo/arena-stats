const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Файл для хранения данных
const DATA_FILE = path.join(__dirname, 'data.json');

// Загрузка данных из файла
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch(e) {}
    return { users: [], stats: [] };
}

// Сохранение данных в файл
function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Получить данные
app.get('/api/data', (req, res) => {
    const data = loadData();
    res.json({ stats: data.stats });
});

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password, gameNick } = req.body;
    const data = loadData();
    
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
    saveData(data);
    res.json({ success: true });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const data = loadData();
    const user = data.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    
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

// Добавить статистику
app.post('/api/stats', (req, res) => {
    const { username, kills, damage, videoLink, screenshot, server } = req.body;
    const data = loadData();
    
    data.stats.push({
        id: Date.now(),
        username,
        kills: kills || 0,
        damage: damage || 0,
        videoLink,
        screenshot,
        server,
        verified: username === 'admin' ? true : false,
        date: new Date().toISOString()
    });
    saveData(data);
    res.json({ success: true });
});

// Лидерборд
app.get('/api/leaderboard', (req, res) => {
    const data = loadData();
    const leaderboard = {};
    
    data.stats.forEach(stat => {
        if (!stat.verified) return;
        if (!leaderboard[stat.username]) {
            leaderboard[stat.username] = {
                username: stat.username,
                gameNick: stat.gameNick || stat.username,
                kills: 0,
                damage: 0
            };
        }
        leaderboard[stat.username].kills += stat.kills || 0;
        leaderboard[stat.username].damage += stat.damage || 0;
    });
    
    const result = Object.values(leaderboard).sort((a,b) => b.kills - a.kills);
    res.json(result);
});

// Моя статистика
app.get('/api/stats/my', (req, res) => {
    const username = req.headers.username;
    const data = loadData();
    const myStats = data.stats.filter(s => s.username === username);
    res.json(myStats);
});

// Админ: все статистики
app.get('/api/stats/all', (req, res) => {
    const data = loadData();
    res.json(data.stats);
});

// Админ: подтвердить
app.put('/api/stats/:id/verify', (req, res) => {
    const data = loadData();
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) stat.verified = true;
    saveData(data);
    res.json({ success: true });
});

// Админ: удалить
app.delete('/api/stats/:id', (req, res) => {
    const data = loadData();
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData(data);
    res.json({ success: true });
});

// Главная
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📁 Данные сохраняются в файл: ${DATA_FILE}`);
});
