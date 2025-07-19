class GeminiVoiceTranscription {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.isConnected = false;
        this.isRecording = false;
        
        // Configuration - will be loaded from server
        this.apiKey = null;
        this.model = 'models/gemini-2.0-flash-live-001'; // Use the working model
        this.endpoint = null; // Will be set after loading API key
        
        // Audio settings for Gemini Live API
        this.sampleRate = 16000; // 16kHz for input audio as required by Gemini Live API
        this.audioQueue = [];
        
        // Live API Token Counting (Official Google Documentation)
        this.AUDIO_TOKENS_PER_SECOND = 25; // Official: 25 tokens per second for audio input/output
        this.VIDEO_TOKENS_PER_SECOND = 258; // Official: 258 tokens per second for video input
        this.TEXT_CHARS_PER_TOKEN = 4; // Official: ~4 characters per token
        this.COST_PER_MILLION_TOKENS = 0.10; // $0.10 per 1M tokens
        
        // Session tracking
        this.sessionStats = {
            audioInputSeconds: 0,
            audioOutputSeconds: 0,
            textInputTokens: 0,
            textOutputTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
            sessionStart: null
        };
        
        // Recording time tracking
        this.recordingStartTime = null;
        
        this.initializeElements();
        this.loadConfig();
    }

    async loadConfig() {
        try {
            this.updateStatus('Loading configuration...');
            const response = await fetch('/api/config');
            const config = await response.json();
            
            this.apiKey = config.apiKey;
            this.endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
            
            if (this.apiKey && this.apiKey !== 'your_api_key_here') {
                this.connectToGemini();
            } else {
                this.updateStatus('Please configure your Google API key in the .env file', true);
            }
        } catch (error) {
            this.updateStatus('Failed to load configuration: ' + error.message, true);
        }
    }

    // Token counting methods based on official Gemini Live API documentation
    calculateAudioTokens(seconds) {
        return Math.ceil(seconds * this.AUDIO_TOKENS_PER_SECOND);
    }

    calculateTextTokens(text) {
        return Math.ceil(text.length / this.TEXT_CHARS_PER_TOKEN);
    }

    calculateCost(totalTokens) {
        return (totalTokens / 1000000) * this.COST_PER_MILLION_TOKENS;
    }

    updateTokenCounter() {
        // Calculate current session totals
        const audioInputTokens = this.calculateAudioTokens(this.sessionStats.audioInputSeconds);
        const audioOutputTokens = this.calculateAudioTokens(this.sessionStats.audioOutputSeconds);
        const totalTokens = audioInputTokens + audioOutputTokens + 
                           this.sessionStats.textInputTokens + this.sessionStats.textOutputTokens;
        
        this.sessionStats.totalTokens = totalTokens;
        this.sessionStats.estimatedCost = this.calculateCost(totalTokens);

        // Update display
        document.getElementById('audioInputTokens').textContent = audioInputTokens.toLocaleString();
        document.getElementById('audioOutputTokens').textContent = audioOutputTokens.toLocaleString();
        document.getElementById('textInputTokens').textContent = this.sessionStats.textInputTokens.toLocaleString();
        document.getElementById('textOutputTokens').textContent = this.sessionStats.textOutputTokens.toLocaleString();
        document.getElementById('totalTokens').textContent = totalTokens.toLocaleString();
        document.getElementById('estimatedCost').textContent = `$${this.sessionStats.estimatedCost.toFixed(6)}`;
        
        // Update timing info
        const sessionDuration = this.sessionStats.sessionStart ? 
            (Date.now() - this.sessionStats.sessionStart) / 1000 : 0;
        document.getElementById('sessionDuration').textContent = `${sessionDuration.toFixed(1)}s`;
        document.getElementById('audioInputTime').textContent = `${this.sessionStats.audioInputSeconds.toFixed(1)}s`;
        document.getElementById('audioOutputTime').textContent = `${this.sessionStats.audioOutputSeconds.toFixed(1)}s`;
    }

    resetTokenCounter() {
        this.sessionStats = {
            audioInputSeconds: 0,
            audioOutputSeconds: 0,
            textInputTokens: 0,
            textOutputTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
            sessionStart: Date.now()
        };
        this.updateTokenCounter();
    }
    
    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.status = document.getElementById('statusText');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.transcription = document.getElementById('transcription');
        
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearTranscription());
    }
    
    updateStatus(message, isError = false) {
        this.status.textContent = message;
        if (isError) {
            this.status.style.color = '#ff6b6b';
        } else {
            this.status.style.color = 'white';
        }
        console.log(message);
    }
    
    updateConnectionStatus(status) {
        this.connectionStatus.className = `connection-status ${status}`;
    }
    
    connectToGemini() {
        this.updateStatus('Connecting to Gemini Live API...');
        this.updateConnectionStatus('connecting');
        
        this.ws = new WebSocket(this.endpoint);
        
        this.ws.onopen = () => {
            console.log('Connected to Gemini Live API');
            this.updateConnectionStatus('connected');
            this.sendConfiguration();
        };
        
        this.ws.onmessage = async (event) => {
            try {
                let messageText;
                
                if (event.data instanceof Blob) {
                    messageText = await event.data.text();
                } else {
                    messageText = event.data;
                }
                
                console.log('Raw message text:', messageText);
                const message = JSON.parse(messageText);
                this.handleGeminiMessage(message);
            } catch (error) {
                console.error('Error parsing message:', error);
                console.log('Raw message:', event.data);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Connection error occurred', true);
            this.updateConnectionStatus('disconnected');
        };
        
        this.ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            this.updateStatus(`Connection closed: ${event.reason || 'Unknown reason'}`, true);
            this.updateConnectionStatus('disconnected');
            this.isConnected = false;
            
            // Disable auto-reconnect for now to stop the loop
            // if (event.code !== 1000) { // Not a normal closure
            //     setTimeout(() => {
            //         this.updateStatus('Attempting to reconnect...');
            //         this.connectToGemini();
            //     }, 3000);
            // }
        };
    }
    
    sendConfiguration() {
        // Simplified config that should work with v1alpha
        const config = {
            setup: {
                model: this.model,
                generationConfig: {
                    responseModalities: ["TEXT"]
                }
            }
        };
        
        console.log('Sending configuration:', config);
        this.ws.send(JSON.stringify(config));
    }
    
    handleGeminiMessage(message) {
        console.log('Received message type:', Object.keys(message));
        console.log('Full message:', message);
        
        if (message.setupComplete) {
            this.isConnected = true;
            this.updateStatus('✅ Ready to transcribe! Click "Start Recording"');
            
        } else if (message.serverContent) {
            console.log('Server content received:', message.serverContent);
            
            // Check for input transcription (user's voice being transcribed)
            if (message.serverContent.inputTranscription) {
                const transcript = message.serverContent.inputTranscription.text;
                if (transcript) {
                    console.log('Input transcription received:', transcript);
                    this.appendTranscription(transcript);
                }
            }
            
            // Check for model turn (Gemini's response)
            if (message.serverContent.modelTurn) {
                const turn = message.serverContent.modelTurn;
                if (turn.parts) {
                    turn.parts.forEach(part => {
                        if (part.text) {
                            console.log('Gemini response text:', part.text);
                            // Track text output tokens
                            this.sessionStats.textOutputTokens += this.calculateTextTokens(part.text);
                            this.updateTokenCounter();
                            // Append Gemini's text response as transcription
                            this.appendTranscription(part.text);
                        }
                    });
                }
            }
            
            // Check for output transcription (Gemini's speech transcription)
            if (message.serverContent.outputTranscription) {
                const transcript = message.serverContent.outputTranscription.text;
                if (transcript) {
                    console.log('Output transcription received:', transcript);
                    this.appendTranscription(transcript);
                }
            }
            
        } else {
            console.log('Unknown message type received');
        }
    }
    
    appendTranscription(text) {
        // Clean up the text - remove extra newlines and whitespace
        const cleanText = text.trim();
        if (!cleanText) return;
        
        // Check if this is the first transcription
        const currentContent = this.transcription.innerHTML;
        if (currentContent.includes('Your voice transcription will appear here...')) {
            // First transcription - replace placeholder
            this.transcription.innerHTML = `<p>${cleanText}</p>`;
        } else {
            // Check if we should start a new paragraph (if text ends with punctuation)
            const lastChar = this.transcription.textContent.slice(-1);
            const shouldNewParagraph = ['.', '!', '?', '\n'].includes(lastChar) || 
                                     cleanText.match(/^[A-Z]/) && cleanText.length > 20;
            
            if (shouldNewParagraph) {
                // Start new paragraph
                this.transcription.innerHTML += `<p>${cleanText}</p>`;
            } else {
                // Continue current paragraph
                const paragraphs = this.transcription.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    const lastParagraph = paragraphs[paragraphs.length - 1];
                    lastParagraph.textContent += ' ' + cleanText;
                } else {
                    // No paragraphs yet, create first one
                    this.transcription.innerHTML = `<p>${cleanText}</p>`;
                }
            }
        }
        
        // Auto-scroll to bottom
        this.transcription.scrollTop = this.transcription.scrollHeight;
    }
    
    async startRecording() {
        if (!this.isConnected) {
            this.updateStatus('Please wait for connection to be established', true);
            return;
        }
        
        try {
            // Request microphone access with specific settings for Gemini Live API
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000, // 16kHz as required by Gemini Live API
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            // Create AudioContext to process raw audio for PCM conversion
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            this.source = this.audioContext.createMediaStreamSource(this.audioStream);
            
            // Use ScriptProcessorNode to get raw PCM data
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.processor.onaudioprocess = (event) => {
                if (this.isRecording) {
                    const inputBuffer = event.inputBuffer.getChannelData(0);
                    this.sendPCMAudio(inputBuffer);
                }
            };
            
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Initialize session tracking if first recording
            if (!this.sessionStats.sessionStart) {
                this.resetTokenCounter();
            }
            
            this.startBtn.disabled = true;
            this.startBtn.classList.add('recording');
            this.stopBtn.disabled = false;
            this.updateStatus('🔴 Recording... Speak now!');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('Error accessing microphone: ' + error.message, true);
        }
    }
    
    stopRecording() {
        if (this.isRecording) {
            this.isRecording = false;
            
            // Final token counter update (audio input already tracked in real-time)
            this.updateTokenCounter();
            this.recordingStartTime = null;
            
            // Stop audio processing
            if (this.processor) {
                this.processor.disconnect();
            }
            if (this.source) {
                this.source.disconnect();
            }
            if (this.audioContext) {
                this.audioContext.close();
            }
            
            // Stop all audio tracks
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
            }
            
            this.startBtn.disabled = false;
            this.startBtn.classList.remove('recording');
            this.stopBtn.disabled = true;
            this.updateStatus('Recording stopped. Ready to record again.');
        }
    }
    
    sendPCMAudio(audioBuffer) {
        if (!this.isConnected || !this.ws) return;
        
        try {
            // Convert Float32Array to 16-bit PCM
            const pcmData = new Int16Array(audioBuffer.length);
            for (let i = 0; i < audioBuffer.length; i++) {
                // Convert from [-1, 1] to [-32768, 32767]
                pcmData[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32768));
            }
            
            // Convert to base64
            const uint8Array = new Uint8Array(pcmData.buffer);
            const base64Audio = btoa(String.fromCharCode(...uint8Array));
            
            console.log('Sending PCM audio chunk, samples:', audioBuffer.length);
            
            // Track audio input in real-time (each chunk is ~256ms at 4096 samples / 16000 Hz)
            const chunkDuration = audioBuffer.length / this.sampleRate; // duration in seconds
            this.sessionStats.audioInputSeconds += chunkDuration;
            
            // Update counter every second for smooth real-time display
            if (Math.floor(this.sessionStats.audioInputSeconds) !== Math.floor(this.sessionStats.audioInputSeconds - chunkDuration)) {
                this.updateTokenCounter();
            }
            
            // Use the correct message structure for Gemini Live API
            const audioMessage = {
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Audio
                    }]
                }
            };
            
            this.ws.send(JSON.stringify(audioMessage));
            
        } catch (error) {
            console.error('Error sending PCM audio:', error);
            this.updateStatus('Error sending audio: ' + error.message, true);
        }
    }
    
    clearTranscription() {
        this.transcription.innerHTML = '<em>Your voice transcription will appear here...</em>';
    }
}

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', () => {
    new GeminiVoiceTranscription();
});