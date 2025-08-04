import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { EscalationService } from './services/EscalationService';
import { NotificationService } from './services/NotificationService';
import { SafetyMiddleware } from './middleware/SafetyMiddleware';
import { Logger } from './utils/logger';

const logger = new Logger('ask-eve-assist');

async function startServer(): Promise<void> {
  try {
    logger.info('🚨 Starting Ask Eve Assist Safety System...');

    // Initialize services
    const notificationService = new NotificationService(
      process.env.TEAMS_WEBHOOK_URL || 'https://teams.microsoft.com/api/webhook/crisis-alerts',
      logger
    );

    const escalationService = new EscalationService(logger, notificationService);
    await escalationService.initialize();

    const safetyMiddleware = new SafetyMiddleware(
      escalationService,
      notificationService,
      logger,
      {
        skipPaths: ['/health', '/metrics'],
        enableAuditLogging: true,
        blockUnsafeResponses: true
      }
    );

    // Test notification connection
    const connectionTest = await notificationService.testConnection();
    if (!connectionTest) {
      logger.warn('Nurse team notification system connection failed - alerts may not be delivered');
    }

    // Create Express app
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

    // Add user identification middleware (in production, this would come from auth)
    app.use((req: any, res, next) => {
      req.userId = req.headers['x-user-id'] || `anonymous-${Date.now()}`;
      req.sessionId = req.headers['x-session-id'] || `session-${Date.now()}`;
      next();
    });

    // Apply safety middleware to all routes
    app.use(safetyMiddleware.addSafetyHeaders());
    app.use(safetyMiddleware.analyzeUserMessage());
    app.use(safetyMiddleware.validateResponse());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'ask-eve-assist',
        timestamp: new Date().toISOString(),
        safety: {
          escalationService: 'active',
          notificationService: connectionTest ? 'connected' : 'disconnected',
          middleware: 'active'
        }
      });
    });

    // Safety system status endpoint
    app.get('/safety/status', (req, res) => {
      res.json({
        status: 'operational',
        services: {
          escalationService: 'active',
          notificationService: connectionTest ? 'connected' : 'warning',
          safetyMiddleware: 'active'
        },
        config: {
          crisisDetectionThreshold: '500ms',
          responseTimeThreshold: '2000ms',
          nurseNotificationEnabled: true,
          mhraComplianceEnabled: true
        },
        timestamp: new Date().toISOString()
      });
    });

    // Chat endpoint (example implementation)
    app.post('/api/v1/chat', async (req: any, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        // Safety analysis is already done by middleware
        const safetyResult = req.safetyResult;
        const crisisResponse = req.crisisResponse;

        // In a real implementation, this would call the AI service
        // For now, we'll return a safe response based on safety analysis
        
        let response = {
          message: 'Thank you for your message. How can I help you with your health questions today?',
          safetyLevel: safetyResult?.severity || 'general',
          resources: [],
          disclaimers: [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.'
          ]
        };

        // If crisis detected, prioritize crisis response
        if (crisisResponse) {
          response = {
            message: crisisResponse.immediateMessage,
            safetyLevel: safetyResult?.severity || 'crisis',
            resources: crisisResponse.resources,
            disclaimers: crisisResponse.disclaimers
          };
        }

        res.json(response);
      } catch (error) {
        logger.error('Chat endpoint error', { error, userId: req.userId });
        res.status(500).json({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
      }
    });

    // Escalation webhook endpoint (for external systems)
    app.post('/api/v1/escalations/webhook', async (req: any, res) => {
      try {
        const { escalationId, status, details } = req.body;
        
        if (!escalationId) {
          return res.status(400).json({
            error: 'Escalation ID is required',
            code: 'MISSING_ESCALATION_ID'
          });
        }

        await notificationService.sendFollowUpNotification(
          escalationId,
          status || 'updated',
          details || 'External system update'
        );

        logger.info('Escalation webhook processed', {
          escalationId,
          status,
          details
        });

        res.json({
          success: true,
          message: 'Escalation update processed'
        });
      } catch (error) {
        logger.error('Escalation webhook error', { error });
        res.status(500).json({
          error: 'Failed to process escalation update',
          code: 'WEBHOOK_ERROR'
        });
      }
    });

    // Error handling middleware
    app.use((error: Error, req: any, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled application error', {
        error,
        path: req.path,
        method: req.method,
        userId: req.userId
      });

      res.status(500).json({
        error: 'Internal server error',
        code: 'UNHANDLED_ERROR',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path
      });
    });

    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => {
      logger.info(`🚨 Ask Eve Assist Safety System running on port ${port}`);
      logger.info('🛡️  Safety systems active - protecting users from harm');
      logger.info('📞 Nurse team notifications configured');
      logger.info('⚖️  MHRA compliance monitoring enabled');
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('🛑 Shutting down Ask Eve Assist Safety System...');
      
      server.close(() => {
        logger.info('HTTP server closed');
      });

      try {
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
      logger.critical('Uncaught exception - system may be unstable', { error });
      shutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.critical('Unhandled promise rejection', { reason, promise });
      shutdown();
    });

  } catch (error) {
    logger.critical('Failed to start Ask Eve Assist Safety System', { error });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Critical startup failure:', error);
    process.exit(1);
  });
}

export { startServer };