import { BaseTopicHandler, TopicHandlerOptions } from './BaseTopicHandler';
import { Logger } from '../utils/logger';
import {
  ConversationState,
  ConversationFlowResult
} from '../types/conversation';
import { ConversationFlowContext } from '../services/ConversationFlowEngine';
import { SearchResponse } from '../types';

interface HealthTopicCategory {
  name: string;
  keywords: string[];
  suggestedQuestions: string[];
  priority: number;
}

/**
 * HealthInformationRouterHandler provides trusted health information from The Eve Appeal
 * Integrates with the content service for RAG-based responses with source attribution
 */
export class HealthInformationRouterHandler extends BaseTopicHandler {
  private readonly healthCategories: HealthTopicCategory[];
  private readonly MAX_RESPONSE_TIME_MS = 3000; // 3 seconds for health queries

  constructor(logger: Logger) {
    super(
      'health_information_router',
      {
        name: 'Health Information Router',
        description: 'Provides trusted gynaecological health information from The Eve Appeal',
        keywords: [
          // Cancer types
          'ovarian', 'cervical', 'womb', 'uterine', 'endometrial', 'vulval', 'vaginal',
          // Symptoms
          'symptoms', 'signs', 'warning signs', 'bleeding', 'pain', 'discharge',
          'lump', 'swelling', 'changes', 'period', 'periods', 'irregular',
          // Screening and tests
          'screening', 'smear', 'test', 'examination', 'scan', 'biopsy',
          'mammogram', 'ultrasound', 'colonoscopy',
          // General health information
          'cancer', 'information', 'about', 'what is', 'tell me', 'explain',
          'risk factors', 'causes', 'prevention', 'treatment', 'diagnosis'
        ],
        supportedStages: ['information_gathering', 'topic_detection'],
        requiresConsent: false,
        canEscalate: true,
        priority: 8 // High priority for main use case
      },
      logger
    );

    this.healthCategories = this.initializeHealthCategories();
  }

  protected initializeIntentPatterns(): void {
    this.intentPatterns = [
      // Direct health information requests
      {
        pattern: /(what\s+is|tell\s+me\s+about|information\s+about|explain).*(cancer|tumor|symptom)/i,
        confidence: 0.9,
        description: 'Direct information requests about health topics'
      },
      {
        pattern: /(ovarian|cervical|womb|uterine|vulval|vaginal)\s*(cancer|symptoms|screening)/i,
        confidence: 0.95,
        description: 'Specific gynaecological health topics'
      },
      
      // Symptom-related queries
      {
        pattern: /(symptoms?|signs?|warning\s+signs?)\s+(of|for)/i,
        confidence: 0.8,
        description: 'Symptom information requests'
      },
      {
        pattern: /(bleeding|pain|discharge|lump|swelling)\s+(in|from|near)/i,
        confidence: 0.7,
        description: 'Specific symptom descriptions'
      },
      
      // Screening and prevention
      {
        pattern: /(screening|smear|test|examination)\s+(for|when|how|what)/i,
        confidence: 0.8,
        description: 'Screening and test information'
      },
      {
        pattern: /(prevent|prevention|risk\s+factors|causes)/i,
        confidence: 0.7,
        description: 'Prevention and risk information'
      },

      // General health queries
      {
        pattern: /(should\s+i\s+be\s+worried|is\s+this\s+normal|concerned\s+about)/i,
        confidence: 0.6,
        description: 'General health concerns'
      }
    ];
  }

  public async handle(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const startTime = Date.now();
    
    try {
      this.logHandlerActivity(message, 'health_info_request', true);

      // Update state if transitioning to this topic
      if (state.currentTopic !== 'health_information_router') {
        await context.stateManager.transitionToTopic(
          state.conversationId,
          'health_information_router',
          'information_gathering'
        );
      }

      // Analyze query and search for content
      const healthQuery = this.processHealthQuery(message);
      const searchResponse = await this.searchHealthContent(healthQuery, context);

      // Generate response based on search results
      const response = await this.generateHealthResponse(
        message,
        searchResponse,
        state,
        context
      );

      // Check response time
      const responseTime = Date.now() - startTime;
      if (responseTime > this.MAX_RESPONSE_TIME_MS) {
        this.logger.warn('Health information response exceeded time limit', {
          responseTime,
          limit: this.MAX_RESPONSE_TIME_MS,
          conversationId: state.conversationId
        });
      }

      return response;

    } catch (error) {
      this.logger.error('Health information handler failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        responseTime: Date.now() - startTime
      });

      return this.handleHealthInfoError(message, state, context);
    }
  }

  /**
   * Process and clean the health query for better search results
   */
  private processHealthQuery(message: string): string {
    let query = this.normalizeMessage(message);

    // Remove common filler phrases
    const fillerPhrases = [
      'can you tell me',
      'i want to know',
      'what can you tell me',
      'i\'m wondering',
      'could you explain'
    ];

    fillerPhrases.forEach(phrase => {
      query = query.replace(new RegExp(phrase, 'gi'), '');
    });

    // Extract key health terms
    const healthTerms = this.extractHealthTerms(query);
    
    // If we found specific health terms, prioritize them
    if (healthTerms.length > 0) {
      query = healthTerms.join(' ') + ' ' + query;
    }

    return query.trim();
  }

  /**
   * Extract specific health terms from the query
   */
  private extractHealthTerms(query: string): string[] {
    const terms: string[] = [];
    
    // Cancer types
    const cancerTypes = ['ovarian', 'cervical', 'womb', 'uterine', 'endometrial', 'vulval', 'vaginal'];
    cancerTypes.forEach(type => {
      if (query.includes(type)) {
        terms.push(type + ' cancer');
      }
    });

    // Specific medical terms
    const medicalTerms = [
      'symptoms', 'screening', 'smear test', 'biopsy', 'ultrasound',
      'bleeding', 'discharge', 'pain', 'lump', 'prevention'
    ];
    
    medicalTerms.forEach(term => {
      if (query.includes(term)) {
        terms.push(term);
      }
    });

    return terms;
  }

  /**
   * Search for health content using the content service
   */
  private async searchHealthContent(
    query: string,
    context: ConversationFlowContext
  ): Promise<SearchResponse> {
    try {
      const searchResponse = await context.contentService.searchContent(query);
      
      this.logger.info('Health content search completed', {
        query: query.substring(0, 100),
        found: searchResponse.found,
        relevanceScore: searchResponse.relevanceScore
      });

      return searchResponse;
    } catch (error) {
      this.logger.error('Health content search failed', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        query: query.substring(0, 100)
      });

      return { found: false };
    }
  }

  /**
   * Generate health response based on search results
   */
  private async generateHealthResponse(
    originalMessage: string,
    searchResponse: SearchResponse,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    if (searchResponse.found && searchResponse.content && searchResponse.sourceUrl) {
      return this.createContentBasedResponse(searchResponse, state, context);
    } else {
      return this.createFallbackHealthResponse(originalMessage, state, context);
    }
  }

  /**
   * Create response based on found content
   */
  private async createContentBasedResponse(
    searchResponse: SearchResponse,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    // Enhanced content with disclaimer
    const responseContent = `${searchResponse.content}

**Important:** This is general health information from The Eve Appeal. Always consult your healthcare provider for personalized medical advice about your specific situation.`;

    // Create attachment with source link
    const attachments = [{
      contentType: 'application/vnd.microsoft.card.hero',
      content: {
        title: 'Information Source',
        subtitle: searchResponse.source || 'The Eve Appeal',
        text: `Relevance: ${Math.round((searchResponse.relevanceScore || 0) * 100)}%`,
        buttons: [{
          type: 'openUrl',
          title: '📖 Read Full Information',
          value: searchResponse.sourceUrl
        }]
      }
    }];

    // Suggest related topics
    const suggestedActions = this.generateRelatedSuggestions(searchResponse);

    const updatedState = await context.stateManager.getCurrentState(state.conversationId);

    return this.createSuccessResponse(
      responseContent,
      updatedState!,
      suggestedActions,
      attachments
    );
  }

  /**
   * Create fallback response when no content found
   */
  private async createFallbackHealthResponse(
    originalMessage: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    // Suggest related categories based on message analysis
    const suggestedCategory = this.suggestHealthCategory(originalMessage);
    
    let responseText = "I don't have specific information about that topic in my current knowledge base. ";
    
    if (suggestedCategory) {
      responseText += `However, I can help you with information about ${suggestedCategory.name.toLowerCase()}. `;
    }

    responseText += `

For personalized health advice, I'd recommend:
• Speaking to your GP or healthcare provider
• Contacting The Eve Appeal Ask Eve service: 0808 802 0019
• Visiting The Eve Appeal website for comprehensive information

Would you like me to connect you with one of our specialist nurses, or would you prefer to explore other health topics?`;

    const suggestedActions = suggestedCategory 
      ? suggestedCategory.suggestedQuestions.slice(0, 4)
      : [
          'Ovarian cancer symptoms',
          'Cervical screening info',
          'Speak to a nurse',
          'General health questions'
        ];

    suggestedActions.push('Speak to a nurse');

    const updatedState = await context.stateManager.getCurrentState(state.conversationId);

    return this.createSuccessResponse(
      responseText,
      updatedState!,
      suggestedActions
    );
  }

  /**
   * Handle health information errors
   */
  private async handleHealthInfoError(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    
    const errorResponse = `I apologize, but I'm experiencing technical difficulties accessing health information right now.

For reliable health information, please:
• Contact your GP or healthcare provider directly
• Call The Eve Appeal Ask Eve service: 0808 802 0019
• Visit The Eve Appeal website: https://eveappeal.org.uk
• Call NHS 111 for non-emergency health guidance

Would you like me to connect you with one of our specialist nurses instead?`;

    return this.createSuccessResponse(
      errorResponse,
      state,
      [
        'Speak to a nurse',
        'Try question again',
        'Contact GP',
        'Visit Eve Appeal website'
      ]
    );
  }

  /**
   * Generate related topic suggestions
   */
  private generateRelatedSuggestions(searchResponse: SearchResponse): string[] {
    const suggestions: string[] = [];
    
    // Base suggestions on content metadata
    const contentType = searchResponse.metadata?.contentType;
    const categories = searchResponse.metadata?.medicalCategories || [];

    if (categories.includes('ovarian_cancer')) {
      suggestions.push('Ovarian cancer screening');
    }
    if (categories.includes('cervical_cancer')) {
      suggestions.push('Cervical screening process');
    }
    if (categories.includes('symptoms')) {
      suggestions.push('When to see a GP');
    }

    // Add generic helpful options
    suggestions.push('Speak to a nurse');
    suggestions.push('Prevention advice');

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Suggest health category based on message
   */
  private suggestHealthCategory(message: string): HealthTopicCategory | null {
    const normalizedMessage = this.normalizeMessage(message);
    
    for (const category of this.healthCategories) {
      for (const keyword of category.keywords) {
        if (normalizedMessage.includes(keyword)) {
          return category;
        }
      }
    }

    return null;
  }

  /**
   * Initialize health topic categories
   */
  private initializeHealthCategories(): HealthTopicCategory[] {
    return [
      {
        name: 'Ovarian Cancer',
        keywords: ['ovarian', 'ovaries', 'ovary'],
        suggestedQuestions: [
          'Ovarian cancer symptoms',
          'Ovarian cancer screening',
          'Ovarian cancer risk factors',
          'Family history and ovarian cancer'
        ],
        priority: 10
      },
      {
        name: 'Cervical Health',
        keywords: ['cervical', 'cervix', 'smear'],
        suggestedQuestions: [
          'Cervical screening process',
          'Abnormal smear results',
          'HPV and cervical cancer',
          'Cervical cancer symptoms'
        ],
        priority: 10
      },
      {
        name: 'Womb Cancer',
        keywords: ['womb', 'uterine', 'endometrial', 'uterus'],
        suggestedQuestions: [
          'Womb cancer symptoms',
          'Abnormal bleeding',
          'Endometrial cancer risk',
          'Post-menopausal bleeding'
        ],
        priority: 9
      },
      {
        name: 'Vulval and Vaginal Health',
        keywords: ['vulval', 'vaginal', 'vulva', 'vagina'],
        suggestedQuestions: [
          'Vulval cancer symptoms',
          'Vaginal discharge changes',
          'Vulval itching concerns',
          'Vaginal bleeding between periods'
        ],
        priority: 8
      },
      {
        name: 'General Symptoms',
        keywords: ['symptoms', 'signs', 'bleeding', 'pain', 'discharge'],
        suggestedQuestions: [
          'Warning signs to watch for',
          'When to see your GP',
          'Abnormal bleeding patterns',
          'Persistent symptoms'
        ],
        priority: 7
      },
      {
        name: 'Screening and Prevention',
        keywords: ['screening', 'prevention', 'test', 'examination'],
        suggestedQuestions: [
          'Cancer screening guidelines',
          'How to reduce your risk',
          'Screening programme details',
          'Preventive measures'
        ],
        priority: 6
      }
    ];
  }

  /**
   * Override confidence calculation for health topics
   */
  public async getIntentConfidence(
    message: string,
    state: ConversationState
  ): Promise<number> {
    const baseConfidence = await super.getIntentConfidence(message, state);
    
    // Boost confidence if we're already in health information topic
    if (state.currentTopic === 'health_information_router') {
      return Math.min(baseConfidence + 0.2, 1.0);
    }

    return baseConfidence;
  }
}