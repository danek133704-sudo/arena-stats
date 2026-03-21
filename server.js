const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'arena_stats_secret_key_2024';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDb() {
    const client = await pool.connect();
    try {
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                discord VARCHAR(100),
                game_nick VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add role column if not exists
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'
        `);
        
        // Stats table
        await client.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                username VARCHAR(100),
                game_nick VARCHAR(100),
                kills INTEGER,
                kill_percent DECIMAL(10,2),
                damage_percent DECIMAL(10,2),
                damage INTEGER,
                video_link TEXT,
                screenshot TEXT,
                server VARCHAR(100),
                verified BOOLEAN DEFAULT false,
                verified_by INTEGER REFERENCES users(id),
                verified_at TIMESTAMP,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create admin user
        const adminExists = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (adminExists.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await client.query(
                'INSERT INTO users (username, password, discord, game_nick, role) VALUES ($1, $2, $3, $4, $5)',
                ['admin', hashedPassword, 'admin@arena', 'Admin', 'admin']
            );
            console.log('Admin user created: admin / admin123');
        }
        
        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Database init error:', err.message);
    } finally {
        client.release();
    }
}

initDb();

// ... остальной код (такой же как был)
