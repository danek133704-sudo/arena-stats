const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Запуск сервера...');
console.log('📦 Версия Node:', process.version);

// Проверка, что папка public существует
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.error('❌ Папка public не найдена! Создаю...');
    fs.mkdirSync(publicPath, { recursive: true });
}
console.log('📁 Папка public:', fs.existsSync(publicPath) ? '✅ существует' : '❌ не найдена');

// Проверяем index.html
const indexPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error('❌ Файл index.html не найден! Создаю...');
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html>
<head>
    <title>Arena Stats</title>
    <style>
        body { background: #0a0a0a; color: #ffd966; font-family: Arial; text-align: center; padding: 50px; }
        h1 { font-size: 48px; }
    </style>
</head>
<body>
    <h1>⚔️ ARENA STATS</h1>
    <p>Сайт работает! Скоро здесь будет полная версия.</p>
    <p>Сервер запущен успешно ✅</p>
</body>
</html>`);
    console.log('✅ Создан временный index.html');
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Проверка работы API
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        message: 'Сервер работает!'
    });
});

// ЗАПУСК СЕРВЕРА
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Сайт доступен: https://arena-stats-1.onrender.com`);
    console.log(`🔗 Проверка API: https://arena-stats-1.onrender.com/api/status`);
});
