const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send('<!DOCTYPE html><html><head><title>Arena Stats</title><style>body{background:#0a0a0a;color:#ffd966;text-align:center;padding:50px;font-family:Arial}</style></head><body><h1>⚔️ ARENA STATS</h1><p>Сервер работает!</p><p>Порт: ' + PORT + '</p></body></html>');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
