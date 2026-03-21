const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'arena_stats_secret_key_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
mongoose.connect('mongodb+srv://danek133704_db_user:WukODLD07o27xzpU@cluster0.f6h3ilv.mongodb.net/?appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Schemas
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    discord: String,
    gameNick: String,
    createdAt: { type: Date, default: Date.now }
});

const StatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: String,
    gameNick: String,
    kills: Number,
    killPercent: Number,
    damagePercent: Number,
    damage: Number,
    videoLink: String,
    server: String,
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Stat = mongoose.model('Stat', StatSchema);

// Middleware для проверки токена
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный токен' });
        req.user = user;
        next();
    });
};

// API Routes
// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, discord, gameNick } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            password: hashedPassword,
            discord,
            gameNick: gameNick || username
        });
        
        await user.save();
        res.json({ message: 'Регистрация успешна' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                discord: user.discord,
                gameNick: user.gameNick
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить профиль
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновить профиль
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { discord, gameNick } = req.body;
        await User.findByIdAndUpdate(req.user.id, { discord, gameNick });
        res.json({ message: 'Профиль обновлен' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить статистику
app.post('/api/stats', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const stat = new Stat({
            userId: req.user.id,
            username: user.username,
            gameNick: user.gameNick,
            ...req.body
        });
        
        await stat.save();
        res.json(stat);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить все статистики (для лидерборда)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await Stat.find()
            .sort({ date: -1 })
            .limit(100);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить статистику пользователя
app.get('/api/stats/user', authenticateToken, async (req, res) => {
    try {
        const stats = await Stat.find({ userId: req.user.id }).sort({ date: -1 });
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить лидерборд
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await Stat.aggregate([
            {
                $group: {
                    _id: '$userId',
                    username: { $first: '$username' },
                    gameNick: { $first: '$gameNick' },
                    totalKills: { $sum: '$kills' },
                    totalDamage: { $sum: '$damage' },
                    avgKillPercent: { $avg: '$killPercent' },
                    avgDamagePercent: { $avg: '$damagePercent' },
                    statsCount: { $sum: 1 },
                    latestVideo: { $last: '$videoLink' },
                    latestDate: { $last: '$date' }
                }
            },
            { $sort: { totalKills: -1 } },
            { $limit: 50 }
        ]);
        
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удалить статистику
app.delete('/api/stats/:id', authenticateToken, async (req, res) => {
    try {
        const stat = await Stat.findById(req.params.id);
        if (stat.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        await stat.deleteOne();
        res.json({ message: 'Статистика удалена' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});