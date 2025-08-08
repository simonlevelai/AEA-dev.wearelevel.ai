import express from 'express';
import { AgentsSDKBot } from './AgentsSDKBot';
import { SafetyServiceAdapter } from '../services/SafetyServiceAdapter';
import { SupabaseContentService } from '../services/SupabaseContentService';
import { EscalationService } from '../services/EscalationService';
import { NotificationService } from '../services/NotificationService';
import { Logger } from '../utils/logger';
import { MessageContext, AgentResponse } from '../types';
import { TurnContext, ActivityHandler, MessageFactory } from 'botbuilder';

export class BotServer {
  private app: express.Application;
  private bot: AgentsSDKBot;
  private logger: Logger;
  private escalationService: EscalationService;
  private notificationService: NotificationService;

  constructor() {
    this.logger = new Logger('bot-server');
    this.app = express();
    this.setupMiddleware();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize services
      this.notificationService = new NotificationService(
        process.env.TEAMS_WEBHOOK_URL || 'test-webhook-url',
        this.logger
      );

      this.escalationService = new EscalationService(this.logger, this.notificationService);
      await this.escalationService.initialize();

      const safetyService = new SafetyServiceAdapter(this.escalationService, this.logger);
      const contentService = new SupabaseContentService(
        process.env.SUPABASE_URL || '',
        process.env.SUPABASE_ANON_KEY || '',
        this.logger
      );
      await contentService.initialize();

      // Initialize bot with ConversationFlowEngine integration
      this.bot = new AgentsSDKBot({
        botId: 'ask-eve-assist',
        botName: 'Ask Eve Assist',
        safetyService,
        contentService
      }, this.logger);
      
      // Initialize the bot's conversation flow engine
      await this.bot.initialize();

      this.setupRoutes();
      this.logger.info('BotServer initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize BotServer', { error });
      throw error;
    }
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static('public'));

    // CORS for web chat widget
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Web chat widget HTML page
    this.app.get('/widget', (req, res) => {
      const widgetHtml = this.generateWidgetHtml();
      res.send(widgetHtml);
    });

    // Bot messaging endpoint
    this.app.post('/api/messages', async (req, res) => {
      try {
        const { message, conversationId, userId } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        // Create mock TurnContext for the bot
        const mockContext = this.createMockTurnContext(message, conversationId, userId);
        
        // Process message through bot
        await this.bot.handleMessage(mockContext);
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Bot message processing failed', { error });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Direct chat API for web widget
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, conversationId = 'web-chat', userId = 'anonymous' } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        // Create MessageContext for direct processing
        const responses: AgentResponse[] = [];
        const context: MessageContext = {
          message: { text: message, id: `msg-${Date.now()}` },
          conversationId,
          userId,
          conversationHistory: [], // Simplified for web chat
          send: async (response: AgentResponse) => {
            responses.push(response);
          },
          sendTyping: async () => {
            // Web chat doesn't need typing indicators
          }
        };

        // Use the conversation flow engine for processing
        const mockTurnContext = this.createMockTurnContext(message, conversationId, userId);
        
        // Create a custom response collector
        let flowResponse: string = '';
        let flowSuggestedActions: string[] = [];
        
        const originalSendActivity = mockTurnContext.sendActivity;
        mockTurnContext.sendActivity = async (activity: any) => {
          flowResponse = activity.text || '';
          if (activity.suggestedActions) {
            flowSuggestedActions = activity.suggestedActions.actions.map((action: any) => action.title);
          }
          return originalSendActivity(activity);
        };
        
        // Process through conversation flow engine
        await this.bot.handleMessage(mockTurnContext);
        
        // Build response from conversation flow result
        if (flowResponse) {
          const response: AgentResponse = {
            text: flowResponse,
            suggestedActions: flowSuggestedActions.length > 0 ? flowSuggestedActions : undefined
          };
          responses.push(response);
        } else {
          // Fallback if no response was generated
          const fallbackResponse: AgentResponse = {
            text: "Hello! I'm Ask Eve Assist. How can I help you with gynaecological health information today?",
            suggestedActions: [
              "Ovarian cancer symptoms",
              "Cervical screening info",
              "Support services",
              "Speak to a nurse"
            ]
          };
          responses.push(fallbackResponse);
        }

        res.json({
          responses,
          conversationId,
          userId
        });

      } catch (error) {
        this.logger.error('Chat API error', { error });
        res.status(500).json({ 
          error: 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.',
          emergencyContacts: this.getEmergencyContacts()
        });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'ask-eve-bot-server',
        timestamp: new Date().toISOString()
      });
    });
  }

  private createMockTurnContext(message: string, conversationId: string, userId: string): TurnContext {
    const activity = MessageFactory.text(message);
    activity.from = { id: userId };
    activity.conversation = { id: conversationId };

    // Create a mock TurnContext with necessary methods
    const mockContext = {
      activity,
      sendActivity: async (activityToSend: any) => {
        this.logger.info('Bot response', { 
          text: activityToSend.text,
          userId,
          conversationId 
        });
        return { id: `response-${Date.now()}` };
      },
      sendActivities: async (activities: any[]) => {
        return activities.map(() => ({ id: `response-${Date.now()}` }));
      }
    } as any;

    return mockContext;
  }

  private buildEscalationResponse(safetyResult: any): AgentResponse {
    switch (safetyResult.escalationType) {
      case 'self_harm':
        return {
          text: "I'm concerned about what you've shared. If you're having thoughts of self-harm, please reach out for urgent support:\n\n• Samaritans: 116 123 (free, 24/7)\n• Text SHOUT to 85258\n• Emergency services: 999\n\nYour safety and wellbeing matter. Please speak to someone who can help.",
          suggestedActions: ["Call Samaritans", "Emergency Services", "Text SHOUT"]
        };

      case 'medical_emergency':
        return {
          text: "This sounds like it may need urgent medical attention. Please:\n\n• Call 999 for emergency services\n• Contact your GP urgently\n• Visit A&E if symptoms are severe\n\nI can provide general health information, but I cannot assess medical emergencies. Please seek immediate medical help.",
          suggestedActions: ["Call 999", "Contact GP", "Find A&E"]
        };

      default:
        return {
          text: "I need to direct you to speak with a healthcare professional about this. Please contact:\n\n• Your GP\n• The Eve Appeal Nurse Line\n• NHS 111 for non-emergency health advice\n\nI'm here to provide general information, but this needs professional guidance.",
          suggestedActions: ["Contact GP", "Eve Appeal Nurses", "Call NHS 111"]
        };
    }
  }

  private getEmergencyContacts() {
    return {
      emergency: "999",
      samaritans: "116 123",
      nhs: "111",
      eveAppeal: "https://eveappeal.org.uk/contact"
    };
  }

  private generateWidgetHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ask Eve Assist - Health Information Chat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .chat-container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 90%;
            max-width: 500px;
            height: 700px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .chat-header {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
        }

        .chat-header h1 {
            font-size: 1.5rem;
            margin-bottom: 5px;
        }

        .chat-header p {
            opacity: 0.9;
            font-size: 0.9rem;
        }

        .emergency-bar {
            background: #e74c3c;
            color: white;
            padding: 10px;
            text-align: center;
            font-size: 0.8rem;
        }

        .emergency-bar strong {
            display: block;
            margin-bottom: 5px;
        }

        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #f8f9fa;
        }

        .message {
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
        }

        .message.user {
            align-items: flex-end;
        }

        .message.bot {
            align-items: flex-start;
        }

        .message-bubble {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
        }

        .message.user .message-bubble {
            background: #007bff;
            color: white;
        }

        .message.bot .message-bubble {
            background: white;
            color: #333;
            border: 1px solid #e0e0e0;
        }

        .message-actions {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }

        .action-button {
            background: #007bff;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 12px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.2s;
        }

        .action-button:hover {
            background: #0056b3;
        }

        .source-link {
            margin-top: 10px;
            padding: 10px;
            background: #f0f8ff;
            border: 1px solid #007bff;
            border-radius: 8px;
            text-align: center;
        }

        .source-link a {
            color: #007bff;
            text-decoration: none;
            font-weight: 500;
        }

        .chat-input {
            padding: 20px;
            background: white;
            border-top: 1px solid #e0e0e0;
        }

        .input-group {
            display: flex;
            gap: 10px;
        }

        .chat-input input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid #ddd;
            border-radius: 25px;
            font-size: 1rem;
            outline: none;
        }

        .chat-input input:focus {
            border-color: #007bff;
        }

        .send-button {
            background: #007bff;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.2s;
        }

        .send-button:hover:not(:disabled) {
            background: #0056b3;
        }

        .send-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .disclaimer {
            padding: 15px;
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            font-size: 0.8rem;
            text-align: center;
        }

        .typing-indicator {
            display: none;
            padding: 10px;
            font-style: italic;
            color: #666;
        }

        @media (max-width: 600px) {
            .chat-container {
                width: 95%;
                height: 90vh;
                border-radius: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>🌸 Ask Eve Assist</h1>
            <p>Your digital assistant for gynaecological health information</p>
        </div>
        
        <div class="emergency-bar">
            <strong>Emergency Contacts</strong>
            Emergency: 999 | Samaritans: 116 123 | NHS: 111
        </div>

        <div class="chat-messages" id="chatMessages">
            <div class="message bot">
                <div class="message-bubble">
                    Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal.
                    <br><br>
                    How can I help you today?
                </div>
                <div class="message-actions">
                    <button class="action-button" onclick="sendMessage('Ovarian cancer symptoms')">Ovarian cancer symptoms</button>
                    <button class="action-button" onclick="sendMessage('Cervical screening info')">Cervical screening info</button>
                    <button class="action-button" onclick="sendMessage('Support services')">Support services</button>
                </div>
            </div>
        </div>

        <div class="typing-indicator" id="typingIndicator">
            Ask Eve is typing...
        </div>

        <div class="disclaimer">
            <strong>Important:</strong> This is general health information only and should not replace professional medical advice. Always consult your healthcare provider for medical concerns.
        </div>

        <div class="chat-input">
            <div class="input-group">
                <input type="text" id="messageInput" placeholder="Ask me about gynaecological health..." onkeypress="handleKeyPress(event)">
                <button class="send-button" id="sendButton" onclick="sendUserMessage()">Send</button>
            </div>
        </div>
    </div>

    <script>
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const typingIndicator = document.getElementById('typingIndicator');

        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendUserMessage();
            }
        }

        function sendMessage(text) {
            messageInput.value = text;
            sendUserMessage();
        }

        async function sendUserMessage() {
            const message = messageInput.value.trim();
            if (!message) return;

            // Add user message to chat
            addMessage('user', message);
            messageInput.value = '';
            sendButton.disabled = true;
            showTyping();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: message,
                        conversationId: 'web-chat',
                        userId: 'web-user-' + Date.now()
                    })
                });

                const data = await response.json();
                
                if (data.responses && data.responses.length > 0) {
                    data.responses.forEach(botResponse => {
                        addBotMessage(botResponse);
                    });
                } else if (data.error) {
                    addMessage('bot', data.error);
                    if (data.emergencyContacts) {
                        addEmergencyContacts(data.emergencyContacts);
                    }
                }
            } catch (error) {
                console.error('Chat error:', error);
                addMessage('bot', 'I apologize, but I\\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.');
            }

            hideTyping();
            sendButton.disabled = false;
            messageInput.focus();
        }

        function addMessage(sender, text) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${sender}\`;
            
            const bubbleDiv = document.createElement('div');
            bubbleDiv.className = 'message-bubble';
            bubbleDiv.innerHTML = text.replace(/\\n/g, '<br>');
            
            messageDiv.appendChild(bubbleDiv);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function addBotMessage(response) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message bot';
            
            const bubbleDiv = document.createElement('div');
            bubbleDiv.className = 'message-bubble';
            bubbleDiv.innerHTML = response.text.replace(/\\n/g, '<br>');
            
            messageDiv.appendChild(bubbleDiv);

            // Add source link if available
            if (response.attachments && response.attachments.length > 0) {
                const attachment = response.attachments[0];
                if (attachment.content && attachment.content.buttons) {
                    const sourceDiv = document.createElement('div');
                    sourceDiv.className = 'source-link';
                    const button = attachment.content.buttons[0];
                    sourceDiv.innerHTML = \`<a href="\${button.value}" target="_blank">\${button.title}</a>\`;
                    messageDiv.appendChild(sourceDiv);
                }
            }

            // Add suggested actions
            if (response.suggestedActions && response.suggestedActions.length > 0) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';
                
                response.suggestedActions.forEach(action => {
                    const button = document.createElement('button');
                    button.className = 'action-button';
                    button.textContent = action;
                    button.onclick = () => sendMessage(action);
                    actionsDiv.appendChild(button);
                });
                
                messageDiv.appendChild(actionsDiv);
            }

            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function addEmergencyContacts(contacts) {
            const contactsDiv = document.createElement('div');
            contactsDiv.className = 'message bot';
            contactsDiv.innerHTML = \`
                <div class="message-bubble">
                    <strong>Emergency Contacts:</strong><br>
                    Emergency Services: \${contacts.emergency}<br>
                    Samaritans: \${contacts.samaritans}<br>
                    NHS: \${contacts.nhs}<br>
                    <a href="\${contacts.eveAppeal}" target="_blank">The Eve Appeal</a>
                </div>
            \`;
            chatMessages.appendChild(contactsDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function showTyping() {
            typingIndicator.style.display = 'block';
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function hideTyping() {
            typingIndicator.style.display = 'none';
        }

        // Focus on input when page loads
        messageInput.focus();
    </script>
</body>
</html>
    `;
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async start(port: number = 3000): Promise<void> {
    await this.initialize();
    
    this.app.listen(port, () => {
      this.logger.info(`🤖 Ask Eve Bot Server running on port ${port}`);
      this.logger.info(`🌐 Web chat widget available at: http://localhost:${port}/widget`);
      this.logger.info('🛡️ Safety systems active - protecting users from harm');
    });
  }
}