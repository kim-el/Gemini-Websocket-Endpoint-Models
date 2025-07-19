const WebSocket = require('ws');

// Configuration
const API_KEY = 'AIzaSyBir4ba5sGOvDjwxijASbqZrxjJwMevSy0';
const ENDPOINT = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

// All possible model names to test
const MODELS_TO_TEST = [
    // Gemini 2.0 models
    'models/gemini-2.0-flash-live-001',
    'models/gemini-2.0-flash-exp',
    'models/gemini-2.0-flash-exp-live',
    'models/gemini-2.0-flash-live',
    'models/gemini-2.0-live',
    'models/gemini-2.0-flash-preview',
    'models/gemini-2.0-flash-preview-live',
    
    // Gemini 2.5 models
    'models/gemini-2.5-flash-preview-native-audio-dialog',
    'models/gemini-2.5-flash-live',
    'models/gemini-2.5-flash-exp',
    'models/gemini-2.5-flash-preview',
    'models/gemini-2.5-pro-preview-05-06',
    
    // Gemini 1.5 models
    'models/gemini-1.5-flash',
    'models/gemini-1.5-flash-live',
    'models/gemini-1.5-pro',
    'models/gemini-1.5-pro-live',
    'models/gemini-1.5-flash-8b',
    
    // Generic models
    'models/gemini-live',
    'models/gemini-pro',
    'models/gemini-pro-vision',
    'models/gemini-flash',
    
    // Without 'models/' prefix
    'gemini-2.0-flash-live-001',
    'gemini-2.0-flash-exp',
    'gemini-2.5-flash-preview-native-audio-dialog',
    'gemini-live'
];

class ModelTester {
    constructor() {
        this.results = [];
    }

    async testModel(modelName) {
        return new Promise((resolve) => {
            console.log(`\n🔍 Testing model: ${modelName}`);
            
            const ws = new WebSocket(ENDPOINT);
            let result = {
                model: modelName,
                status: 'unknown',
                error: null,
                setupComplete: false,
                responseReceived: false
            };

            const timeout = setTimeout(() => {
                result.status = 'timeout';
                result.error = 'Connection timeout';
                ws.close();
                resolve(result);
            }, 10000);

            ws.on('open', () => {
                console.log(`  ✅ Connected for ${modelName}`);
                
                // Send configuration
                const config = {
                    setup: {
                        model: modelName,
                        generationConfig: {
                            responseModalities: ["TEXT"]
                        }
                    }
                };

                ws.send(JSON.stringify(config));
            });

            ws.on('message', async (data) => {
                try {
                    let messageText;
                    if (data instanceof Buffer) {
                        messageText = data.toString();
                    } else if (data instanceof Blob) {
                        messageText = await data.text();
                    } else {
                        messageText = data;
                    }

                    const message = JSON.parse(messageText);
                    
                    if (message.setupComplete) {
                        result.setupComplete = true;
                        result.status = 'success';
                        console.log(`  🎉 Setup complete for ${modelName}`);
                        
                        // Send a test message
                        const testMessage = {
                            realtimeInput: {
                                mediaChunks: [{
                                    mimeType: "text/plain",
                                    data: btoa("Hello, test message")
                                }]
                            }
                        };
                        
                        ws.send(JSON.stringify(testMessage));
                    }
                    
                    if (message.serverContent) {
                        result.responseReceived = true;
                        console.log(`  📝 Response received from ${modelName}`);
                    }

                } catch (error) {
                    console.log(`  ❌ JSON parse error for ${modelName}: ${error.message}`);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                result.status = 'error';
                result.error = error.message;
                console.log(`  ❌ Error for ${modelName}: ${error.message}`);
                resolve(result);
            });

            ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                if (result.status === 'unknown') {
                    result.status = 'failed';
                    result.error = `Closed: ${code} ${reason}`;
                }
                console.log(`  🔌 Closed for ${modelName}: ${code} ${reason}`);
                
                // Wait a bit before resolving to see if we got responses
                setTimeout(() => resolve(result), 1000);
            });
        });
    }

    async testAllModels() {
        console.log('🚀 Testing all models against Gemini Live API WebSocket endpoint...\n');
        console.log(`📡 Endpoint: ${ENDPOINT.split('?')[0]}\n`);

        for (const model of MODELS_TO_TEST) {
            const result = await this.testModel(model);
            this.results.push(result);
            
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        this.printSummary();
    }

    printSummary() {
        console.log('\n\n🎯 MODEL TESTING SUMMARY');
        console.log('========================\n');

        const successful = this.results.filter(r => r.status === 'success');
        const failed = this.results.filter(r => r.status === 'failed');
        const errors = this.results.filter(r => r.status === 'error');
        const timeouts = this.results.filter(r => r.status === 'timeout');

        console.log(`✅ SUCCESSFUL MODELS (${successful.length}):`);
        successful.forEach(r => {
            const indicators = [];
            if (r.setupComplete) indicators.push('Setup✓');
            if (r.responseReceived) indicators.push('Response✓');
            console.log(`   🟢 ${r.model} ${indicators.length ? `(${indicators.join(', ')})` : ''}`);
        });

        if (failed.length > 0) {
            console.log(`\n❌ FAILED MODELS (${failed.length}):`);
            failed.forEach(r => {
                console.log(`   🔴 ${r.model} - ${r.error}`);
            });
        }

        if (errors.length > 0) {
            console.log(`\n⚠️  ERROR MODELS (${errors.length}):`);
            errors.forEach(r => {
                console.log(`   🟡 ${r.model} - ${r.error}`);
            });
        }

        if (timeouts.length > 0) {
            console.log(`\n⏰ TIMEOUT MODELS (${timeouts.length}):`);
            timeouts.forEach(r => {
                console.log(`   ⚪ ${r.model}`);
            });
        }

        console.log(`\n📊 TOTAL STATS:`);
        console.log(`   Total tested: ${this.results.length}`);
        console.log(`   Successful: ${successful.length}`);
        console.log(`   Failed: ${failed.length}`);
        console.log(`   Errors: ${errors.length}`);
        console.log(`   Timeouts: ${timeouts.length}`);

        console.log('\n🏆 RECOMMENDED MODELS FOR LIVE API:');
        successful
            .filter(r => r.setupComplete)
            .forEach(r => console.log(`   ⭐ ${r.model}`));
    }
}

// Run the test
const tester = new ModelTester();
tester.testAllModels().catch(console.error);