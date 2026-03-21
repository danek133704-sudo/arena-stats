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
                users: [{ id: 1, username: 'admin', password: 'admin123', gameNick: 'Admin', discord: '', role: 'admin' }],
                stats: []
            };
            saveData();
        }
    } catch(e) { console.log('Ошибка загрузки:', e); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ============= API РОУТЫ =============

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
        leaderboard[stat.username].kills += stat.kills || 0;
        leaderboard[stat.username].damage += stat.damage || 0;
    });
    res.json(Object.values(leaderboard).sort((a,b) => b.kills - a.kills));
});

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password, gameNick, discord } = req.body;
    if (data.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    data.users.push({
        id: Date.now(),
        username,
        password,
        gameNick: gameNick || username,
        discord: discord || '',
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
            discord: user.discord,
            role: user.role 
        } 
    });
});

// ✅ НОВЫЙ РОУТ: Обновить профиль
app.put('/api/profile', (req, res) => {
    const { username, discord, gameNick } = req.body;
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (discord !== undefined) user.discord = discord;
    if (gameNick !== undefined) user.gameNick = gameNick;
    
    saveData();
    res.json({ 
        success: true, 
        user: { 
            username: user.username, 
            discord: user.discord, 
            gameNick: user.gameNick,
            role: user.role 
        } 
    });
});

// Добавить статистику
app.post('/api/stats', (req, res) => {
    const { username, kills, damage, videoLink, screenshot, server } = req.body;
    const user = data.users.find(u => u.username === username);
    data.stats.push({
        id: Date.now(),
        username,
        gameNick: user?.gameNick || username,
        kills: kills || 0,
        damage: damage || 0,
        videoLink,
        screenshot,
        server,
        verified: username === 'admin' ? true : false,
        date: new Date().toISOString()
    });
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

// Подтвердить статистику (админ)
app.put('/api/stats/:id/verify', (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) stat.verified = true;
    saveData();
    res.json({ success: true });
});

// Удалить статистику (админ)
app.delete('/api/stats/:id', (req, res) => {
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData();
    res.json({ success: true });
});

// Главная
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
