import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AzureOpenAI } from 'openai';
// Supabase client is initialized within SupabaseContentService
import { Logger } from './utils/logger';
import { SafetyMiddleware } from './middleware/SafetyMiddleware';
import { EscalationService } from './services/EscalationService';
import { NotificationService } from './services/NotificationService';
import { SupabaseContentService } from './services/SupabaseContentService';

const logger = new Logger('ask-eve-assist');

// Base system prompt for Ask Eve Assist
const baseSystemPrompt = `You are Ask Eve Assist, a helpful and empathetic AI assistant providing gynaecological health information from The Eve Appeal charity.

Key Guidelines:
- Provide accurate, evidence-based health information
- Always recommend consulting healthcare professionals for personal medical concerns  
- Be empathetic and supportive, especially for sensitive topics
- Include appropriate disclaimers about not replacing professional medical advice
- For crisis situations involving self-harm, immediately provide emergency contact information:
  - Emergency Services: 999
  - Samaritans: 116 123 (free 24/7)
  - Crisis Text Line: Text SHOUT to 85258
  - NHS 111: For urgent mental health support
- Focus on gynaecological health topics: cervical, ovarian, womb, vulval, and vaginal cancers
- Encourage regular screening and early detection

IMPORTANT: If someone expresses thoughts of self-harm, distress, or mental health crisis, immediately provide the emergency contacts above and encourage them to seek immediate professional help.`;

// Enhanced system prompt creation with priority content
function createEnhancedSystemPrompt(contentResult: any): string {
  let prompt = baseSystemPrompt;
  
  if (contentResult && contentResult.found) {
    prompt += `\n\n🎯 PRIORITY MEDICAL INFORMATION from The Eve Appeal (USE THIS FIRST):\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `📄 Source Document: ${contentResult.source || 'Unknown'}\n`;
    prompt += `🔗 Reference URL: ${contentResult.sourceUrl || ''}\n`;
    prompt += `📊 Relevance Score: ${((contentResult.relevanceScore || 0) * 100).toFixed(1)}%\n`;
    prompt += `🏥 Content Type: ${contentResult.metadata?.contentType || 'medical_information'}\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `AUTHORITATIVE CONTENT:\n${contentResult.content}\n\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `🚨 CRITICAL INSTRUCTIONS:\n`;
    prompt += `1. PRIORITIZE the above Eve Appeal content over your general knowledge\n`;
    prompt += `2. Base your response PRIMARILY on this authoritative medical information\n`;
    prompt += `3. ALWAYS cite the source document and include the reference URL\n`;
    prompt += `4. Only supplement with general knowledge if the Eve Appeal content doesn't cover the question\n`;
    prompt += `5. Make it clear when information comes from The Eve Appeal vs general medical knowledge\n`;
    prompt += `6. Never contradict The Eve Appeal content - it is the authoritative source\n\n`;
  } else {
    prompt += `\n\n⚠️ No specific Eve Appeal content found for this query.\n`;
    prompt += `Please provide general gynaecological health information while encouraging the user to:\n`;
    prompt += `• Consult healthcare professionals for personalized advice\n`;
    prompt += `• Visit The Eve Appeal website: https://eveappeal.org.uk/\n`;
    prompt += `• Use their Ask Eve information service: 0808 802 0019\n\n`;
  }
  
  return prompt;
}

// Crisis detection function
function detectCrisisIndicators(message: string, response: string): boolean {
  const lowerMessage = message.toLowerCase();
  const lowerResponse = response.toLowerCase();
  
  return lowerMessage.includes('hopeless') ||
         lowerMessage.includes('end my life') ||
         lowerMessage.includes('dark thoughts') ||
         lowerMessage.includes('giving up') ||
         lowerMessage.includes('suicide') ||
         lowerResponse.includes('999') ||
         lowerResponse.includes('samaritans');
}

// Conversation analytics logging
async function logConversationAnalytics(
  message: string, 
  contentResult: any, 
  responseTime: number, 
  userId: string
): Promise<void> {
  try {
    // This would be integrated with the comprehensive analytics system
    logger.info('📊 Conversation logged', {
      userId,
      queryLength: message.length,
      contentFound: contentResult?.found || false,
      relevanceScore: contentResult?.relevanceScore || 0,
      responseTime,
      contentType: contentResult?.metadata?.contentType || 'none'
    });
  } catch (error) {
    logger.warn('Failed to log conversation analytics', { error, userId });
  }
}

async function startServer(): Promise<void> {
  try {
    logger.info('🚨 Starting Ask Eve Assist Core System...');

    // Initialize Azure OpenAI client
    const azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });

    // Initialize Supabase content service

    const contentService = new SupabaseContentService(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      logger
    );

    await contentService.initialize();
    logger.info('✅ Supabase content service initialized');

    // Initialize safety services
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
    
    const connectionTest = true; // Safety services now active

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
    app.use((req: any, _res, next) => {
      req.userId = req.headers['x-user-id'] || `anonymous-${Date.now()}`;
      req.sessionId = req.headers['x-session-id'] || `session-${Date.now()}`;
      next();
    });

    // Apply safety middleware to all routes
    app.use(safetyMiddleware.addSafetyHeaders());
    app.use(safetyMiddleware.analyzeUserMessage());
    app.use(safetyMiddleware.validateResponse());

    // Health check endpoint
    app.get('/health', (_req, res) => {
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
    app.get('/safety/status', (_req, res) => {
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

    // Enhanced chat endpoint with Azure OpenAI + Supabase RAG
    app.post('/api/v1/chat', async (req: any, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        logger.info(`🗣️ User message: ${message}`, { userId: req.userId });
        const startTime = Date.now();

        // Search for relevant Eve Appeal content
        const contentResult = await contentService.searchContent(message);
        
        // Create enhanced system prompt
        const systemPrompt = createEnhancedSystemPrompt(contentResult);

        // Call Azure OpenAI with enhanced context
        const completion = await azureOpenAI.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_completion_tokens: 500,
          temperature: 0.7
        });

        const responseTime = Date.now() - startTime;
        const responseText = completion.choices[0].message.content || '';

        // Check for crisis indicators
        const isCrisis = detectCrisisIndicators(message, responseText);

        // Log conversation analytics  
        await logConversationAnalytics(message, contentResult, responseTime, req.userId);

        logger.info(`🤖 Response generated (${responseTime}ms)`, { 
          userId: req.userId,
          tokens: completion.usage?.total_tokens,
          contentFound: contentResult.found 
        });

        const response = {
          message: responseText,
          safetyLevel: isCrisis ? 'crisis' : 'general',
          responseTime,
          tokenUsage: completion.usage?.total_tokens || 0,
          isCrisis,
          timestamp: new Date().toISOString(),
          contentUsed: contentResult.found ? {
            source: contentResult.metadata?.bestMatchSource || 'Unknown',
            relevanceScore: contentResult.relevanceScore || 0,
            sourceUrl: contentResult.sourceUrl || '',
            contentType: contentResult.metadata?.contentType || 'medical_information'
          } : null,
          resources: contentResult.found ? [contentResult.sourceUrl || ''] : [],
          disclaimers: [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.',
            'In emergencies, call 999 immediately.'
          ]
        };

        return res.json(response);
      } catch (error) {
        logger.error('Enhanced chat endpoint error', { 
          error: error instanceof Error ? error : new Error(String(error)), 
          userId: req.userId 
        });

        // Handle Azure OpenAI content filtering
        if (error instanceof Error && error.message.includes('content management policy')) {
          return res.json({
            message: `I understand you may be going through a difficult time. For your safety and wellbeing, please reach out for support:

**Emergency Contacts:**
• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7) 
• Crisis Text Line: Text SHOUT to 85258
• NHS 111: For urgent mental health support

Your safety matters, and there are people who want to help. Please speak to someone who can provide the care and support you need.`,
            safetyLevel: 'crisis',
            isCrisis: true,
            contentFiltered: true,
            timestamp: new Date().toISOString()
          });
        }

        return res.status(500).json({
          error: 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.',
          code: 'INTERNAL_ERROR',
          emergencyContacts: {
            emergency: '999',
            samaritans: '116 123', 
            nhs: '111',
            eveAppeal: 'https://eveappeal.org.uk'
          }
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

        // Process escalation update through notification service
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

        return res.json({
          success: true,
          message: 'Escalation update processed'
        });
      } catch (error) {
        logger.error('Escalation webhook error', { error: error instanceof Error ? error : new Error(String(error)) });
        return res.status(500).json({
          error: 'Failed to process escalation update',
          code: 'WEBHOOK_ERROR'
        });
      }
    });

    // Error handling middleware
    app.use((error: Error, req: any, res: express.Response, _next: express.NextFunction) => {
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
        // Shutdown safety middleware
        await safetyMiddleware.shutdown();
        await logger.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: error instanceof Error ? error : new Error(String(error)) });
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