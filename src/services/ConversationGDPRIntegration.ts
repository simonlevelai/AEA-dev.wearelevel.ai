import { Logger } from '../utils/logger';
import { ConversationState, ConversationFlowResult } from '../types/conversation';
import { ConversationFlowContext } from './ConversationFlowEngine';
import { ConsentCaptureDialog } from '../dialogs/ConsentCaptureDialog';
import { EnhancedGDPRService } from './EnhancedGDPRService';

export interface GDPRConversationConfig {
  requiresConsent: boolean;
  consentType: string;
  dataCategories: string[];
  legalBasis: 'consent' | 'legitimate_interest' | 'legal_obligation' | 'vital_interests';
  automaticConsentCapture: boolean;
  gracefulDegradation: boolean;
}

export interface GDPRComplianceResult {
  compliant: boolean;
  consentRequired: boolean;
  consentStatus: 'granted' | 'denied' | 'not_requested' | 'expired';
  requiredAction?: 'capture_consent' | 'renew_consent' | 'degrade_service';
  consentId?: string;
  error?: string;
}

/**
 * ConversationGDPRIntegration provides seamless GDPR compliance for conversation flows
 * Integrates consent management, data processing oversight, and compliance validation
 */
export class ConversationGDPRIntegration {
  private readonly logger: Logger;
  private readonly consentDialog: ConsentCaptureDialog;

  constructor(
    logger: Logger,
    consentDialog?: ConsentCaptureDialog
  ) {
    this.logger = logger;
    this.consentDialog = consentDialog || new ConsentCaptureDialog(logger);
  }

  /**
   * Check GDPR compliance before processing a conversation step
   */
  async checkConversationCompliance(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<GDPRComplianceResult> {
    try {
      this.logger.info('Checking GDPR compliance for conversation step', {
        conversationId: state.conversationId,
        topicHandler: state.currentTopic,
        consentType: config.consentType,
        requiresConsent: config.requiresConsent
      });

      // If no consent required, allow processing
      if (!config.requiresConsent) {
        return {
          compliant: true,
          consentRequired: false,
          consentStatus: 'not_requested'
        };
      }

      // Check existing consent status
      const consentStatus = await context.gdprService.getConsentStatus(state.userId, config.consentType);
      
      if (consentStatus.granted && !consentStatus.expired) {
        // Valid consent exists
        this.logger.info('Valid consent found', {
          conversationId: state.conversationId,
          consentId: consentStatus.consentId,
          consentType: config.consentType
        });

        return {
          compliant: true,
          consentRequired: true,
          consentStatus: 'granted',
          consentId: consentStatus.consentId
        };
      }

      // No valid consent - determine required action
      if (consentStatus.expired) {
        return {
          compliant: false,
          consentRequired: true,
          consentStatus: 'expired',
          requiredAction: 'renew_consent'
        };
      }

      if (config.automaticConsentCapture) {
        return {
          compliant: false,
          consentRequired: true,
          consentStatus: 'not_requested',
          requiredAction: 'capture_consent'
        };
      }

      if (config.gracefulDegradation) {
        return {
          compliant: false,
          consentRequired: true,
          consentStatus: 'not_requested',
          requiredAction: 'degrade_service'
        };
      }

      // Block processing without consent
      return {
        compliant: false,
        consentRequired: true,
        consentStatus: 'not_requested',
        requiredAction: 'capture_consent'
      };

    } catch (error) {
      this.logger.error('GDPR compliance check failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        consentType: config.consentType
      });

      return {
        compliant: false,
        consentRequired: config.requiresConsent,
        consentStatus: 'not_requested',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle GDPR compliance action (capture consent, renew, etc.)
   */
  async handleComplianceAction(
    complianceResult: GDPRComplianceResult,
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<ConversationFlowResult | null> {
    
    if (complianceResult.compliant) {
      return null; // No action needed, continue with normal processing
    }

    switch (complianceResult.requiredAction) {
      case 'capture_consent':
        return this.captureRequiredConsent(state, context, config);
      
      case 'renew_consent':
        return this.renewExpiredConsent(state, context, config);
      
      case 'degrade_service':
        return this.provideDegradedService(state, context, config);
      
      default:
        return this.blockProcessingResponse(state, context, config);
    }
  }

  /**
   * Capture required consent for the conversation step
   */
  private async captureRequiredConsent(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<ConversationFlowResult> {
    
    try {
      let consentResult;

      // Route to appropriate consent capture based on type
      switch (config.consentType) {
        case 'nurse_callback':
          consentResult = await this.consentDialog.captureNurseCallbackConsent(state, context);
          break;
        
        case 'health_information_sharing':
          consentResult = await this.consentDialog.captureHealthInformationConsent(state, context);
          break;
        
        case 'crisis_escalation':
          consentResult = await this.consentDialog.captureCrisisEscalationConsent(state, context);
          break;
        
        default:
          // Generic consent capture
          consentResult = await this.captureGenericConsent(state, context, config);
          break;
      }

      if (consentResult.granted) {
        // Consent granted - create success response with next steps
        return this.consentDialog.createConsentConfirmationResponse(
          consentResult,
          this.getNextStepsMessage(config.consentType),
          this.getPostConsentActions(config.consentType)
        );
      } else {
        // Consent denied - provide alternatives
        return this.createConsentDeniedResponse(state, config);
      }

    } catch (error) {
      this.logger.error('Consent capture failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        consentType: config.consentType
      });

      return this.createConsentErrorResponse(state, config);
    }
  }

  /**
   * Handle expired consent renewal
   */
  private async renewExpiredConsent(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<ConversationFlowResult> {
    
    const responseText = `🔄 **Consent Renewal Required**

Your previous consent for **${config.consentType.replace('_', ' ')}** has expired. To continue with this service, we need to renew your consent.

**What's changed:**
• Updated privacy practices
• Enhanced data protection measures
• Clearer user rights information

Would you like to renew your consent to continue?`;

    return {
      response: {
        text: responseText,
        suggestedActions: [
          'Yes, renew consent',
          'Review privacy policy',
          'Use basic service instead',
          'Contact privacy team'
        ]
      },
      newState: await context.stateManager.updateState(state.conversationId, {
        context: {
          ...state.context,
          consentRenewalRequired: true,
          expiredConsentType: config.consentType
        }
      }),
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Provide degraded service without data processing
   */
  private async provideDegradedService(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<ConversationFlowResult> {
    
    const responseText = `ℹ️ **Limited Service Mode**

To respect your privacy, I'm operating in limited mode without collecting your data.

**Available services:**
• General health information (no personalization)
• Emergency contact information
• Basic support resources
• Direct contact options

**To access full services:**
• You can grant consent anytime
• Full service includes personalized support
• Your choice is always respected

How can I help you with basic information?`;

    return {
      response: {
        text: responseText,
        suggestedActions: [
          'General health info',
          'Emergency contacts', 
          'Grant consent for full service',
          'Privacy policy'
        ]
      },
      newState: await context.stateManager.updateState(state.conversationId, {
        context: {
          ...state.context,
          serviceMode: 'degraded',
          dataProcessingDisabled: true
        }
      }),
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Block processing when consent is required but not available
   */
  private async blockProcessingResponse(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<ConversationFlowResult> {
    
    const responseText = `🔒 **Consent Required**

To provide this service, we need your consent to process your data in line with GDPR requirements.

**This request requires:**
• Processing of: ${config.dataCategories.join(', ')}
• Legal basis: ${config.legalBasis.replace('_', ' ')}
• Your explicit consent

**Your options:**
• Grant consent to continue
• Use alternative services
• Contact us directly

Your privacy is our priority. What would you prefer?`;

    return {
      response: {
        text: responseText,
        suggestedActions: [
          'Grant consent',
          'Alternative services',
          'Contact directly',
          'Privacy information'
        ]
      },
      newState: state,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Generic consent capture for custom consent types
   */
  private async captureGenericConsent(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig
  ): Promise<any> {
    
    // Record generic consent
    const consentRecord = await context.gdprService.recordConsent(state.userId, {
      consentType: config.consentType,
      purpose: `Data processing for ${config.consentType.replace('_', ' ')} functionality`,
      dataCategories: config.dataCategories,
      legalBasis: config.legalBasis,
      consentText: `User granted consent for ${config.consentType}`,
      timestamp: Date.now(),
      consentMethod: 'conversation_flow'
    });

    return {
      granted: true,
      consentId: consentRecord.id,
      timestamp: Date.now(),
      categories: config.dataCategories,
      withdrawalInstructions: 'Contact gdpr@eveappeal.org.uk to withdraw consent',
      userNotified: true
    };
  }

  /**
   * Create response for consent denial
   */
  private createConsentDeniedResponse(
    state: ConversationState,
    config: GDPRConversationConfig
  ): ConversationFlowResult {
    
    const responseText = `🔒 **Consent Declined - No Problem**

You've chosen not to consent to data processing for **${config.consentType.replace('_', ' ')}**. This is completely your choice and we respect it.

**Alternative support:**
• Basic information services (no data collection)
• Direct contact with our team
• Written resources and guides
• Phone support: 0808 802 0019

**Remember:**
• You can change your mind anytime
• Your privacy choice is always respected
• Full support is still available via phone

How else can I help you today?`;

    return {
      response: {
        text: responseText,
        suggestedActions: [
          'Basic information',
          'Phone support',
          'Change my mind',
          'Privacy policy'
        ]
      },
      newState: state,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Create error response for consent capture failures
   */
  private createConsentErrorResponse(
    state: ConversationState,
    config: GDPRConversationConfig
  ): ConversationFlowResult {
    
    const responseText = `⚠️ **Technical Issue with Consent Processing**

I'm experiencing difficulties processing your consent for **${config.consentType.replace('_', ' ')}**. 

**Your options:**
• Try again in a moment
• Contact our privacy team: gdpr@eveappeal.org.uk
• Use phone support: 0808 802 0019
• Continue with basic services (no data processing)

Your privacy and security are paramount. We apologize for this inconvenience.`;

    return {
      response: {
        text: responseText,
        suggestedActions: [
          'Try again',
          'Contact privacy team',
          'Phone support',
          'Basic services only'
        ]
      },
      newState: state,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Get next steps message after consent granted
   */
  private getNextStepsMessage(consentType: string): string {
    const nextSteps = {
      nurse_callback: 'arrange your nurse callback securely',
      health_information_sharing: 'provide personalized health information',
      crisis_escalation: 'ensure your safety with our crisis team'
    };
    
    return nextSteps[consentType as keyof typeof nextSteps] || 'continue with your request';
  }

  /**
   * Get suggested actions after consent granted
   */
  private getPostConsentActions(consentType: string): string[] {
    const actions = {
      nurse_callback: ['Continue with callback', 'Review consent details', 'Privacy settings'],
      health_information_sharing: ['Get health information', 'Manage preferences', 'Privacy settings'],  
      crisis_escalation: ['Continue with support', 'Emergency resources', 'Privacy settings']
    };
    
    return actions[consentType as keyof typeof actions] || ['Continue', 'Privacy settings'];
  }

  /**
   * Process conversation message with GDPR compliance
   */
  async processWithCompliance(
    state: ConversationState,
    context: ConversationFlowContext,
    config: GDPRConversationConfig,
    processingFunction: () => Promise<ConversationFlowResult>
  ): Promise<ConversationFlowResult> {
    
    // Check GDPR compliance first
    const complianceResult = await this.checkConversationCompliance(state, context, config);
    
    if (!complianceResult.compliant) {
      // Handle compliance issues
      const complianceResponse = await this.handleComplianceAction(complianceResult, state, context, config);
      if (complianceResponse) {
        return complianceResponse;
      }
    }

    // GDPR compliant - proceed with normal processing
    try {
      const result = await processingFunction();
      
      // Log GDPR compliant processing
      this.logger.info('GDPR compliant processing completed', {
        conversationId: state.conversationId,
        consentType: config.consentType,
        consentId: complianceResult.consentId
      });
      
      return result;
    } catch (error) {
      this.logger.error('Processing failed after GDPR compliance check', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        consentType: config.consentType
      });
      
      throw error;
    }
  }

  /**
   * Create GDPR configuration for different conversation types
   */
  static createGDPRConfig(
    topicType: 'nurse_callback' | 'health_info' | 'crisis' | 'general',
    options: Partial<GDPRConversationConfig> = {}
  ): GDPRConversationConfig {
    
    const baseConfigs: Record<string, GDPRConversationConfig> = {
      nurse_callback: {
        requiresConsent: true,
        consentType: 'nurse_callback',
        dataCategories: ['contact_information', 'health_inquiry', 'conversation_history'],
        legalBasis: 'consent',
        automaticConsentCapture: true,
        gracefulDegradation: false
      },
      health_info: {
        requiresConsent: true,
        consentType: 'health_information_sharing',
        dataCategories: ['health_queries', 'conversation_context', 'preferences'],
        legalBasis: 'consent',
        automaticConsentCapture: false,
        gracefulDegradation: true
      },
      crisis: {
        requiresConsent: false, // Vital interests override
        consentType: 'crisis_escalation',
        dataCategories: ['crisis_communications', 'safety_context', 'emergency_contacts'],
        legalBasis: 'vital_interests',
        automaticConsentCapture: true,
        gracefulDegradation: false
      },
      general: {
        requiresConsent: false,
        consentType: 'general_support',
        dataCategories: ['basic_interaction'],
        legalBasis: 'legitimate_interest',
        automaticConsentCapture: false,
        gracefulDegradation: true
      }
    };
    
    const baseConfig = baseConfigs[topicType];
    return { ...baseConfig, ...options };
  }
}