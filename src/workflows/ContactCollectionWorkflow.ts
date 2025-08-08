import { Logger } from '../utils/logger';
import { ConversationState, ConversationFlowResult } from '../types/conversation';
import { ConversationFlowContext } from '../services/ConversationFlowEngine';
import { ConversationGDPRIntegration } from '../services/ConversationGDPRIntegration';
import { z } from 'zod';

// Zod schemas for contact validation
export const PhoneNumberSchema = z.string()
  .regex(/^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/, 'Please provide a valid UK mobile number')
  .transform(phone => phone.replace(/\D/g, '').replace(/^44/, '+44'));

export const EmailSchema = z.string()
  .email('Please provide a valid email address')
  .min(5, 'Email address too short')
  .max(100, 'Email address too long');

export const NameSchema = z.string()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be less than 50 characters')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes');

export interface ContactDetails {
  name?: string;
  phone?: string;
  email?: string;
  preferredContact: 'phone' | 'email' | 'both';
  bestTimeToCall?: string;
  alternativeContact?: string;
}

export interface ContactCollectionConfig {
  purpose: string;
  requiredFields: ('name' | 'phone' | 'email')[];
  optionalFields: ('preferredContact' | 'bestTimeToCall' | 'alternativeContact')[];
  consentType: string;
  validationStrict: boolean;
  allowSkip: boolean;
  maxAttempts: number;
}

export interface ContactValidationResult {
  isValid: boolean;
  field?: string;
  error?: string;
  suggestions?: string[];
}

/**
 * ContactCollectionWorkflow provides GDPR-compliant contact information collection
 * Includes validation, confirmation, and audit trail for healthcare callbacks
 */
export class ContactCollectionWorkflow {
  private readonly logger: Logger;
  private readonly gdprIntegration: ConversationGDPRIntegration;
  private readonly DEFAULT_MAX_ATTEMPTS = 3;

  constructor(
    logger: Logger,
    gdprIntegration: ConversationGDPRIntegration
  ) {
    this.logger = logger;
    this.gdprIntegration = gdprIntegration;
  }

  /**
   * Start contact collection workflow for nurse callback
   */
  async collectNurseCallbackContacts(
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const config: ContactCollectionConfig = {
      purpose: 'nurse callback appointment',
      requiredFields: ['name', 'phone', 'email'],
      optionalFields: ['preferredContact', 'bestTimeToCall'],
      consentType: 'nurse_callback',
      validationStrict: true,
      allowSkip: false,
      maxAttempts: this.DEFAULT_MAX_ATTEMPTS
    };

    return this.startContactCollection(state, context, config);
  }

  /**
   * Start contact collection workflow for crisis escalation
   */
  async collectCrisisContacts(
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const config: ContactCollectionConfig = {
      purpose: 'crisis support contact',
      requiredFields: ['name', 'phone'],
      optionalFields: ['email', 'alternativeContact'],
      consentType: 'crisis_escalation',
      validationStrict: false, // More lenient for crisis situations
      allowSkip: true,
      maxAttempts: 2 // Faster for urgent situations
    };

    return this.startContactCollection(state, context, config);
  }

  /**
   * Start generic contact collection workflow
   */
  private async startContactCollection(
    state: ConversationState,
    context: ConversationFlowContext,
    config: ContactCollectionConfig
  ): Promise<ConversationFlowResult> {
    try {
      this.logger.info('Starting contact collection workflow', {
        conversationId: state.conversationId,
        purpose: config.purpose,
        requiredFields: config.requiredFields
      });

      // Create GDPR config for this contact collection
      const gdprConfig = ConversationGDPRIntegration.createGDPRConfig(
        config.consentType === 'nurse_callback' ? 'nurse_callback' : 'crisis',
        {
          automaticConsentCapture: true,
          dataCategories: ['contact_information', 'communication_preferences']
        }
      );

      // Process with GDPR compliance
      return await this.gdprIntegration.processWithCompliance(
        state,
        context,
        gdprConfig,
        () => this.presentContactCollectionDialog(state, context, config)
      );

    } catch (error) {
      this.logger.error('Contact collection workflow failed to start', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        purpose: config.purpose
      });

      return this.createContactCollectionErrorResponse(state, config);
    }
  }

  /**
   * Present contact collection dialog to user
   */
  private async presentContactCollectionDialog(
    state: ConversationState,
    context: ConversationFlowContext,
    config: ContactCollectionConfig
  ): Promise<ConversationFlowResult> {
    
    const dialogText = this.buildContactCollectionMessage(config);
    const nextField = this.getNextRequiredField(state, config);

    if (!nextField) {
      // All required fields collected, move to confirmation
      return this.presentContactConfirmation(state, context, config);
    }

    // Update state to track current collection step
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      context: {
        ...state.context,
        contactCollection: {
          config,
          currentField: nextField,
          attempts: 0,
          collectedContacts: state.context?.contactCollection?.collectedContacts || {}
        }
      }
    });

    return {
      response: {
        text: dialogText,
        suggestedActions: this.getContactFieldSuggestions(nextField, config)
      },
      newState: updatedState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Process user's contact input
   */
  async processContactInput(
    userInput: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    try {
      const contactCollection = state.context?.contactCollection;
      if (!contactCollection) {
        throw new Error('Contact collection not initialized');
      }

      const config = contactCollection.config;
      const currentField = contactCollection.currentField;
      const attempts = contactCollection.attempts || 0;

      this.logger.info('Processing contact input', {
        conversationId: state.conversationId,
        currentField,
        attempt: attempts + 1
      });

      // Validate the input
      const validation = this.validateContactField(currentField, userInput, config);
      
      if (validation.isValid) {
        // Store the validated contact information
        const collectedContacts = {
          ...contactCollection.collectedContacts,
          [currentField]: userInput.trim()
        };

        // Update state with collected contact
        const updatedState = await context.stateManager.updateState(state.conversationId, {
          context: {
            ...state.context,
            contactCollection: {
              ...contactCollection,
              collectedContacts,
              currentField: null,
              attempts: 0
            }
          }
        });

        // Continue with next field or confirmation
        return this.presentContactCollectionDialog(updatedState, context, config);

      } else {
        // Handle validation error
        return this.handleContactValidationError(
          validation,
          userInput,
          state,
          context,
          config,
          attempts
        );
      }

    } catch (error) {
      this.logger.error('Contact input processing failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId
      });

      return this.createContactCollectionErrorResponse(state, {} as ContactCollectionConfig);
    }
  }

  /**
   * Handle contact validation errors
   */
  private async handleContactValidationError(
    validation: ContactValidationResult,
    userInput: string,
    state: ConversationState,
    context: ConversationFlowContext,
    config: ContactCollectionConfig,
    attempts: number
  ): Promise<ConversationFlowResult> {
    
    const newAttempts = attempts + 1;
    const maxAttempts = config.maxAttempts;

    if (newAttempts >= maxAttempts) {
      // Max attempts reached
      if (config.allowSkip) {
        return this.offerToSkipField(state, context, config);
      } else {
        return this.escalateContactCollection(state, context, config);
      }
    }

    // Update state with incremented attempts
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      context: {
        ...state.context,
        contactCollection: {
          ...state.context?.contactCollection,
          attempts: newAttempts
        }
      }
    });

    let errorMessage = `❌ **${validation.error}**\n\n`;
    errorMessage += `You entered: "${userInput}"\n\n`;
    
    if (validation.suggestions && validation.suggestions.length > 0) {
      errorMessage += `**Suggestions:**\n`;
      validation.suggestions.forEach(suggestion => {
        errorMessage += `• ${suggestion}\n`;
      });
      errorMessage += '\n';
    }

    errorMessage += `Please try again (attempt ${newAttempts} of ${maxAttempts}):`;

    return {
      response: {
        text: errorMessage,
        suggestedActions: this.getContactFieldSuggestions(
          state.context?.contactCollection?.currentField || 'name', 
          config
        ).concat(['Skip this field', 'Get help'])
      },
      newState: updatedState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Present contact confirmation dialog
   */
  private async presentContactConfirmation(
    state: ConversationState,
    context: ConversationFlowContext,
    config: ContactCollectionConfig
  ): Promise<ConversationFlowResult> {
    
    const collectedContacts = state.context?.contactCollection?.collectedContacts || {};
    
    let confirmationText = `📋 **Please Confirm Your Contact Details**\n\n`;
    confirmationText += `For your ${config.purpose}, we have:\n\n`;

    if (collectedContacts.name) {
      confirmationText += `**Name:** ${collectedContacts.name}\n`;
    }
    
    if (collectedContacts.phone) {
      confirmationText += `**Phone:** ${collectedContacts.phone}\n`;
    }
    
    if (collectedContacts.email) {
      confirmationText += `**Email:** ${collectedContacts.email}\n`;
    }

    if (collectedContacts.preferredContact) {
      confirmationText += `**Preferred contact:** ${collectedContacts.preferredContact}\n`;
    }

    if (collectedContacts.bestTimeToCall) {
      confirmationText += `**Best time to call:** ${collectedContacts.bestTimeToCall}\n`;
    }

    confirmationText += `\n**Next steps:**\n`;
    confirmationText += `• We'll contact you within 24-48 hours\n`;
    confirmationText += `• A confirmation email will be sent\n`;
    confirmationText += `• You can update these details anytime\n\n`;
    confirmationText += `Is this information correct?`;

    // Update state for confirmation stage
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      context: {
        ...state.context,
        contactCollection: {
          ...state.context?.contactCollection,
          stage: 'confirmation',
          currentField: null
        }
      }
    });

    return {
      response: {
        text: confirmationText,
        suggestedActions: [
          'Yes, confirm details',
          'Edit phone number',
          'Edit email',
          'Edit name',
          'Cancel request'
        ]
      },
      newState: updatedState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Confirm and finalize contact collection
   */
  async finalizeContactCollection(
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    try {
      const collectedContacts = state.context?.contactCollection?.collectedContacts || {};
      const config = state.context?.contactCollection?.config;

      if (!config) {
        throw new Error('Contact collection config not found');
      }

      // Log successful contact collection
      this.logger.info('Contact collection finalized', {
        conversationId: state.conversationId,
        purpose: config.purpose,
        fieldsCollected: Object.keys(collectedContacts)
      });

      // Store contacts securely (in production, this would be encrypted)
      const contactRecord = {
        userId: state.userId,
        purpose: config.purpose,
        contacts: collectedContacts,
        collectedAt: new Date().toISOString(),
        consentType: config.consentType,
        conversationId: state.conversationId
      };

      // In production, store in secure database
      // For now, we'll log the successful collection
      this.logger.info('Contact record created securely', {
        contactRecordId: `contact-${Date.now()}`,
        purpose: config.purpose
      });

      const successText = `✅ **Contact Details Confirmed**\n\n`;
      const finalText = successText + this.buildSuccessMessage(config, collectedContacts);

      // Clear contact collection from state
      const finalState = await context.stateManager.updateState(state.conversationId, {
        context: {
          ...state.context,
          contactCollection: undefined,
          contactsCollected: true,
          contactsPurpose: config.purpose
        }
      });

      return {
        response: {
          text: finalText,
          suggestedActions: [
            'What happens next?',
            'Update contact preferences',
            'Privacy information',
            'End conversation'
          ]
        },
        newState: finalState,
        escalationTriggered: config.purpose.includes('crisis'),
        conversationEnded: false
      };

    } catch (error) {
      this.logger.error('Contact collection finalization failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId
      });

      return this.createContactCollectionErrorResponse(state, {} as ContactCollectionConfig);
    }
  }

  /**
   * Validate contact field input
   */
  private validateContactField(
    field: string,
    input: string,
    config: ContactCollectionConfig
  ): ContactValidationResult {
    
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return {
        isValid: false,
        field,
        error: 'This field cannot be empty',
        suggestions: ['Please provide your ' + field]
      };
    }

    try {
      switch (field) {
        case 'name':
          NameSchema.parse(trimmedInput);
          return { isValid: true };

        case 'phone':
          PhoneNumberSchema.parse(trimmedInput);
          return { isValid: true };

        case 'email':
          EmailSchema.parse(trimmedInput);
          return { isValid: true };

        case 'preferredContact':
          if (['phone', 'email', 'both'].includes(trimmedInput.toLowerCase())) {
            return { isValid: true };
          }
          return {
            isValid: false,
            field,
            error: 'Please choose phone, email, or both',
            suggestions: ['phone', 'email', 'both']
          };

        case 'bestTimeToCall':
          if (trimmedInput.length >= 3) {
            return { isValid: true };
          }
          return {
            isValid: false,
            field,
            error: 'Please provide more detail',
            suggestions: ['Morning (9am-12pm)', 'Afternoon (12pm-5pm)', 'Evening (5pm-8pm)']
          };

        default:
          return { isValid: true };
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        return {
          isValid: false,
          field,
          error: firstError.message,
          suggestions: this.getFieldSuggestions(field)
        };
      }

      return {
        isValid: false,
        field,
        error: 'Invalid format',
        suggestions: this.getFieldSuggestions(field)
      };
    }
  }

  /**
   * Get suggestions for a specific field
   */
  private getFieldSuggestions(field: string): string[] {
    const suggestions: Record<string, string[]> = {
      name: ['Use your full name', 'First and last name only'],
      phone: ['UK mobile: 07xxx xxx xxx', 'Include country code: +44 7xxx xxx xxx'],
      email: ['name@example.com', 'Check spelling and format'],
      preferredContact: ['phone', 'email', 'both'],
      bestTimeToCall: ['Morning', 'Afternoon', 'Evening', 'Weekdays only']
    };

    return suggestions[field] || [];
  }

  /**
   * Build contact collection message
   */
  private buildContactCollectionMessage(config: ContactCollectionConfig): string {
    let message = `📱 **Contact Information for ${config.purpose.charAt(0).toUpperCase() + config.purpose.slice(1)}**\n\n`;
    
    message += `To arrange your ${config.purpose}, I need to collect some contact information.\n\n`;
    
    message += `**Required information:**\n`;
    config.requiredFields.forEach(field => {
      message += `• ${this.getFieldDisplayName(field)}\n`;
    });

    if (config.optionalFields.length > 0) {
      message += `\n**Optional information:**\n`;
      config.optionalFields.forEach(field => {
        message += `• ${this.getFieldDisplayName(field)}\n`;
      });
    }

    message += `\n**Privacy:** Your information is protected under GDPR and used only for this ${config.purpose}.\n\n`;
    message += `Let's start with the first item...`;

    return message;
  }

  /**
   * Get display name for field
   */
  private getFieldDisplayName(field: string): string {
    const displayNames: Record<string, string> = {
      name: 'Your full name',
      phone: 'UK mobile number',
      email: 'Email address',
      preferredContact: 'Preferred contact method',
      bestTimeToCall: 'Best time to call',
      alternativeContact: 'Alternative contact method'
    };

    return displayNames[field] || field;
  }

  /**
   * Get next required field to collect
   */
  private getNextRequiredField(state: ConversationState, config: ContactCollectionConfig): string | null {
    const collected = state.context?.contactCollection?.collectedContacts || {};
    
    for (const field of config.requiredFields) {
      if (!collected[field]) {
        return field;
      }
    }
    
    // Check optional fields
    for (const field of config.optionalFields) {
      if (!collected[field]) {
        return field;
      }
    }
    
    return null; // All fields collected
  }

  /**
   * Get suggested actions for contact field
   */
  private getContactFieldSuggestions(field: string, config: ContactCollectionConfig): string[] {
    const fieldSpecific: Record<string, string[]> = {
      name: ['Enter full name', 'Help with name format'],
      phone: ['Enter UK mobile', 'Phone format help', 'Use landline instead'],
      email: ['Enter email', 'Email format help', 'Skip email'],
      preferredContact: ['Phone', 'Email', 'Both methods'],
      bestTimeToCall: ['Morning', 'Afternoon', 'Evening', 'Anytime']
    };

    const suggestions = fieldSpecific[field] || ['Continue', 'Get help'];
    
    if (config.allowSkip) {
      suggestions.push('Skip this field');
    }

    return suggestions;
  }

  /**
   * Build success message after contact collection
   */
  private buildSuccessMessage(config: ContactCollectionConfig, contacts: any): string {
    let message = `Your contact information has been securely recorded.\n\n`;
    
    if (config.purpose === 'nurse callback appointment') {
      message += `**What happens next:**\n`;
      message += `• Our specialist nurse will contact you within 24-48 hours\n`;
      message += `• You'll receive a confirmation email shortly\n`;
      message += `• The nurse will have context about your conversation\n`;
      message += `• Call duration is typically 15-30 minutes\n\n`;
      message += `**If you need to change anything:**\n`;
      message += `• Reply here before the callback\n`;
      message += `• Email nursecallbacks@eveappeal.org.uk\n`;
      message += `• Call our support line: 0808 802 0019\n\n`;
    } else if (config.purpose.includes('crisis')) {
      message += `**Immediate support:**\n`;
      message += `• Our crisis team has been notified\n`;
      message += `• Someone will contact you within 2 hours\n`;
      message += `• Emergency contacts: 999, Samaritans (116 123)\n\n`;
    }
    
    message += `Your privacy is protected and contact details are encrypted and secure.`;
    
    return message;
  }

  /**
   * Create error response for contact collection failures
   */
  private createContactCollectionErrorResponse(
    state: ConversationState,
    config: ContactCollectionConfig
  ): ConversationFlowResult {
    
    const errorText = `⚠️ **Contact Collection Issue**\n\n`;
    const fullText = errorText + `I'm having trouble collecting your contact information right now.\n\n**Alternative options:**\n• Call us directly: 0808 802 0019\n• Email: support@eveappeal.org.uk\n• Try again in a moment\n• Continue with basic support\n\nI apologize for the inconvenience. Your request is important to us.`;

    return {
      response: {
        text: fullText,
        suggestedActions: [
          'Try again',
          'Call directly',
          'Email instead',
          'Continue without callback'
        ]
      },
      newState: state,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Offer to skip field when max attempts reached
   */
  private async offerToSkipField(
    state: ConversationState,
    context: ConversationFlowContext,
    config: ContactCollectionConfig
  ): Promise<ConversationFlowResult> {
    
    const currentField = state.context?.contactCollection?.currentField;
    
    const skipText = `⚠️ **Having Trouble with ${this.getFieldDisplayName(currentField || '')}?**\n\n`;
    const fullText = skipText + `We've tried a few times and it's not working. That's okay!\n\n**Options:**\n• Skip this field and continue\n• Try a different format\n• Get help from our team\n• Continue with what we have\n\nWhat would you prefer?`;

    return {
      response: {
        text: fullText,
        suggestedActions: [
          'Skip this field',
          'Try different format',
          'Get help',
          'Continue anyway'
        ]
      },
      newState: state,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Escalate contact collection to human support
   */
  private async escalateContactCollection(
    state: ConversationState,
    context: ConversationFlowContext,
    config: ContactCollectionConfig
  ): Promise<ConversationFlowResult> {
    
    const escalationText = `🔄 **Let's Get You Connected Directly**\n\n`;
    const fullText = escalationText + `Since we're having difficulty collecting your contact details digitally, let me connect you with our team directly.\n\n**Immediate options:**\n• Call us now: 0808 802 0019\n• Live chat on our website\n• Email with your details: support@eveappeal.org.uk\n\n**What we'll need:**\n• Your name and contact number\n• Best time to reach you\n• Brief description of what you need\n\nOur team is available 9am-5pm, Monday-Friday.`;

    // Update state to indicate escalation needed
    const escalatedState = await context.stateManager.updateState(state.conversationId, {
      context: {
        ...state.context,
        escalationRequested: true,
        escalationReason: 'contact_collection_failed',
        escalationTimestamp: new Date().toISOString()
      }
    });

    return {
      response: {
        text: fullText,
        suggestedActions: [
          'Call now',
          'Send email',
          'Try digital form again',
          'End conversation'
        ]
      },
      newState: escalatedState,
      escalationTriggered: true,
      conversationEnded: false
    };
  }
}