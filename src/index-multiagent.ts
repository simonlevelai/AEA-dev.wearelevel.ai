import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Logger } from './utils/logger';
import { AskEveMultiAgentBot } from './bot/AskEveMultiAgentBot';
import { SafetyMiddleware } from './middleware/SafetyMiddleware';
import { EscalationService } from './services/EscalationService';
import { NotificationService } from './services/NotificationService';

/**
 * Modern Ask Eve Assist using Microsoft 365 Agents SDK 2025
 * Multi-agent orchestration with healthcare-specific safety-first approach
 * - SafetyAgent: <500ms crisis detection
 * - ContentAgent: RAG with PiF-approved content  
 * - EscalationAgent: GDPR-compliant nurse callback coordination
 */

const logger = new Logger('ask-eve-multiagent');

// Global bot instance for API integration
let multiAgentBot: AskEveMultiAgentBot;

async function startMultiAgentServer(): Promise<void> {
  try {
    logger.info('🚀 Starting Ask Eve Assist Multi-Agent System');
    logger.info('🤖 M365 Agents SDK 2025 Architecture');

    // Initialize Multi-Agent Bot System
    multiAgentBot = new AskEveMultiAgentBot();
    await multiAgentBot.initialize();

    // Initialize legacy safety services for middleware compatibility
    const notificationService = new NotificationService(
      process.env.TEAMS_WEBHOOK_URL || 'test-webhook-url',
      logger
    );
    
    const escalationService = new EscalationService(logger, notificationService);
    await escalationService.initialize();
    
    const safetyMiddleware = new SafetyMiddleware(
      escalationService,
      notificationService,
      logger
    );

    // Create Express app for API endpoints
    const app = express();
    
    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));
    
    app.use(cors({
      origin: [
        'https://dashboard.askeve.ai',
        'http://localhost:3000',
        'http://localhost:3001'
      ],
      credentials: true
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // User identification middleware
    app.use((req: any, _res, next) => {
      req.userId = req.headers['x-user-id'] || `anonymous-${Date.now()}`;
      req.sessionId = req.headers['x-session-id'] || `session-${Date.now()}`;
      next();
    });

    // Apply safety middleware to all routes
    app.use(safetyMiddleware.addSafetyHeaders());
    app.use(safetyMiddleware.analyzeUserMessage());
    app.use(safetyMiddleware.validateResponse());

    // Multi-Agent System Health Check
    app.get('/health', async (_req, res) => {
      try {
        const systemHealth = await multiAgentBot.getSystemHealth();
        
        res.json({
          status: systemHealth.status,
          service: 'ask-eve-multiagent',
          timestamp: new Date().toISOString(),
          architecture: 'm365-agents-sdk-2025',
          agents: {
            safetyAgent: systemHealth.agents.safetyAgent.status,
            contentAgent: systemHealth.agents.contentAgent.status,  
            escalationAgent: systemHealth.agents.escalationAgent.status
          },
          orchestration: systemHealth.orchestration,
          multiChannel: true,
          copilotReady: true
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Multi-Agent System Status
    app.get('/agents/status', async (_req, res) => {
      try {
        const systemHealth = await multiAgentBot.getSystemHealth();
        
        res.json({
          status: 'operational',
          architecture: 'Microsoft 365 Agents SDK 2025',
          orchestration: {
            pattern: 'healthcare-safety-first',
            sequence: ['SafetyAgent', 'ContentAgent', 'EscalationAgent'],
            maxActiveAgents: 3,
            groupChatEnabled: true
          },
          agents: systemHealth.agents,
          capabilities: {
            crisisDetection: '<500ms',
            contentRetrieval: 'RAG + PiF-approved',
            nurseEscalation: 'GDPR-compliant',
            multiChannel: ['Teams', 'WebChat', 'Copilot'],
            foundationModel: 'Azure OpenAI GPT-4o-mini'
          },
          compliance: {
            mhra: true,
            gdpr: true,
            ukDataResidency: true
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get agent status',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Enhanced Multi-Agent Chat Endpoint
    app.post('/api/v1/chat', async (req: any, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        logger.info('💬 Processing message through multi-agent orchestration', { 
          userId: req.userId.substring(0, 8) + '***',
          messageLength: message.length 
        });
        
        const startTime = Date.now();
        const conversationId = req.sessionId || `conv-${Date.now()}`;

        // Process message through multi-agent orchestration
        const agentResponse = await multiAgentBot.processMessage(
          message,
          conversationId,
          req.userId
        );

        const responseTime = Date.now() - startTime;

        logger.info('✅ Multi-agent response generated', {
          userId: req.userId.substring(0, 8) + '***',
          responseTime,
          success: agentResponse.success,
          agentsInvolved: agentResponse.result?.agentsInvolved || []
        });

        // Convert agent response to API format for compatibility
        const apiResponse = {
          message: agentResponse.result?.text || 'I apologize, but I was unable to generate a response.',
          safetyLevel: agentResponse.result?.isCrisis ? 'crisis' : 'general',
          responseTime,
          isCrisis: agentResponse.result?.isCrisis || false,
          timestamp: new Date().toISOString(),
          
          // Multi-agent specific fields
          multiAgentResponse: true,
          orchestrationSuccess: agentResponse.success,
          agentsInvolved: agentResponse.result?.agentsInvolved || [],
          
          // Crisis response with immediate emergency contacts
          emergencyContacts: agentResponse.result?.emergencyContacts || undefined,
          
          // Content information (from ContentAgent)
          contentUsed: agentResponse.result?.found ? {
            source: agentResponse.result.source || 'Unknown',
            relevanceScore: agentResponse.result.relevanceScore || 0,
            sourceUrl: agentResponse.result.sourceUrl || '',
            medicalCategories: agentResponse.result.medicalCategories || []
          } : null,
          
          // Escalation information (from EscalationAgent)
          escalation: agentResponse.result?.escalationId ? {
            escalationId: agentResponse.result.escalationId,
            priority: agentResponse.result.priority,
            callbackScheduled: agentResponse.result.callbackScheduled,
            nurseTeamAlerted: agentResponse.result.nurseTeamAlerted
          } : undefined,
          
          resources: agentResponse.result?.sourceUrl ? [agentResponse.result.sourceUrl] : [],
          suggestedActions: agentResponse.result?.suggestedActions || [],
          
          disclaimers: agentResponse.result?.disclaimers || [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.',
            'In emergencies, call 999 immediately.'
          ]
        };

        return res.json(apiResponse);

      } catch (error) {
        const responseTime = Date.now() - (req.startTime || Date.now());
        
        logger.error('❌ Multi-agent chat endpoint error', { 
          error: error instanceof Error ? error : new Error(String(error)), 
          userId: req.userId.substring(0, 8) + '***'
        });

        // Return safety fallback response
        return res.json({
          message: `I'm experiencing technical difficulties but want to ensure your safety. If you're having thoughts of self-harm or are in crisis, please reach out for immediate support:

**Emergency Contacts:**
• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7) 
• Crisis Text Line: Text SHOUT to 85258
• NHS 111: For urgent support

For gynaecological health information, please contact The Eve Appeal directly at 0808 802 0019.`,
          safetyLevel: 'crisis',
          responseTime,
          isCrisis: false,
          systemError: true,
          multiAgentResponse: true,
          orchestrationSuccess: false,
          timestamp: new Date().toISOString(),
          emergencyContacts: {
            emergency: '999',
            samaritans: '116 123',
            nhs: '111', 
            eveAppeal: '0808 802 0019'
          }
        });
      }
    });

    // Agent-specific endpoints for debugging and monitoring
    app.get('/api/v1/agents/:agentId/health', async (req, res) => {
      try {
        const { agentId } = req.params;
        const systemHealth = await multiAgentBot.getSystemHealth();
        
        if (!systemHealth.agents[agentId as keyof typeof systemHealth.agents]) {
          return res.status(404).json({
            error: 'Agent not found',
            availableAgents: Object.keys(systemHealth.agents)
          });
        }
        
        res.json({
          agentId,
          health: systemHealth.agents[agentId as keyof typeof systemHealth.agents],
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get agent health',
          agentId: req.params.agentId
        });
      }
    });

    // Escalation webhook endpoint (maintains compatibility)
    app.post('/api/v1/escalations/webhook', async (req: any, res) => {
      try {
        const { escalationId, status, details } = req.body;
        
        if (!escalationId) {
          return res.status(400).json({
            error: 'Escalation ID is required',
            code: 'MISSING_ESCALATION_ID'
          });
        }

        // Process through notification service
        await notificationService.sendFollowUpNotification(
          escalationId,
          status || 'updated',
          details || 'External system update'
        );

        logger.info('📞 Escalation webhook processed', {
          escalationId,
          status,
          details
        });

        return res.json({
          success: true,
          message: 'Escalation update processed',
          multiAgentSystem: true
        });
      } catch (error) {
        logger.error('Escalation webhook error', { error });
        return res.status(500).json({
          error: 'Failed to process escalation update',
          code: 'WEBHOOK_ERROR'
        });
      }
    });

    // Bot Framework compatibility endpoint (for Teams/Copilot integration)
    app.post('/api/messages', async (req: any, res) => {
      try {
        // This would integrate with Bot Framework's TurnContext
        // For now, redirect to multi-agent processing
        logger.info('🤖 Bot Framework message received - processing through multi-agent system');
        
        const message = req.body.text || req.body.message || '';
        const conversationId = req.body.conversation?.id || `bot-conv-${Date.now()}`;
        const userId = req.body.from?.id || 'bot-user';

        const agentResponse = await multiAgentBot.processMessage(
          message,
          conversationId,
          userId
        );

        res.json({
          type: 'message',
          text: agentResponse.result?.text || 'I apologize, but I was unable to process your message.',
          suggestedActions: agentResponse.result?.suggestedActions || []
        });

      } catch (error) {
        logger.error('Bot Framework endpoint error', { error });
        res.status(500).json({
          type: 'message',
          text: 'I apologize, but I\'m experiencing technical difficulties. Please try again.'
        });
      }
    });

    // Error handling middleware
    app.use((error: Error, req: any, res: express.Response, _next: express.NextFunction) => {
      logger.error('❌ Unhandled application error', {
        error,
        path: req.path,
        method: req.method,
        userId: req.userId
      });

      res.status(500).json({
        error: 'Internal server error',
        code: 'UNHANDLED_ERROR',
        multiAgentSystem: true,
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path,
        availableEndpoints: [
          'GET /health',
          'GET /agents/status', 
          'POST /api/v1/chat',
          'POST /api/messages',
          'POST /api/v1/escalations/webhook'
        ]
      });
    });

    // Start Express server alongside the multi-agent hosting
    const port = process.env.PORT || 3978;
    
    // The AskEveMultiAgentBot already starts its own ExpressHosting
    // So we need to coordinate ports
    const apiPort = port === 3978 ? 3979 : Number(port) + 1;
    
    const apiServer = app.listen(apiPort, () => {
      logger.info(`🌐 Multi-Agent API Server running on port ${apiPort}`);
      logger.info('📡 Available endpoints:');
      logger.info('   GET  /health - System health check');
      logger.info('   GET  /agents/status - Agent orchestration status');
      logger.info('   POST /api/v1/chat - Multi-agent chat endpoint');
      logger.info('   POST /api/messages - Bot Framework compatibility');
    });

    // Start the Multi-Agent Bot system (this includes ExpressHosting)
    await multiAgentBot.start();

    logger.info('🎉 Ask Eve Assist Multi-Agent System fully operational');
    logger.info(`🤖 Multi-agent orchestration active with 3 specialized agents`);
    logger.info(`🛡️ Safety-first healthcare approach implemented`);
    logger.info(`📞 GDPR-compliant nurse escalation system ready`);
    logger.info(`⚖️ MHRA compliance and source attribution enforced`);

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('🛑 Shutting down Ask Eve Multi-Agent System...');
      
      // Close API server
      apiServer.close(() => {
        logger.info('API server closed');
      });

      try {
        // Shutdown multi-agent bot
        await multiAgentBot.stop();
        
        // Shutdown safety middleware  
        await safetyMiddleware.shutdown();
        await logger.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('uncaughtException', (error) => {
      logger.critical('Uncaught exception in multi-agent system', { error });
      shutdown();
    });
    process.on('unhandledRejection', (reason) => {
      logger.critical('Unhandled promise rejection in multi-agent system', { reason });
      shutdown();
    });

  } catch (error) {
    logger.critical('❌ Failed to start Ask Eve Multi-Agent System', { error });
    process.exit(1);
  }
}

// Start the multi-agent server if this file is run directly
if (require.main === module) {
  startMultiAgentServer().catch((error) => {
    console.error('💥 Critical multi-agent startup failure:', error);
    process.exit(1);
  });
}

export { startMultiAgentServer, multiAgentBot };