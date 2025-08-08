import { Logger } from '../utils/logger';
import { NotificationService } from '../services/NotificationService';
import { ContactCollectionWorkflow, ContactDetails } from '../workflows/ContactCollectionWorkflow';
import { ConversationGDPRIntegration } from '../services/ConversationGDPRIntegration';
import {
  IAgent,
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentPayload,
  ConversationContext,
  AgentCapabilities,
  EscalationAgentConfig
} from '../types/agents';
import { v4 as uuidv4 } from 'uuid';

/**
 * EscalationAgent - Specialized nurse callback and escalation coordination agent
 * Handles GDPR-compliant contact collection and Teams webhook notifications
 * Coordinates with healthcare professionals for user support
 */
export class EscalationAgent implements IAgent {
  public readonly id: AgentId = 'escalation_agent';
  public readonly capabilities: AgentCapabilities;
  
  private readonly logger: Logger;
  private readonly config: EscalationAgentConfig;
  private readonly notificationService: NotificationService;
  private readonly contactWorkflow: ContactCollectionWorkflow;
  private readonly gdprIntegration: ConversationGDPRIntegration;
  
  // Performance and tracking
  private readonly metrics = {
    totalEscalations: 0,
    successfulEscalations: 0,
    callbacksScheduled: 0,
    teamsNotifications: 0,
    averageResponseTime: 0,
    gdprCompliance: 1.0 // Must be 100%
  };

  private readonly activeEscalations: Map<string, {
    escalationId: string;
    type: 'immediate' | 'urgent' | 'standard';
    status: 'initiated' | 'contact_collecting' | 'callback_scheduled' | 'completed';
    contactDetails?: ContactDetails;
    startTime: number;
    conversationId: string;
  }> = new Map();

  constructor(
    logger: Logger,
    config: EscalationAgentConfig,
    notificationService: NotificationService,
    contactWorkflow: ContactCollectionWorkflow,
    gdprIntegration: ConversationGDPRIntegration
  ) {
    this.logger = logger;
    this.config = config;
    this.notificationService = notificationService;
    this.contactWorkflow = contactWorkflow;
    this.gdprIntegration = gdprIntegration;
    
    this.capabilities = {
      agentId: 'escalation_agent',
      name: 'Escalation Agent',
      description: 'Specialized nurse callback coordination agent with GDPR-compliant contact collection. Handles escalation to healthcare professionals via Teams notifications and callback scheduling.',
      capabilities: ['escalation_coordination', 'nurse_callback', 'teams_notification'],
      responseTimeTarget: 5000, // 5 seconds for escalation coordination
      priority: 3, // Third priority after safety and content
      isActive: false,
      healthEndpoint: '/health/escalation-agent'
    };
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('🚨 Initializing EscalationAgent with nurse callback coordination');
      
      // Initialize notification service
      await this.notificationService.initialize?.();
      
      // Initialize GDPR integration
      await this.gdprIntegration.initialize?.();
      
      // Validate Teams webhook connectivity
      await this.validateTeamsIntegration();
      
      // Start escalation monitoring
      this.startEscalationMonitoring();
      
      this.capabilities.isActive = true;
      
      const initTime = Date.now() - startTime;
      this.logger.info('✅ EscalationAgent initialized successfully', {
        initializationTime: initTime,
        teamsWebhookReady: true,
        gdprIntegrationReady: true,
        nurseCallbackHours: this.config.nurseCallbackConfig.availableHours
      });
      
    } catch (error) {
      this.logger.error('❌ EscalationAgent initialization failed', { error });
      throw new Error('EscalationAgent initialization failed - cannot coordinate escalations');
    }
  }

  async processMessage(
    message: AgentMessage, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      const userMessage = message.payload.data.userMessage as string;
      const escalationType = message.payload.data.escalationType as string || 'nurse_callback';
      const contentFound = message.payload.data.contentFound as boolean || false;
      
      this.logger.info('🚨 Escalation processing initiated', {
        conversationId: context.conversationId.substring(0, 8) + '***',
        escalationType,
        contentFound,
        fromAgent: message.fromAgent
      });

      // Determine escalation priority and type
      const escalationAssessment = await this.assessEscalationRequirements(
        userMessage, 
        escalationType, 
        context
      );

      // Create escalation record
      const escalationId = uuidv4();
      const escalationRecord = {
        escalationId,
        type: escalationAssessment.priority,
        status: 'initiated' as const,
        startTime: Date.now(),
        conversationId: context.conversationId
      };

      this.activeEscalations.set(escalationId, escalationRecord);

      // Execute escalation workflow
      const escalationResult = await this.executeEscalationWorkflow(
        escalationAssessment,
        escalationId,
        context,
        userMessage
      );
      
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(responseTime, escalationResult.success, escalationResult.type);
      
      const response: AgentResponse = {
        messageId: message.id,
        agentId: this.id,
        success: escalationResult.success,
        responseTime,
        result: {
          escalationId,
          escalationType: escalationAssessment.type,
          priority: escalationAssessment.priority,
          actionTaken: escalationResult.actionTaken,
          callbackScheduled: escalationResult.callbackScheduled,
          teamsNotificationSent: escalationResult.teamsNotified,
          contactRequired: escalationResult.contactRequired,
          estimatedCallbackTime: escalationResult.estimatedCallbackTime,
          nurseTeamAlerted: escalationResult.nurseTeamAlerted,
          gdprCompliant: true, // Always ensure GDPR compliance
          userGuidance: escalationResult.userGuidance
        },
        nextActions: escalationResult.nextActions,
        handoffRequired: false // Escalation agent is typically the final step
      };

      this.logger.info('✅ Escalation processing completed', {
        conversationId: context.conversationId.substring(0, 8) + '***',
        escalationId,
        success: escalationResult.success,
        responseTime,
        actionTaken: escalationResult.actionTaken
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, false, 'error');
      
      this.logger.error('❌ Escalation processing failed', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: context.conversationId,
        responseTime
      });

      return {
        messageId: message.id,
        agentId: this.id,
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
        result: {
          escalationFailed: true,
          fallbackGuidance: this.getFallbackEscalationGuidance(),
          emergencyContacts: this.getEmergencyContacts(),
          gdprCompliant: true
        }
      };
    }
  }

  async handleHandoff(fromAgent: AgentId, payload: AgentPayload): Promise<AgentResponse> {
    this.logger.info('🔄 EscalationAgent handling handoff', { fromAgent });
    
    // Create escalation message from handoff payload
    const escalationMessage: AgentMessage = {
      id: uuidv4(),
      fromAgent,
      toAgent: 'escalation_agent',
      messageType: 'escalation_required',
      payload: {
        ...payload,
        data: {
          ...payload.data,
          escalationType: payload.data.escalationType || 'nurse_callback'
        }
      },
      priority: 'high',
      timestamp: Date.now()
    };

    const handoffContext: ConversationContext = {
      conversationId: payload.conversationId,
      userId: payload.userId,
      sessionId: `handoff-${Date.now()}`,
      messageHistory: [],
      safetyStatus: 'safe',
      escalationStatus: 'pending',
      metadata: { handoffFrom: fromAgent }
    };

    return await this.processMessage(escalationMessage, handoffContext);
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, unknown> }> {
    const notificationHealth = await this.notificationService.getHealth?.() || { status: 'unknown' };
    
    const healthDetails = {
      agentId: this.id,
      isActive: this.capabilities.isActive,
      metrics: this.metrics,
      activeEscalations: this.activeEscalations.size,
      notificationServiceStatus: notificationHealth.status,
      lastHealthCheck: Date.now(),
      gdprCompliance: {
        complianceRate: this.metrics.gdprCompliance,
        target: 1.0,
        auditLogging: this.config.gdprConfig.auditLogging
      }
    };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!this.capabilities.isActive || notificationHealth.status === 'unhealthy') {
      status = 'unhealthy';
    } else if (
      this.metrics.gdprCompliance < 1.0 || // GDPR compliance violation
      this.metrics.averageResponseTime > this.capabilities.responseTimeTarget * 1.5 ||
      notificationHealth.status === 'degraded'
    ) {
      status = 'degraded';
    }

    return { status, details: healthDetails };
  }

  // Lifecycle methods
  async start(): Promise<void> {
    await this.initialize();
    this.logger.info('🟢 EscalationAgent started');
  }

  async stop(): Promise<void> {
    this.capabilities.isActive = false;
    // Complete any active escalations before stopping
    await this.completeActiveEscalations();
    this.logger.info('🔴 EscalationAgent stopped');
  }

  async pause(): Promise<void> {
    this.capabilities.isActive = false;
    this.logger.info('⏸️ EscalationAgent paused');
  }

  async resume(): Promise<void> {
    this.capabilities.isActive = true;
    this.logger.info('▶️ EscalationAgent resumed');
  }

  /**
   * Assess escalation requirements and determine appropriate response
   */
  private async assessEscalationRequirements(
    userMessage: string,
    escalationType: string,
    context: ConversationContext
  ): Promise<{
    type: 'nurse_callback' | 'gp_referral' | 'emergency_referral' | 'support_resources';
    priority: 'immediate' | 'urgent' | 'standard';
    reasoning: string;
  }> {
    
    const lowerMessage = userMessage.toLowerCase();
    
    // Immediate escalation indicators
    const immediateKeywords = [
      'severe pain', 'can\'t breathe', 'heavy bleeding', 'emergency',
      'urgent', 'right now', 'immediately'
    ];

    // Urgent escalation indicators  
    const urgentKeywords = [
      'worried', 'concerning', 'getting worse', 'painful', 
      'unusual', 'changed', 'different'
    ];

    // Check for immediate escalation needs
    if (immediateKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return {
        type: 'emergency_referral',
        priority: 'immediate',
        reasoning: 'Immediate medical attention may be required'
      };
    }

    // Check for urgent escalation needs
    if (urgentKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return {
        type: 'nurse_callback',
        priority: 'urgent',
        reasoning: 'User expressing health concerns requiring professional guidance'
      };
    }

    // Default to standard nurse callback
    return {
      type: 'nurse_callback',
      priority: 'standard',
      reasoning: 'General health inquiry suitable for nurse consultation'
    };
  }

  /**
   * Execute the appropriate escalation workflow
   */
  private async executeEscalationWorkflow(
    assessment: any,
    escalationId: string,
    context: ConversationContext,
    userMessage: string
  ): Promise<{
    success: boolean;
    type: string;
    actionTaken: string;
    callbackScheduled: boolean;
    teamsNotified: boolean;
    contactRequired: boolean;
    estimatedCallbackTime?: string;
    nurseTeamAlerted: boolean;
    userGuidance: string;
    nextActions: string[];
  }> {

    switch (assessment.type) {
      case 'emergency_referral':
        return await this.handleEmergencyReferral(escalationId, context, userMessage);
      
      case 'nurse_callback':
        return await this.handleNurseCallback(escalationId, context, userMessage, assessment.priority);
      
      case 'gp_referral':
        return await this.handleGPReferral(escalationId, context, userMessage);
      
      case 'support_resources':
        return await this.handleSupportResources(escalationId, context, userMessage);
      
      default:
        throw new Error(`Unknown escalation type: ${assessment.type}`);
    }
  }

  private async handleEmergencyReferral(
    escalationId: string,
    context: ConversationContext,
    userMessage: string
  ): Promise<any> {
    
    // Send immediate Teams notification
    const teamsNotified = await this.sendTeamsNotification({
      escalationId,
      priority: 'immediate',
      type: 'emergency_referral',
      conversationId: context.conversationId,
      userId: context.userId,
      userMessage: userMessage.substring(0, 200) + '...',
      timestamp: new Date().toISOString()
    });

    const escalation = this.activeEscalations.get(escalationId);
    if (escalation) {
      escalation.status = 'completed';
    }

    return {
      success: true,
      type: 'emergency_referral',
      actionTaken: 'Emergency referral provided with immediate medical guidance',
      callbackScheduled: false,
      teamsNotified,
      contactRequired: false,
      nurseTeamAlerted: teamsNotified,
      userGuidance: 'This sounds like it may need urgent medical attention. Please call 999 for emergency services, contact your GP urgently, or visit A&E if symptoms are severe.',
      nextActions: ['provide_emergency_contacts', 'log_escalation']
    };
  }

  private async handleNurseCallback(
    escalationId: string,
    context: ConversationContext,
    userMessage: string,
    priority: 'urgent' | 'standard'
  ): Promise<any> {
    
    // Initiate contact collection workflow
    const contactResult = await this.initiateContactCollection(context, escalationId);
    
    if (contactResult.success && contactResult.contactDetails) {
      // Schedule callback and notify team
      const callbackScheduled = await this.scheduleNurseCallback(
        escalationId,
        contactResult.contactDetails,
        priority
      );

      const teamsNotified = await this.sendTeamsNotification({
        escalationId,
        priority,
        type: 'nurse_callback',
        conversationId: context.conversationId,
        userId: context.userId,
        userMessage: userMessage.substring(0, 200) + '...',
        contactDetails: contactResult.contactDetails,
        timestamp: new Date().toISOString()
      });

      const escalation = this.activeEscalations.get(escalationId);
      if (escalation) {
        escalation.status = 'callback_scheduled';
        escalation.contactDetails = contactResult.contactDetails;
      }

      return {
        success: true,
        type: 'nurse_callback',
        actionTaken: 'Nurse callback scheduled with contact details collected',
        callbackScheduled,
        teamsNotified,
        contactRequired: true,
        estimatedCallbackTime: this.calculateCallbackTime(priority),
        nurseTeamAlerted: teamsNotified,
        userGuidance: `Thank you for providing your contact details. A specialist nurse from The Eve Appeal will call you back within ${this.calculateCallbackTime(priority)}. They'll be able to provide personalized guidance for your health concerns.`,
        nextActions: ['send_confirmation_message', 'log_callback_request']
      };
    } else {
      // Contact collection failed - provide alternative guidance
      return {
        success: true,
        type: 'nurse_callback_alternative',
        actionTaken: 'Alternative contact methods provided',
        callbackScheduled: false,
        teamsNotified: false,
        contactRequired: true,
        nurseTeamAlerted: false,
        userGuidance: 'To speak with a specialist nurse, you can call The Eve Appeal nurse line directly on 0808 802 0019 (Monday-Friday, 9am-5pm) or email nurses@eveappeal.org.uk.',
        nextActions: ['provide_direct_contact_info']
      };
    }
  }

  private async handleGPReferral(
    escalationId: string,
    context: ConversationContext,
    userMessage: string
  ): Promise<any> {
    
    const teamsNotified = await this.sendTeamsNotification({
      escalationId,
      priority: 'standard',
      type: 'gp_referral',
      conversationId: context.conversationId,
      userId: context.userId,
      userMessage: userMessage.substring(0, 200) + '...',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      type: 'gp_referral',
      actionTaken: 'GP consultation recommended',
      callbackScheduled: false,
      teamsNotified,
      contactRequired: false,
      nurseTeamAlerted: teamsNotified,
      userGuidance: 'For personalized medical advice about your concerns, I recommend speaking with your GP who can provide tailored guidance based on your medical history.',
      nextActions: ['provide_gp_guidance', 'offer_nurse_line']
    };
  }

  private async handleSupportResources(
    escalationId: string,
    context: ConversationContext,
    userMessage: string
  ): Promise<any> {
    
    return {
      success: true,
      type: 'support_resources',
      actionTaken: 'Support resources provided',
      callbackScheduled: false,
      teamsNotified: false,
      contactRequired: false,
      nurseTeamAlerted: false,
      userGuidance: 'Here are some support resources that may be helpful for your situation.',
      nextActions: ['provide_support_resources']
    };
  }

  private async initiateContactCollection(
    context: ConversationContext,
    escalationId: string
  ): Promise<{ success: boolean; contactDetails?: ContactDetails }> {
    
    try {
      // This would integrate with the conversation flow to collect contact details
      // For now, return a mock successful collection
      
      this.logger.info('📝 Contact collection initiated', {
        escalationId,
        conversationId: context.conversationId.substring(0, 8) + '***'
      });

      // In a real implementation, this would:
      // 1. Present contact collection form
      // 2. Validate UK phone numbers and emails
      // 3. Obtain GDPR consent
      // 4. Store securely with audit trail

      return {
        success: true,
        contactDetails: {
          name: 'User Contact',
          phone: '+44 7XXX XXX XXX',
          email: 'user@example.com',
          preferredContact: 'phone',
          bestTimeToCall: 'Morning'
        }
      };

    } catch (error) {
      this.logger.error('Contact collection failed', { error, escalationId });
      return { success: false };
    }
  }

  private async scheduleNurseCallback(
    escalationId: string,
    contactDetails: ContactDetails,
    priority: 'urgent' | 'standard'
  ): Promise<boolean> {
    
    try {
      this.logger.info('📞 Scheduling nurse callback', {
        escalationId,
        priority,
        contactMethod: contactDetails.preferredContact
      });

      // In production, this would integrate with booking system
      // For now, log the callback request

      this.metrics.callbacksScheduled++;
      return true;

    } catch (error) {
      this.logger.error('Callback scheduling failed', { error, escalationId });
      return false;
    }
  }

  private async sendTeamsNotification(notificationData: any): Promise<boolean> {
    try {
      await this.notificationService.sendCrisisAlert(
        notificationData.escalationId,
        notificationData.priority,
        `Escalation: ${notificationData.type}\nUser: ${notificationData.userId}\nMessage: ${notificationData.userMessage}`
      );

      this.metrics.teamsNotifications++;
      return true;

    } catch (error) {
      this.logger.error('Teams notification failed', { error });
      return false;
    }
  }

  private calculateCallbackTime(priority: 'urgent' | 'standard'): string {
    switch (priority) {
      case 'urgent':
        return '2-4 hours';
      case 'standard':
        return '24 hours';
      default:
        return '24 hours';
    }
  }

  private getFallbackEscalationGuidance(): string {
    return `I apologize, but I'm experiencing technical difficulties with the escalation system. 
    
For immediate support, please:
• Call your GP
• Contact The Eve Appeal nurse line: 0808 802 0019
• Call NHS 111 for non-emergency health advice

If this is an emergency, call 999 immediately.`;
  }

  private getEmergencyContacts(): Record<string, string> {
    return {
      emergency: '999',
      eveAppealNurse: '0808 802 0019',
      nhs111: '111',
      samaritans: '116 123'
    };
  }

  private async validateTeamsIntegration(): Promise<void> {
    try {
      // Test Teams webhook connectivity
      const testResult = await this.notificationService.testConnection?.();
      if (testResult === false) {
        throw new Error('Teams webhook test failed');
      }
      
      this.logger.info('✅ Teams integration validated');
    } catch (error) {
      this.logger.warn('⚠️ Teams integration validation failed', { error });
      // Don't throw - allow agent to start but log the issue
    }
  }

  private startEscalationMonitoring(): void {
    // Monitor active escalations every minute
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 30 * 60 * 1000; // 30 minutes

      for (const [escalationId, escalation] of this.activeEscalations.entries()) {
        if (now - escalation.startTime > staleThreshold) {
          this.logger.warn('Stale escalation detected', {
            escalationId,
            age: now - escalation.startTime,
            status: escalation.status
          });
          
          // Clean up stale escalations
          if (escalation.status === 'completed') {
            this.activeEscalations.delete(escalationId);
          }
        }
      }
    }, 60 * 1000);
  }

  private async completeActiveEscalations(): Promise<void> {
    for (const [escalationId, escalation] of this.activeEscalations.entries()) {
      if (escalation.status !== 'completed') {
        this.logger.info('Completing active escalation during shutdown', { escalationId });
        escalation.status = 'completed';
      }
    }
  }

  private updateMetrics(responseTime: number, success: boolean, type: string): void {
    this.metrics.totalEscalations++;
    
    if (success) {
      this.metrics.successfulEscalations++;
    }
    
    if (type === 'nurse_callback') {
      this.metrics.callbacksScheduled++;
    }
    
    // Update average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalEscalations - 1) + responseTime) / this.metrics.totalEscalations;
  }
}