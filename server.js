const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
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
            data = { users: [], stats: [] };
        }
        
        // Проверяем админа
        const adminExists = data.users.find(u => u.username === 'admin');
        if (!adminExists) {
            const adminHash = bcrypt.hashSync('gtafak', 10);
            data.users.push({ id: 1, username: 'admin', password: adminHash, game_nick: 'Admin', role: 'admin' });
            console.log('✅ Админ создан');
        }
        
        // ПРИНУДИТЕЛЬНО ДОБАВЛЯЕМ ТЕСТОВЫЕ ЗАПИСИ, ЕСЛИ ИХ НЕТ
        const unverifiedCount = data.stats.filter(s => !s.verified).length;
        if (unverifiedCount < 3) {
            // Удаляем старые неподтверждённые
            data.stats = data.stats.filter(s => s.verified);
            
            // Добавляем новые тестовые
            const testStats = [
                {
                    id: Date.now() + 1,
                    username: 'player1',
                    game_nick: 'Flik_Homixide',
                    kills: 142,
                    kill_percent: 33,
                    hs_percent: 5,
                    damage: 16257,
                    video_link: '',
                    screenshot: '',
                    verified: false,
                    date: new Date().toISOString()
                },
                {
                    id: Date.now() + 2,
                    username: 'player2',
                    game_nick: 'Andrey_Chikatilov',
                    kills: 80,
                    kill_percent: 26,
                    hs_percent: 10,
                    damage: 10948,
                    video_link: '',
                    screenshot: '',
                    verified: false,
                    date: new Date().toISOString()
                },
                {
                    id: Date.now() + 3,
                    username: 'player3',
                    game_nick: 'Avi_Effexx',
                    kills: 86,
                    kill_percent: 26,
                    hs_percent: 6,
                    damage: 11039,
                    video_link: '',
                    screenshot: '',
                    verified: false,
                    date: new Date().toISOString()
                }
            ];
            data.stats.push(...testStats);
            saveData();
            console.log('📊 Добавлены тестовые записи в админ-панель (3 штуки)');
        }
        
    } catch(e) { console.error('Ошибка загрузки:', e); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Данные сохранены');
}

loadData();

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, gameNick } = req.body;
        if (data.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        const hash = bcrypt.hashSync(password, 10);
        data.users.push({
            id: Date.now(),
            username,
            password: hash,
            game_nick: gameNick || username,
            role: 'user'
        });
        saveData();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = data.users.find(u => u.username === username);
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        const match = bcrypt.compareSync(password, user.password);
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
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

app.put('/api/profile', async (req, res) => {
    try {
        const { username, gameNick } = req.body;
        const user = data.users.find(u => u.username === username);
        if (user) {
            user.game_nick = gameNick;
            saveData();
            res.json({ success: true, user: { username: user.username, gameNick: user.game_nick, role: user.role } });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.post('/api/stats', async (req, res) => {
    try {
        const { username, kills, killPercent, hsPercent, damage, videoLink, screenshot } = req.body;
        const user = data.users.find(u => u.username === username);
        if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
        
        const newStat = {
            id: Date.now(),
            username,
            game_nick: user.game_nick,
            kills: kills || 0,
            kill_percent: killPercent || 0,
            hs_percent: hsPercent || 0,
            damage: damage || 0,
            video_link: videoLink || '',
            screenshot: screenshot || '',
            verified: user.role === 'admin' ? true : false,
            date: new Date().toISOString()
        };
        data.stats.push(newStat);
        saveData();
        console.log(`✅ Статистика сохранена: ${username} - ${kills} убийств, ${damage} урона`);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.get('/api/stats/my', async (req, res) => {
    const username = req.headers.username;
    const myStats = data.stats.filter(s => s.username === username);
    res.json(myStats);
});

app.get('/api/stats/all', async (req, res) => {
    const unverified = data.stats.filter(s => !s.verified);
    console.log(`📋 Запрос всех статистик: всего ${data.stats.length}, неподтверждённых: ${unverified.length}`);
    res.json(data.stats);
});

app.put('/api/stats/:id/verify', async (req, res) => {
    const stat = data.stats.find(s => s.id == req.params.id);
    if (stat) {
        stat.verified = true;
        saveData();
        console.log(`✅ Подтверждена запись ${req.params.id}`);
    }
    res.json({ success: true });
});

app.delete('/api/stats/:id', async (req, res) => {
    data.stats = data.stats.filter(s => s.id != req.params.id);
    saveData();
    console.log(`🗑️ Удалена запись ${req.params.id}`);
    res.json({ success: true });
});

app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = {};
    data.stats.forEach(stat => {
        if (!stat.verified) return;
        if (!leaderboard[stat.username]) {
            leaderboard[stat.username] = {
                username: stat.username,
                game_nick: stat.game_nick,
                kills: 0,
                damage: 0,
                video_link: stat.video_link
            };
        }
        leaderboard[stat.username].kills += stat.kills;
        leaderboard[stat.username].damage += stat.damage;
    });
    res.json(Object.values(leaderboard).sort((a, b) => b.kills - a.kills));
});

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

app.listen(PORT, () => {
    console.log(`✅ Сервер на порту ${PORT}`);
    console.log(`👑 Админ: admin / gtafak`);
    const unverifiedCount = data.stats.filter(s => !s.verified).length;
    console.log(`📊 В админ-панели ${unverifiedCount} неподтверждённых записей`);
});
