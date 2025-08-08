import { Logger } from '../utils/logger';
import { ConversationStateManager } from './ConversationStateManager';
import { 
  ConversationState,
  ConversationTopic,
  ConversationStage,
  ConversationFlowResult,
  TopicDetectionResult,
  ConversationMessage
} from '../types/conversation';
import { SafetyService, ContentService } from '../types';
import { EscalationService } from './EscalationService';
import { EnhancedGDPRService } from './EnhancedGDPRService';

export interface TopicHandler {
  readonly topicName: ConversationTopic;
  readonly supportedStages: ConversationStage[];
  
  canHandle(message: string, state: ConversationState): Promise<boolean>;
  handle(
    message: string, 
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult>;
  
  getIntentConfidence(message: string, state: ConversationState): Promise<number>;
}

export interface ConversationFlowContext {
  logger: Logger;
  safetyService: SafetyService;
  contentService: ContentService;
  escalationService: EscalationService;
  gdprService: EnhancedGDPRService;
  stateManager: ConversationStateManager;
}

export interface ConversationFlowEngineOptions {
  enableSafetyFirst: boolean;
  crisisDetectionTimeoutMs: number;
  fallbackToHumanThreshold: number;
  multipleTopicsThreshold: number;
}

/**
 * ConversationFlowEngine replicates Microsoft Copilot Studio conversation flow
 * Manages topic detection, routing, and conversation state transitions
 */
export class ConversationFlowEngine {
  private logger: Logger;
  private stateManager: ConversationStateManager;
  private topicHandlers: Map<ConversationTopic, TopicHandler> = new Map();
  private context: ConversationFlowContext;
  private options: ConversationFlowEngineOptions;

  constructor(
    context: ConversationFlowContext,
    options: Partial<ConversationFlowEngineOptions> = {}
  ) {
    this.logger = context.logger;
    this.stateManager = context.stateManager;
    this.context = context;
    this.options = {
      enableSafetyFirst: true,
      crisisDetectionTimeoutMs: 500,
      fallbackToHumanThreshold: 0.3,
      multipleTopicsThreshold: 0.8,
      ...options
    };
  }

  /**
   * Register a topic handler
   */
  registerTopicHandler(handler: TopicHandler): void {
    this.topicHandlers.set(handler.topicName, handler);
    this.logger.info('Registered topic handler', { 
      topicName: handler.topicName,
      supportedStages: handler.supportedStages 
    });
  }

  /**
   * Process user message through conversation flow
   */
  async processMessage(
    conversationId: string,
    userId: string,
    userMessage: string,
    sessionId?: string
  ): Promise<ConversationFlowResult> {
    const startTime = Date.now();
    
    try {
      // Get or create conversation state
      const state = await this.stateManager.getOrCreateState(
        conversationId, 
        userId, 
        sessionId
      );

      // Add user message to history
      await this.stateManager.addMessage(conversationId, userMessage, true);

      // SAFETY FIRST: Always check for crisis situations
      if (this.options.enableSafetyFirst) {
        const crisisResult = await this.performSafetyCheck(
          userMessage, 
          state, 
          conversationId
        );
        
        if (crisisResult) {
          return crisisResult;
        }
      }

      // Handle conversation flow based on current state
      let flowResult: ConversationFlowResult;

      if (!state.conversationStarted || !state.hasSeenOpeningStatement) {
        // Force conversation start flow
        flowResult = await this.handleConversationStart(
          userMessage, 
          state, 
          conversationId
        );
      } else if (state.currentStage === 'consent_capture' || 
                 state.currentStage === 'contact_collection') {
        // Continue current workflow
        flowResult = await this.continueCurrentWorkflow(
          userMessage, 
          state, 
          conversationId
        );
      } else {
        // Perform topic detection and routing
        flowResult = await this.performTopicDetectionAndRouting(
          userMessage, 
          state, 
          conversationId
        );
      }

      // Add bot response to history
      await this.stateManager.addMessage(
        conversationId, 
        flowResult.response.text, 
        false,
        { 
          topic: flowResult.newState.currentTopic,
          stage: flowResult.newState.currentStage 
        }
      );

      // Log conversation flow metrics
      const processingTime = Date.now() - startTime;
      this.logger.info('Conversation flow processed', {
        conversationId,
        userId,
        currentTopic: flowResult.newState.currentTopic,
        currentStage: flowResult.newState.currentStage,
        escalationTriggered: flowResult.escalationTriggered,
        processingTime,
        messageCount: flowResult.newState.messageCount
      });

      return flowResult;
    } catch (error) {
      this.logger.error('Conversation flow processing failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId,
        userId,
        userMessage: userMessage.substring(0, 100) + '...'
      });

      // Return error handling flow
      return this.handleError(conversationId, error as Error);
    }
  }

  /**
   * Safety check for crisis situations
   */
  private async performSafetyCheck(
    message: string,
    state: ConversationState,
    conversationId: string
  ): Promise<ConversationFlowResult | null> {
    try {
      const messageHistory = this.stateManager.getMessageHistory(conversationId);
      const formattedHistory = messageHistory.map(msg => ({
        text: msg.text,
        isUser: msg.isUser,
        timestamp: new Date(msg.timestamp)
      }));
      const safetyResult = await this.context.safetyService.analyzeMessage(
        message,
        formattedHistory
      );

      if (safetyResult.shouldEscalate) {
        this.logger.warn('Crisis situation detected, routing to crisis support', {
          conversationId,
          severity: safetyResult.severity,
          escalationType: safetyResult.escalationType
        });

        // Transition to crisis support routing
        const newState = await this.stateManager.transitionToTopic(
          conversationId,
          'crisis_support_routing',
          'escalation'
        );

        if (!newState.success) {
          throw new Error('Failed to transition to crisis support');
        }

        // Get crisis support handler
        const handler = this.topicHandlers.get('crisis_support_routing');
        if (handler) {
          return await handler.handle(message, state, this.context);
        } else {
          // Fallback crisis response if handler not available
          return {
            response: {
              text: `I'm very concerned about what you've shared. Please contact emergency services immediately:
              
**Emergency Contacts:**
• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7)
• Crisis Text Line: Text SHOUT to 85258
• NHS 111: For urgent medical support

Your safety is the most important thing right now. Please reach out for help.`,
              suggestedActions: ['Call 999', 'Call Samaritans', 'Text SHOUT']
            },
            newState: await this.stateManager.getCurrentState(conversationId)!,
            escalationTriggered: true,
            conversationEnded: false
          };
        }
      }

      return null; // No crisis detected
    } catch (error) {
      this.logger.error('Safety check failed', { 
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId 
      });
      return null; // Continue with normal flow if safety check fails
    }
  }

  /**
   * Handle conversation start with mandatory opening statement
   */
  private async handleConversationStart(
    message: string,
    state: ConversationState,
    conversationId: string
  ): Promise<ConversationFlowResult> {
    const handler = this.topicHandlers.get('conversation_start');
    
    if (!handler) {
      throw new Error('Conversation start handler not registered');
    }

    return await handler.handle(message, state, this.context);
  }

  /**
   * Continue current workflow (consent capture, contact collection, etc.)
   */
  private async continueCurrentWorkflow(
    message: string,
    state: ConversationState,
    conversationId: string
  ): Promise<ConversationFlowResult> {
    const handler = this.topicHandlers.get(state.currentTopic);
    
    if (!handler) {
      this.logger.warn('No handler found for current topic, falling back', {
        conversationId,
        currentTopic: state.currentTopic
      });
      return this.handleFallback(message, state, conversationId);
    }

    return await handler.handle(message, state, this.context);
  }

  /**
   * Perform topic detection and route to appropriate handler
   */
  private async performTopicDetectionAndRouting(
    message: string,
    state: ConversationState,
    conversationId: string
  ): Promise<ConversationFlowResult> {
    try {
      // Detect the most appropriate topic
      const topicDetection = await this.detectTopic(message, state);
      
      this.logger.info('Topic detected', {
        conversationId,
        detectedTopic: topicDetection.detectedTopic,
        confidence: topicDetection.confidence,
        reason: topicDetection.reason
      });

      // Handle multiple high-confidence topics
      if (topicDetection.alternativeTopics && 
          topicDetection.alternativeTopics.length > 0 &&
          topicDetection.confidence < this.options.multipleTopicsThreshold) {
        return this.handleMultipleTopicsMatched(message, state, conversationId, topicDetection);
      }

      // Get appropriate handler
      const handler = this.topicHandlers.get(topicDetection.detectedTopic);
      
      if (!handler) {
        this.logger.warn('No handler found for detected topic', {
          conversationId,
          detectedTopic: topicDetection.detectedTopic
        });
        return this.handleFallback(message, state, conversationId);
      }

      // Check if handler can handle current message
      const canHandle = await handler.canHandle(message, state);
      if (!canHandle) {
        this.logger.info('Handler declined to handle message, using fallback', {
          conversationId,
          detectedTopic: topicDetection.detectedTopic
        });
        return this.handleFallback(message, state, conversationId);
      }

      // Transition to new topic if needed
      if (state.currentTopic !== topicDetection.detectedTopic) {
        const transitionResult = await this.stateManager.transitionToTopic(
          conversationId,
          topicDetection.detectedTopic,
          'information_gathering'
        );

        if (!transitionResult.success) {
          this.logger.warn('Topic transition failed, using current handler', {
            conversationId,
            from: state.currentTopic,
            to: topicDetection.detectedTopic,
            error: transitionResult.error
          });
        }
      }

      // Handle the message
      return await handler.handle(message, state, this.context);
    } catch (error) {
      this.logger.error('Topic detection and routing failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId
      });
      return this.handleFallback(message, state, conversationId);
    }
  }

  /**
   * Detect the most appropriate topic for the user's message
   */
  private async detectTopic(
    message: string,
    state: ConversationState
  ): Promise<TopicDetectionResult> {
    const topicConfidences: Array<{
      topic: ConversationTopic;
      confidence: number;
    }> = [];

    // Get confidence scores from all registered handlers
    for (const [topic, handler] of this.topicHandlers.entries()) {
      try {
        const confidence = await handler.getIntentConfidence(message, state);
        if (confidence > 0) {
          topicConfidences.push({ topic, confidence });
        }
      } catch (error) {
        this.logger.warn('Handler confidence calculation failed', {
          topic,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Sort by confidence
    topicConfidences.sort((a, b) => b.confidence - a.confidence);

    if (topicConfidences.length === 0) {
      return {
        detectedTopic: 'fallback',
        confidence: 0.5,
        reason: 'No topics detected, using fallback'
      };
    }

    const bestMatch = topicConfidences[0];
    const alternativeTopics = topicConfidences
      .slice(1, 4) // Top 3 alternatives
      .filter(t => t.confidence > 0.3);

    return {
      detectedTopic: bestMatch.topic,
      confidence: bestMatch.confidence,
      reason: `Best match with ${(bestMatch.confidence * 100).toFixed(1)}% confidence`,
      alternativeTopics
    };
  }

  /**
   * Handle multiple topics matched scenario
   */
  private async handleMultipleTopicsMatched(
    message: string,
    state: ConversationState,
    conversationId: string,
    detection: TopicDetectionResult
  ): Promise<ConversationFlowResult> {
    // Transition to multiple_topics_matched system topic
    await this.stateManager.transitionToTopic(
      conversationId,
      'multiple_topics_matched',
      'topic_detection'
    );

    const alternatives = detection.alternativeTopics || [];
    const topicOptions = [
      { topic: detection.detectedTopic, confidence: detection.confidence },
      ...alternatives
    ];

    const suggestedActions = topicOptions
      .slice(0, 3) // Top 3 options
      .map(t => this.getTopicDisplayName(t.topic));

    const updatedState = await this.stateManager.updateState(conversationId, {
      currentTopic: 'multiple_topics_matched',
      context: { ...state.context, detectedTopics: topicOptions }
    });

    return {
      response: {
        text: "I can help you with several different things. What would you like to focus on?",
        suggestedActions
      },
      newState: updatedState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Handle fallback scenario
   */
  private async handleFallback(
    message: string,
    state: ConversationState,
    conversationId: string
  ): Promise<ConversationFlowResult> {
    const handler = this.topicHandlers.get('fallback');
    
    if (handler) {
      return await handler.handle(message, state, this.context);
    }

    // Built-in fallback response
    const updatedState = await this.stateManager.updateState(conversationId, {
      currentTopic: 'fallback'
    });

    return {
      response: {
        text: "I'm not sure I understand. I can help you with gynaecological health information, connect you with a nurse, or provide support resources. What would you like to know about?",
        suggestedActions: [
          'Health information',
          'Speak to a nurse',
          'Support options'
        ]
      },
      newState: updatedState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  /**
   * Handle system errors
   */
  private async handleError(
    conversationId: string,
    error: Error
  ): Promise<ConversationFlowResult> {
    try {
      const state = await this.stateManager.getCurrentState(conversationId);
      if (!state) {
        throw new Error('Cannot retrieve conversation state for error handling');
      }

      const updatedState = await this.stateManager.updateState(conversationId, {
        currentTopic: 'on_error',
        currentStage: 'greeting'
      });

      return {
        response: {
          text: "I'm sorry, I'm experiencing technical difficulties. Let me help you get the support you need:\n\n• For urgent medical concerns: Call 999\n• For health information: Call NHS 111\n• For emotional support: Call Samaritans 116 123\n• The Eve Appeal: Visit eveappeal.org.uk",
          suggestedActions: ['Try again', 'Contact support', 'Emergency help']
        },
        newState: updatedState,
        escalationTriggered: false,
        conversationEnded: false
      };
    } catch (errorHandlingError) {
      this.logger.critical('Error handling failed', {
        originalError: error.message,
        errorHandlingError: errorHandlingError instanceof Error ? errorHandlingError.message : 'Unknown error',
        conversationId
      });

      // Ultimate fallback - basic error response without state management
      return {
        response: {
          text: "I'm experiencing technical difficulties. For immediate health concerns, please call 999. For non-urgent matters, contact NHS 111 or visit eveappeal.org.uk.",
          suggestedActions: ['Call 999', 'Call NHS 111']
        },
        newState: {} as ConversationState, // This will be handled by the calling code
        escalationTriggered: false,
        conversationEnded: true
      };
    }
  }

  /**
   * Get display name for topic
   */
  private getTopicDisplayName(topic: ConversationTopic): string {
    const displayNames: Record<ConversationTopic, string> = {
      conversation_start: 'Start conversation',
      crisis_support_routing: 'Crisis support',
      health_information_router: 'Health information',
      nurse_escalation_handler: 'Speak to a nurse',
      support_options_overview: 'Support options',
      user_satisfaction_handler: 'Feedback',
      exit_intent_detection: 'End conversation',
      fallback: 'General help',
      end_of_conversation: 'End',
      on_error: 'Error',
      multiple_topics_matched: 'Multiple options'
    };

    return displayNames[topic] || topic.replace(/_/g, ' ');
  }

  /**
   * Get registered topic handlers (for testing/debugging)
   */
  getRegisteredTopics(): ConversationTopic[] {
    return Array.from(this.topicHandlers.keys());
  }
}