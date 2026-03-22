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
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            data = JSON.parse(raw);
            console.log(`📁 Загружено: ${data.users.length} пользователей, ${data.stats.length} записей`);
            console.log(`⏳ Неподтверждённых: ${data.stats.filter(s => !s.verified).length}`);
        } else {
            data = {
                users: [{ id: 1, username: 'admin', password: 'admin123', gameNick: 'Admin', discord: '', role: 'admin' }],
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

// API
app.get('/api/leaderboard', (req, res) => {
    const leaderboard = {};
    data.stats.forEach(stat => {
        if (!stat.verified) return;
        if (!leaderboard[stat.username]) {
            leaderboard[stat.username] = { 
                username: stat.username, 
                gameNick: stat.gameNick, 
                kills: 0, 
                damage: 0,
                killPercent: 0,
                damagePercent: 0,
                videoLink: stat.videoLink
            };
        }
        leaderboard[stat.username].kills += stat.kills || 0;
        leaderboard[stat.username].damage += stat.damage || 0;
        leaderboard[stat.username].killPercent = stat.killPercent || 0;
        leaderboard[stat.username].damagePercent = stat.damagePercent || 0;
    });
    res.json(Object.values(leaderboard).sort((a,b) => b.kills - a.kills));
});

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

app.put('/api/profile', (req, res) => {
    const { username, discord, gameNick } = req.body;
    const user = data.users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (discord !== undefined) user.discord = discord;
    if (gameNick !== undefined) user.gameNick = gameNick;
    saveData();
    res.json({ success: true, user: { username: user.username, discord: user.discord, gameNick: user.gameNick, role: user.role } });
});

app.post('/api/stats', (req, res) => {
    const { username, kills, killPercent, damagePercent, damage, videoLink, screenshot, server } = req.body;
    const user = data.users.find(u => u.username === username);
    const isAdmin = user?.role === 'admin';
    const verified = isAdmin ? true : false;
    
    const newStat = {
        id: Date.now(),
        username,
        gameNick: user?.gameNick || username,
        kills: kills || 0,
        killPercent: killPercent || 0,
        damagePercent: damagePercent || 0,
        damage: damage || 0,
        videoLink: videoLink || '',
        screenshot: screenshot || '',
        server: server || '',
        verified: verified,
        date: new Date().toISOString()
    };
    data.stats.push(newStat);
    saveData();
    console.log(`📊 Новая статистика от ${username}:`);
    console.log(`   Убийства: ${kills}, Урон: ${damage}`);
    console.log(`   % убийств: ${killPercent}%, % урона: ${damagePercent}%`);
    console.log(`   Статус: ${verified ? '✅ ПОДТВЕРЖДЕНА' : '⏳ ОЖИДАЕТ'}`);
    console.log(`   Неподтверждённых всего: ${data.stats.filter(s => !s.verified).length}`);
    res.json({ success: true, stat: newStat });
});

app.get('/api/stats/my', (req, res) => {
    const username = req.headers.username;
    const myStats = data.stats.filter(s => s.username === username);
    res.json(myStats);
});

app.get('/api/stats/all', (req, res) => {
    const unverified = data.stats.filter(s => !s.verified);
    console.log(`📋 Запрос всех статистик: всего ${data.stats.length}, неподтверждённых: ${unverified.length}`);
    res.json(data.stats);
});

app.put('/api/stats/:id/verify', (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) {
        stat.verified = true;
        saveData();
        console.log(`✅ Подтверждена запись ${req.params.id} (${stat.username})`);
    }
    res.json({ success: true });
});

app.delete('/api/stats/:id', (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) console.log(`🗑️ Удалена запись ${req.params.id} (${stat.username})`);
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData();
    res.json({ success: true });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

loadData();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`👑 Админ: admin / admin123`);
    const unverified = data.stats.filter(s => !s.verified).length;
    console.log(`📊 Всего записей: ${data.stats.length}, ожидают проверки: ${unverified}`);
});
