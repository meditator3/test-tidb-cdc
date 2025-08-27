const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const JWT_SECRET = 'some-secret';


// start connection with testdb 
async function getConnection() {
  return mysql.createConnection({
    host: 'tidb-server',
    port: 4000,
    user: 'root',
    password: '',
    database: 'testdb'
  });
}
// init db if necessary
async function initDatabase() {
  try {
    console.log('Testing TiDB connection...');
    const connection = await getConnection();
    console.log('Connected to TiDB successfully!');
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(100) UNIQUE,
        password VARCHAR(100),
        email VARCHAR(60) UNIQUE,
        password_hash VARCHAR(200) NOT NULL
      )
    `);
     await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Table created/verified');
    await connection.end();
  } catch (error) {
    console.error('Database connection failed:', error.message);
  }
}

// auth token 
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const connection = await getConnection();
    
    // Check if token exists in database and is not expired
    const [tokenRows] = await connection.execute(
      'SELECT ut.*, u.username FROM user_tokens ut JOIN users u ON ut.user_id = u.id WHERE ut.token = ? AND ut.expires_at > NOW()',
      [token]
    );
    
    await connection.end();
    
    if (tokenRows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      username: tokenRows[0].username
    };
    
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Register user
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  try {
    const connection = await getConnection();
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert user
    const [result] = await connection.execute(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );
    
    await connection.end();
    
      res.send(`
      <html>
        <head><title>Registration</title></head>
        <body>
          <h1>✅ Registration Successful</h1>
          <p>You can now <a href="/login.html">log in</a>.</p>
        </body>
      </html>
    `);
    
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});


// Login user
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const connection = await getConnection();
    
    // Find user
    const [userRows] = await connection.execute(
      'SELECT id, username, email, password_hash FROM users WHERE username = ?',
      [username]
    );
    
    if (userRows.length === 0) {
      await connection.end();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userRows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      await connection.end();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Store token in database
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await connection.execute(
      'INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );
    res.setHeader('Authorization', `Bearer ${token}`);
    await connection.end();
    
    res.send(`
      <html>
        <head><title>Dashboard</title></head>
        <body>
          <h1>Welcome, ${user.username}!</h1>
          <p>You are now logged in.</p>
        </body>
      </html>
    `);
    
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.listen(3000, () => {
  console.log('Server on http://localhost:3000');
  setTimeout(initDatabase, 10000); // Wait 10 seconds
});