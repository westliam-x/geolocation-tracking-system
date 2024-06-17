const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(express.json());

// Enable CORS for all routes
app.use(cors());

app.post('/updateLocation', (req, res) => {
    const { latitude, longitude, timestamp } = req.body;
    console.log(`Received location: Latitude = ${latitude}, Longitude = ${longitude}, timestamp = ${timestamp}`);
    // You can save the location to your database here
    res.json({ message: 'Location received', 'longitude': longitude, 'latitude': latitude, "timestamp": timestamp });
});

app.listen(port, () => {
    console.log(`Server running at ${port}`);
});
