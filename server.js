const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Простая статика
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Простой API для проверки
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ЗАПУСК - САМОЕ ВАЖНОЕ
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Сайт доступен: https://arena-stats-1.onrender.com`);
});
