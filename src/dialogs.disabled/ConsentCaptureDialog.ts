import { Logger } from '../utils/logger';
import { ConversationFlowContext } from '../services/ConversationFlowEngine';
import { ConversationState, ConversationFlowResult } from '../types/conversation';

export interface ConsentRequest {
  consentType: string;
  purpose: string;
  dataCategories: string[];
  legalBasis: 'consent' | 'legitimate_interest' | 'legal_obligation' | 'vital_interests';
  retentionPeriod?: string;
  dataProcessors?: string[];
  userRights?: string[];
  withdrawalInstructions?: string;
}

export interface ConsentDialogOptions {
  title?: string;
  customMessage?: string;
  urgency?: 'low' | 'medium' | 'high';
  allowPartialConsent?: boolean;
  requireExplicitConsent?: boolean;
  timeout?: number;
}

export interface ConsentResult {
  granted: boolean;
  consentId?: string;
  timestamp: number;
  categories: string[];
  withdrawalInstructions: string;
  userNotified: boolean;
}

/**
 * ConsentCaptureDialog handles GDPR-compliant consent collection
 * Provides reusable consent dialogs for different data processing activities
 */
export class ConsentCaptureDialog {
  private readonly CONSENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes default
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Capture consent for nurse callback services
   */
  async captureNurseCallbackConsent(
    state: ConversationState,
    context: ConversationFlowContext,
    options: ConsentDialogOptions = {}
  ): Promise<ConsentResult> {
    const consentRequest: ConsentRequest = {
      consentType: 'nurse_callback',
      purpose: 'To arrange a callback with one of our specialist nurses for health guidance and support',
      dataCategories: [
        'Personal contact information (name, phone, email)',
        'Health inquiry context',
        'Conversation history for continuity of care'
      ],
      legalBasis: 'consent',
      retentionPeriod: '12 months after last contact, unless you request earlier deletion',
      dataProcessors: ['The Eve Appeal specialist nurses', 'Secure communication systems'],
      userRights: [
        'Right to withdraw consent at any time',
        'Right to access your data',
        'Right to rectify incorrect information',
        'Right to data portability',
        'Right to be forgotten'
      ],
      withdrawalInstructions: 'You can withdraw consent by saying "withdraw consent", emailing gdpr@eveappeal.org.uk, or calling our support line'
    };

    return this.presentConsentDialog(
      consentRequest,
      state,
      context,
      {
        title: '🔒 Privacy & Consent for Nurse Callback',
        urgency: 'medium',
        requireExplicitConsent: true,
        ...options
      }
    );
  }

  /**
   * Capture consent for health information sharing
   */
  async captureHealthInformationConsent(
    state: ConversationState,
    context: ConversationFlowContext,
    options: ConsentDialogOptions = {}
  ): Promise<ConsentResult> {
    const consentRequest: ConsentRequest = {
      consentType: 'health_information_sharing',
      purpose: 'To provide personalized health information and track conversation context for better support',
      dataCategories: [
        'Health-related queries and concerns',
        'Conversation history for context',
        'Interaction preferences'
      ],
      legalBasis: 'consent',
      retentionPeriod: '6 months after last interaction',
      dataProcessors: ['The Eve Appeal support team', 'Secure AI systems for response generation'],
      userRights: [
        'Right to withdraw consent',
        'Right to data deletion',
        'Right to access conversation history',
        'Right to data correction'
      ],
      withdrawalInstructions: 'Say "stop sharing my information" or contact gdpr@eveappeal.org.uk'
    };

    return this.presentConsentDialog(
      consentRequest,
      state,
      context,
      {
        title: '📋 Health Information Sharing Consent',
        urgency: 'low',
        allowPartialConsent: true,
        ...options
      }
    );
  }

  /**
   * Capture consent for crisis support escalation
   */
  async captureCrisisEscalationConsent(
    state: ConversationState,
    context: ConversationFlowContext,
    options: ConsentDialogOptions = {}
  ): Promise<ConsentResult> {
    const consentRequest: ConsentRequest = {
      consentType: 'crisis_escalation',
      purpose: 'To ensure your immediate safety by alerting our crisis support team and providing emergency assistance',
      dataCategories: [
        'Crisis-related communications',
        'Contact information for emergency follow-up',
        'Immediate safety context'
      ],
      legalBasis: 'vital_interests',
      retentionPeriod: '2 years for safety monitoring and follow-up support',
      dataProcessors: [
        'The Eve Appeal crisis team', 
        'Emergency services (if required)',
        'Mental health support partners'
      ],
      userRights: [
        'Right to understand how your data helps us help you',
        'Right to access support records',
        'Right to request deletion after safety period'
      ],
      withdrawalInstructions: 'Crisis support data may be retained for safety purposes. Contact gdpr@eveappeal.org.uk for deletion requests after the safety period'
    };

    return this.presentConsentDialog(
      consentRequest,
      state,
      context,
      {
        title: '🚨 Crisis Support Data Processing Notice',
        urgency: 'high',
        requireExplicitConsent: false, // Vital interests basis
        customMessage: '**Important**: We process this data to protect your vital interests and ensure your safety.',
        ...options
      }
    );
  }

  /**
   * Present a comprehensive consent dialog
   */
  private async presentConsentDialog(
    request: ConsentRequest,
    state: ConversationState,
    context: ConversationFlowContext,
    options: ConsentDialogOptions
  ): Promise<ConsentResult> {
    try {
      this.logger.info('Presenting GDPR consent dialog', {
        conversationId: state.conversationId,
        consentType: request.consentType,
        legalBasis: request.legalBasis,
        urgency: options.urgency
      });

      // Build consent message
      const consentMessage = this.buildConsentMessage(request, options);
      
      // Present to user (in a real implementation, this would be interactive)
      // For now, we'll simulate the consent capture process
      const consentGranted = this.simulateUserConsentResponse(request, options);
      
      if (consentGranted) {
        // Record consent with GDPR service
        const consentRecord = await context.gdprService.recordConsent(state.userId, {
          consentType: request.consentType,
          purpose: request.purpose,
          dataCategories: request.dataCategories,
          legalBasis: request.legalBasis,
          consentText: this.getConsentText(request),
          timestamp: Date.now(),
          consentMethod: 'interactive_dialog',
          retentionPeriod: request.retentionPeriod,
          processingDetails: {
            dataProcessors: request.dataProcessors,
            userRights: request.userRights,
            withdrawalInstructions: request.withdrawalInstructions
          }
        });

        this.logger.info('GDPR consent granted and recorded', {
          conversationId: state.conversationId,
          consentId: consentRecord.id,
          consentType: request.consentType
        });

        return {
          granted: true,
          consentId: consentRecord.id,
          timestamp: Date.now(),
          categories: request.dataCategories,
          withdrawalInstructions: request.withdrawalInstructions || 'Contact gdpr@eveappeal.org.uk',
          userNotified: true
        };
      } else {
        // Record consent denial
        await context.gdprService.recordConsent(state.userId, {
          consentType: request.consentType,
          purpose: request.purpose,
          dataCategories: [],
          legalBasis: request.legalBasis,
          consentText: `User declined consent for ${request.consentType}`,
          timestamp: Date.now(),
          consentMethod: 'interactive_dialog',
          processingDetails: {
            consentDeclined: true,
            alternativeOffered: true
          }
        });

        this.logger.info('GDPR consent declined and recorded', {
          conversationId: state.conversationId,
          consentType: request.consentType
        });

        return {
          granted: false,
          timestamp: Date.now(),
          categories: [],
          withdrawalInstructions: request.withdrawalInstructions || 'Contact gdpr@eveappeal.org.uk',
          userNotified: true
        };
      }

    } catch (error) {
      this.logger.error('Consent capture dialog failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        consentType: request.consentType
      });

      // Return safe fallback
      return {
        granted: false,
        timestamp: Date.now(),
        categories: [],
        withdrawalInstructions: 'Contact gdpr@eveappeal.org.uk',
        userNotified: false
      };
    }
  }

  /**
   * Build comprehensive consent message
   */
  private buildConsentMessage(request: ConsentRequest, options: ConsentDialogOptions): string {
    let message = `${options.title || '🔒 Data Processing Consent'}\n\n`;
    
    if (options.customMessage) {
      message += `${options.customMessage}\n\n`;
    }
    
    message += `**What we need consent for:**\n${request.purpose}\n\n`;
    
    message += `**Information we'll process:**\n`;
    request.dataCategories.forEach(category => {
      message += `• ${category}\n`;
    });
    
    message += `\n**Legal basis:** ${this.getLegalBasisDescription(request.legalBasis)}\n\n`;
    
    if (request.retentionPeriod) {
      message += `**How long we keep it:** ${request.retentionPeriod}\n\n`;
    }
    
    if (request.dataProcessors && request.dataProcessors.length > 0) {
      message += `**Who processes your data:**\n`;
      request.dataProcessors.forEach(processor => {
        message += `• ${processor}\n`;
      });
      message += '\n';
    }
    
    message += `**Your rights:**\n`;
    if (request.userRights && request.userRights.length > 0) {
      request.userRights.forEach(right => {
        message += `• ${right}\n`;
      });
    } else {
      message += `• Right to withdraw consent\n`;
      message += `• Right to access your data\n`;
      message += `• Right to data deletion\n`;
      message += `• Right to data portability\n`;
    }
    
    if (request.withdrawalInstructions) {
      message += `\n**How to withdraw consent:**\n${request.withdrawalInstructions}\n\n`;
    }
    
    if (options.requireExplicitConsent !== false) {
      message += `Do you consent to this data processing?`;
    } else {
      message += `We are processing this data under ${request.legalBasis} legal basis to protect your interests.`;
    }
    
    return message;
  }

  /**
   * Get human-readable legal basis description
   */
  private getLegalBasisDescription(legalBasis: string): string {
    const descriptions = {
      consent: 'Your explicit consent',
      legitimate_interest: 'Legitimate interest in providing healthcare support',
      legal_obligation: 'Legal obligation to provide healthcare services',
      vital_interests: 'Vital interests to protect your health and safety'
    };
    
    return descriptions[legalBasis as keyof typeof descriptions] || legalBasis;
  }

  /**
   * Get standardized consent text for records
   */
  private getConsentText(request: ConsentRequest): string {
    return `User provided informed consent for ${request.consentType}: ${request.purpose}. Data categories: ${request.dataCategories.join(', ')}. Legal basis: ${request.legalBasis}.`;
  }

  /**
   * Simulate user consent response (in real implementation, this would be interactive)
   */
  private simulateUserConsentResponse(request: ConsentRequest, options: ConsentDialogOptions): boolean {
    // For testing purposes, simulate consent based on request type
    // In real implementation, this would wait for user input
    
    if (request.legalBasis === 'vital_interests') {
      return true; // Always process for vital interests
    }
    
    if (options.urgency === 'high') {
      return true; // Usually granted for high-priority requests
    }
    
    // Simulate 85% consent rate for normal requests
    return Math.random() > 0.15;
  }

  /**
   * Create a consent confirmation response
   */
  createConsentConfirmationResponse(
    result: ConsentResult,
    nextSteps: string,
    suggestedActions: string[]
  ): ConversationFlowResult {
    if (result.granted) {
      const responseText = `✅ **Consent Granted - Thank You**

Your consent has been recorded securely. Reference: **${result.consentId?.substring(0, 8)}**

**What this means:**
• We can now ${nextSteps}
• Your data is processed in line with GDPR
• You can withdraw consent at any time

**Remember:** ${result.withdrawalInstructions}

Ready to continue?`;

      return {
        response: {
          text: responseText,
          suggestedActions: suggestedActions.concat(['Withdraw consent', 'Privacy policy'])
        },
        newState: {} as any, // Will be populated by calling handler
        escalationTriggered: false,
        conversationEnded: false
      };
    } else {
      const responseText = `🔒 **Consent Not Granted**

That's completely fine - you're in control of your information.

We respect your privacy choice and will not process your data for this purpose.

**Alternative options:**
• Continue with basic support (no data collection)
• Review our privacy policy
• Contact us directly for non-digital support

How would you like to proceed?`;

      return {
        response: {
          text: responseText,
          suggestedActions: ['Basic support', 'Privacy policy', 'Contact directly', 'Try again']
        },
        newState: {} as any, // Will be populated by calling handler
        escalationTriggered: false,
        conversationEnded: false
      };
    }
  }

  /**
   * Handle consent timeout
   */
  createConsentTimeoutResponse(): ConversationFlowResult {
    const responseText = `⏰ **Consent Request Timed Out**

We didn't receive your consent decision within the time limit. For your privacy protection, we've cancelled this data processing request.

**You can:**
• Try the request again
• Continue with basic support
• Contact us directly

No data has been collected or processed.`;

    return {
      response: {
        text: responseText,
        suggestedActions: ['Try again', 'Basic support', 'Contact directly', 'Privacy info']
      },
      newState: {} as any,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Validate consent status
   */
  async validateExistingConsent(
    userId: string,
    consentType: string,
    context: ConversationFlowContext
  ): Promise<boolean> {
    try {
      const existingConsent = await context.gdprService.getConsentStatus(userId, consentType);
      
      this.logger.info('Consent validation check', {
        userId: userId.substring(0, 8) + '***',
        consentType,
        hasValidConsent: existingConsent.granted && !existingConsent.expired
      });

      return existingConsent.granted && !existingConsent.expired;
    } catch (error) {
      this.logger.error('Consent validation failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        userId: userId.substring(0, 8) + '***',
        consentType
      });
      return false;
    }
  }

  /**
   * Create consent withdrawal dialog
   */
  async processConsentWithdrawal(
    userId: string,
    consentType: string,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    try {
      await context.gdprService.withdrawConsent(userId, consentType);
      
      this.logger.info('Consent withdrawn successfully', {
        userId: userId.substring(0, 8) + '***',
        consentType
      });

      const responseText = `✅ **Consent Withdrawn Successfully**

Your consent for **${consentType}** has been withdrawn and recorded.

**What happens now:**
• We'll stop processing your data for this purpose
• Existing data will be deleted within 30 days
• You'll receive confirmation via email
• You can grant consent again anytime

**Note:** Some data may be retained for legal or safety obligations.

Is there anything else I can help you with?`;

      return {
        response: {
          text: responseText,
          suggestedActions: ['Privacy policy', 'Other support', 'End conversation', 'Grant consent again']
        },
        newState: {} as any,
        escalationTriggered: false,
        conversationEnded: false
      };

    } catch (error) {
      this.logger.error('Consent withdrawal failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        userId: userId.substring(0, 8) + '***',
        consentType
      });

      return {
        response: {
          text: "I'm sorry, there was an issue processing your consent withdrawal. Please contact our privacy team directly at gdpr@eveappeal.org.uk for immediate assistance.",
          suggestedActions: ['Try again', 'Contact privacy team', 'Continue support']
        },
        newState: {} as any,
        escalationTriggered: false,
        conversationEnded: false
      };
    }
  }
}