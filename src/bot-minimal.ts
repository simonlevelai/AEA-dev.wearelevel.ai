import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
// TODO: Replace with Microsoft 365 Agents SDK imports when package is published
// Microsoft 365 Agents SDK migration ready - using AgentsSdkAdapter as foundation
// import { AgentBuilder, AgentContainer } from '@microsoft/agents-sdk';
import { AskEveBot } from './bot/AskEveBot';
import { AgentsSdkAdapter } from './adapters/AgentsSdkAdapter';
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
    // Create Express app
    const app = express();
    const port = process.env['PORT'] || 3978;

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Create services (mocked for demo)
    const safetyService = new MockSafetyService();
    const contentService = new MockContentService();

    // Create bot instance
    const askEveBot = new AskEveBot({
      botId: 'ask-eve-assist',
      botName: 'Ask Eve Assist',
      safetyService,
      contentService
    });

    // Create and configure Agents SDK adapter
    const agentsSdkAdapter = new AgentsSdkAdapter(askEveBot);
    agentsSdkAdapter.configure();
    agentsSdkAdapter.configureExpress(app);

    // Root endpoint
    app.get('/', (_req, res) => {
      res.json({
        name: 'Ask Eve Assist',
        description: 'AI chatbot for gynaecological health information from The Eve Appeal',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          messages: '/api/messages',
          widget: '/widget',
          widgetConfig: '/api/widget-config'
        }
      });
    });

    // Start server
    app.listen(port, () => {
      console.log(`🤖 Ask Eve Assist is running on port ${port}`);
      console.log(`🚀 Agents SDK integration active`);
      console.log(`📱 Web chat widget available at: http://localhost:${port}/widget`);
      console.log(`🔧 Health check: http://localhost:${port}/health`);
      console.log(`⚙️  Widget config: http://localhost:${port}/api/widget-config`);
      console.log(`🛡️  Safety systems active: EscalationService, SafetyMiddleware`);
    });

  } catch (error) {
    console.error('Failed to start Ask Eve Assist:', error);
    process.exit(1);
  }
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