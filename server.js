const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Load environment variables

const app = express();
const port = 3000;

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// API endpoint to get configuration (without exposing the full API key)
app.get('/api/config', (req, res) => {
    res.json({
        apiKey: process.env.GOOGLE_API_KEY || 'your_api_key_here'
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`🌐 Voice Transcription Server running at http://localhost:${port}`);
    console.log('🎤 Open your browser and click "Start Recording" to transcribe your voice!');
});