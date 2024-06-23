const express = require('express');
const mysql = require("mysql");
const dotenv = require('dotenv');
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http'); // Add the http module

const app = express();
dotenv.config({path: './.env'});

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({extended:true}));

const connection = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_ROOT,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});

connection.connect(error => {
    if (error) {
        console.log(error);
    } else {
        console.log("Connected to Database!");
    }
});

// Create an HTTP server
const server = http.createServer(app);

// Create a WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'subscribe' && data.parent_id) {
      ws.parentId = data.parent_id;
    }
  });
});

// User Registration Endpoint
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  
  // Generate a unique ID
  const uniqueid = Math.floor(Math.random() * 9999);
  
  // Hash the password
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Insert user into database
    connection.query(
      'INSERT INTO parents (name, email, password, unique_id) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, uniqueid],
      (err, result) => {
        if (err) {
          console.error('Error inserting parent into database:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        console.log(uniqueid);
        res.status(201).json({uniqueid, message: 'Parent registered successfully' });
      }
    );
  });
});

// User Authentication Endpoint
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Check if user exists in database
    connection.query(
      'SELECT * FROM parents WHERE email = ?',
      [email],
      (err, results) => {
        if (err) {
          console.error('Error fetching parent from database:', err);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }

        if (results.length === 0) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const user = results[0];

        // Compare passwords
        bcrypt.compare(password, user.password, (err, result) => {
          if (err) {
            console.error('Error comparing passwords:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
          }

          if (!result) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
          }

          // Generate JWT token
          const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET);
          res.json({ 'user data': user, userid: user.unique_id, token });
        });
      }
    );
});

// Child Registration Endpoint
app.post('/registerChild', (req, res) => {
  const { parent_id, name, age, password } = req.body;
  console.log(parent_id);
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    // Insert child into database linked to parent
    connection.query(
      'INSERT INTO children (parent_id, name, age, password) VALUES (?, ?, ?, ?)',
      [parent_id, name, age, hashedPassword],
      (err, result) => {
        if (err) {
          console.error('Error inserting child into database:', err);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }
        res.status(201).json({ message: 'Child registered successfully' });
      }
    );
  });
});

// Child Authentication Endpoint
app.post('/childlogin', (req, res) => {
    const { name, password } = req.body;

    // Check if child exists in database
    connection.query(
      'SELECT * FROM children WHERE name = ?',
      [name],
      (err, results) => {
        if (err) {
          console.error('Error fetching child from database:', err);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }

        if (results.length === 0) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const user = results[0];

        // Compare passwords
        bcrypt.compare(password, user.password, (err, result) => {
          if (err) {
            console.error('Error comparing passwords:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
          }

          if (!result) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
          }

          // Generate JWT token
          const token = jwt.sign({ name: user.name }, process.env.JWT_SECRET);
          res.json({ 'user data': user, childid: user.child_id, parentid: user.parent_id, token });
        });
      }
    );
});

// Tracking Endpoint
app.post('/updateLocation', (req, res) => {
  const { child_id, parent_id, latitude, longitude, timestamp } = req.body;

  connection.query(
    'INSERT INTO tracking (parentId, childId, Longitude, Latitude, TimeStamp) VALUES (?, ?, ?, ?, ?)',
    [parent_id, child_id, longitude, latitude, timestamp],
    (err, result) => {
      if (err) {
        console.error('Error inserting tracking log into database:', err);
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      res.status(201).json({ message: 'Tracking log registered successfully' });

      // Notify all connected clients about the location update
      const locationUpdate = JSON.stringify({
        child_id,
        parent_id,
        latitude,
        longitude,
        timestamp
      });

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.parentId === parent_id) {
          client.send(locationUpdate);
        }
      });

      console.log(`Received location: Latitude = ${latitude}, Longitude = ${longitude}, timestamp = ${timestamp}`);
    }
  );
});

app.get('/child', (req, res) => {
  const parentId = req.query.parent_id;
  const childQuery = 'SELECT child_id FROM children WHERE parent_id = ?';

  connection.query(childQuery, [parentId], (err, childResults) => {
    if (err) {
      console.error('Error fetching children:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (childResults.length === 0) {
      return res.status(404).json({ message: 'No children found for the given parent ID' });
    }

    const childIds = childResults.map(child => child.child_id);
    const trackingQuery = `SELECT ChildId, latitude, longitude, timestamp FROM tracking WHERE ChildId IN (${childIds.join(',')})`;

    connection.query(trackingQuery, (err, trackingResults) => {
      if (err) {
        console.error('Error fetching tracking data:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json(trackingResults);
    });
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
