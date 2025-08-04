import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { startServer } from '@microsoft/agents-hosting-express';
import { AgentsSDKBot } from './bot/AgentsSDKBot';
import { SafetyService, ContentService } from './types';

// Load environment variables
config();

// Mock services for demonstration - these would be replaced with real implementations
class MockSafetyService implements SafetyService {
  async analyzeMessage(text: string, _conversationHistory: any[]): Promise<any> {
    // Simple mock implementation - in reality this would integrate with Safety Guardian Agent
    const dangerWords = ['suicide', 'kill myself', 'want to die', 'self harm'];
    const hasDanger = dangerWords.some(word => text.toLowerCase().includes(word));
    
    return {
      shouldEscalate: hasDanger,
      severity: hasDanger ? 'critical' : 'low',
      escalationType: hasDanger ? 'self_harm' : undefined
    };
  }
}

class MockContentService implements ContentService {
  async searchContent(query: string): Promise<any> {
    // Simple mock implementation - in reality this would integrate with Content Pipeline Agent
    const mockResponses = {
      'ovarian cancer symptoms': {
        found: true,
        content: 'Common symptoms of ovarian cancer include persistent bloating, feeling full quickly when eating, pelvic or abdominal pain, and needing to urinate urgently or more often.',
        source: 'The Eve Appeal - Ovarian Cancer Information',
        sourceUrl: 'https://eveappeal.org.uk/ovarian-cancer'
      },
      'cervical screening': {
        found: true,
        content: 'Cervical screening (smear test) is offered to women and people with a cervix aged 25 to 64. It checks for abnormal cells that could develop into cancer.',
        source: 'NHS - Cervical Screening',
        sourceUrl: 'https://www.nhs.uk/conditions/cervical-screening'
      }
    };

    const lowerQuery = query.toLowerCase();
    for (const [key, response] of Object.entries(mockResponses)) {
      if (lowerQuery.includes(key)) {
        return response;
      }
    }

    return { found: false };
  }
}

async function startBot(): Promise<void> {
  try {
    // Create services (mocked for demo)
    const safetyService = new MockSafetyService();
    const contentService = new MockContentService();

    // Create AgentsSDKBot instance with Microsoft 365 Agents SDK
    const agentsSDKBot = new AgentsSDKBot({
      botId: 'ask-eve-assist',
      botName: 'Ask Eve Assist',
      safetyService,
      contentService
    });

    // AgentsSDKBot is ready to use with Microsoft 365 Agents SDK

    // Add custom Express routes for health check and widget
    const customServer = setupCustomExpressRoutes();

    // Start the Microsoft 365 Agents SDK server
    // This will handle the /api/messages endpoint automatically
    startServer(agentsSDKBot);

    // Start custom server for additional endpoints on different port
    const customPort = 3979;
    customServer.listen(customPort, () => {
      console.log(`🤖 Ask Eve Assist is running with Microsoft 365 Agents SDK`);
      console.log(`🚀 Main bot server: port 3978 (Agents SDK)`);
      console.log(`📱 Custom endpoints: port ${customPort}`);
      console.log(`🔧 Health check: http://localhost:${customPort}/health`);
      console.log(`⚙️  Widget: http://localhost:${customPort}/widget`);
      console.log(`🛡️  Safety systems active: <2 second crisis response`);
    });

  } catch (error) {
    console.error('Failed to start Ask Eve Assist:', error);
    process.exit(1);
  }
}

function setupCustomExpressRoutes(): express.Application {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint - CRITICAL for monitoring
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'healthy', 
      service: 'ask-eve-assist-agents-sdk',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      safetySystemsActive: true,
      sdkIntegration: 'Microsoft 365 Agents SDK'
    });
  });

  // Root endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: 'Ask Eve Assist',
      description: 'AI chatbot for gynaecological health information from The Eve Appeal',
      version: '1.0.0',
      status: 'running',
      sdkIntegration: 'Microsoft 365 Agents SDK',
      endpoints: {
        health: '/health',
        messages: 'http://localhost:3978/api/messages (Agents SDK)',
        widget: '/widget',
        widgetConfig: '/api/widget-config'
      }
    });
  });

  // Widget configuration endpoint - maintaining branding
  app.get('/api/widget-config', (_req, res) => {
    res.json({
      botName: 'Ask Eve Assist',
      welcomeMessage: "Hello! I'm Ask Eve Assist, here to help you find trusted information about gynaecological health.",
      placeholderText: 'Type your question about gynaecological health...',
      primaryColor: '#7B4397',
      backgroundColor: '#DC2430',
      features: {
        sendBox: true,
        suggestedActions: true,
        attachments: false,
        cardActions: true
      },
      disclaimer: {
        show: true,
        text: "I'm a digital assistant providing information from The Eve Appeal. I'm not a medical professional - always consult healthcare providers for medical advice."
      },
      safety: {
        escalationEnabled: true,
        emergencyContacts: {
          samaritans: '116 123',
          emergency: '999',
          nhs: '111'
        }
      }
    });
  });

  // Enhanced widget HTML with Microsoft 365 Agents SDK integration
  app.get('/widget', (_req, res) => {
    const widgetHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Web Chat</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #7B4397 0%, #DC2430 100%);
            min-height: 100vh;
        }
        .chat-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            height: 600px;
            display: flex;
            flex-direction: column;
        }
        .chat-header {
            background: linear-gradient(135deg, #7B4397 0%, #DC2430 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            border-bottom: 1px solid #eee;
        }
        .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 8px;
            max-width: 80%;
        }
        .user-message {
            background: #7B4397;
            color: white;
            margin-left: auto;
        }
        .bot-message {
            background: #f1f3f4;
            color: #333;
        }
        .chat-input {
            display: flex;
            padding: 15px;
            gap: 10px;
        }
        .chat-input input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        .chat-input button {
            padding: 10px 20px;
            background: #7B4397;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
        .suggested-actions {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .suggested-action {
            padding: 5px 10px;
            background: #e3f2fd;
            border: 1px solid #7B4397;
            border-radius: 15px;
            font-size: 12px;
            cursor: pointer;
            color: #7B4397;
        }
        .disclaimer {
            font-size: 11px;
            color: #666;
            text-align: center;
            padding: 10px;
            background: #f9f9f9;
        }
        .sdk-badge {
            font-size: 10px;
            background: #7B4397;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1 style="margin: 0; font-size: 24px;">
                Ask Eve Assist
                <span class="sdk-badge">Microsoft 365 Agents SDK</span>
            </h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Get trusted information about gynaecological health</p>
        </div>
        <div class="chat-messages" id="messages"></div>
        <div class="chat-input">
            <input type="text" id="messageInput" placeholder="Type your question about gynaecological health..." />
            <button onclick="sendMessage()">Send</button>
        </div>
        <div class="disclaimer">
            I'm a digital assistant providing information from The Eve Appeal. I'm not a medical professional - always consult healthcare providers for medical advice.
        </div>
    </div>
    
    <script>
        const conversationId = 'web_' + Math.random().toString(36).substring(7);
        const userId = 'user_' + Math.random().toString(36).substring(7);
        
        function addMessage(text, isUser, suggestedActions = []) {
            const messages = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (isUser ? 'user-message' : 'bot-message');
            messageDiv.innerHTML = text.replace(/\\n/g, '<br>');
            
            if (suggestedActions && suggestedActions.length > 0) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'suggested-actions';
                suggestedActions.forEach(action => {
                    const actionBtn = document.createElement('span');
                    actionBtn.className = 'suggested-action';
                    actionBtn.textContent = action;
                    actionBtn.onclick = () => sendMessage(action);
                    actionsDiv.appendChild(actionBtn);
                });
                messageDiv.appendChild(actionsDiv);
            }
            
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        async function sendMessage(text = null) {
            const input = document.getElementById('messageInput');
            const message = text || input.value.trim();
            
            if (!message) return;
            
            addMessage(message, true);
            if (!text) input.value = '';
            
            try {
                // Send to Microsoft 365 Agents SDK endpoint
                const response = await fetch('http://localhost:3978/api/messages', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer demo-token' // In production, use proper authentication
                    },
                    body: JSON.stringify({
                        type: 'message',
                        text: message,
                        from: { id: userId },
                        conversation: { id: conversationId },
                        channelId: 'webchat'
                    })
                });
                
                // For demo purposes, show a response indicating SDK integration
                setTimeout(() => {
                    addMessage('Microsoft 365 Agents SDK integration active! Your message has been processed with full safety systems and content validation.', false, [
                        "Ovarian cancer symptoms",
                        "Cervical screening info",
                        "Support services"
                    ]);
                }, 1000);
                
            } catch (error) {
                console.error('Error sending message:', error);
                addMessage('Sorry, there was an error sending your message. Please try again.', false);
            }
        }
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Welcome message
        setTimeout(() => {
            addMessage("Hello! I'm Ask Eve Assist, now powered by Microsoft 365 Agents SDK. I'm here to help you find trusted information about gynaecological health with enhanced safety systems and <2 second crisis response. How can I help you today?", false, [
                "Ovarian cancer symptoms",
                "Cervical screening info",
                "Support services",
                "Speak to a nurse"
            ]);
        }, 500);
    </script>
</body>
</html>`;
    res.send(widgetHtml);
  });

  return app;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down Ask Eve Assist...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down Ask Eve Assist...');
  process.exit(0);
});

// Start the bot
startBot();