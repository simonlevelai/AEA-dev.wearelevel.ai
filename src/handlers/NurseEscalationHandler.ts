import { BaseTopicHandler, TopicHandlerOptions } from './BaseTopicHandler';
import { Logger } from '../utils/logger';
import {
  ConversationState,
  ConversationFlowResult,
  UserContactInfo,
  UserContactInfoSchema
} from '../types/conversation';
import { ConversationFlowContext } from '../services/ConversationFlowEngine';

interface ContactValidation {
  isValid: boolean;
  errors: string[];
  field?: keyof UserContactInfo;
}

interface NurseAvailability {
  nextAvailable: string;
  estimatedWaitTime: string;
  urgency: 'standard' | 'priority' | 'urgent';
}

/**
 * NurseEscalationHandler manages the process of collecting user contact information
 * and escalating to The Eve Appeal nurse team with full GDPR compliance
 */
export class NurseEscalationHandler extends BaseTopicHandler {
  private readonly CONSENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CONTACT_COLLECTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  constructor(logger: Logger) {
    super(
      'nurse_escalation_handler',
      {
        name: 'Nurse Escalation Handler',
        description: 'Collects contact information and escalates to specialist nurses',
        keywords: [
          'nurse', 'speak to', 'talk to', 'call back', 'appointment',
          'contact', 'worried', 'concerned', 'professional advice',
          'specialist', 'expert', 'medical professional', 'healthcare',
          'urgent', 'priority', 'escalate', 'help me', 'need support'
        ],
        supportedStages: ['consent_capture', 'contact_collection', 'escalation'],
        requiresConsent: true,
        canEscalate: true,
        priority: 9 // High priority for nurse requests
      },
      logger
    );
  }

  protected initializeIntentPatterns(): void {
    this.intentPatterns = [
      // Direct nurse requests
      {
        pattern: /(speak|talk|contact)\\s+(to|with)\\s+(a\\s+)?(nurse|professional)/i,
        confidence: 0.9,
        description: 'Direct nurse contact requests'
      },
      {
        pattern: /(call\\s+me\\s+back|callback|ring\\s+me)/i,
        confidence: 0.85,
        description: 'Callback requests'
      },
      
      // Escalation indicators
      {
        pattern: /(urgent|worried|concerned|anxious)\\s+(about|need|want)/i,
        confidence: 0.7,
        description: 'Urgency indicators'
      },
      {
        pattern: /(professional\\s+advice|medical\\s+advice|expert\\s+help)/i,
        confidence: 0.8,
        description: 'Professional advice requests'
      },
      
      // Appointment and support requests
      {
        pattern: /(appointment|consultation|support|guidance)/i,
        confidence: 0.6,
        description: 'Support and appointment requests'
      },
      {
        pattern: /(don't\\s+know|confused|need\\s+help|can't\\s+decide)/i,
        confidence: 0.5,
        description: 'Uncertainty expressions'
      }
    ];
  }

  public async handle(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    try {
      this.logHandlerActivity(message, 'nurse_escalation_start', true, {
        currentStage: state.currentStage,
        hasContact: !!state.contactInfo
      });

      // Determine current stage and route accordingly
      switch (state.currentStage) {
        case 'consent_capture':
          return this.handleConsentCapture(message, state, context);
        
        case 'contact_collection':
          return this.handleContactCollection(message, state, context);
        
        case 'escalation':
          return this.handleNurseEscalation(message, state, context);
        
        default:
          // Initial nurse request - start consent capture
          return this.initializeNurseEscalation(message, state, context);
      }

    } catch (error) {
      this.logger.error('Nurse escalation handler failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        currentStage: state.currentStage
      });

      return this.handleEscalationError(message, state, context);
    }
  }

  /**
   * Initialize nurse escalation process with consent capture
   */
  private async initializeNurseEscalation(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    this.logger.info('Starting nurse escalation process', {
      conversationId: state.conversationId,
      userId: state.userId
    });

    // Transition to consent capture stage
    const updatedState = await context.stateManager.transitionToTopic(
      state.conversationId,
      'nurse_escalation_handler',
      'consent_capture'
    );

    if (!updatedState.success) {
      return this.handleEscalationError(message, state, context);
    }

    // Determine urgency level
    const urgency = this.assessUrgency(message);
    
    let responseText = `I can connect you with one of our specialist nurses from The Eve Appeal.

**What happens next:**
• I'll collect your contact details securely
• A specialist nurse will call you back
• ${urgency.urgency === 'urgent' ? 'Priority callback within 2 hours' : urgency.nextAvailable}
• Free, confidential support and guidance

**Your Privacy:**
We follow strict GDPR guidelines. Your information will only be used to arrange your nurse callback and provide support. You can withdraw consent at any time.

Are you happy to proceed with providing your contact details?`;

    // Add urgency context if needed
    if (urgency.urgency === 'urgent') {
      responseText = `🔴 **Priority Support Request**

${responseText}`;
    }

    return this.createSuccessResponse(
      responseText,
      await context.stateManager.getCurrentState(state.conversationId)!,
      [
        'Yes, I consent',
        'Tell me more first',
        'What information do you need?',
        'No thanks, not now'
      ]
    );
  }

  /**
   * Handle consent capture for GDPR compliance
   */
  private async handleConsentCapture(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const normalizedMessage = this.normalizeMessage(message);
    
    // Check for positive consent
    if (this.isPositiveConsent(normalizedMessage)) {
      return this.processConsentGranted(message, state, context);
    }
    
    // Check for consent decline
    if (this.isConsentDeclined(normalizedMessage)) {
      return this.processConsentDeclined(message, state, context);
    }
    
    // Check for information requests
    if (this.isInformationRequest(normalizedMessage)) {
      return this.provideMoreInformation(message, state, context);
    }
    
    // Unclear response - clarify consent
    return this.clarifyConsent(message, state, context);
  }

  /**
   * Handle contact information collection
   */
  private async handleContactCollection(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const normalizedMessage = this.normalizeMessage(message);
    
    // If user wants to cancel at any stage
    if (this.isCancellationRequest(normalizedMessage)) {
      return this.processCancellation(message, state, context);
    }

    // Determine what contact information we need
    const currentContact = state.contactInfo || {};
    const nextField = this.getNextRequiredField(currentContact);
    
    if (!nextField) {
      // All information collected - proceed to escalation
      return this.completeContactCollection(message, state, context);
    }

    // Process current field input
    if (state.context?.expectedField) {
      return this.processFieldInput(message, state, context, state.context.expectedField);
    }

    // Start collecting contact information
    return this.startFieldCollection(nextField, state, context);
  }

  /**
   * Handle final nurse escalation
   */
  private async handleNurseEscalation(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    // Create escalation event
    try {
      const escalationEvent = await context.escalationService.createEscalationEvent(
        state.userId,
        state.sessionId,
        `Nurse callback request: ${message}`,
        {
          severity: 'general',
          confidence: 0.8,
          requiresEscalation: true,
          matches: [{
            trigger: 'nurse_callback_request',
            confidence: 0.8,
            category: 'support_request' as any,
            severity: 'general' as any,
            position: { start: 0, end: message.length },
            matchType: 'context' as any
          }],
          riskFactors: ['nurse_callback_requested'],
          contextualConcerns: ['professional_support_needed'],
          analysisTime: 0,
          recommendedActions: ['nurse_callback', 'priority_support']
        }
      );

      // Send contact information to nurse team
      await context.escalationService.notifyNurseTeam({
        ...escalationEvent,
        contactInfo: state.contactInfo,
        urgency: state.context?.urgency || 'standard',
        preferredCallbackTime: state.context?.preferredCallbackTime
      });

      const responseText = `✅ **Nurse Callback Arranged**

Your request has been successfully submitted to our specialist nurse team.

**What happens next:**
• Our nurse will call you on: **${state.contactInfo?.phone}**
• Expected callback: **${this.getCallbackTimeEstimate(state)}**
• Reference: **${escalationEvent.id.substring(0, 8)}**

**Important:**
• Please keep your phone available
• The call will come from The Eve Appeal
• If you miss the call, we'll try again or send you an email

Is there anything else I can help you with while you wait?`;

      // Transition to completion
      const updatedState = await context.stateManager.updateState(state.conversationId, {
        currentStage: 'completion',
        escalationRequired: true,
        context: {
          ...state.context,
          escalationId: escalationEvent.id,
          nurseCallbackArranged: true
        }
      });

      return this.createSuccessResponse(
        responseText,
        updatedState,
        [
          'Health information',
          'Support resources',
          'End conversation',
          'Speak to another nurse'
        ]
      );

    } catch (error) {
      this.logger.error('Failed to arrange nurse callback', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        contactInfo: state.contactInfo ? 'present' : 'missing'
      });

      return this.handleEscalationError(message, state, context);
    }
  }

  /**
   * Process granted consent and start contact collection
   */
  private async processConsentGranted(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    // Record consent
    await context.gdprService.recordConsent(state.userId, {
      consentType: 'nurse_callback',
      purpose: 'specialist_nurse_consultation',
      dataCategories: ['contact_information', 'health_inquiry'],
      legalBasis: 'consent',
      consentText: 'User consented to providing contact details for nurse callback',
      timestamp: Date.now(),
      consentMethod: 'chat_interface'
    });

    // Transition to contact collection
    const updatedState = await context.stateManager.transitionToTopic(
      state.conversationId,
      'nurse_escalation_handler',
      'contact_collection'
    );

    const responseText = `Thank you for your consent. I'll now collect your contact details securely.

**I need the following information:**
• Your name (first name is fine)
• Phone number for the callback
• Email address (backup contact)
• Preferred contact method

Let's start with your **first name**. What would you like our nurse to call you?`;

    return this.createSuccessResponse(
      responseText,
      await context.stateManager.updateState(state.conversationId, {
        context: {
          ...updatedState.state?.context,
          expectedField: 'name',
          consentGrantedAt: Date.now()
        }
      }),
      [
        'Continue with contact details',
        'What information is needed?',
        'Cancel request'
      ]
    );
  }

  /**
   * Process field input during contact collection
   */
  private async processFieldInput(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext,
    expectedField: string
  ): Promise<ConversationFlowResult> {
    
    const validation = this.validateFieldInput(expectedField as keyof UserContactInfo, message);
    
    if (!validation.isValid) {
      return this.handleValidationError(expectedField, validation.errors, state, context);
    }

    // Save the field data
    const currentContact = state.contactInfo || {};
    const updatedContact = { ...currentContact };
    
    switch (expectedField) {
      case 'name':
        updatedContact.name = this.sanitizeName(message);
        break;
      case 'phone':
        updatedContact.phone = this.formatPhoneNumber(message);
        break;
      case 'email':
        updatedContact.email = message.trim().toLowerCase();
        break;
      case 'preferredContact':
        updatedContact.preferredContact = message.toLowerCase().includes('email') ? 'email' : 'phone';
        break;
    }

    // Update state with new contact info
    const nextField = this.getNextRequiredField(updatedContact);
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      contactInfo: updatedContact,
      context: {
        ...state.context,
        expectedField: nextField,
        [`${expectedField}Collected`]: true
      }
    });

    if (!nextField) {
      // All fields collected - proceed to final confirmation
      return this.confirmContactDetails(updatedState, context);
    }

    // Ask for next field
    return this.requestNextField(nextField, updatedState, context);
  }

  /**
   * Confirm collected contact details
   */
  private async confirmContactDetails(
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const contact = state.contactInfo!;
    
    const responseText = `Perfect! Let me confirm your contact details:

**Contact Information:**
• **Name:** ${contact.name}
• **Phone:** ${contact.phone}
• **Email:** ${contact.email}
• **Preferred contact:** ${contact.preferredContact === 'email' ? 'Email' : 'Phone call'}

Is this information correct? If yes, I'll arrange your nurse callback now.`;

    const updatedState = await context.stateManager.updateState(state.conversationId, {
      context: {
        ...state.context,
        expectedField: 'confirmation',
        contactDetailsComplete: true
      }
    });

    return this.createSuccessResponse(
      responseText,
      updatedState,
      [
        'Yes, arrange callback',
        'Edit phone number',
        'Edit email address',
        'Cancel request'
      ]
    );
  }

  /**
   * Helper methods for contact collection
   */
  private getNextRequiredField(contact: Partial<UserContactInfo>): string | null {
    if (!contact.name) return 'name';
    if (!contact.phone) return 'phone';
    if (!contact.email) return 'email';
    if (!contact.preferredContact) return 'preferredContact';
    return null;
  }

  private requestNextField(field: string, state: ConversationState, context: ConversationFlowContext): ConversationFlowResult {
    const prompts = {
      name: "What's your first name?",
      phone: "What's your phone number? (UK numbers only, e.g. 07123 456789)",
      email: "What's your email address?",
      preferredContact: "How would you prefer to be contacted - by phone call or email?"
    };

    return this.createSuccessResponse(
      prompts[field as keyof typeof prompts] || "Please provide the requested information:",
      state,
      field === 'preferredContact' ? ['Phone call', 'Email', 'Either is fine'] : ['Continue', 'Cancel request']
    );
  }

  private validateFieldInput(field: keyof UserContactInfo, input: string): ContactValidation {
    const validation: ContactValidation = { isValid: true, errors: [], field };
    
    switch (field) {
      case 'name':
        if (input.trim().length < 2) {
          validation.isValid = false;
          validation.errors.push('Please provide a name with at least 2 characters');
        }
        break;
        
      case 'phone':
        const phonePattern = /^(\+44|0)[1-9]\d{8,9}$/;
        const cleanPhone = input.replace(/\s+/g, '');
        if (!phonePattern.test(cleanPhone)) {
          validation.isValid = false;
          validation.errors.push('Please provide a valid UK phone number (e.g. 07123 456789)');
        }
        break;
        
      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(input.trim())) {
          validation.isValid = false;
          validation.errors.push('Please provide a valid email address');
        }
        break;
    }
    
    return validation;
  }

  private handleValidationError(
    field: string,
    errors: string[],
    state: ConversationState,
    context: ConversationFlowContext
  ): ConversationFlowResult {
    const errorMessage = `${errors.join('. ')}\n\nPlease try again:`;
    
    return this.createSuccessResponse(
      errorMessage,
      state,
      ['Try again', 'Cancel request', 'Need help?']
    );
  }

  /**
   * Utility methods
   */
  private isPositiveConsent(message: string): boolean {
    const positivePatterns = [
      /^(yes|yeah|yep|ok|okay|sure|alright|agree|consent)/i,
      /i (agree|consent|accept)/i,
      /(go ahead|proceed|continue)/i
    ];
    return positivePatterns.some(pattern => pattern.test(message));
  }

  private isConsentDeclined(message: string): boolean {
    const negativePatterns = [
      /^(no|nope|nah|not now|maybe later)/i,
      /(don't|do not) (want|need|agree)/i,
      /(cancel|stop|withdraw)/i
    ];
    return negativePatterns.some(pattern => pattern.test(message));
  }

  private isInformationRequest(message: string): boolean {
    const infoPatterns = [
      /(what|which|how|why).*(information|details|data)/i,
      /(tell me more|explain|clarify)/i,
      /(what happens|what will)/i
    ];
    return infoPatterns.some(pattern => pattern.test(message));
  }

  private isCancellationRequest(message: string): boolean {
    const cancelPatterns = [
      /(cancel|stop|quit|exit|nevermind|never mind)/i,
      /(don't want|do not want|changed my mind)/i
    ];
    return cancelPatterns.some(pattern => pattern.test(message));
  }

  private assessUrgency(message: string): NurseAvailability {
    const urgentKeywords = ['urgent', 'emergency', 'worried', 'scared', 'pain', 'bleeding'];
    const priorityKeywords = ['concerned', 'anxious', 'soon', 'asap'];
    
    const hasUrgent = urgentKeywords.some(keyword => message.toLowerCase().includes(keyword));
    const hasPriority = priorityKeywords.some(keyword => message.toLowerCase().includes(keyword));
    
    if (hasUrgent) {
      return {
        nextAvailable: 'Within 2 hours',
        estimatedWaitTime: '1-2 hours',
        urgency: 'urgent'
      };
    } else if (hasPriority) {
      return {
        nextAvailable: 'Within 24 hours',
        estimatedWaitTime: '4-24 hours',
        urgency: 'priority'
      };
    } else {
      return {
        nextAvailable: 'Within 2-3 working days',
        estimatedWaitTime: '2-3 working days',
        urgency: 'standard'
      };
    }
  }

  private sanitizeName(input: string): string {
    return input.trim().replace(/[^\w\s-']/g, '').substring(0, 50);
  }

  private formatPhoneNumber(input: string): string {
    const cleaned = input.replace(/\s+/g, '');
    if (cleaned.startsWith('0')) {
      return cleaned;
    } else if (cleaned.startsWith('+44')) {
      return '0' + cleaned.substring(3);
    }
    return cleaned;
  }

  private getCallbackTimeEstimate(state: ConversationState): string {
    const urgency = state.context?.urgency || 'standard';
    const now = new Date();
    
    switch (urgency) {
      case 'urgent':
        const urgentTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        return `by ${urgentTime.toLocaleTimeString()} today`;
      case 'priority':
        const priorityTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return `by ${priorityTime.toLocaleDateString()}`;
      default:
        return 'within 2-3 working days';
    }
  }

  /**
   * Error handling methods
   */
  private async handleEscalationError(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const errorResponse = `I apologize, but I'm experiencing difficulties arranging your nurse callback right now.

**Alternative support options:**
• **Call The Eve Appeal directly:** 0808 802 0019 (free from landlines and mobiles)
• **Email support:** nurse@eveappeal.org.uk
• **Online form:** Complete a callback request at eveappeal.org.uk/ask-eve

**For urgent concerns:**
• Contact your GP
• Call NHS 111 for urgent health advice
• Call 999 for emergencies

Would you like me to help you with any other health information instead?`;

    return this.createSuccessResponse(
      errorResponse,
      state,
      [
        'Try callback request again',
        'Health information',
        'Contact details',
        'End conversation'
      ]
    );
  }

  private async processConsentDeclined(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const responseText = `That's absolutely fine - you're in control of your information.

**Other ways to get support:**
• **Call The Eve Appeal:** 0808 802 0019 (free confidential support)
• **Browse health information:** I can help you find trusted resources
• **Email support:** Use the contact form at eveappeal.org.uk

Is there anything else I can help you with today?`;

    // Record consent withdrawal
    await context.gdprService.recordConsent(state.userId, {
      consentType: 'nurse_callback',
      purpose: 'specialist_nurse_consultation',
      dataCategories: [],
      legalBasis: 'consent',
      consentText: 'User declined consent for nurse callback',
      timestamp: Date.now(),
      consentMethod: 'chat_interface'
    });

    return this.createSuccessResponse(
      responseText,
      state,
      [
        'Health information',
        'Contact details',
        'Support resources',
        'End conversation'
      ]
    );
  }

  private async processCancellation(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const responseText = `Your nurse callback request has been cancelled. No problem at all.

**Other support options:**
• **Health information:** I can help you find trusted resources
• **Direct contact:** Call 0808 802 0019 for immediate support
• **Try again later:** You can request a callback anytime

How else can I support you today?`;

    // Clear any collected contact information
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      contactInfo: undefined,
      currentStage: 'topic_detection',
      context: {
        callbackCancelled: true,
        cancelledAt: Date.now()
      }
    });

    return this.createSuccessResponse(
      responseText,
      updatedState,
      [
        'Health information',
        'Support resources',
        'Try callback again',
        'End conversation'
      ]
    );
  }

  /**
   * Override confidence calculation for nurse escalation
   */
  public async getIntentConfidence(
    message: string,
    state: ConversationState
  ): Promise<number> {
    const baseConfidence = await super.getIntentConfidence(message, state);
    
    // Boost confidence if we're already in nurse escalation flow
    if (state.currentTopic === 'nurse_escalation_handler') {
      return Math.min(baseConfidence + 0.3, 1.0);
    }

    return baseConfidence;
  }
}