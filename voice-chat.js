const WebSocket = require('ws');

// Configuration
const API_KEY = 'AIzaSyBir4ba5sGOvDjwxijASbqZrxjJwMevSy0'; // Replace with your API key
const MODEL = 'models/gemini-2.0-flash-live-001'; // This model works with text-only
const VOICE = 'Puck'; // Available: Aoede, Charon, Fenrir, Kore, Puck

// Gemini Live API WebSocket endpoint
const ENDPOINT = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

class GeminiVoiceChat {
    constructor() {
        this.ws = null;
        this.isConnected = false;
    }

    async connect() {
        console.log('🔗 Connecting to Gemini Live API...');
        console.log(`📡 Endpoint: ${ENDPOINT.split('?')[0]}`);
        console.log(`🤖 Model: ${MODEL}`);
        console.log(`🎵 Voice: ${VOICE}\n`);

        this.ws = new WebSocket(ENDPOINT);

        this.ws.on('open', () => {
            console.log('✅ Connected to Gemini Live API!');
            this.sendConfiguration();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(JSON.parse(data.toString()));
        });

        this.ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed: ${code} ${reason}`);
            this.isConnected = false;
        });
    }

    sendConfiguration() {
        // Simplified config based on Pipecat's working implementation
        const config = {
            setup: {
                model: MODEL,
                generation_config: {
                    response_modalities: ["TEXT"],
                    temperature: 0.7
                }
            }
        };

        console.log('📋 Sending configuration...');
        console.log('Config:', JSON.stringify(config, null, 2));
        this.ws.send(JSON.stringify(config));
    }

    sendTextMessage(text) {
        if (!this.isConnected) {
            console.log('❌ Not connected to Gemini Live API');
            return;
        }

        const message = {
            client_content: {
                turns: [{
                    role: "user",
                    parts: [{
                        text: text
                    }]
                }],
                turn_complete: true
            }
        };

        console.log(`👤 You: ${text}`);
        this.ws.send(JSON.stringify(message));
    }

    handleMessage(message) {
        if (message.setupComplete) {
            console.log('🎉 Setup complete! Ready to chat.');
            this.isConnected = true;
            
            // Send a test message
            console.log('\\n💬 Starting conversation...');
            this.sendTextMessage("Hello! Can you introduce yourself?");
            
        } else if (message.serverContent) {
            if (message.serverContent.modelTurn) {
                const turn = message.serverContent.modelTurn;
                
                if (turn.parts) {
                    turn.parts.forEach(part => {
                        if (part.text) {
                            console.log(`🤖 Gemini: ${part.text}`);
                        }
                        if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
                            console.log('🔊 [Received audio response - would play audio here]');
                        }
                    });
                }
            }
            
            if (message.serverContent.turnComplete) {
                console.log('\\n💬 Ready for next message...');
                console.log('Type a message or press Ctrl+C to exit\\n');
            }
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Main execution
async function main() {
    console.log('🎤 Gemini Voice Chat Demo');
    console.log('========================\\n');
    
    const chat = new GeminiVoiceChat();
    await chat.connect();

    // Keep the process alive
    process.on('SIGINT', () => {
        console.log('\\n👋 Goodbye!');
        chat.disconnect();
        process.exit(0);
    });

    // Simple interactive mode (for testing)
    setTimeout(() => {
        if (chat.isConnected) {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const askForInput = () => {
                rl.question('You: ', (input) => {
                    if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
                        console.log('👋 Goodbye!');
                        chat.disconnect();
                        rl.close();
                        process.exit(0);
                    }
                    
                    chat.sendTextMessage(input);
                    askForInput(); // Continue asking for input
                });
            };

            console.log('\\n🎯 Interactive mode ready!');
            console.log('Type your message and press Enter (or "quit" to exit)\\n');
            askForInput();
        }
    }, 5000);
}

main().catch(console.error);