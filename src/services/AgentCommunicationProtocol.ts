import { Logger } from '../utils/logger';
import {
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentPayload,
  ConversationContext,
  IAgent,
  IChatManager
} from '../types/agents';
import { v4 as uuidv4 } from 'uuid';

/**
 * Communication protocols for different agent interaction patterns
 */
export type CommunicationProtocol = 
  | 'safety_to_content'           // Safety clears message for content search
  | 'content_to_escalation'       // Content triggers escalation
  | 'escalation_to_safety'        // Escalation confirms safety measures
  | 'group_coordination'          // Multi-agent coordination
  | 'crisis_broadcast'            // Emergency broadcast to all agents
  | 'context_sharing'             // Share conversation context
  | 'handoff_preparation'         // Prepare for agent handoff
  | 'result_aggregation';         // Combine multiple agent results

/**
 * Message priorities for agent communication
 */
export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Communication channel configuration
 */
export interface CommunicationChannel {
  id: string;
  protocol: CommunicationProtocol;
  participants: AgentId[];
  priority: MessagePriority;
  timeout: number;
  retryCount: number;
  isActive: boolean;
}

/**
 * Agent communication event for monitoring
 */
export interface CommunicationEvent {
  eventId: string;
  timestamp: number;
  protocol: CommunicationProtocol;
  fromAgent: AgentId;
  toAgent: AgentId;
  messageType: string;
  success: boolean;
  responseTime: number;
  error?: string;
}

/**
 * Structured payload for agent-to-agent communication
 */
export interface AgentCommunicationPayload extends AgentPayload {
  protocol: CommunicationProtocol;
  contextSharing?: {
    safetyStatus: 'safe' | 'warning' | 'crisis';
    contentFound: boolean;
    escalationNeeded: boolean;
    userIntent: string;
    medicalCategory?: string;
  };
  coordination?: {
    sequenceStep: number;
    expectedNextAgent: AgentId;
    coordinationId: string;
    groupChatActive: boolean;
  };
  results?: {
    aggregateResults: boolean;
    partialResults: any[];
    finalResult?: any;
  };
}

/**
 * AgentCommunicationProtocol manages structured communication between agents
 * Implements healthcare-specific protocols for safety-first orchestration
 */
export class AgentCommunicationProtocol {
  private readonly logger: Logger;
  private readonly chatManager: IChatManager;
  private readonly activeChannels: Map<string, CommunicationChannel> = new Map();
  private readonly communicationEvents: CommunicationEvent[] = [];
  private readonly maxEventHistory = 1000;
  
  // Protocol-specific configuration
  private readonly protocolConfigs: Map<CommunicationProtocol, {
    timeout: number;
    retryCount: number;
    requiresAck: boolean;
    broadcast: boolean;
  }> = new Map([
    ['safety_to_content', { timeout: 3000, retryCount: 2, requiresAck: true, broadcast: false }],
    ['content_to_escalation', { timeout: 5000, retryCount: 3, requiresAck: true, broadcast: false }],
    ['escalation_to_safety', { timeout: 2000, retryCount: 1, requiresAck: true, broadcast: false }],
    ['group_coordination', { timeout: 10000, retryCount: 2, requiresAck: false, broadcast: true }],
    ['crisis_broadcast', { timeout: 1000, retryCount: 1, requiresAck: false, broadcast: true }],
    ['context_sharing', { timeout: 2000, retryCount: 3, requiresAck: false, broadcast: false }],
    ['handoff_preparation', { timeout: 3000, retryCount: 2, requiresAck: true, broadcast: false }],
    ['result_aggregation', { timeout: 5000, retryCount: 2, requiresAck: false, broadcast: false }]
  ]);

  constructor(logger: Logger, chatManager: IChatManager) {
    this.logger = logger;
    this.chatManager = chatManager;
  }

  /**
   * Initialize communication protocols and channels
   */
  async initialize(): Promise<void> {
    this.logger.info('🔗 Initializing Agent Communication Protocol system');
    
    // Setup standard healthcare communication channels
    await this.setupHealthcareChannels();
    
    // Start communication monitoring
    this.startCommunicationMonitoring();
    
    this.logger.info('✅ Agent Communication Protocol system initialized', {
      activeChannels: this.activeChannels.size,
      supportedProtocols: Array.from(this.protocolConfigs.keys())
    });
  }

  /**
   * Send message using specific communication protocol
   */
  async sendMessage(
    fromAgent: AgentId,
    toAgent: AgentId,
    protocol: CommunicationProtocol,
    payload: AgentCommunicationPayload,
    conversationContext: ConversationContext,
    priority: MessagePriority = 'normal'
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const eventId = uuidv4();
    
    try {
      this.logger.info('📤 Sending agent communication message', {
        eventId,
        fromAgent,
        toAgent,
        protocol,
        priority,
        conversationId: conversationContext.conversationId.substring(0, 8) + '***'
      });

      // Validate communication protocol
      const config = this.protocolConfigs.get(protocol);
      if (!config) {
        throw new Error(`Unknown communication protocol: ${protocol}`);
      }

      // Create structured agent message
      const message: AgentMessage = {
        id: eventId,
        fromAgent,
        toAgent,
        messageType: this.getMessageTypeForProtocol(protocol),
        payload: {
          ...payload,
          protocol,
          metadata: {
            ...payload.metadata,
            communicationProtocol: protocol,
            priority,
            timeout: config.timeout,
            requiresAck: config.requiresAck
          }
        },
        priority: this.convertToBotPriority(priority),
        timestamp: Date.now(),
        expiresAt: Date.now() + config.timeout
      };

      // Route through ChatManager or send directly based on protocol
      let response: AgentResponse;
      if (config.broadcast) {
        response = await this.broadcastMessage(message, conversationContext);
      } else {
        response = await this.chatManager.routeMessage(message);
      }

      const responseTime = Date.now() - startTime;

      // Record successful communication
      this.recordCommunicationEvent({
        eventId,
        timestamp: startTime,
        protocol,
        fromAgent,
        toAgent,
        messageType: message.messageType,
        success: response.success,
        responseTime,
        error: response.error
      });

      // Process acknowledgment if required
      if (config.requiresAck && response.success) {
        await this.processAcknowledgment(fromAgent, toAgent, protocol, response);
      }

      this.logger.info('✅ Agent communication completed', {
        eventId,
        protocol,
        success: response.success,
        responseTime
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('❌ Agent communication failed', {
        eventId,
        fromAgent,
        toAgent,
        protocol,
        error: errorMessage,
        responseTime
      });

      // Record failed communication
      this.recordCommunicationEvent({
        eventId,
        timestamp: startTime,
        protocol,
        fromAgent,
        toAgent,
        messageType: 'communication_error',
        success: false,
        responseTime,
        error: errorMessage
      });

      // Return error response
      return {
        messageId: eventId,
        agentId: toAgent,
        success: false,
        responseTime,
        error: errorMessage,
        result: {
          communicationError: true,
          protocol,
          fallbackRequired: true
        }
      };
    }
  }

  /**
   * Healthcare-specific protocol: Safety agent clears content search
   */
  async safetyToContent(
    safetyResult: any,
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    const payload: AgentCommunicationPayload = {
      messageId: uuidv4(),
      timestamp: Date.now(),
      conversationId: conversationContext.conversationId,
      userId: conversationContext.userId,
      protocol: 'safety_to_content',
      data: {
        safetyCleared: !safetyResult.isCrisis,
        userMessage: conversationContext.messageHistory[conversationContext.messageHistory.length - 1]?.text || '',
        safetyAnalysis: safetyResult
      },
      contextSharing: {
        safetyStatus: safetyResult.isCrisis ? 'crisis' : (safetyResult.severity === 'high' ? 'warning' : 'safe'),
        contentFound: false,
        escalationNeeded: safetyResult.isCrisis,
        userIntent: 'health_information_request',
        medicalCategory: safetyResult.medicalCategory
      }
    };

    return this.sendMessage(
      'safety_agent',
      'content_agent',
      'safety_to_content',
      payload,
      conversationContext,
      safetyResult.isCrisis ? 'critical' : 'high'
    );
  }

  /**
   * Healthcare-specific protocol: Content agent triggers escalation
   */
  async contentToEscalation(
    contentResult: any,
    conversationContext: ConversationContext,
    escalationType: string = 'nurse_callback'
  ): Promise<AgentResponse> {
    const payload: AgentCommunicationPayload = {
      messageId: uuidv4(),
      timestamp: Date.now(),
      conversationId: conversationContext.conversationId,
      userId: conversationContext.userId,
      protocol: 'content_to_escalation',
      data: {
        contentResult,
        escalationType,
        userMessage: conversationContext.messageHistory[conversationContext.messageHistory.length - 1]?.text || '',
        requiresCallback: true
      },
      contextSharing: {
        safetyStatus: 'safe',
        contentFound: contentResult.found,
        escalationNeeded: true,
        userIntent: 'needs_professional_guidance',
        medicalCategory: contentResult.medicalCategory
      }
    };

    return this.sendMessage(
      'content_agent',
      'escalation_agent',
      'content_to_escalation',
      payload,
      conversationContext,
      'high'
    );
  }

  /**
   * Emergency protocol: Crisis broadcast to all agents
   */
  async crisisBroadcast(
    crisisDetails: any,
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    const payload: AgentCommunicationPayload = {
      messageId: uuidv4(),
      timestamp: Date.now(),
      conversationId: conversationContext.conversationId,
      userId: conversationContext.userId,
      protocol: 'crisis_broadcast',
      data: {
        crisisType: crisisDetails.crisisType,
        severity: crisisDetails.severity,
        immediateResponse: crisisDetails.immediateResponse,
        emergencyContacts: crisisDetails.emergencyContacts,
        allAgentsAlert: true
      },
      contextSharing: {
        safetyStatus: 'crisis',
        contentFound: false,
        escalationNeeded: true,
        userIntent: 'crisis_support',
        medicalCategory: 'crisis'
      }
    };

    this.logger.warn('🚨 Broadcasting crisis alert to all agents', {
      conversationId: conversationContext.conversationId.substring(0, 8) + '***',
      crisisType: crisisDetails.crisisType,
      severity: crisisDetails.severity
    });

    return this.sendMessage(
      'safety_agent',
      'all_agents',
      'crisis_broadcast',
      payload,
      conversationContext,
      'critical'
    );
  }

  /**
   * Group coordination protocol for multi-agent workflows
   */
  async coordinateGroupWorkflow(
    coordinationId: string,
    participants: AgentId[],
    workflowData: any,
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    const payload: AgentCommunicationPayload = {
      messageId: uuidv4(),
      timestamp: Date.now(),
      conversationId: conversationContext.conversationId,
      userId: conversationContext.userId,
      protocol: 'group_coordination',
      data: {
        workflowData,
        participants,
        coordinatedResponse: true
      },
      coordination: {
        sequenceStep: 1,
        expectedNextAgent: participants[0],
        coordinationId,
        groupChatActive: true
      }
    };

    return this.sendMessage(
      'conversation_agent',
      'all_agents',
      'group_coordination',
      payload,
      conversationContext,
      'high'
    );
  }

  /**
   * Result aggregation protocol for combining agent responses
   */
  async aggregateResults(
    results: AgentResponse[],
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    const payload: AgentCommunicationPayload = {
      messageId: uuidv4(),
      timestamp: Date.now(),
      conversationId: conversationContext.conversationId,
      userId: conversationContext.userId,
      protocol: 'result_aggregation',
      data: {
        individualResults: results,
        aggregationType: 'healthcare_response'
      },
      results: {
        aggregateResults: true,
        partialResults: results.map(r => r.result),
        finalResult: null
      }
    };

    return this.sendMessage(
      'conversation_agent',
      'content_agent',
      'result_aggregation',
      payload,
      conversationContext,
      'normal'
    );
  }

  /**
   * Setup standard healthcare communication channels
   */
  private async setupHealthcareChannels(): Promise<void> {
    const healthcareChannels: Omit<CommunicationChannel, 'id'>[] = [
      {
        protocol: 'safety_to_content',
        participants: ['safety_agent', 'content_agent'],
        priority: 'high',
        timeout: 3000,
        retryCount: 2,
        isActive: true
      },
      {
        protocol: 'content_to_escalation',
        participants: ['content_agent', 'escalation_agent'],
        priority: 'high',
        timeout: 5000,
        retryCount: 3,
        isActive: true
      },
      {
        protocol: 'crisis_broadcast',
        participants: ['safety_agent', 'content_agent', 'escalation_agent'],
        priority: 'critical',
        timeout: 1000,
        retryCount: 1,
        isActive: true
      },
      {
        protocol: 'group_coordination',
        participants: ['safety_agent', 'content_agent', 'escalation_agent'],
        priority: 'normal',
        timeout: 10000,
        retryCount: 2,
        isActive: true
      }
    ];

    for (const channelConfig of healthcareChannels) {
      const channelId = `channel_${channelConfig.protocol}_${Date.now()}`;
      const channel: CommunicationChannel = {
        id: channelId,
        ...channelConfig
      };
      
      this.activeChannels.set(channelId, channel);
      
      this.logger.info('📡 Healthcare communication channel established', {
        channelId,
        protocol: channel.protocol,
        participants: channel.participants
      });
    }
  }

  /**
   * Broadcast message to multiple agents
   */
  private async broadcastMessage(
    message: AgentMessage,
    conversationContext: ConversationContext
  ): Promise<AgentResponse> {
    const responses: AgentResponse[] = [];
    const activeAgents = this.chatManager.getActiveAgents();

    this.logger.info('📢 Broadcasting message to active agents', {
      messageId: message.id,
      protocol: (message.payload as AgentCommunicationPayload).protocol,
      activeAgents
    });

    // Send to all active agents except the sender
    for (const agentId of activeAgents) {
      if (agentId !== message.fromAgent) {
        try {
          const targetMessage = { ...message, toAgent: agentId };
          const response = await this.chatManager.routeMessage(targetMessage);
          responses.push(response);
        } catch (error) {
          this.logger.warn('Broadcast failed to agent', { agentId, error });
        }
      }
    }

    // Aggregate broadcast responses
    return {
      messageId: message.id,
      agentId: 'broadcast',
      success: responses.length > 0,
      responseTime: 0,
      result: {
        broadcast: true,
        responses,
        successfulBroadcasts: responses.filter(r => r.success).length,
        totalRecipients: activeAgents.length - 1
      }
    };
  }

  /**
   * Process acknowledgment for protocols that require it
   */
  private async processAcknowledgment(
    fromAgent: AgentId,
    toAgent: AgentId,
    protocol: CommunicationProtocol,
    response: AgentResponse
  ): Promise<void> {
    this.logger.info('✅ Processing acknowledgment', {
      fromAgent,
      toAgent,
      protocol,
      messageId: response.messageId
    });

    // Record acknowledgment (in production, this would update channel state)
    // For now, just log the acknowledgment
  }

  /**
   * Get message type based on communication protocol
   */
  private getMessageTypeForProtocol(protocol: CommunicationProtocol): string {
    const messageTypes: Record<CommunicationProtocol, string> = {
      safety_to_content: 'safety_clearance',
      content_to_escalation: 'escalation_required',
      escalation_to_safety: 'safety_confirmation',
      group_coordination: 'group_workflow',
      crisis_broadcast: 'crisis_alert',
      context_sharing: 'context_update',
      handoff_preparation: 'handoff_ready',
      result_aggregation: 'result_merge'
    };

    return messageTypes[protocol] || 'agent_communication';
  }

  /**
   * Convert custom priority to bot framework priority
   */
  private convertToBotPriority(priority: MessagePriority): AgentMessage['priority'] {
    const priorityMap: Record<MessagePriority, AgentMessage['priority']> = {
      critical: 'immediate',
      high: 'high',
      normal: 'normal',
      low: 'low'
    };

    return priorityMap[priority];
  }

  /**
   * Record communication event for monitoring and analytics
   */
  private recordCommunicationEvent(event: CommunicationEvent): void {
    this.communicationEvents.push(event);
    
    // Keep only recent events to prevent memory issues
    if (this.communicationEvents.length > this.maxEventHistory) {
      this.communicationEvents.splice(0, this.communicationEvents.length - this.maxEventHistory);
    }
  }

  /**
   * Start monitoring communication channels
   */
  private startCommunicationMonitoring(): void {
    // Monitor channel health every 30 seconds
    setInterval(() => {
      this.monitorChannelHealth();
    }, 30 * 1000);

    // Log communication metrics every 5 minutes
    setInterval(() => {
      this.logCommunicationMetrics();
    }, 5 * 60 * 1000);
  }

  /**
   * Monitor health of communication channels
   */
  private monitorChannelHealth(): void {
    const healthyChannels = Array.from(this.activeChannels.values()).filter(c => c.isActive).length;
    const totalChannels = this.activeChannels.size;

    if (healthyChannels < totalChannels) {
      this.logger.warn('⚠️ Some communication channels are inactive', {
        healthyChannels,
        totalChannels,
        inactiveChannels: totalChannels - healthyChannels
      });
    }
  }

  /**
   * Log communication metrics for monitoring
   */
  private logCommunicationMetrics(): void {
    const recentEvents = this.communicationEvents.filter(
      e => Date.now() - e.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );

    const metrics = {
      totalCommunications: recentEvents.length,
      successfulCommunications: recentEvents.filter(e => e.success).length,
      averageResponseTime: recentEvents.reduce((sum, e) => sum + e.responseTime, 0) / Math.max(recentEvents.length, 1),
      protocolUsage: {} as Record<CommunicationProtocol, number>,
      activeChannels: this.activeChannels.size
    };

    // Count protocol usage
    for (const event of recentEvents) {
      metrics.protocolUsage[event.protocol] = (metrics.protocolUsage[event.protocol] || 0) + 1;
    }

    this.logger.info('📊 Agent communication metrics', metrics);
  }

  /**
   * Get communication statistics
   */
  getCommunicationStats(): {
    totalChannels: number;
    activeChannels: number;
    recentEvents: number;
    successRate: number;
    averageResponseTime: number;
    protocolUsage: Record<CommunicationProtocol, number>;
  } {
    const recentEvents = this.communicationEvents.filter(
      e => Date.now() - e.timestamp < 30 * 60 * 1000 // Last 30 minutes
    );

    const successfulEvents = recentEvents.filter(e => e.success);
    const protocolUsage = {} as Record<CommunicationProtocol, number>;

    for (const event of recentEvents) {
      protocolUsage[event.protocol] = (protocolUsage[event.protocol] || 0) + 1;
    }

    return {
      totalChannels: this.activeChannels.size,
      activeChannels: Array.from(this.activeChannels.values()).filter(c => c.isActive).length,
      recentEvents: recentEvents.length,
      successRate: recentEvents.length > 0 ? successfulEvents.length / recentEvents.length : 0,
      averageResponseTime: successfulEvents.reduce((sum, e) => sum + e.responseTime, 0) / Math.max(successfulEvents.length, 1),
      protocolUsage
    };
  }

  /**
   * Shutdown communication protocol system
   */
  async shutdown(): Promise<void> {
    this.logger.info('🛑 Shutting down Agent Communication Protocol system');
    
    // Deactivate all channels
    for (const channel of this.activeChannels.values()) {
      channel.isActive = false;
    }

    this.logger.info('✅ Agent Communication Protocol system shutdown complete');
  }
}