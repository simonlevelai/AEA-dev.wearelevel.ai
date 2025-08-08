import { BaseTopicHandler, TopicHandlerOptions } from './BaseTopicHandler';
import { Logger } from '../utils/logger';
import {
  ConversationState,
  ConversationFlowResult,
  ConversationStage
} from '../types/conversation';
import { ConversationFlowContext } from '../services/ConversationFlowEngine';

/**
 * ConversationStartHandler manages the mandatory opening statement and initial conversation flow
 * Ensures every user receives the proper greeting and disclaimers before proceeding
 */
export class ConversationStartHandler extends BaseTopicHandler {
  private readonly OPENING_STATEMENT = `Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health.

I'm not a medical professional or a nurse, but I can help you access trusted information from The Eve Appeal.

How can I support you today?`;

  private readonly FOLLOW_UP_GREETING = `Thank you for your message. I'm here to help you with gynaecological health information and support.`;

  constructor(logger: Logger) {
    super(
      'conversation_start',
      {
        name: 'Conversation Start',
        description: 'Handles conversation initialization and opening statement',
        keywords: ['hello', 'hi', 'hey', 'start', 'help', 'begin'],
        supportedStages: ['greeting', 'topic_detection'],
        requiresConsent: false,
        canEscalate: false,
        priority: 10 // Highest priority
      },
      logger
    );
  }

  protected initializeIntentPatterns(): void {
    this.intentPatterns = [
      {
        pattern: /^(hello|hi|hey|good\s+(morning|afternoon|evening))/i,
        confidence: 0.9,
        description: 'Greeting patterns'
      },
      {
        pattern: /^(help|start|begin|new\s+conversation)/i,
        confidence: 0.8,
        description: 'Start conversation patterns'
      },
      {
        pattern: /^.{1,20}$/,
        confidence: 0.3,
        description: 'Short messages likely to be greetings'
      }
    ];
  }

  public async handle(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    try {
      this.logHandlerActivity(message, 'handle_conversation_start', true);

      // If user hasn't seen opening statement yet, always show it first
      if (!state.hasSeenOpeningStatement) {
        return this.handleInitialGreeting(message, state, context);
      }

      // If conversation has started but user sends another greeting
      if (state.conversationStarted && this.isGreeting(message)) {
        return this.handleRepeatedGreeting(message, state, context);
      }

      // Route user to appropriate topic based on their response to opening statement
      return this.routeToNextTopic(message, state, context);

    } catch (error) {
      this.logger.error('ConversationStartHandler failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId
      });

      // Fallback to basic greeting
      return this.handleInitialGreeting(message, state, context);
    }
  }

  /**
   * Handle the very first interaction - show mandatory opening statement
   */
  private async handleInitialGreeting(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    this.logger.info('Showing mandatory opening statement', {
      conversationId: state.conversationId,
      userId: state.userId
    });

    // Update state to mark opening statement as seen
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      hasSeenOpeningStatement: true,
      conversationStarted: true,
      currentStage: 'topic_detection'
    });

    return this.createSuccessResponse(
      this.OPENING_STATEMENT,
      updatedState,
      [
        'Health information',
        'Speak to a nurse', 
        'Support options',
        'Cancer symptoms',
        'Screening information'
      ]
    );
  }

  /**
   * Handle when user sends another greeting after conversation has started
   */
  private async handleRepeatedGreeting(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    this.logger.info('Handling repeated greeting', {
      conversationId: state.conversationId
    });

    return this.createSuccessResponse(
      `${this.FOLLOW_UP_GREETING} What would you like to know about today?`,
      state,
      [
        'Ovarian cancer symptoms',
        'Cervical screening', 
        'Womb cancer signs',
        'Speak to a nurse',
        'Support services'
      ]
    );
  }

  /**
   * Route user to appropriate topic based on their response
   */
  private async routeToNextTopic(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const normalizedMessage = this.normalizeMessage(message);
    
    // Analyze user's response to determine next topic
    const intentAnalysis = this.analyzeUserIntent(normalizedMessage);
    
    this.logger.info('Routing to next topic', {
      conversationId: state.conversationId,
      detectedIntent: intentAnalysis.intent,
      confidence: intentAnalysis.confidence
    });

    // Route based on detected intent
    switch (intentAnalysis.intent) {
      case 'health_information':
        return this.transitionToHealthInfo(message, state, context);
      
      case 'nurse_support':
        return this.transitionToNurseEscalation(message, state, context);
      
      case 'crisis_support':
        return this.transitionToCrisisSupport(message, state, context);
      
      case 'general_support':
        return this.transitionToSupportOptions(message, state, context);
      
      default:
        return this.handleUnclearIntent(message, state, context);
    }
  }

  /**
   * Analyze user intent from their message
   */
  private analyzeUserIntent(normalizedMessage: string): { intent: string; confidence: number } {
    // Health information keywords
    const healthKeywords = [
      'symptoms', 'cancer', 'ovarian', 'cervical', 'womb', 'vaginal', 'vulval',
      'screening', 'smear', 'test', 'examination', 'period', 'bleeding',
      'pain', 'discharge', 'lump', 'information', 'know about', 'tell me'
    ];

    // Nurse support keywords  
    const nurseKeywords = [
      'nurse', 'speak to', 'talk to', 'appointment', 'call back',
      'contact', 'urgent', 'worried', 'concerned', 'professional'
    ];

    // Crisis support keywords
    const crisisKeywords = [
      'help', 'crisis', 'urgent', 'emergency', 'scared', 'afraid',
      'don\'t know what to do', 'desperate', 'hopeless'
    ];

    // Support options keywords
    const supportKeywords = [
      'support', 'options', 'services', 'what can you do',
      'how can you help', 'what do you offer'
    ];

    // Calculate confidence scores
    const healthScore = this.calculateKeywordScore(normalizedMessage, healthKeywords);
    const nurseScore = this.calculateKeywordScore(normalizedMessage, nurseKeywords);
    const crisisScore = this.calculateKeywordScore(normalizedMessage, crisisKeywords);
    const supportScore = this.calculateKeywordScore(normalizedMessage, supportKeywords);

    // Determine highest scoring intent
    const scores = [
      { intent: 'health_information', confidence: healthScore },
      { intent: 'nurse_support', confidence: nurseScore },
      { intent: 'crisis_support', confidence: crisisScore },
      { intent: 'general_support', confidence: supportScore }
    ];

    scores.sort((a, b) => b.confidence - a.confidence);
    
    return scores[0].confidence > 0.3 ? scores[0] : { intent: 'unclear', confidence: 0 };
  }

  private calculateKeywordScore(message: string, keywords: string[]): number {
    let score = 0;
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        score += 0.1; // 10% per keyword match
      }
    }
    return Math.min(score, 0.8); // Cap at 80%
  }

  /**
   * Transition methods to different topics
   */
  private async transitionToHealthInfo(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const updatedState = await context.stateManager.transitionToTopic(
      state.conversationId,
      'health_information_router',
      'information_gathering'
    );

    if (!updatedState.success) {
      return this.handleTransitionError(message, state, context);
    }

    return this.createSuccessResponse(
      "I can help you find trusted health information from The Eve Appeal. What would you like to know about?",
      await context.stateManager.getCurrentState(state.conversationId)!,
      [
        'Ovarian cancer symptoms',
        'Cervical screening process',
        'Womb cancer warning signs', 
        'Vulval cancer information',
        'When to see a GP'
      ]
    );
  }

  private async transitionToNurseEscalation(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const updatedState = await context.stateManager.transitionToTopic(
      state.conversationId,
      'nurse_escalation_handler',
      'consent_capture'
    );

    if (!updatedState.success) {
      return this.handleTransitionError(message, state, context);
    }

    return this.createSuccessResponse(
      "I can connect you with one of our specialist nurses. To do this, I'll need to collect some contact information so they can reach you. Is that okay?",
      await context.stateManager.getCurrentState(state.conversationId)!,
      [
        'Yes, connect me',
        'Tell me more first',
        'What information do you need?',
        'No thanks'
      ]
    );
  }

  private async transitionToCrisisSupport(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const updatedState = await context.stateManager.transitionToTopic(
      state.conversationId,
      'crisis_support_routing',
      'escalation'
    );

    if (!updatedState.success) {
      return this.handleTransitionError(message, state, context);
    }

    return this.createSuccessResponse(
      "I understand you may need urgent support. Let me help you find the right assistance:",
      await context.stateManager.getCurrentState(state.conversationId)!,
      [
        'Emergency services (999)',
        'Samaritans (116 123)',
        'Crisis text line',
        'NHS urgent help'
      ]
    );
  }

  private async transitionToSupportOptions(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const updatedState = await context.stateManager.transitionToTopic(
      state.conversationId,
      'support_options_overview',
      'information_gathering'
    );

    if (!updatedState.success) {
      return this.handleTransitionError(message, state, context);
    }

    return this.createSuccessResponse(
      "Here are the different ways I can support you today:",
      await context.stateManager.getCurrentState(state.conversationId)!,
      [
        'Find health information',
        'Speak to a nurse',
        'Emergency support contacts',
        'The Eve Appeal services',
        'Book a screening'
      ]
    );
  }

  private async handleUnclearIntent(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    this.logger.info('User intent unclear, providing options', {
      conversationId: state.conversationId,
      message: message.substring(0, 50)
    });

    return this.createSuccessResponse(
      "I'm here to help! I can assist you with:",
      state,
      [
        'Health information',
        'Speak to a nurse',
        'Support services',
        'Symptom guidance',
        'Screening information'
      ]
    );
  }

  private async handleTransitionError(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    this.logger.error('Topic transition failed in conversation start', {
      conversationId: state.conversationId
    });

    return this.createSuccessResponse(
      "I can help you with gynaecological health information and support. What would you like to know about?",
      state,
      [
        'Health information', 
        'Speak to a nurse',
        'Support options'
      ]
    );
  }

  /**
   * Check if message is a greeting
   */
  private isGreeting(message: string): boolean {
    const normalizedMessage = this.normalizeMessage(message);
    const greetingPatterns = [
      /^(hello|hi|hey|good\s+(morning|afternoon|evening))/i,
      /^(thanks?|thank\s+you)/i
    ];

    return greetingPatterns.some(pattern => pattern.test(normalizedMessage)) && message.length < 50;
  }

  /**
   * Override confidence calculation for conversation start
   */
  public async getIntentConfidence(
    message: string,
    state: ConversationState
  ): Promise<number> {
    // Always handle if conversation hasn't started
    if (!state.conversationStarted || !state.hasSeenOpeningStatement) {
      return 1.0;
    }

    // High confidence for greetings when conversation has started
    if (this.isGreeting(message)) {
      return 0.8;
    }

    // Use base implementation for other cases
    return super.getIntentConfidence(message, state);
  }
}