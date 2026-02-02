require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000; // Порт, на котором висит бэкенд
const SECRET_KEY = process.env.JWT_SECRET || 'fallback_secret_key';

// 1. РАЗРЕШАЕМ ДОСТУП (CORS)
// Это нужно, чтобы твой фронтенд мог стучаться на сервер
app.use(cors());
app.use(bodyParser.json());

// 2. ПУТИ К ФАЙЛАМ
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');

// 3. АВТО-СОЗДАНИЕ ПАПОК И ФАЙЛОВ ПРИ СТАРТЕ
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Генерируем юзеров, если их нет
if (!fs.existsSync(USERS_FILE)) {
    console.log('>>> СОЗДАЮ ЮЗЕРОВ...');
    const salt = bcrypt.genSaltSync(10);
    const users = [
        { 
            username: 'tliza', 
            // Хэшируем пароль EditorInChief_2026!
            passwordHash: bcrypt.hashSync('EditorInChief_2026!', salt) 
        },
        { 
            username: 'cynobeats', 
            // Хэшируем пароль Dev_Mode_On_99
            passwordHash: bcrypt.hashSync('Dev_Mode_On_99', salt) 
        }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Генерируем пустой файл цитат, если нет
if (!fs.existsSync(QUOTES_FILE)) {
    fs.writeFileSync(QUOTES_FILE, JSON.stringify([], null, 2));
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ЧТЕНИЯ/ЗАПИСИ
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ПРОВЕРКА ТОКЕНА (ОХРАННИК)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401); // Нет токена — уходи

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403); // Токен поддельный
        req.user = user;
        next(); // Проходи
    });
};

// === API МАРШРУТЫ ===

// Логин
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username);

    if (!user) return res.status(400).json({ error: 'Пользователь не найден' });

    // Сравнение пароля с хэшем
    if (!bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(400).json({ error: 'Неверный пароль' });
    }

    // Выдача пропуска (токена)
    const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token });
});

// Получить цитаты (Доступно всем)
app.get('/api/quotes', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    res.json(quotes);
});

// Сохранить цитаты (Только с токеном)
app.post('/api/quotes', authenticateToken, (req, res) => {
    writeJSON(QUOTES_FILE, req.body);
    res.json({ status: 'success' });
});

// ЗАПУСК
app.listen(PORT, () => {
    console.log(`--- SERVER RUNNING ON http://localhost:${PORT} ---`);
});