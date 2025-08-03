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
        this.promptInput = document.getElementById('promptInput');
        this.status = document.getElementById('statusText');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.transcription = document.getElementById('transcription');
        
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearTranscription());
        
        // Track when prompt changes to show user they need to reconnect
        this.lastPrompt = '';
        this.promptInput.addEventListener('input', () => this.handlePromptChange());
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
    
    handlePromptChange() {
        const currentPrompt = this.promptInput.value.trim();
        if (this.isConnected && currentPrompt !== this.lastPrompt) {
            this.updateStatus('Prompt changed. Click "Start Recording" to apply new instructions.');
            // We'll reconnect when starting recording to apply the new prompt
        }
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
        // Get user's prompt for system instruction
        const userPrompt = this.promptInput.value.trim();
        
        // Base config that should work with v1alpha with live transcription
        const config = {
            setup: {
                model: this.model,
                generationConfig: {
                    responseModalities: ["TEXT"]
                }
            }
        };
        
        // Add system instruction if user provided a prompt
        if (userPrompt) {
            config.setup.systemInstruction = {
                parts: [{
                    text: `${userPrompt}\n\nIMPORTANT: Process the user's voice input live according to the instruction above. Provide incremental updates word-by-word or phrase-by-phrase as the user speaks. Be concise and respond progressively to build up your response as you hear more of their speech.`
                }]
            };
        } else {
            // Default behavior - just transcribe live
            config.setup.systemInstruction = {
                parts: [{
                    text: "You are a live voice transcription assistant. Transcribe what the user says in real-time, showing progressive updates as they speak. Provide accurate, word-by-word transcription."
                }]
            };
        }
        
        console.log('Sending configuration:', config);
        this.ws.send(JSON.stringify(config));
    }
    
    handleGeminiMessage(message) {
        console.log('Received message type:', Object.keys(message));
        console.log('Full message:', message);
        
        if (message.setupComplete) {
            this.isConnected = true;
            this.updateStatus('✅ Ready for live transcription! Click "Start Recording"');
            
        } else if (message.serverContent) {
            console.log('Server content received:', message.serverContent);
            
            // Handle live transcription - prioritize model turns for prompt processing
            if (message.serverContent.modelTurn) {
                const turn = message.serverContent.modelTurn;
                if (turn.parts) {
                    turn.parts.forEach(part => {
                        if (part.text) {
                            console.log('Gemini live response:', part.text);
                            // Track text output tokens
                            this.sessionStats.textOutputTokens += this.calculateTextTokens(part.text);
                            this.updateTokenCounter();
                            // For live transcription with prompts, display Gemini's processed response
                            this.updateLiveTranscription(part.text, 'response');
                        }
                    });
                }
            }
            
            // Handle input transcription for live display (when no prompt or as fallback)
            else if (message.serverContent.inputTranscription) {
                const transcript = message.serverContent.inputTranscription.text;
                if (transcript) {
                    console.log('Input transcription received:', transcript);
                    // Only show input transcription if no prompt is set (pure transcription mode)
                    if (!this.promptInput.value.trim()) {
                        this.updateLiveTranscription(transcript, 'input');
                    }
                }
            }
            
            // Handle output transcription if available
            else if (message.serverContent.outputTranscription) {
                const transcript = message.serverContent.outputTranscription.text;
                if (transcript) {
                    console.log('Output transcription received:', transcript);
                    this.updateLiveTranscription(transcript, 'output');
                }
            }
            
        } else {
            console.log('Unknown message type received');
        }
    }
    
    updateLiveTranscription(text, type = 'input') {
        // Clean up the text - remove extra newlines and whitespace
        const cleanText = text.trim();
        if (!cleanText) return;
        
        // Initialize live transcription tracking
        if (!this.liveTranscription) {
            this.liveTranscription = {
                currentText: '',
                lastUpdateLength: 0,
                revisionBuffer: []
            };
        }
        
        console.log(`[${type}] Live transcription update:`, cleanText);
        
        // Handle context-based revisions - if new text is shorter or significantly different
        // it might be a correction/revision of earlier content
        if (this.shouldReviseText(cleanText, this.liveTranscription.currentText)) {
            console.log('Detected revision, updating previous text');
            this.liveTranscription.currentText = cleanText;
        } else {
            // Progressive update - new content being added
            if (cleanText.length > this.liveTranscription.currentText.length) {
                this.liveTranscription.currentText = cleanText;
            } else if (cleanText !== this.liveTranscription.currentText) {
                // Handle case where Gemini provides a refined version
                this.liveTranscription.currentText = cleanText;
            }
        }
        
        // Update the display
        this.displayLiveText(this.liveTranscription.currentText);
        
        // Track length for next comparison
        this.liveTranscription.lastUpdateLength = this.liveTranscription.currentText.length;
    }
    
    shouldReviseText(newText, currentText) {
        // Check if this looks like a revision rather than an addition
        if (!currentText) return false;
        
        // If new text is significantly shorter, it's likely a revision
        if (newText.length < currentText.length * 0.7) return true;
        
        // If new text doesn't start with current text, it's likely a revision
        if (!newText.startsWith(currentText.substring(0, Math.min(20, currentText.length)))) {
            return true;
        }
        
        return false;
    }
    
    displayLiveText(text) {
        // Check if this is the first transcription
        const currentContent = this.transcription.innerHTML;
        if (currentContent.includes('Your voice transcription will appear here...')) {
            // First transcription - replace placeholder
            this.transcription.innerHTML = `<p class="live-transcription">${text}</p>`;
        } else {
            // Update existing live transcription
            const liveP = this.transcription.querySelector('.live-transcription');
            if (liveP) {
                liveP.textContent = text;
            } else {
                // Create new live transcription paragraph
                this.transcription.innerHTML = `<p class="live-transcription">${text}</p>`;
            }
        }
        
        // Auto-scroll to bottom
        this.transcription.scrollTop = this.transcription.scrollHeight;
    }
    
    // Keep old method for compatibility during transition
    appendTranscription(text) {
        this.updateLiveTranscription(text, 'legacy');
    }
    
    async startRecording() {
        const currentPrompt = this.promptInput.value.trim();
        
        // Check if we need to reconnect due to prompt change
        if (this.isConnected && currentPrompt !== this.lastPrompt) {
            this.updateStatus('Reconnecting with new prompt...');
            this.ws.close();
            this.isConnected = false;
            // Wait a moment for the connection to close
            await new Promise(resolve => setTimeout(resolve, 500));
            this.connectToGemini();
            // Wait for connection to be established
            while (!this.isConnected) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        if (!this.isConnected) {
            this.updateStatus('Please wait for connection to be established', true);
            return;
        }
        
        // Update the last prompt
        this.lastPrompt = currentPrompt;
        
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
            
            // Reset live transcription state for new recording
            this.liveTranscription = {
                currentText: '',
                lastUpdateLength: 0,
                revisionBuffer: []
            };
            
            this.startBtn.disabled = true;
            this.startBtn.classList.add('recording');
            this.stopBtn.disabled = false;
            this.updateStatus('🔴 Live transcription active - speak and see results in real-time!');
            
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
            this.updateStatus('Live transcription stopped. Ready to start again.');
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
        // Reset live transcription state
        this.liveTranscription = null;
    }
}

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', () => {
    new GeminiVoiceTranscription();
});