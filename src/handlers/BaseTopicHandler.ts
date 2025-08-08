import { Logger } from '../utils/logger';
import {
  ConversationState,
  ConversationTopic,
  ConversationStage,
  ConversationFlowResult
} from '../types/conversation';
import { TopicHandler, ConversationFlowContext } from '../services/ConversationFlowEngine';
import { z } from 'zod';

export interface TopicHandlerOptions {
  name: string;
  description: string;
  keywords: string[];
  supportedStages: ConversationStage[];
  requiresConsent: boolean;
  canEscalate: boolean;
  priority: number; // 1-10, higher = more priority
}

export interface IntentPattern {
  pattern: RegExp;
  confidence: number;
  description: string;
}

export interface TopicHandlerMetrics {
  totalMessages: number;
  successfulHandles: number;
  averageConfidence: number;
  escalationRate: number;
  lastUsed: number;
}

/**
 * BaseTopicHandler provides common functionality for all conversation topic handlers
 * Implements the TopicHandler interface with shared utilities and patterns
 */
export abstract class BaseTopicHandler implements TopicHandler {
  protected logger: Logger;
  protected options: TopicHandlerOptions;
  protected intentPatterns: IntentPattern[] = [];
  protected metrics: TopicHandlerMetrics;

  public readonly topicName: ConversationTopic;
  public readonly supportedStages: ConversationStage[];

  constructor(topicName: ConversationTopic, options: TopicHandlerOptions, logger: Logger) {
    this.topicName = topicName;
    this.options = options;
    this.logger = logger;
    this.supportedStages = options.supportedStages;
    
    // Initialize metrics
    this.metrics = {
      totalMessages: 0,
      successfulHandles: 0,
      averageConfidence: 0,
      escalationRate: 0,
      lastUsed: 0
    };

    this.initializeIntentPatterns();
  }

  /**
   * Abstract method to initialize intent patterns - must be implemented by each handler
   */
  protected abstract initializeIntentPatterns(): void;

  /**
   * Abstract method to handle the message - must be implemented by each handler
   */
  public abstract handle(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult>;

  /**
   * Determine if this handler can handle the given message
   */
  public async canHandle(message: string, state: ConversationState): Promise<boolean> {
    try {
      // Check if current stage is supported
      if (!this.supportedStages.includes(state.currentStage)) {
        return false;
      }

      // Check intent confidence threshold
      const confidence = await this.getIntentConfidence(message, state);
      return confidence > 0.3; // 30% confidence threshold

    } catch (error) {
      this.logger.error(`${this.topicName} handler canHandle check failed`, {
        error: error instanceof Error ? error : new Error('Unknown error'),
        topicName: this.topicName
      });
      return false;
    }
  }

  /**
   * Calculate intent confidence for the message
   */
  public async getIntentConfidence(
    message: string, 
    state: ConversationState
  ): Promise<number> {
    try {
      const normalizedMessage = this.normalizeMessage(message);
      let maxConfidence = 0;

      // Check against intent patterns
      for (const pattern of this.intentPatterns) {
        if (pattern.pattern.test(normalizedMessage)) {
          maxConfidence = Math.max(maxConfidence, pattern.confidence);
        }
      }

      // Check keyword matches
      const keywordConfidence = this.calculateKeywordConfidence(normalizedMessage);
      maxConfidence = Math.max(maxConfidence, keywordConfidence);

      // Context-based confidence adjustments
      const contextConfidence = this.calculateContextualConfidence(normalizedMessage, state);
      maxConfidence = Math.max(maxConfidence, contextConfidence);

      // Update metrics
      this.updateConfidenceMetrics(maxConfidence);

      return maxConfidence;

    } catch (error) {
      this.logger.error(`${this.topicName} confidence calculation failed`, {
        error: error instanceof Error ? error : new Error('Unknown error'),
        topicName: this.topicName
      });
      return 0;
    }
  }

  /**
   * Protected utility methods for subclasses
   */
  protected normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  protected calculateKeywordConfidence(normalizedMessage: string): number {
    if (this.options.keywords.length === 0) {
      return 0;
    }

    const matchedKeywords = this.options.keywords.filter(keyword =>
      normalizedMessage.includes(keyword.toLowerCase())
    );

    // Calculate confidence based on keyword matches
    const matchRatio = matchedKeywords.length / this.options.keywords.length;
    return Math.min(matchRatio * 0.8, 0.8); // Max 80% confidence from keywords
  }

  protected calculateContextualConfidence(
    normalizedMessage: string, 
    state: ConversationState
  ): number {
    let contextConfidence = 0;

    // Boost confidence if user is already in this topic
    if (state.currentTopic === this.topicName) {
      contextConfidence += 0.2;
    }

    // Boost confidence if user has been in this topic recently
    if (state.topics.includes(this.topicName)) {
      contextConfidence += 0.1;
    }

    // Boost confidence based on conversation stage appropriateness
    if (this.isStageAppropriate(state.currentStage)) {
      contextConfidence += 0.15;
    }

    return Math.min(contextConfidence, 0.4); // Max 40% from context
  }

  protected isStageAppropriate(stage: ConversationStage): boolean {
    return this.supportedStages.includes(stage);
  }

  protected createSuccessResponse(
    text: string,
    newState: ConversationState,
    suggestedActions?: string[],
    attachments?: Array<{ contentType: string; content: unknown }>
  ): ConversationFlowResult {
    this.updateSuccessMetrics();
    
    return {
      response: {
        text,
        suggestedActions,
        attachments
      },
      newState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  protected createEscalationResponse(
    text: string,
    newState: ConversationState,
    suggestedActions?: string[]
  ): ConversationFlowResult {
    this.updateEscalationMetrics();
    
    return {
      response: {
        text,
        suggestedActions
      },
      newState,
      escalationTriggered: true,
      conversationEnded: false
    };
  }

  protected createEndConversationResponse(
    text: string,
    newState: ConversationState,
    reason: string
  ): ConversationFlowResult {
    return {
      response: {
        text,
        suggestedActions: ['Start new conversation', 'Get help']
      },
      newState: {
        ...newState,
        currentTopic: 'end_of_conversation',
        currentStage: 'completion',
        completionReason: reason
      },
      escalationTriggered: false,
      conversationEnded: true
    };
  }

  protected validateInput(input: string, schema: z.ZodSchema): { valid: boolean; error?: string } {
    try {
      schema.parse(input);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          valid: false, 
          error: error.errors.map(e => e.message).join(', ')
        };
      }
      return { valid: false, error: 'Invalid input' };
    }
  }

  protected extractKeyInformation(message: string): Record<string, string> {
    const info: Record<string, string> = {};
    
    // Extract common patterns
    const phoneMatch = message.match(/(\+44|0)[\d\s]{10,11}/);
    if (phoneMatch) {
      info.phone = phoneMatch[0].replace(/\s/g, '');
    }

    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      info.email = emailMatch[0];
    }

    // Extract names (basic heuristic)
    const nameMatch = message.match(/(?:my name is|i'm|i am)\s+([a-zA-Z\s]{2,30})/i);
    if (nameMatch) {
      info.name = nameMatch[1].trim();
    }

    return info;
  }

  protected logHandlerActivity(
    message: string,
    action: string,
    success: boolean,
    additionalData?: Record<string, unknown>
  ): void {
    this.logger.info(`${this.topicName} handler activity`, {
      topicName: this.topicName,
      action,
      success,
      messageLength: message.length,
      timestamp: Date.now(),
      ...additionalData
    });
  }

  /**
   * Update metrics
   */
  private updateSuccessMetrics(): void {
    this.metrics.totalMessages++;
    this.metrics.successfulHandles++;
    this.metrics.lastUsed = Date.now();
  }

  private updateEscalationMetrics(): void {
    this.metrics.totalMessages++;
    this.metrics.escalationRate = (this.metrics.escalationRate + 1) / this.metrics.totalMessages;
    this.metrics.lastUsed = Date.now();
  }

  private updateConfidenceMetrics(confidence: number): void {
    const currentTotal = this.metrics.averageConfidence * this.metrics.totalMessages;
    this.metrics.totalMessages++;
    this.metrics.averageConfidence = (currentTotal + confidence) / this.metrics.totalMessages;
  }

  /**
   * Get handler metrics (for monitoring and debugging)
   */
  public getMetrics(): TopicHandlerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset handler metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalMessages: 0,
      successfulHandles: 0,
      averageConfidence: 0,
      escalationRate: 0,
      lastUsed: 0
    };
  }

  /**
   * Get handler information
   */
  public getHandlerInfo(): TopicHandlerOptions & { topicName: ConversationTopic } {
    return {
      ...this.options,
      topicName: this.topicName
    };
  }
}