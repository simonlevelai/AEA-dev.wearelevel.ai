import { AgentBuilder } from '@microsoft/agents-hosting';
import { ExpressHosting } from '@microsoft/agents-hosting-express';
import { AzureOpenAI } from 'openai';
import { Logger } from '../utils/logger';
import { ChatManager } from '../services/ChatManager';
import { SafetyAgent } from '../agents/SafetyAgent';
import { ContentAgent } from '../agents/ContentAgent';
import { EscalationAgent } from '../agents/EscalationAgent';
import { SupabaseContentService } from '../services/SupabaseContentService';
import { EntityService } from '../services/EntityService';
import { NotificationService } from '../services/NotificationService';
import { ContactCollectionWorkflow } from '../workflows/ContactCollectionWorkflow';
import { ConversationGDPRIntegration } from '../services/ConversationGDPRIntegration';
import { FoundationModelManager } from '../services/FoundationModelManager';
import {
  ConversationContext,
  AgentResponse,
  SafetyAgentConfig,
  ContentAgentConfig,
  EscalationAgentConfig,
  ConversationAgentConfig
} from '../types/agents';
import { TurnContext, MessageFactory } from 'botbuilder';
import { v4 as uuidv4 } from 'uuid';

/**
 * AskEveMultiAgentBot - Modern M365 Agents SDK implementation
 * Implements Microsoft 365 Agents SDK 2025 best practices:
 * - AgentBuilder pattern with foundation model integration
 * - Multi-agent orchestration with group chat coordination  
 * - Healthcare-specific safety-first agent sequencing
 * - Copilot Studio integration ready
 * - MHRA compliant medical information delivery
 */
export class AskEveMultiAgentBot {
  private readonly logger: Logger;
  private readonly azureOpenAI: AzureOpenAI;
  private readonly chatManager: ChatManager;
  private readonly agentBuilder: AgentBuilder;
  private readonly hosting: ExpressHosting;
  private readonly foundationModelManager: FoundationModelManager;
  
  // Specialized agents
  private readonly safetyAgent: SafetyAgent;
  private readonly contentAgent: ContentAgent;  
  private readonly escalationAgent: EscalationAgent;
  
  // Supporting services
  private readonly contentService: SupabaseContentService;
  private readonly entityService: EntityService;
  private readonly notificationService: NotificationService;
  private readonly contactWorkflow: ContactCollectionWorkflow;
  private readonly gdprIntegration: ConversationGDPRIntegration;
  
  // Configuration
  private readonly config: {
    safety: SafetyAgentConfig;
    content: ContentAgentConfig;
    escalation: EscalationAgentConfig;
    conversation: ConversationAgentConfig;
  };

  // Bot disclosure for healthcare compliance
  private readonly botDisclosure = {
    text: "Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. I'm powered by a team of specialized AI agents working together to provide you with the best possible support. I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal.",
    followUp: "How can I help you today?",
    suggestedActions: [
      "Ovarian cancer symptoms",
      "Cervical screening info", 
      "Support services",
      "Speak to a nurse"
    ]
  };

  constructor() {
    this.logger = new Logger('multi-agent-bot');
    
    // Initialize Azure OpenAI with healthcare-optimized settings
    this.azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });

    // Load agent configurations
    this.config = this.loadAgentConfigurations();
    
    // Initialize supporting services
    this.contentService = new SupabaseContentService(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      this.logger
    );
    
    this.entityService = new EntityService();
    
    this.notificationService = new NotificationService(
      process.env.TEAMS_WEBHOOK_URL || 'test-webhook',
      this.logger
    );
    
    this.gdprIntegration = new ConversationGDPRIntegration(this.logger);
    
    this.contactWorkflow = new ContactCollectionWorkflow(
      this.logger,
      this.gdprIntegration
    );
    
    // Initialize specialized agents
    this.safetyAgent = new SafetyAgent(this.logger, this.config.safety);
    this.contentAgent = new ContentAgent(
      this.logger, 
      this.config.content, 
      this.contentService, 
      this.entityService
    );
    this.escalationAgent = new EscalationAgent(
      this.logger,
      this.config.escalation,
      this.notificationService,
      this.contactWorkflow,
      this.gdprIntegration
    );
    
    // Initialize ChatManager for multi-agent orchestration
    this.chatManager = new ChatManager(this.logger);
    
    // Initialize Foundation Model Manager for intelligent AI orchestration
    this.foundationModelManager = new FoundationModelManager(this.logger);
    
    // Create modern AgentBuilder with M365 SDK best practices
    this.agentBuilder = new AgentBuilder()
      .withOpenAI({
        client: this.azureOpenAI,
        model: this.config.conversation.openaiConfig.deploymentName,
        temperature: this.config.conversation.openaiConfig.temperature
      })
      .withMultiAgentOrchestration({
        chatManager: this.chatManager,
        maxActiveAgents: 3, // M365 SDK best practice
        healthcareSpecialized: true,
        safetyFirst: true
      })
      .withFoundationModel({
        contextWindow: this.config.conversation.conversationFlow.contextWindow,
        memoryManagement: this.config.conversation.conversationFlow.memoryManagement,
        safetyConstraints: 'healthcare_mhra_compliant'
      })
      .withSafetyValidation({
        agent: this.safetyAgent,
        mandatory: true,
        responseTimeTarget: 500
      })
      .withContentRetrieval({
        agent: this.contentAgent,
        ragEnabled: true,
        sourceAttribution: 'mandatory'
      })
      .withEscalationCoordination({
        agent: this.escalationAgent,
        nurseCallbackEnabled: true,
        gdprCompliant: true
      })
      .withConversationMemory({
        enabled: true,
        retentionPolicy: '30days',
        gdprCompliant: true
      })
      .build();

    // Initialize ExpressHosting with multi-channel support
    this.hosting = new ExpressHosting(this.agentBuilder, {
      port: parseInt(process.env.PORT || '3978', 10),
      healthEndpoint: '/health',
      widgetEndpoint: '/widget',
      multiChannel: true,
      copilotOptimized: true,
      teamsOptimized: true,
      webChatOptimized: true
    });
  }

  /**
   * Initialize the multi-agent bot system
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('🚀 Initializing Ask Eve Multi-Agent Bot with M365 Agents SDK');
      
      // Step 1: Initialize ChatManager
      await this.chatManager.initialize();
      
      // Step 2: Initialize and register specialized agents
      await this.initializeAndRegisterAgents();
      
      // Step 3: Initialize supporting services
      await this.initializeSupportingServices();
      
      // Step 4: Initialize foundation model management
      // FoundationModelManager initializes automatically, no explicit init needed
      
      // Step 5: Setup agent orchestration patterns
      await this.setupOrchestrationPatterns();
      
      // Step 6: Validate system health
      await this.validateSystemHealth();
      
      const initTime = Date.now() - startTime;
      this.logger.info('✅ Ask Eve Multi-Agent Bot initialized successfully', {
        initializationTime: initTime,
        activeAgents: this.chatManager.getActiveAgents().length,
        orchestrationReady: true,
        mhraCompliant: true,
        m365SdkVersion: '2.0.0'
      });
      
    } catch (error) {
      this.logger.error('❌ Multi-Agent Bot initialization failed', { error });
      throw new Error('Critical failure: Multi-Agent Bot system cannot start');
    }
  }

  /**
   * Process user messages through multi-agent orchestration
   * Implements healthcare-specific agent coordination: Safety → Content → Escalation
   */
  async processMessage(
    userMessage: string,
    conversationId: string,
    userId: string,
    turnContext?: TurnContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('💬 Processing message through multi-agent orchestration', {
        conversationId: conversationId.substring(0, 8) + '***',
        messageLength: userMessage.length,
        userId: userId.substring(0, 8) + '***'
      });

      // Create conversation context
      const conversationContext = await this.createConversationContext(
        conversationId,
        userId,
        userMessage,
        turnContext
      );

      // Check if this is a greeting/first message
      if (this.isGreeting(userMessage) || conversationContext.messageHistory.length === 0) {
        return await this.handleGreeting(conversationContext, turnContext);
      }

      // Execute multi-agent orchestration through ChatManager
      const orchestrationResult = await this.chatManager.orchestrateConversation(
        userMessage,
        conversationContext
      );

      // Convert agent response to user-facing response
      const userResponse = await this.convertToUserResponse(orchestrationResult, conversationContext);

      // Send response if TurnContext provided (Teams/Bot Framework integration)
      if (turnContext) {
        await this.sendBotFrameworkResponse(turnContext, userResponse);
      }

      const responseTime = Date.now() - startTime;
      this.logger.info('✅ Multi-agent message processing completed', {
        conversationId: conversationId.substring(0, 8) + '***',
        responseTime,
        agentsInvolved: orchestrationResult.result?.agentsInvolved || [],
        success: orchestrationResult.success
      });

      return {
        ...orchestrationResult,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('❌ Multi-agent message processing failed', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId,
        responseTime
      });

      // Return safety fallback response
      return this.createSafetyFallbackResponse(conversationId, userId, responseTime);
    }
  }

  /**
   * Start the multi-agent bot with Express hosting
   */
  async start(): Promise<void> {
    try {
      // Initialize the bot system
      await this.initialize();
      
      // Start Express hosting
      await this.hosting.start();
      
      this.logger.info('🌟 Ask Eve Multi-Agent Bot started successfully', {
        port: process.env.PORT || 3978,
        multiChannelReady: true,
        agentsActive: this.chatManager.getActiveAgents().length,
        orchestrationActive: true
      });
      
    } catch (error) {
      this.logger.error('❌ Failed to start Multi-Agent Bot', { error });
      throw error;
    }
  }

  /**
   * Stop the multi-agent bot gracefully
   */
  async stop(): Promise<void> {
    this.logger.info('🛑 Shutting down Ask Eve Multi-Agent Bot');
    
    try {
      // Stop all agents
      for (const agentId of this.chatManager.getActiveAgents()) {
        const agent = [this.safetyAgent, this.contentAgent, this.escalationAgent]
          .find(a => a.id === agentId);
        if (agent) {
          await agent.stop();
        }
      }
      
      // Stop foundation model manager
      await this.foundationModelManager.shutdown();
      
      // Stop hosting
      await this.hosting.stop?.();
      
      this.logger.info('✅ Multi-Agent Bot shutdown completed');
      
    } catch (error) {
      this.logger.error('❌ Error during Multi-Agent Bot shutdown', { error });
    }
  }

  /**
   * Get comprehensive system health
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: Record<string, any>;
    orchestration: any;
    services: Record<string, any>;
    foundationModel: {
      usageStatistics: Record<string, any>;
      memoryStatistics: any;
      status: 'healthy' | 'degraded' | 'unhealthy';
    };
  }> {
    
    const agentHealth = {
      safetyAgent: await this.safetyAgent.getHealth(),
      contentAgent: await this.contentAgent.getHealth(),
      escalationAgent: await this.escalationAgent.getHealth()
    };
    
    const orchestrationHealth = await this.chatManager.getOrchestrationMetrics();
    
    const serviceHealth = {
      contentService: await this.contentService.getHealth?.() || { status: 'unknown' },
      notificationService: await this.notificationService.getHealth?.() || { status: 'unknown' }
    };

    // Foundation model health and statistics
    const foundationModelUsage = this.foundationModelManager.getUsageStatistics();
    const memoryStats = this.foundationModelManager.getMemoryStatistics();
    
    let foundationModelStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const totalRequests = Object.values(foundationModelUsage).reduce((sum, stats) => sum + stats.successfulRequests + stats.failedRequests, 0);
    const totalFailures = Object.values(foundationModelUsage).reduce((sum, stats) => sum + stats.failedRequests, 0);
    
    if (totalRequests > 0) {
      const failureRate = totalFailures / totalRequests;
      if (failureRate > 0.1) foundationModelStatus = 'unhealthy';
      else if (failureRate > 0.05) foundationModelStatus = 'degraded';
    }

    // Determine overall system status
    const agentStatuses = Object.values(agentHealth).map(h => h.status);
    const serviceStatuses = Object.values(serviceHealth).map(h => h.status);
    
    let systemStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if ([...agentStatuses, ...serviceStatuses].includes('unhealthy')) {
      systemStatus = 'unhealthy';
    } else if ([...agentStatuses, ...serviceStatuses].includes('degraded')) {
      systemStatus = 'degraded';
    }

    return {
      status: systemStatus,
      agents: agentHealth,
      orchestration: orchestrationHealth,
      services: serviceHealth,
      foundationModel: {
        usageStatistics: foundationModelUsage,
        memoryStatistics: memoryStats,
        status: foundationModelStatus
      }
    };
  }

  /**
   * Private helper methods
   */
  private async initializeAndRegisterAgents(): Promise<void> {
    this.logger.info('🤖 Initializing and registering specialized agents');
    
    // Initialize agents in priority order
    await this.safetyAgent.initialize();
    await this.contentAgent.initialize();
    await this.escalationAgent.initialize();
    
    // Register agents with ChatManager
    await this.chatManager.registerAgent(this.safetyAgent);
    await this.chatManager.registerAgent(this.contentAgent);
    await this.chatManager.registerAgent(this.escalationAgent);
    
    this.logger.info('✅ All agents initialized and registered', {
      activeAgents: this.chatManager.getActiveAgents()
    });
  }

  private async initializeSupportingServices(): Promise<void> {
    this.logger.info('🔧 Initializing supporting services');
    
    await this.contentService.initialize();
    await this.entityService.initialize();
    await this.gdprIntegration.initialize?.();
    
    this.logger.info('✅ Supporting services initialized');
  }

  private async setupOrchestrationPatterns(): Promise<void> {
    this.logger.info('🎼 Setting up multi-agent orchestration patterns');
    
    // Healthcare-specific orchestration pattern is implemented in ChatManager
    // Safety → Content → Escalation sequence with group chat coordination
    
    this.logger.info('✅ Orchestration patterns configured');
  }

  private async validateSystemHealth(): Promise<void> {
    const health = await this.getSystemHealth();
    
    if (health.status === 'unhealthy') {
      throw new Error('System health validation failed - critical components unhealthy');
    }
    
    if (health.status === 'degraded') {
      this.logger.warn('⚠️ System health degraded but operational', { health });
    } else {
      this.logger.info('✅ System health validation passed');
    }
  }

  private async createConversationContext(
    conversationId: string,
    userId: string,
    userMessage: string,
    turnContext?: TurnContext
  ): Promise<ConversationContext> {
    
    // In production, this would load conversation history from persistent storage
    const messageHistory = [
      {
        text: userMessage,
        isUser: true,
        timestamp: Date.now()
      }
    ];

    return {
      conversationId,
      userId,
      sessionId: `session-${Date.now()}`,
      messageHistory,
      safetyStatus: 'unknown',
      escalationStatus: 'none',
      metadata: {
        platform: turnContext ? 'teams' : 'web',
        timestamp: Date.now()
      }
    };
  }

  private isGreeting(message: string): boolean {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const lowerMessage = message.toLowerCase().trim();
    return greetings.some(greeting => lowerMessage.includes(greeting)) && message.length < 50;
  }

  private async handleGreeting(
    context: ConversationContext,
    turnContext?: TurnContext
  ): Promise<AgentResponse> {
    
    const greetingResponse: AgentResponse = {
      messageId: uuidv4(),
      agentId: 'conversation_agent',
      success: true,
      responseTime: 0,
      result: {
        text: `${this.botDisclosure.text}\n\n${this.botDisclosure.followUp}`,
        isGreeting: true,
        suggestedActions: this.botDisclosure.suggestedActions,
        multiAgentSystem: true,
        agentsAvailable: ['SafetyAgent', 'ContentAgent', 'EscalationAgent']
      }
    };

    if (turnContext) {
      await this.sendBotFrameworkResponse(turnContext, greetingResponse);
    }

    return greetingResponse;
  }

  private async convertToUserResponse(
    orchestrationResult: AgentResponse,
    context: ConversationContext
  ): Promise<AgentResponse> {
    
    // Process multi-agent responses into user-friendly format
    if (orchestrationResult.result?.multiAgentResponse) {
      const responses = orchestrationResult.result.responses as AgentResponse[];
      
      // Combine responses from different agents
      let combinedText = '';
      const combinedSuggestedActions: string[] = [];
      let isCrisis = false;
      
      for (const response of responses) {
        if (response.result?.isCrisis) {
          // Crisis response takes precedence
          return response;
        }
        
        if (response.result?.text) {
          combinedText += response.result.text + '\n\n';
        }
        
        if (response.result?.suggestedActions) {
          combinedSuggestedActions.push(...response.result.suggestedActions);
        }
      }

      return {
        ...orchestrationResult,
        result: {
          ...orchestrationResult.result,
          text: combinedText.trim(),
          suggestedActions: [...new Set(combinedSuggestedActions)], // Remove duplicates
          multiAgentCoordinated: true
        }
      };
    }

    return orchestrationResult;
  }

  private async sendBotFrameworkResponse(
    turnContext: TurnContext,
    response: AgentResponse
  ): Promise<void> {
    
    const activity = MessageFactory.text(response.result?.text || 'I apologize, but I was unable to generate a response.');
    
    // Add suggested actions
    if (response.result?.suggestedActions?.length > 0) {
      activity.suggestedActions = {
        actions: response.result.suggestedActions.map(action => ({
          type: 'imBack',
          title: action,
          value: action
        })),
        to: []
      };
    }
    
    // Add source attribution for medical content
    if (response.result?.sourceUrl) {
      activity.attachments = [{
        contentType: 'application/vnd.microsoft.card.hero',
        content: {
          title: 'Information Source',
          subtitle: response.result.source || 'The Eve Appeal',
          buttons: [{
            type: 'openUrl',
            title: '📖 Read Full Information',
            value: response.result.sourceUrl
          }]
        }
      }];
    }

    await turnContext.sendActivity(activity);
  }

  private createSafetyFallbackResponse(
    conversationId: string,
    userId: string,
    responseTime: number
  ): AgentResponse {
    
    return {
      messageId: uuidv4(),
      agentId: 'safety_fallback',
      success: false,
      responseTime,
      error: 'System error - defaulting to safety response',
      result: {
        text: `I'm experiencing technical difficulties but want to ensure your safety. If you're having thoughts of self-harm or are in crisis, please reach out for immediate support:

• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7) 
• Crisis Text Line: Text SHOUT to 85258
• NHS 111: For urgent support

For gynaecological health information, please contact The Eve Appeal directly at 0808 802 0019.`,
        isCrisis: false, // Avoid triggering crisis escalation
        systemError: true,
        safetyFallback: true,
        emergencyContacts: {
          emergency: '999',
          samaritans: '116 123', 
          nhs: '111',
          eveAppeal: '0808 802 0019'
        }
      }
    };
  }

  private loadAgentConfigurations(): {
    safety: SafetyAgentConfig;
    content: ContentAgentConfig;
    escalation: EscalationAgentConfig;
    conversation: ConversationAgentConfig;
  } {
    
    return {
      safety: {
        crisisDetectionTimeoutMs: 500,
        triggerFiles: {
          crisisTriggersPath: 'data/crisis-triggers.json',
          highConcernTriggersPath: 'data/high-concern-triggers.json',
          emotionalSupportTriggersPath: 'data/emotional-support-triggers.json'
        },
        emergencyContacts: {
          emergency: '999',
          samaritans: '116 123',
          nhs: '111',
          crisisText: 'Text SHOUT to 85258'
        }
      },
      
      content: {
        supabaseConfig: {
          url: process.env.SUPABASE_URL || '',
          anonKey: process.env.SUPABASE_ANON_KEY || ''
        },
        searchConfig: {
          maxResults: 5,
          relevanceThreshold: 0.7,
          requireSourceUrl: true
        },
        mhraCompliance: {
          requireDisclaimers: true,
          prohibitDiagnosis: true,
          mandatorySourceAttribution: true
        }
      },
      
      escalation: {
        teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
        nurseCallbackConfig: {
          availableHours: 'Monday-Friday, 9am-5pm',
          maxWaitTime: 24,
          priorityLevels: ['immediate', 'urgent', 'standard']
        },
        gdprConfig: {
          retentionDays: 30,
          consentRequired: true,
          auditLogging: true
        }
      },
      
      conversation: {
        openaiConfig: {
          apiKey: process.env.AZURE_OPENAI_API_KEY || '',
          endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
          deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
          temperature: 0.1
        },
        conversationFlow: {
          maxTurns: 50,
          contextWindow: 128000,
          memoryManagement: 'sliding'
        },
        botDisclosure: this.botDisclosure
      }
    };
  }
}