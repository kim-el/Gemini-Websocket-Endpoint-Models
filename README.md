# Gemini Live API Voice Transcription

A real-time voice transcription application using Google's Gemini Live API via WebSocket connection.

## 🎯 Features

- ✅ Real-time voice transcription
- ✅ WebSocket connection to Gemini Live API  
- ✅ Clean, modern web interface
- ✅ 16-bit PCM audio processing
- ✅ Extremely low cost (~$0.003 per 5-minute session)

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <your-repo-url>
cd Gemini-Websocket-Endpoint-Models
npm install
```

### 2. Set Up Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your Google API key
GOOGLE_API_KEY=your_actual_api_key_here
```

### 3. Run the Application
```bash
npm start
```

### 4. Open Browser
Navigate to `http://localhost:3000` and start transcribing!

## 🔧 Technical Details

### Supported Models
- ✅ `models/gemini-2.0-flash-live-001` (Primary)
- ✅ `models/gemini-2.0-flash-exp` (Alternative)

### Audio Format
- **Sample Rate:** 16kHz
- **Format:** 16-bit PCM
- **MIME Type:** `audio/pcm;rate=16000`

### WebSocket Endpoint
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent
```

## 💰 Pricing

- **Audio Processing:** 25 tokens per second
- **Cost:** ~$0.0000025 per second of audio
- **5-minute session:** ~$0.00075
- **Very affordable for production use!**

## 🔒 Security

- ✅ API keys stored in environment variables
- ✅ `.gitignore` prevents key exposure
- ✅ No hardcoded secrets in source code

## 📁 Project Structure

```
├── server.js              # Express server
├── voice-transcription.js # Frontend WebSocket client
├── index.html             # Web interface
├── test-all-models.js     # Model testing utility
├── .env                   # Environment variables (not in git)
├── .env.example           # Example environment file
└── .gitignore             # Git ignore rules
```

## 🛠️ Development

### Test All Available Models
```bash
node test-all-models.js
```

### Environment Variables
- `GOOGLE_API_KEY` - Your Google AI API key (required)

## ⚠️ Important Notes

- The Live API is currently in preview
- Ensure your API key has Live API access
- Audio processing requires HTTPS in production
- Microphone permissions required in browser

## 🎉 Success Story

This project successfully reverse-engineered the Gemini Live API WebSocket protocol and achieved real-time voice transcription with minimal cost and excellent performance!

## 📝 License

ISC