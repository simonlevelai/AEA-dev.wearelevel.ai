import { Logger } from '../utils/logger';
import { ConversationFlowEngine, ConversationFlowContext } from './ConversationFlowEngine';
import { ConversationStateManager } from './ConversationStateManager';
import { ConversationFlowResult } from '../types/conversation';

// Import topic handlers
import { ConversationStartHandler } from '../handlers/ConversationStartHandler';
import { CrisisSupportRoutingHandler } from '../handlers/CrisisSupportRoutingHandler';
import { HealthInformationRouterHandler } from '../handlers/HealthInformationRouterHandler';
import { NurseEscalationHandler } from '../handlers/NurseEscalationHandler';

// Import services
import { EscalationService } from './EscalationService';
import { EnhancedGDPRService } from './EnhancedGDPRService';
import { SupabaseContentService } from './SupabaseContentService';
import { NotificationService } from './NotificationService';
import { DataRetentionService } from './DataRetentionService';
import { UserConsentService } from './UserConsentService';
import { SafetyServiceAdapter } from './SafetyServiceAdapter';

export interface ConversationFlowIntegratorOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  teamsWebhookUrl?: string;
  sessionTimeoutMs?: number;
  enableSafetyFirst?: boolean;
}

/**
 * ConversationFlowIntegrator orchestrates the entire conversation flow system
 * Sets up all services and handlers, provides a unified interface for message processing
 */
export class ConversationFlowIntegrator {
  private logger: Logger;
  private stateManager: ConversationStateManager;
  private flowEngine: ConversationFlowEngine;
  private initialized = false;

  // Services
  private contentService: SupabaseContentService;
  private escalationService: EscalationService;
  private gdprService: EnhancedGDPRService;
  private notificationService: NotificationService;
  private safetyService: SafetyServiceAdapter;

  // Handlers
  private conversationStartHandler: ConversationStartHandler;
  private crisisSupportHandler: CrisisSupportRoutingHandler;
  private healthInfoHandler: HealthInformationRouterHandler;
  private nurseEscalationHandler: NurseEscalationHandler;

  constructor(
    private options: ConversationFlowIntegratorOptions,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('conversation-flow-integrator');
  }

  /**
   * Initialize all services and handlers
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('🚀 Initializing Ask Eve Conversation Flow System...');

      // Initialize core services
      await this.initializeServices();

      // Create conversation flow context
      const context = this.createFlowContext();

      // Initialize flow engine
      this.flowEngine = new ConversationFlowEngine(context, {
        enableSafetyFirst: this.options.enableSafetyFirst !== false,
        crisisDetectionTimeoutMs: 500,
        fallbackToHumanThreshold: 0.3,
        multipleTopicsThreshold: 0.8
      });

      // Initialize and register handlers
      await this.initializeHandlers();

      this.initialized = true;
      this.logger.info('✅ Ask Eve Conversation Flow System initialized successfully');

      // Log registered topics
      const registeredTopics = this.flowEngine.getRegisteredTopics();
      this.logger.info(`📋 Registered ${registeredTopics.length} topic handlers:`, {
        topics: registeredTopics
      });

    } catch (error) {
      this.logger.error('❌ Failed to initialize conversation flow system', {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
      throw new Error('Conversation flow system initialization failed');
    }
  }

  /**
   * Process a user message through the conversation flow
   */
  async processMessage(
    conversationId: string,
    userId: string,
    message: string,
    sessionId?: string
  ): Promise<ConversationFlowResult> {
    if (!this.initialized) {
      throw new Error('Conversation flow system not initialized. Call initialize() first.');
    }

    try {
      this.logger.info('💬 Processing user message', {
        conversationId,
        userId,
        messageLength: message.length,
        sessionId
      });

      const startTime = Date.now();
      const result = await this.flowEngine.processMessage(
        conversationId,
        userId,
        message,
        sessionId
      );

      const processingTime = Date.now() - startTime;
      
      this.logger.info('✅ Message processed successfully', {
        conversationId,
        currentTopic: result.newState.currentTopic,
        currentStage: result.newState.currentStage,
        escalationTriggered: result.escalationTriggered,
        conversationEnded: result.conversationEnded,
        processingTime
      });

      return result;

    } catch (error) {
      this.logger.error('❌ Message processing failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId,
        userId
      });

      // Return a safe fallback response
      return {
        response: {
          text: "I apologize, but I'm experiencing technical difficulties. For immediate health support, please call NHS 111 or contact your GP. In emergencies, call 999.",
          suggestedActions: ['Call NHS 111', 'Contact GP', 'Try again']
        },
        newState: {} as any, // This will be handled by the error recovery system
        escalationTriggered: false,
        conversationEnded: false
      };
    }
  }

  /**
   * Get conversation history for debugging/monitoring
   */
  getConversationHistory(conversationId: string) {
    if (!this.stateManager) {
      throw new Error('State manager not initialized');
    }
    
    return {
      state: this.stateManager.getCurrentState(conversationId),
      messages: this.stateManager.getMessageHistory(conversationId)
    };
  }

  /**
   * Clean up expired conversations
   */
  async performMaintenance(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const cleanedStates = await this.stateManager.cleanupExpiredStates();
      
      if (cleanedStates > 0) {
        this.logger.info(`🧹 Maintenance completed: cleaned ${cleanedStates} expired states`);
      }
    } catch (error) {
      this.logger.error('Maintenance failed', {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
    }
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    initialized: boolean;
    registeredTopics: number;
    services: Record<string, 'healthy' | 'error'>;
  } {
    const services: Record<string, 'healthy' | 'error'> = {
      stateManager: this.stateManager ? 'healthy' : 'error',
      contentService: this.contentService ? 'healthy' : 'error',
      escalationService: this.escalationService ? 'healthy' : 'error',
      safetyService: this.safetyService ? 'healthy' : 'error'
    };

    return {
      initialized: this.initialized,
      registeredTopics: this.flowEngine ? this.flowEngine.getRegisteredTopics().length : 0,
      services
    };
  }

  /**
   * Initialize all required services
   */
  private async initializeServices(): Promise<void> {
    this.logger.info('🔧 Initializing core services...');

    // Initialize state manager
    this.stateManager = new ConversationStateManager(this.logger, {
      sessionTimeoutMs: this.options.sessionTimeoutMs || 30 * 60 * 1000,
      maxMessagesPerSession: 100,
      enablePersistence: false
    });

    // Initialize notification service
    this.notificationService = new NotificationService(
      this.options.teamsWebhookUrl || 'test-webhook-url',
      this.logger
    );

    // Initialize escalation service
    this.escalationService = new EscalationService(this.logger, this.notificationService);
    await this.escalationService.initialize();

    // Initialize content service
    this.contentService = new SupabaseContentService(
      this.options.supabaseUrl,
      this.options.supabaseAnonKey,
      this.logger
    );
    await this.contentService.initialize();

    // Initialize GDPR service
    const dataRetentionService = new DataRetentionService(this.logger);
    const userConsentService = new UserConsentService(this.logger);
    this.gdprService = new EnhancedGDPRService(
      this.logger,
      dataRetentionService,
      userConsentService
    );

    // Initialize safety service
    this.safetyService = new SafetyServiceAdapter(this.escalationService, this.logger);

    this.logger.info('✅ Core services initialized');
  }

  /**
   * Create conversation flow context
   */
  private createFlowContext(): ConversationFlowContext {
    return {
      logger: this.logger,
      safetyService: this.safetyService,
      contentService: this.contentService,
      escalationService: this.escalationService,
      gdprService: this.gdprService,
      stateManager: this.stateManager
    };
  }

  /**
   * Initialize and register all topic handlers
   */
  private async initializeHandlers(): Promise<void> {
    this.logger.info('🎯 Initializing topic handlers...');

    // Initialize handlers
    this.conversationStartHandler = new ConversationStartHandler(this.logger);
    this.crisisSupportHandler = new CrisisSupportRoutingHandler(this.logger);
    this.healthInfoHandler = new HealthInformationRouterHandler(this.logger);
    this.nurseEscalationHandler = new NurseEscalationHandler(this.logger);

    // Register handlers with the flow engine
    this.flowEngine.registerTopicHandler(this.conversationStartHandler);
    this.flowEngine.registerTopicHandler(this.crisisSupportHandler);
    this.flowEngine.registerTopicHandler(this.healthInfoHandler);
    this.flowEngine.registerTopicHandler(this.nurseEscalationHandler);

    this.logger.info('✅ Topic handlers initialized and registered');
  }

  /**
   * Shutdown the system gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('🛑 Shutting down conversation flow system...');

    try {
      // Perform final cleanup
      if (this.stateManager) {
        await this.stateManager.cleanupExpiredStates();
      }

      this.initialized = false;
      this.logger.info('✅ Conversation flow system shutdown complete');

    } catch (error) {
      this.logger.error('Error during shutdown', {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
    }
  }
}