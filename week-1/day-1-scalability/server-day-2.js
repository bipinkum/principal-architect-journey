const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL 17 connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'youtube_clone',
  port: 5432
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', port: PORT });
});

app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello from server!',
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.json({
      message: 'User created',
      user: result.rows[0],
      server_port: PORT
    });
  } catch (error) {
    res.status(400).json({ error: error.message, server_port: PORT });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json({
      users: result.rows,
      count: result.rows.length,
      server_port: PORT
    });
  } catch (error) {
    res.status(400).json({ error: error.message, server_port: PORT });
  }
});

app.get('/api/users/:email', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [req.params.email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', server_port: PORT });
    }
    res.json({ user: result.rows[0], server_port: PORT });
  } catch (error) {
    res.status(400).json({ error: error.message, server_port: PORT });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/users`);
});