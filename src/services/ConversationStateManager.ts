import { Logger } from '../utils/logger';
import {
  ConversationState,
  ConversationStateSchema,
  ConversationTopic,
  ConversationStage,
  ConsentStatus,
  UserContactInfo,
  ConversationMessage,
  TopicTransitionResult
} from '../types/conversation';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationStateManagerOptions {
  sessionTimeoutMs?: number;
  maxMessagesPerSession?: number;
  enablePersistence?: boolean;
}

/**
 * ConversationStateManager handles the state management for Ask Eve Assist conversations
 * Tracks user journey through topics, consent status, and conversation context
 */
export class ConversationStateManager {
  private logger: Logger;
  private states: Map<string, ConversationState> = new Map();
  private messages: Map<string, ConversationMessage[]> = new Map();
  private options: ConversationStateManagerOptions;

  constructor(logger: Logger, options: ConversationStateManagerOptions = {}) {
    this.logger = logger;
    this.options = {
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      maxMessagesPerSession: 100,
      enablePersistence: false,
      ...options
    };
  }

  /**
   * Initialize or retrieve conversation state for a user
   */
  async getOrCreateState(
    conversationId: string, 
    userId: string,
    sessionId?: string
  ): Promise<ConversationState> {
    try {
      // Check if state exists and is still valid
      let state = this.states.get(conversationId);
      
      if (state && this.isStateValid(state)) {
        this.logger.info('Retrieved existing conversation state', {
          conversationId,
          currentTopic: state.currentTopic,
          currentStage: state.currentStage
        });
        return state;
      }

      // Create new state
      const newState: ConversationState = {
        conversationId,
        userId,
        sessionId: sessionId || uuidv4(),
        currentTopic: 'conversation_start',
        currentStage: 'greeting',
        consentStatus: 'not_requested',
        conversationStarted: false,
        hasSeenOpeningStatement: false,
        lastActivity: Date.now(),
        messageCount: 0,
        topics: ['conversation_start']
      };

      // Validate the state
      const validatedState = ConversationStateSchema.parse(newState);
      
      // Store the state
      this.states.set(conversationId, validatedState);
      this.messages.set(conversationId, []);

      this.logger.info('Created new conversation state', {
        conversationId,
        userId,
        sessionId: validatedState.sessionId
      });

      return validatedState;
    } catch (error) {
      this.logger.error('Failed to get or create conversation state', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId,
        userId
      });
      throw new Error('Failed to initialize conversation state');
    }
  }

  /**
   * Update conversation state
   */
  async updateState(
    conversationId: string,
    updates: Partial<ConversationState>
  ): Promise<ConversationState> {
    try {
      const currentState = this.states.get(conversationId);
      if (!currentState) {
        throw new Error('Conversation state not found');
      }

      const updatedState: ConversationState = {
        ...currentState,
        ...updates,
        lastActivity: Date.now()
      };

      // Validate the updated state
      const validatedState = ConversationStateSchema.parse(updatedState);
      
      // Store the updated state
      this.states.set(conversationId, validatedState);

      this.logger.info('Updated conversation state', {
        conversationId,
        previousTopic: currentState.currentTopic,
        newTopic: validatedState.currentTopic,
        previousStage: currentState.currentStage,
        newStage: validatedState.currentStage
      });

      return validatedState;
    } catch (error) {
      this.logger.error('Failed to update conversation state', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
        updates
      });
      throw error;
    }
  }

  /**
   * Transition to a new topic
   */
  async transitionToTopic(
    conversationId: string,
    newTopic: ConversationTopic,
    newStage: ConversationStage,
    context?: Record<string, unknown>
  ): Promise<TopicTransitionResult> {
    try {
      const currentState = this.states.get(conversationId);
      if (!currentState) {
        throw new Error('Conversation state not found');
      }

      // Validate the transition
      const isValidTransition = this.validateTopicTransition(
        currentState.currentTopic,
        newTopic
      );

      if (!isValidTransition) {
        this.logger.warn('Invalid topic transition attempted', {
          conversationId,
          from: currentState.currentTopic,
          to: newTopic
        });
        
        return {
          success: false,
          newTopic: currentState.currentTopic,
          newStage: currentState.currentStage,
          requiresUserAction: false,
          error: 'Invalid topic transition'
        };
      }

      // Update state with new topic and stage
      const updatedState = await this.updateState(conversationId, {
        currentTopic: newTopic,
        currentStage: newStage,
        topics: [...currentState.topics, newTopic],
        context: { ...currentState.context, ...context }
      });

      this.logger.info('Topic transition completed', {
        conversationId,
        from: currentState.currentTopic,
        to: newTopic,
        newStage
      });

      return {
        success: true,
        newTopic,
        newStage,
        requiresUserAction: this.stageRequiresUserAction(newStage),
        message: this.getTransitionMessage(newTopic, newStage)
      };
    } catch (error) {
      this.logger.error('Failed to transition topic', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
        newTopic,
        newStage
      });
      
      return {
        success: false,
        newTopic: 'on_error',
        newStage: 'greeting',
        requiresUserAction: false,
        error: 'Topic transition failed'
      };
    }
  }

  /**
   * Add message to conversation history
   */
  async addMessage(
    conversationId: string,
    text: string,
    isUser: boolean,
    metadata?: Record<string, unknown>
  ): Promise<ConversationMessage> {
    try {
      const state = this.states.get(conversationId);
      if (!state) {
        throw new Error('Conversation state not found');
      }

      const message: ConversationMessage = {
        id: uuidv4(),
        text,
        isUser,
        timestamp: Date.now(),
        topic: state.currentTopic,
        stage: state.currentStage,
        metadata
      };

      let messages = this.messages.get(conversationId) || [];
      
      // Limit message history to prevent memory issues
      if (messages.length >= (this.options.maxMessagesPerSession || 100)) {
        messages = messages.slice(-50); // Keep last 50 messages
      }
      
      messages.push(message);
      this.messages.set(conversationId, messages);

      // Update message count in state
      await this.updateState(conversationId, {
        messageCount: state.messageCount + 1
      });

      return message;
    } catch (error) {
      this.logger.error('Failed to add message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
        isUser
      });
      throw error;
    }
  }

  /**
   * Get conversation message history
   */
  getMessageHistory(conversationId: string): ConversationMessage[] {
    return this.messages.get(conversationId) || [];
  }

  /**
   * Update consent status
   */
  async updateConsentStatus(
    conversationId: string,
    consentStatus: ConsentStatus,
    contactInfo?: UserContactInfo
  ): Promise<ConversationState> {
    const updates: Partial<ConversationState> = {
      consentStatus
    };

    if (contactInfo) {
      updates.userContactInfo = contactInfo;
    }

    return this.updateState(conversationId, updates);
  }

  /**
   * Mark conversation as completed
   */
  async completeConversation(
    conversationId: string,
    reason: string,
    satisfactionRating?: number
  ): Promise<ConversationState> {
    return this.updateState(conversationId, {
      currentTopic: 'end_of_conversation',
      currentStage: 'completion',
      completionReason: reason,
      satisfactionRating
    });
  }

  /**
   * Clean up expired states
   */
  async cleanupExpiredStates(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [conversationId, state] of this.states.entries()) {
      if (now - state.lastActivity > (this.options.sessionTimeoutMs || 1800000)) {
        this.states.delete(conversationId);
        this.messages.delete(conversationId);
        cleanedCount++;
        
        this.logger.info('Cleaned up expired conversation state', {
          conversationId,
          lastActivity: new Date(state.lastActivity).toISOString()
        });
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} expired conversation states`);
    }

    return cleanedCount;
  }

  /**
   * Get current state
   */
  getCurrentState(conversationId: string): ConversationState | undefined {
    return this.states.get(conversationId);
  }

  /**
   * Private helper methods
   */
  private isStateValid(state: ConversationState): boolean {
    const now = Date.now();
    const timeout = this.options.sessionTimeoutMs || 1800000; // 30 minutes
    
    return (now - state.lastActivity) < timeout;
  }

  private validateTopicTransition(
    fromTopic: ConversationTopic,
    toTopic: ConversationTopic
  ): boolean {
    // Define valid transition rules based on Copilot Studio flow
    const validTransitions: Record<ConversationTopic, ConversationTopic[]> = {
      conversation_start: ['crisis_support_routing', 'health_information_router', 'support_options_overview'],
      crisis_support_routing: ['nurse_escalation_handler', 'end_of_conversation'],
      health_information_router: ['nurse_escalation_handler', 'user_satisfaction_handler', 'support_options_overview'],
      nurse_escalation_handler: ['user_satisfaction_handler', 'end_of_conversation'],
      support_options_overview: ['health_information_router', 'nurse_escalation_handler', 'user_satisfaction_handler'],
      user_satisfaction_handler: ['end_of_conversation', 'health_information_router'],
      exit_intent_detection: ['end_of_conversation'],
      fallback: ['conversation_start', 'health_information_router', 'support_options_overview'],
      end_of_conversation: [], // Terminal state
      on_error: ['conversation_start', 'fallback'],
      multiple_topics_matched: ['crisis_support_routing', 'health_information_router', 'support_options_overview']
    };

    const allowedTransitions = validTransitions[fromTopic] || [];
    return allowedTransitions.includes(toTopic);
  }

  private stageRequiresUserAction(stage: ConversationStage): boolean {
    return ['consent_capture', 'contact_collection', 'satisfaction_check'].includes(stage);
  }

  private getTransitionMessage(topic: ConversationTopic, stage: ConversationStage): string {
    // Provide contextual messages for topic transitions
    const messages: Record<string, string> = {
      'crisis_support_routing.greeting': 'I understand you may be going through a difficult time. Let me help you find the right support.',
      'health_information_router.information_gathering': 'I can help you find trusted health information. What would you like to know about?',
      'nurse_escalation_handler.consent_capture': 'To connect you with one of our nurses, I\'ll need to collect some contact information. Is that okay?',
      'support_options_overview.information_gathering': 'Here are the different ways I can support you today.',
      'user_satisfaction_handler.satisfaction_check': 'Before we finish, could you let me know how helpful our conversation has been?'
    };

    const key = `${topic}.${stage}`;
    return messages[key] || '';
  }
}