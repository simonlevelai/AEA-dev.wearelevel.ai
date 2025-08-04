import { BotFrameworkAdapter, MemoryStorage, ConversationState, UserState } from 'botbuilder';
import { Request, Response, Express } from 'express';
import { AskEveBot } from '../bot/AskEveBot';
import { BaseAdapter } from './BaseAdapter';

export class WebChatAdapter extends BaseAdapter {
  private adapter: BotFrameworkAdapter;
  private conversationState: ConversationState;
  private userState: UserState;

  constructor(bot: AskEveBot, appId?: string, appPassword?: string) {
    super(bot);
    
    // Create adapter with credentials
    this.adapter = new BotFrameworkAdapter({
      appId: appId || process.env['MicrosoftAppId'] || '',
      appPassword: appPassword || process.env['MicrosoftAppPassword'] || ''
    });

    // Create conversation and user state with in-memory storage
    const memoryStorage = new MemoryStorage();
    this.conversationState = new ConversationState(memoryStorage);
    this.userState = new UserState(memoryStorage);

    // Error handler
    this.adapter.onTurnError = async (context, error) => {
      console.error('WebChat adapter error:', error);
      await context.sendActivity('Sorry, an error occurred. Please try again.');
    };
  }

  public configure(): void {
    // Additional configuration can be added here
    console.log('WebChatAdapter configured successfully');
  }

  public configureExpress(app: Express): void {
    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'healthy', 
        service: 'ask-eve-assist-webchat',
        timestamp: new Date().toISOString()
      });
    });

    // Main bot endpoint for web chat
    app.post('/api/messages', (req: Request, res: Response) => {
      this.adapter.processActivity(req, res, async (context) => {
        // Add state to context
        await this.conversationState.load(context);
        await this.userState.load(context);

        // Process the message
        await this.processMessage(context);

        // Save state
        await this.conversationState.saveChanges(context);
        await this.userState.saveChanges(context);
      });
    });

    // Web chat widget configuration endpoint
    app.get('/api/widget-config', (_req: Request, res: Response) => {
      res.json({
        botName: 'Ask Eve Assist',
        welcomeMessage: "Hello! I'm Ask Eve Assist, here to help you find trusted information about gynaecological health.",
        placeholderText: 'Type your question about gynaecological health...',
        primaryColor: '#7B4397', // Eve Appeal brand colors
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
        }
      });
    });

    // Serve widget HTML (for testing/demo purposes)
    app.get('/widget', (_req: Request, res: Response) => {
      const widgetHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Web Chat</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #7B4397 0%, #DC2430 100%);">
    <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #7B4397 0%, #DC2430 100%); color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Ask Eve Assist</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Get trusted information about gynaecological health</p>
        </div>
        <div id="webchat" style="height: 500px;"></div>
    </div>
    
    <script src="https://cdn.botframework.com/botframework-webchat/latest/webchat.js"></script>
    <script>
        (async () => {
            // Request a token from the bot
            const res = await fetch('/directline/token', { method: 'POST' });
            const { token } = await res.json();

            // Render the web chat
            window.WebChat.renderWebChat({
                directLine: window.WebChat.createDirectLine({ token }),
                styleOptions: {
                    backgroundColor: '#f8f9fa',
                    primaryColor: '#7B4397',
                    accent: '#DC2430',
                    cardEmphasisBackgroundColor: '#f1f3f4',
                    paddingRegular: 10,
                    paddingWide: 20,
                    avatarSize: 40,
                    botAvatarInitials: 'EA',
                    userAvatarInitials: 'You',
                    showUploadButton: false
                }
            }, document.getElementById('webchat'));
        })();
    </script>
</body>
</html>`;
      res.send(widgetHtml);
    });
  }

  public getAdapter(): BotFrameworkAdapter {
    return this.adapter;
  }
}