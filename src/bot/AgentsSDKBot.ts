import { ActivityHandler, MessageFactory, TurnContext, AgentApplication, TurnState } from '@microsoft/agents-hosting';
import { OpenAI } from 'openai';
import { 
  MessageContext, 
  AgentResponse, 
  AgentOptions, 
  SafetyResult, 
  SearchResponse, 
  BotDisclosure 
} from '../types';
import { SearchResponse as ContentSearchResponse } from '../types/content';
import { ConversationFlowEngine } from '../services/ConversationFlowEngine';
import { ConversationStateManager } from '../services/ConversationStateManager';
import { ConversationState, ConversationFlowResult } from '../types/conversation';
import { Logger } from '../utils/logger';
import { EnhancedGDPRService } from '../services/EnhancedGDPRService';
import { DataRetentionService } from '../services/DataRetentionService';
import { UserConsentService } from '../services/UserConsentService';

export class AgentsSDKBot extends ActivityHandler {
  private readonly options: AgentOptions;
  private readonly botDisclosure: BotDisclosure;
  private readonly agentApplication: AgentApplication<TurnState>;
  private readonly openai: OpenAI;
  private readonly temperature = 0.1; // Low temperature for health information accuracy
  private readonly modelName = 'gpt-4o-mini';
  private readonly conversationHistory: Map<string, Array<{text: string; isUser: boolean; timestamp: Date}>> = new Map();
  
  // New conversation flow components
  private readonly conversationFlowEngine: ConversationFlowEngine;
  private readonly stateManager: ConversationStateManager;
  private readonly logger: Logger;
  private readonly gdprService: EnhancedGDPRService;

  constructor(options: AgentOptions, logger?: Logger) {
    super();
    this.options = options;
    this.logger = logger || new Logger('agents-sdk-bot');
    
    this.botDisclosure = {
      text: "Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal.",
      followUp: "How can I help you today?",
      suggestedActions: [
        "Ovarian cancer symptoms",
        "Cervical screening info", 
        "Support services",
        "Speak to a nurse"
      ]
    };

    // Initialize OpenAI client with proper error handling
    this.openai = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'] || 'test-api-key-for-testing'
    });

    // Initialize conversation flow components
    this.stateManager = new ConversationStateManager();
    
    // Initialize GDPR service with dependencies
    const dataRetentionService = new DataRetentionService(this.logger);
    const userConsentService = new UserConsentService(this.logger);
    this.gdprService = new EnhancedGDPRService(this.logger, dataRetentionService, userConsentService);
    
    // Initialize conversation flow engine
    this.conversationFlowEngine = new ConversationFlowEngine(
      this.logger,
      this.stateManager,
      this.gdprService,
      options.contentService
    );

    // Initialize AgentApplication
    this.agentApplication = new AgentApplication<TurnState>();
    
    // Set up message handlers
    this.setupMessageHandlers();
  }

  /**
   * Initialize the bot with conversation flow setup
   */
  async initialize(): Promise<void> {
    try {
      await this.conversationFlowEngine.initialize();
      this.logger.info('AgentsSDKBot with ConversationFlowEngine initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AgentsSDKBot with ConversationFlowEngine', {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
      throw error;
    }
  }

  // Public methods for testing
  public getTemperature(): number {
    return this.temperature;
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getAgentApplication(): AgentApplication<TurnState> {
    return this.agentApplication;
  }

  private setupMessageHandlers(): void {
    // Set up the message handler using the AgentApplication pattern
    // Handle all messages by using a catch-all selector
    this.agentApplication.onMessage(/.*/i, async (context: TurnContext, _state: TurnState) => {
      await this.handleMessage(context);
    });
  }

  public async handleMessage(context: TurnContext): Promise<void> {
    try {
      // Convert TurnContext to ConversationState and context
      const conversationId = context.activity.conversation?.id || 'default';
      const userId = context.activity.from?.id || 'anonymous';
      const userMessage = context.activity.text || '';
      
      this.logger.info('Processing message with ConversationFlowEngine', {
        conversationId: conversationId.substring(0, 8) + '***',
        userId: userId.substring(0, 8) + '***',
        messageLength: userMessage.length
      });
      
      // Update conversation history with the user's message
      this.updateConversationHistory(context, userMessage, true);
      
      // Get or create conversation state
      const conversationState = await this.getOrCreateConversationState(conversationId, userId, userMessage);
      
      // Create conversation flow context
      const flowContext = {
        stateManager: this.stateManager,
        gdprService: this.gdprService,
        contentService: this.options.contentService,
        sendResponse: async (response: ConversationFlowResult) => {
          await this.sendFlowResponse(context, response);
        }
      };
      
      // Process message through conversation flow engine
      const flowResult = await this.conversationFlowEngine.processMessage(
        userMessage,
        conversationState,
        flowContext
      );
      
      // Send the response
      await this.sendFlowResponse(context, flowResult);
      
    } catch (error) {
      this.logger.error('Message handling failed in ConversationFlowEngine', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: context.activity.conversation?.id
      });
      await this.handleError(context, error);
    }
  }

  private async createMessageContext(context: TurnContext): Promise<MessageContext> {
    // Get conversation history from state
    const conversationHistory = await this.getConversationHistory(context);
    
    return {
      message: {
        text: context.activity.text || '',
        id: context.activity.id || `msg_${Date.now()}`
      },
      conversationId: context.activity.conversation?.id || 'default',
      userId: context.activity.from?.id || 'anonymous',
      conversationHistory,
      send: async (response: AgentResponse) => {
        const activity = MessageFactory.text(response.text);
        
        // Add attachments if present
        if (response.attachments && response.attachments.length > 0) {
          activity.attachments = response.attachments;
        }

        // Add suggested actions if present
        if (response.suggestedActions && response.suggestedActions.length > 0) {
          activity.suggestedActions = {
            actions: response.suggestedActions.map(action => ({
              type: 'imBack',
              title: action,
              value: action
            })),
            to: []
          };
        }

        await context.sendActivity(activity);
      },
      sendTyping: async () => {
        await context.sendActivity(MessageFactory.text(''));
      }
      // turnContext: context // Removed due to type compatibility issues
    };
  }

  private async getConversationHistory(context: TurnContext): Promise<Array<{
    text: string;
    isUser: boolean;
    timestamp: Date;
  }>> {
    // Get conversation history from our Map-based storage
    const conversationId = context.activity.conversation?.id || 'default';
    return this.conversationHistory.get(conversationId) || [];
  }

  private updateConversationHistory(context: TurnContext, text: string, isUser: boolean): void {
    const conversationId = context.activity.conversation?.id || 'default';
    const history = this.conversationHistory.get(conversationId) || [];
    history.push({
      text,
      isUser,
      timestamp: new Date()
    });
    this.conversationHistory.set(conversationId, history);
  }

  /**
   * Get or create conversation state for flow engine
   */
  private async getOrCreateConversationState(
    conversationId: string,
    userId: string,
    userMessage: string
  ): Promise<ConversationState> {
    
    // Try to get existing state
    const existingState = this.stateManager.getCurrentState(conversationId);
    if (existingState) {
      return existingState;
    }
    
    // Create new conversation state
    const newState: ConversationState = {
      conversationId,
      userId,
      sessionId: `session-${Date.now()}`,
      currentTopic: 'conversation_start', // This will trigger the opening statement
      currentStage: 'greeting',
      context: {
        isFirstMessage: true,
        messageCount: 1,
        lastActivity: Date.now()
      },
      metadata: {
        startTime: new Date().toISOString(),
        platform: 'agents-sdk',
        version: '1.0.0'
      }
    };
    
    // Initialize state in manager
    await this.stateManager.updateState(conversationId, newState);
    
    return newState;
  }
  
  /**
   * Send conversation flow result as bot response
   */
  private async sendFlowResponse(context: TurnContext, flowResult: ConversationFlowResult): Promise<void> {
    try {
      const activity = MessageFactory.text(flowResult.response.text);
      
      // Add suggested actions if present
      if (flowResult.response.suggestedActions && flowResult.response.suggestedActions.length > 0) {
        activity.suggestedActions = {
          actions: flowResult.response.suggestedActions.map(action => ({
            type: 'imBack',
            title: action,
            value: action
          })),
          to: []
        };
      }
      
      await context.sendActivity(activity);
      
      // Update conversation history with bot response
      this.updateConversationHistory(context, flowResult.response.text, false);
      
      this.logger.info('Conversation flow response sent', {
        conversationId: context.activity.conversation?.id?.substring(0, 8) + '***',
        escalationTriggered: flowResult.escalationTriggered,
        conversationEnded: flowResult.conversationEnded,
        responseLength: flowResult.response.text.length
      });
      
    } catch (error) {
      this.logger.error('Failed to send conversation flow response', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: context.activity.conversation?.id
      });
      throw error;
    }
  }

  private async handleEscalation(context: TurnContext, safetyResult: SafetyResult): Promise<void> {
    let escalationResponse: AgentResponse;

    switch (safetyResult.escalationType) {
      case 'self_harm':
        escalationResponse = {
          text: "I'm concerned about what you've shared. If you're having thoughts of self-harm, please reach out for urgent support:\n\n• Samaritans: 116 123 (free, 24/7)\n• Text SHOUT to 85258\n• Emergency services: 999\n\nYour safety and wellbeing matter. Please speak to someone who can help.",
          suggestedActions: ["Call Samaritans", "Emergency Services", "Text SHOUT"]
        };
        break;

      case 'medical_emergency':
        escalationResponse = {
          text: "This sounds like it may need urgent medical attention. Please:\n\n• Call 999 for emergency services\n• Contact your GP urgently\n• Visit A&E if symptoms are severe\n\nI can provide general health information, but I cannot assess medical emergencies. Please seek immediate medical help.",
          suggestedActions: ["Call 999", "Contact GP", "Find A&E"]
        };
        break;

      default:
        escalationResponse = {
          text: "I need to direct you to speak with a healthcare professional about this. Please contact:\n\n• Your GP\n• The Eve Appeal Nurse Line\n• NHS 111 for non-emergency health advice\n\nI'm here to provide general information, but this needs professional guidance.",
          suggestedActions: ["Contact GP", "Eve Appeal Nurses", "Call NHS 111"]
        };
    }

    const activity = MessageFactory.text(escalationResponse.text);
    if (escalationResponse.suggestedActions) {
      activity.suggestedActions = {
        actions: escalationResponse.suggestedActions.map(action => ({
          type: 'imBack',
          title: action,
          value: action
        })),
        to: []
      };
    }

    await context.sendActivity(activity);
  }

  /**
   * Legacy method maintained for backward compatibility
   */
  private async handleNormalQuery(context: TurnContext, messageContext: MessageContext): Promise<void> {
    // This method is now handled by the ConversationFlowEngine
    // But we keep it for any legacy code that might call it directly
    
    this.logger.warn('handleNormalQuery called directly - this should go through ConversationFlowEngine', {
      conversationId: context.activity.conversation?.id
    });
    
    // Fallback to basic response
    const response: AgentResponse = {
      text: "I'm now using an improved conversation system. Please try your message again.",
      suggestedActions: [
        "Ovarian cancer symptoms",
        "Cervical screening info", 
        "Support services",
        "Speak to a nurse"
      ]
    };
    
    await this.sendResponse(context, response);
  }

  private isGreeting(text: string): boolean {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const lowerText = text.toLowerCase().trim();
    return greetings.some(greeting => lowerText.includes(greeting)) && text.length < 50;
  }

  private async sendBotDisclosure(context: TurnContext): Promise<void> {
    const response: AgentResponse = {
      text: `${this.botDisclosure.text}\n\n${this.botDisclosure.followUp}`,
      suggestedActions: this.botDisclosure.suggestedActions
    };
    
    await this.sendResponse(context, response);
  }

  private async handleNoContentFound(context: TurnContext): Promise<void> {
    const response: AgentResponse = {
      text: "I don't have specific information about that topic in my knowledge base. For personalized health advice, I'd recommend:\n\n• Speaking to your GP\n• Contacting The Eve Appeal nurse line\n• Calling NHS 111 for health guidance\n\nIs there something else about gynaecological health I can help you find information about?",
      suggestedActions: [
        "Ovarian cancer symptoms",
        "Cervical screening",
        "Contact a nurse",
        "Common conditions"
      ]
    };

    await this.sendResponse(context, response);
  }

  private async handleMissingSourceUrl(context: TurnContext, _searchResponse: SearchResponse): Promise<void> {
    const response: AgentResponse = {
      text: "I found some information about your question, but I'm unable to provide it without a proper source reference. This is to ensure you only receive information from trusted, verified sources.\n\nPlease try rephrasing your question, or contact The Eve Appeal directly for reliable health information.",
      suggestedActions: [
        "Try different keywords",
        "Contact Eve Appeal",
        "Speak to a nurse"
      ]
    };

    await this.sendResponse(context, response);
  }


  /**
   * Get conversation flow engine for testing and integration
   */
  public getConversationFlowEngine(): ConversationFlowEngine {
    return this.conversationFlowEngine;
  }
  
  /**
   * Get state manager for testing and integration
   */
  public getStateManager(): ConversationStateManager {
    return this.stateManager;
  }
  
  /**
   * Get GDPR service for testing and integration
   */
  public getGDPRService(): EnhancedGDPRService {
    return this.gdprService;
  }

  /**
   * RAG Implementation: Build final response with AI-generated content and source attribution
   * (Legacy method - now handled by ConversationFlowEngine handlers)
   */
  private buildRAGResponse(searchResponse: ContentSearchResponse, aiResponse: string): AgentResponse {
    if (!searchResponse.sourceUrl) {
      throw new Error('Invalid search response: missing source URL');
    }

    return {
      text: aiResponse,
      attachments: [{
        contentType: 'application/vnd.microsoft.card.hero',
        content: {
          title: 'Information Source',
          subtitle: searchResponse.source || 'The Eve Appeal',
          buttons: [{
            type: 'openUrl',
            title: '📖 Read Full Information',
            value: searchResponse.sourceUrl
          }]
        }
      }],
      // Inline citation with AI response
      markdown: `${aiResponse}\n\n*Source: [${searchResponse.source || 'The Eve Appeal'}](${searchResponse.sourceUrl})*`
    };
  }

  private async sendResponse(context: TurnContext, response: AgentResponse): Promise<void> {
    const activity = MessageFactory.text(response.text);
    
    // Add attachments if present
    if (response.attachments && response.attachments.length > 0) {
      activity.attachments = response.attachments;
    }

    // Add suggested actions if present
    if (response.suggestedActions && response.suggestedActions.length > 0) {
      activity.suggestedActions = {
        actions: response.suggestedActions.map(action => ({
          type: 'imBack',
          title: action,
          value: action
        })),
        to: []
      };
    }

    await context.sendActivity(activity);
    
    // Update conversation history with bot response
    this.updateConversationHistory(context, response.text, false);
  }

  private async handleError(context: TurnContext, error: unknown): Promise<void> {
    console.error('AgentsSDKBot error:', error);
    
    const response: AgentResponse = {
      text: "I'm sorry, I'm experiencing technical difficulties at the moment. Please try again in a few moments.\n\nIf you need immediate health information, please:\n• Contact your GP\n• Call NHS 111\n• Visit The Eve Appeal website directly",
      suggestedActions: [
        "Try again",
        "Contact GP", 
        "Visit Eve Appeal"
      ]
    };

    await this.sendResponse(context, response);
  }

  /**
   * RAG Implementation: Clean and prepare user queries for search
   * (Legacy method - now handled by ConversationFlowEngine handlers)
   */
  private cleanQuery(rawQuery: string): string {
    // Remove common filler words and normalize
    const fillerWords = ['um', 'uh', 'you know', 'like', 'can you', 'please', 'tell me about', 'what about'];
    let cleanedQuery = rawQuery.toLowerCase().trim();

    // Replace filler words
    fillerWords.forEach(filler => {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      cleanedQuery = cleanedQuery.replace(regex, '');
    });

    // Clean up extra spaces and punctuation
    cleanedQuery = cleanedQuery
      .replace(/[.]{3,}/g, '') // Remove excessive dots
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/^\W+|\W+$/g, '') // Remove leading/trailing non-word chars
      .trim();

    return cleanedQuery || rawQuery; // Fallback to original if cleaning removes everything
  }

  /**
   * RAG Implementation: Build context for OpenAI using retrieved content and sources
   * (Legacy method - now handled by ConversationFlowEngine handlers)
   */
  private buildRAGContext(searchResponse: ContentSearchResponse, userQuery: string): string {
    if (!searchResponse.found || !searchResponse.content || !searchResponse.sourceUrl) {
      return '';
    }

    return `Context: The user asked "${userQuery}". Here is relevant information from The Eve Appeal:

Content: ${searchResponse.content}

Source: ${searchResponse.source || 'The Eve Appeal'}  
Source URL: ${searchResponse.sourceUrl}
${searchResponse.title ? `Title: ${searchResponse.title}` : ''}

IMPORTANT: You must base your response ONLY on this provided content. Always include the source URL in your response. Do not generate medical advice beyond what is provided in the source material.`;
  }

  /**
   * RAG Implementation: Generate response using OpenAI with RAG context and source enforcement
   * (Legacy method - now handled by ConversationFlowEngine handlers)
   */
  private async generateOpenAIResponse(ragContext: string, userQuery: string): Promise<string> {
    try {
      const systemPrompt = `You are Ask Eve Assist, a helpful assistant providing gynaecological health information from The Eve Appeal. 

CRITICAL RULES:
1. ONLY use information provided in the context
2. ALWAYS include source URLs in your responses
3. NEVER generate medical advice beyond the provided content
4. If asked about symptoms, always recommend consulting a healthcare professional
5. Be empathetic but maintain professional boundaries
6. Keep responses concise and accessible

Format your response to include the source URL at the end like: "Source: [URL]"`;

      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        temperature: this.temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${ragContext}\n\nUser Question: ${userQuery}` }
        ],
        max_tokens: 500 // Keep responses concise
      });

      return response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response at this time.';

    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate AI response');
    }
  }
}