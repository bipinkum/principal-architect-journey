const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.USER || 'bipinkumar',
  host: 'localhost',
  port: 5432,
  database: 'postgres'
});

async function setup() {
  try {
    await pool.query('DROP DATABASE IF EXISTS youtube_clone;');
    await pool.query('CREATE DATABASE youtube_clone;');
    console.log('✅ Database created');
  } catch (err) {
    console.error('Error:', err.message);
  }

  const pool2 = new Pool({
    user: process.env.USER || 'bipinkumar',
    host: 'localhost',
    database: 'youtube_clone',
    port: 5432
  });

  try {
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table created');
  } catch (err) {
    console.error('Error:', err.message);
  }

  await pool.end();
  await pool2.end();
  console.log('✅ Setup complete!');
}

setup();
