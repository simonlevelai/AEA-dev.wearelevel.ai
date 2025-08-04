import { Request, Response, Express } from 'express';
import { AskEveBot } from '../bot/AskEveBot';
import { MessageContext, AgentResponse } from '../types';

interface AgentsSdkMessage {
  text: string;
  id: string;
  userId: string;
  conversationId: string;
  timestamp: Date;
}

interface AgentsSdkResponse {
  text: string;
  suggestedActions?: string[];
  attachments?: Array<{
    contentType: string;
    content: any;
  }>;
}

export class AgentsSdkAdapter {
  private bot: AskEveBot;
  private conversationHistories: Map<string, AgentsSdkMessage[]> = new Map();

  constructor(bot: AskEveBot) {
    this.bot = bot;
  }

  public configure(): void {
    console.log('AgentsSdkAdapter configured successfully');
  }

  public configureExpress(app: Express): void {
    // Health check endpoint - CRITICAL for monitoring
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'healthy', 
        service: 'ask-eve-assist-agents-sdk',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        safetySystemsActive: true
      });
    });

    // Main message processing endpoint
    app.post('/api/messages', async (req: Request, res: Response): Promise<void> => {
      try {
        const { text, userId, conversationId } = req.body;
        
        if (!text || !userId || !conversationId) {
          res.status(400).json({ 
            error: 'Missing required fields: text, userId, conversationId' 
          });
          return;
        }

        const message: AgentsSdkMessage = {
          text,
          id: `msg_${Date.now()}`,
          userId,
          conversationId,
          timestamp: new Date()
        };

        // Get conversation history
        const history = this.conversationHistories.get(conversationId) || [];
        
        // Create message context
        const context = this.createMessageContext(message, history);
        
        // Process message through bot
        await this.bot.handleUserMessage(context);
        
        // Update conversation history
        history.push(message);
        this.conversationHistories.set(conversationId, history);
        
        res.json({ success: true });
      } catch (error) {
        console.error('AgentsSdkAdapter error:', error);
        res.status(500).json({ 
          error: 'Failed to process message',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Widget configuration endpoint - maintaining branding
    app.get('/api/widget-config', (_req: Request, res: Response) => {
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

    // Enhanced widget HTML with Agents SDK integration
    app.get('/widget', (_req: Request, res: Response) => {
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
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1 style="margin: 0; font-size: 24px;">Ask Eve Assist</h1>
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
                const response = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: message,
                        userId: userId,
                        conversationId: conversationId
                    })
                });
                
                // Note: In a real implementation, we'd need WebSocket or SSE for real-time responses
                // For demo purposes, we'll show a placeholder response
                setTimeout(() => {
                    addMessage('Thank you for your message. The Agents SDK integration is being finalized. Please check back soon!', false);
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
            addMessage("Hello! I'm Ask Eve Assist, here to help you find trusted information about gynaecological health. How can I help you today?", false, [
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
  }

  private createMessageContext(message: AgentsSdkMessage, history: AgentsSdkMessage[]): MessageContext {
    let responseData: AgentsSdkResponse | null = null;
    
    return {
      message: {
        text: message.text,
        id: message.id
      },
      conversationId: message.conversationId,
      userId: message.userId,
      conversationHistory: history.map(msg => ({
        text: msg.text,
        timestamp: msg.timestamp,
        isUser: true
      })),
      send: async (response: AgentResponse) => {
        responseData = {
          text: response.text,
          ...(response.suggestedActions && { suggestedActions: response.suggestedActions }),
          ...(response.attachments && { attachments: response.attachments })
        };
        // In a real implementation, this would send via WebSocket or similar
        console.log('Bot response:', responseData);
      },
      sendTyping: async () => {
        // In a real implementation, this would show typing indicator
        console.log('Typing indicator...');
      }
    };
  }
}