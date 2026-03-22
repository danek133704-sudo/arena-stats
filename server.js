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
            console.log(`📁 Загружено: ${data.users.length} пользователей, ${data.stats.length} записей`);
        } else {
            data = {
                users: [{ id: 1, username: 'admin', password: 'admin123', gameNick: 'Admin', role: 'admin' }],
                stats: []
            };
            saveData();
            console.log('📁 Создан новый файл данных');
        }
    } catch(e) { console.error('Ошибка загрузки:', e); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Данные сохранены');
}

loadData();

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password, gameNick, discord } = req.body;
    if (data.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    const role = username === 'admin' ? 'admin' : 'user';
    data.users.push({
        id: Date.now(),
        username,
        password,
        gameNick: gameNick || username,
        discord: discord || '',
        role: role
    });
    saveData();
    console.log(`✅ Зарегистрирован: ${username} (${role})`);
    res.json({ success: true });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверный логин или пароль' });
    console.log(`🔐 Вход: ${username} (${user.role})`);
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

// Обновить профиль
app.put('/api/profile', (req, res) => {
    const { username, discord, gameNick } = req.body;
    const user = data.users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (discord !== undefined) user.discord = discord;
    if (gameNick !== undefined) user.gameNick = gameNick;
    saveData();
    res.json({ success: true, user: { username: user.username, discord: user.discord, gameNick: user.gameNick, role: user.role } });
});

// Добавить статистику
app.post('/api/stats', (req, res) => {
    const { username, kills, killPercent, hsPercent, damage, videoLink, screenshot } = req.body;
    const user = data.users.find(u => u.username === username);
    const isAdmin = user?.role === 'admin';
    
    const newStat = {
        id: Date.now(),
        username: username,
        gameNick: user?.gameNick || username,
        kills: Number(kills) || 0,
        killPercent: Number(killPercent) || 0,
        hsPercent: Number(hsPercent) || 0,
        damage: Number(damage) || 0,
        videoLink: videoLink || '',
        screenshot: screenshot || '',
        verified: isAdmin ? true : false,
        date: new Date().toISOString()
    };
    data.stats.push(newStat);
    saveData();
    console.log(`📊 СТАТИСТИКА СОХРАНЕНА:`);
    console.log(`   ${username}: убийства=${newStat.kills}, %=${newStat.killPercent}%, HS%=${newStat.hsPercent}%, урон=${newStat.damage}`);
    console.log(`   Всего записей: ${data.stats.length}, неподтверждённых: ${data.stats.filter(s => !s.verified).length}`);
    res.json({ success: true, stat: newStat });
});

// Моя статистика
app.get('/api/stats/my', (req, res) => {
    const username = req.headers.username;
    const myStats = data.stats.filter(s => s.username === username);
    res.json(myStats);
});

// Вся статистика (для админа)
app.get('/api/stats/all', (req, res) => {
    console.log(`📋 ЗАПРОС ВСЕХ СТАТИСТИК: всего ${data.stats.length}`);
    console.log(`📋 Детально:`, data.stats.map(s => ({ id: s.id, username: s.username, kills: s.kills, killPercent: s.killPercent, hsPercent: s.hsPercent, damage: s.damage, verified: s.verified })));
    res.json(data.stats);
});

// Подтвердить статистику
app.put('/api/stats/:id/verify', (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) {
        stat.verified = true;
        saveData();
        console.log(`✅ Подтверждена запись ${req.params.id}`);
    }
    res.json({ success: true });
});

// Удалить статистику
app.delete('/api/stats/:id', (req, res) => {
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData();
    console.log(`🗑️ Удалена запись ${req.params.id}`);
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
