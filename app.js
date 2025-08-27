const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// No pool creation at startup
async function getConnection() {
  return mysql.createConnection({
    host: 'tidb-server',
    port: 4000,
    user: 'root',
    password: '',
    database: 'testdb'
  });
}

async function initDatabase() {
  try {
    console.log('Testing TiDB connection...');
    const connection = await getConnection();
    console.log('Connected to TiDB successfully!');
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(100) UNIQUE,
        password VARCHAR(100)
      )
    `);
    console.log('Table created/verified');
    await connection.end();
  } catch (error) {
    console.error('Database connection failed:', error.message);
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const connection = await getConnection();
    await connection.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
    await connection.end();
    res.send(`<h1>User ${username} registered!</h1><a href="/">Back</a>`);
  } catch (error) {
    res.send(`<h1>Error: ${error.message}</h1><a href="/">Back</a>`);
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    await connection.end();
    
    if (rows.length > 0) {
      res.send(`<h1>Welcome ${username}!</h1><a href="/">Back</a>`);
    } else {
      res.send(`<h1>Invalid login</h1><a href="/">Back</a>`);
    }
  } catch (error) {
    res.send(`<h1>Error: ${error.message}</h1><a href="/">Back</a>`);
  }
});

app.listen(3000, () => {
  console.log('Server on http://localhost:3000');
  setTimeout(initDatabase, 20000); // Wait 10 seconds
});