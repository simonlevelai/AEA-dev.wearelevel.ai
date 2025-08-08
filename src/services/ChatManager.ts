import { Logger } from '../utils/logger';
import {
  IChatManager,
  IAgent,
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentPayload,
  ConversationContext,
  OrchestrationMetrics,
  AgentMessageSchema,
  ConversationContextSchema
} from '../types/agents';
import { AgentCommunicationProtocol } from './AgentCommunicationProtocol';
import { v4 as uuidv4 } from 'uuid';

/**
 * ChatManager implements Microsoft 365 Agents SDK group chat orchestration pattern
 * Manages multi-agent collaboration with healthcare-specific safety-first approach
 * Follows best practice of limiting to ≤3 agents for optimal control
 */
export class ChatManager implements IChatManager {
  private readonly logger: Logger;
  private readonly agents: Map<AgentId, IAgent> = new Map();
  private readonly maxActiveAgents = 3; // M365 SDK best practice
  private readonly messageTimeout = 30000; // 30 seconds
  private readonly metrics: OrchestrationMetrics;
  private readonly communicationProtocol: AgentCommunicationProtocol;
  
  // Message routing and coordination
  private readonly messageQueue: Map<string, AgentMessage> = new Map();
  private readonly activeConversations: Map<string, {
    agents: AgentId[];
    context: ConversationContext;
    lastActivity: number;
  }> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
    this.metrics = {
      activeAgents: 0,
      totalMessages: 0,
      averageResponseTime: 0,
      handoffSuccessRate: 0,
      errorRate: 0,
      agentMetrics: {} as Record<AgentId, any>
    };
    
    // Initialize communication protocol system
    this.communicationProtocol = new AgentCommunicationProtocol(logger, this);
  }

  async initialize(): Promise<void> {
    this.logger.info('🤖 Initializing ChatManager with M365 Agents SDK orchestration');
    
    // Initialize metrics tracking for all agent types
    const agentIds: AgentId[] = ['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent'];
    for (const agentId of agentIds) {
      this.metrics.agentMetrics[agentId] = {
        messagesProcessed: 0,
        averageResponseTime: 0,
        errorCount: 0,
        lastActive: 0
      };
    }

    // Initialize agent communication protocol system
    await this.communicationProtocol.initialize();

    // Start metrics collection
    this.startMetricsCollection();
    
    this.logger.info('✅ ChatManager initialized successfully', {
      communicationProtocolReady: true,
      supportedProtocols: ['safety_to_content', 'content_to_escalation', 'crisis_broadcast', 'group_coordination']
    });
  }

  /**
   * Main orchestration method - routes user messages through appropriate agents
   * Implements healthcare-specific agent sequencing: Safety → Content → Escalation
   */
  async orchestrateConversation(
    userMessage: string,
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      // Validate conversation context
      const validatedContext = ConversationContextSchema.parse(conversationContext);
      
      this.logger.info('🎯 Orchestrating conversation', {
        conversationId: validatedContext.conversationId.substring(0, 8) + '***',
        messageLength: userMessage.length,
        currentSafetyStatus: validatedContext.safetyStatus
      });

      // Healthcare-specific agent orchestration sequence
      const orchestrationResult = await this.executeHealthcareOrchestration(
        userMessage,
        validatedContext
      );

      // Update metrics
      this.updateOrchestrationMetrics(startTime, true);

      return orchestrationResult;

    } catch (error) {
      this.logger.error('❌ Conversation orchestration failed', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: conversationContext.conversationId
      });

      // Update error metrics
      this.updateOrchestrationMetrics(startTime, false);

      // Return error response with safety fallback
      return this.createErrorResponse(error, conversationContext);
    }
  }

  /**
   * Healthcare-specific orchestration: Safety-first agent sequencing
   * 1. SafetyAgent - Crisis detection (<500ms)
   * 2. ContentAgent - Medical information retrieval  
   * 3. EscalationAgent - Nurse callback coordination
   */
  private async executeHealthcareOrchestration(
    userMessage: string,
    context: ConversationContext
  ): Promise<AgentResponse> {
    
    // Phase 1: MANDATORY Safety Check (highest priority)
    const safetyAgent = this.agents.get('safety_agent');
    if (!safetyAgent) {
      throw new Error('Safety agent not available - cannot proceed without safety validation');
    }

    const safetyMessage = this.createAgentMessage(
      'conversation_agent',
      'safety_agent',
      'safety_check_request',
      {
        messageId: uuidv4(),
        timestamp: Date.now(),
        conversationId: context.conversationId,
        userId: context.userId,
        data: { userMessage, context }
      },
      'immediate' // Always immediate priority for safety
    );

    const safetyResponse = await this.processAgentMessage(safetyAgent, safetyMessage, context);
    
    // If crisis detected, broadcast crisis alert and return immediately
    if (safetyResponse.result?.isCrisis) {
      this.logger.warn('🚨 Crisis detected - broadcasting alert and returning emergency response', {
        conversationId: context.conversationId.substring(0, 8) + '***'
      });
      
      // Broadcast crisis alert to all agents
      await this.communicationProtocol.crisisBroadcast(safetyResponse.result, context);
      
      return safetyResponse;
    }

    // Phase 2: Content Search (if safety cleared) - Use communication protocol
    const contentResponse = await this.communicationProtocol.safetyToContent(
      safetyResponse.result,
      context
    );

    if (!contentResponse.success) {
      this.logger.warn('Content agent communication failed - proceeding with basic response');
      return this.createFallbackResponse(context);
    }

    // Phase 3: Escalation Assessment (if content found or escalation needed) - Use communication protocol
    if (contentResponse.result?.escalationRecommended || contentResponse.result?.nurseCallbackSuggested) {
      this.logger.info('🔄 Escalation required - using communication protocol', {
        escalationRecommended: contentResponse.result?.escalationRecommended,
        nurseCallbackSuggested: contentResponse.result?.nurseCallbackSuggested
      });
      
      const escalationResponse = await this.communicationProtocol.contentToEscalation(
        contentResponse.result,
        context,
        contentResponse.result?.escalationType || 'nurse_callback'
      );
      
      if (escalationResponse.success) {
        // Merge agent responses using communication protocol
        const mergedResponse = await this.communicationProtocol.aggregateResults(
          [contentResponse, escalationResponse],
          context
        );
        return mergedResponse.success ? mergedResponse : this.mergeAgentResponses([contentResponse, escalationResponse], context);
      }
    }

    return contentResponse;
  }

  /**
   * Process individual agent message with timeout and error handling
   */
  private async processAgentMessage(
    agent: IAgent,
    message: AgentMessage,
    context: ConversationContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      // Set message timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Agent response timeout')), this.messageTimeout);
      });

      const responsePromise = agent.processMessage(message, context);
      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Update agent-specific metrics
      const responseTime = Date.now() - startTime;
      this.updateAgentMetrics(agent.id, responseTime, true);

      this.logger.info(`✅ Agent response received`, {
        agentId: agent.id,
        responseTime,
        success: response.success
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateAgentMetrics(agent.id, responseTime, false);

      this.logger.error(`❌ Agent processing failed`, {
        agentId: agent.id,
        error: error instanceof Error ? error : new Error(String(error)),
        responseTime
      });

      // Return error response but don't throw - allow orchestration to continue
      return {
        messageId: message.id,
        agentId: agent.id,
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Route messages between agents
   */
  async routeMessage(message: AgentMessage): Promise<AgentResponse> {
    try {
      // Validate message
      const validatedMessage = AgentMessageSchema.parse(message);
      
      // Get target agent
      const targetAgent = this.agents.get(validatedMessage.toAgent);
      if (!targetAgent) {
        throw new Error(`Target agent ${validatedMessage.toAgent} not found`);
      }

      // Create conversation context for agent routing
      const routingContext: ConversationContext = {
        conversationId: validatedMessage.payload.conversationId,
        userId: validatedMessage.payload.userId,
        sessionId: `routing-${Date.now()}`,
        messageHistory: [],
        safetyStatus: 'unknown',
        escalationStatus: 'none',
        metadata: validatedMessage.payload.metadata || {}
      };

      return await this.processAgentMessage(targetAgent, validatedMessage, routingContext);

    } catch (error) {
      this.logger.error('Message routing failed', { error, message });
      throw error;
    }
  }

  /**
   * Coordinate handoff between agents
   */
  async coordinateHandoff(
    fromAgent: AgentId,
    toAgent: AgentId,
    payload: AgentPayload
  ): Promise<AgentResponse> {
    this.logger.info('🔄 Coordinating agent handoff', { fromAgent, toAgent });

    const targetAgent = this.agents.get(toAgent);
    if (!targetAgent) {
      throw new Error(`Handoff target agent ${toAgent} not available`);
    }

    try {
      const handoffContext: ConversationContext = {
        conversationId: payload.conversationId,
        userId: payload.userId,
        sessionId: `handoff-${Date.now()}`,
        messageHistory: [],
        safetyStatus: 'unknown',
        escalationStatus: 'none',
        metadata: { handoffFrom: fromAgent, ...payload.metadata }
      };

      const response = await targetAgent.handleHandoff(fromAgent, payload);
      
      this.logger.info('✅ Agent handoff completed', {
        fromAgent,
        toAgent,
        success: response.success
      });

      return response;

    } catch (error) {
      this.logger.error('❌ Agent handoff failed', { error, fromAgent, toAgent });
      throw error;
    }
  }

  /**
   * Initiate group chat orchestration (≤3 agents)
   */
  async initiateGroupChat(
    agents: AgentId[],
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    if (agents.length > this.maxActiveAgents) {
      throw new Error(`Group chat limited to ${this.maxActiveAgents} agents for optimal control`);
    }

    this.logger.info('👥 Initiating group chat orchestration', {
      agents,
      conversationId: conversationContext.conversationId.substring(0, 8) + '***'
    });

    // For healthcare, we enforce Safety → Content → Escalation sequence even in group chat
    const orderedAgents = this.orderAgentsForHealthcare(agents);
    
    // Store active conversation
    this.activeConversations.set(conversationContext.conversationId, {
      agents: orderedAgents,
      context: conversationContext,
      lastActivity: Date.now()
    });

    // Process through ordered agents
    let currentResponse: AgentResponse | undefined;
    const responses: AgentResponse[] = [];

    for (const agentId of orderedAgents) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      const message = this.createAgentMessage(
        orderedAgents[0], // Always from first agent in sequence
        agentId,
        'safety_check_request', // Will be interpreted by each agent appropriately
        {
          messageId: uuidv4(),
          timestamp: Date.now(),
          conversationId: conversationContext.conversationId,
          userId: conversationContext.userId,
          data: { 
            groupChatMode: true,
            previousResponses: responses,
            context: conversationContext
          }
        },
        'high'
      );

      const response = await this.processAgentMessage(agent, message, conversationContext);
      responses.push(response);

      // If crisis detected by safety agent, stop group chat immediately
      if (agentId === 'safety_agent' && response.result?.isCrisis) {
        this.logger.warn('🚨 Crisis detected in group chat - stopping orchestration');
        return response;
      }

      currentResponse = response;
    }

    // Clean up active conversation
    this.activeConversations.delete(conversationContext.conversationId);

    return currentResponse || this.createFallbackResponse(conversationContext);
  }

  /**
   * Agent management methods
   */
  async registerAgent(agent: IAgent): Promise<void> {
    this.logger.info('📝 Registering agent', { agentId: agent.id });
    
    // Initialize agent
    await agent.initialize();
    
    // Add to registry
    this.agents.set(agent.id, agent);
    this.metrics.activeAgents = this.agents.size;
    
    // Initialize agent metrics
    this.metrics.agentMetrics[agent.id] = {
      messagesProcessed: 0,
      averageResponseTime: 0,
      errorCount: 0,
      lastActive: Date.now()
    };

    this.logger.info('✅ Agent registered successfully', { 
      agentId: agent.id,
      totalAgents: this.agents.size 
    });
  }

  async unregisterAgent(agentId: AgentId): Promise<void> {
    this.logger.info('🗑️ Unregistering agent', { agentId });
    
    const agent = this.agents.get(agentId);
    if (agent) {
      await agent.stop();
      this.agents.delete(agentId);
      this.metrics.activeAgents = this.agents.size;
    }
    
    this.logger.info('✅ Agent unregistered', { agentId });
  }

  getActiveAgents(): AgentId[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get orchestration metrics for monitoring
   */
  async getOrchestrationMetrics(): Promise<OrchestrationMetrics> {
    // Include communication protocol statistics
    const commStats = this.communicationProtocol.getCommunicationStats();
    
    return { 
      ...this.metrics,
      communicationStats: commStats
    };
  }

  /**
   * Helper methods
   */
  private createAgentMessage(
    fromAgent: AgentId,
    toAgent: AgentId,
    messageType: AgentMessage['messageType'],
    payload: AgentPayload,
    priority: AgentMessage['priority']
  ): AgentMessage {
    return {
      id: uuidv4(),
      fromAgent,
      toAgent,
      messageType,
      payload,
      priority,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.messageTimeout
    };
  }

  private orderAgentsForHealthcare(agents: AgentId[]): AgentId[] {
    // Healthcare-specific ordering: Safety → Content → Escalation
    const priorityOrder: AgentId[] = ['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent'];
    
    return priorityOrder.filter(agentId => agents.includes(agentId));
  }

  private mergeAgentResponses(responses: AgentResponse[], context: ConversationContext): AgentResponse {
    const merged: AgentResponse = {
      messageId: uuidv4(),
      agentId: 'conversation_agent',
      success: responses.every(r => r.success),
      responseTime: responses.reduce((total, r) => total + r.responseTime, 0),
      result: {
        multiAgentResponse: true,
        responses: responses,
        conversationId: context.conversationId
      }
    };

    return merged;
  }

  private createFallbackResponse(context: ConversationContext): AgentResponse {
    return {
      messageId: uuidv4(),
      agentId: 'conversation_agent',
      success: true,
      responseTime: 0,
      result: {
        text: "I'm here to help you with gynaecological health information. For personalized advice, please speak with your GP or contact The Eve Appeal nurse line on 0808 802 0019.",
        isFallback: true,
        conversationId: context.conversationId
      }
    };
  }

  private createErrorResponse(error: unknown, context: ConversationContext): AgentResponse {
    return {
      messageId: uuidv4(),
      agentId: 'conversation_agent',
      success: false,
      responseTime: 0,
      error: error instanceof Error ? error.message : String(error),
      result: {
        text: "I apologize, but I'm experiencing technical difficulties. For immediate health information, please contact your GP or call NHS 111.",
        isError: true,
        conversationId: context.conversationId,
        emergencyContacts: {
          emergency: '999',
          samaritans: '116 123',
          nhs: '111',
          eveAppeal: 'https://eveappeal.org.uk'
        }
      }
    };
  }

  private updateOrchestrationMetrics(startTime: number, success: boolean): void {
    this.metrics.totalMessages++;
    
    const responseTime = Date.now() - startTime;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalMessages - 1) + responseTime) / this.metrics.totalMessages;
    
    if (!success) {
      this.metrics.errorRate = (this.metrics.errorRate * this.metrics.totalMessages + 1) / this.metrics.totalMessages;
    }
  }

  private updateAgentMetrics(agentId: AgentId, responseTime: number, success: boolean): void {
    const metrics = this.metrics.agentMetrics[agentId];
    if (!metrics) return;

    metrics.messagesProcessed++;
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.messagesProcessed - 1) + responseTime) / metrics.messagesProcessed;
    metrics.lastActive = Date.now();

    if (!success) {
      metrics.errorCount++;
    }
  }

  private startMetricsCollection(): void {
    // Clean up old conversations every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      for (const [conversationId, conversation] of this.activeConversations.entries()) {
        if (conversation.lastActivity < fiveMinutesAgo) {
          this.activeConversations.delete(conversationId);
          this.logger.info('🧹 Cleaned up stale conversation', { conversationId: conversationId.substring(0, 8) + '***' });
        }
      }
    }, 5 * 60 * 1000);
  }
}