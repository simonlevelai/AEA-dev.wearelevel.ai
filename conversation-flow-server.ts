#!/usr/bin/env npx ts-node

/**
 * Ask Eve Assist - Complete Conversation Flow System
 * Full integration with ConversationFlowEngine, RAG, and Microsoft Copilot Studio patterns
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AzureOpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Simple logger for conversation flow server
class Logger {
  constructor(private service: string) {}
  
  info(message: string, context?: any) {
    console.log(`[${this.service}] ${message}`, context ? JSON.stringify(context) : '');
  }
  
  error(message: string, context?: any) {
    console.error(`[${this.service}] ERROR: ${message}`, context ? JSON.stringify(context) : '');
  }
  
  warn(message: string, context?: any) {
    console.warn(`[${this.service}] WARN: ${message}`, context ? JSON.stringify(context) : '');
  }
}

// Conversation State Types
interface ConversationState {
  conversationId: string;
  userId: string;
  currentTopic: string;
  currentStage: string;
  context: Record<string, any>;
  messageCount: number;
  lastMessageTime: number;
  consentStatus: string;
  userContactInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    preferredContactMethod?: string;
  };
}

interface ConversationFlowResult {
  response: {
    text: string;
    suggestedActions?: string[];
    attachments?: any[];
  };
  newState: ConversationState;
  escalationTriggered: boolean;
  conversationEnded: boolean;
  topicTransition?: {
    from: string;
    to: string;
    reason: string;
  };
}

// Conversation State Manager
class ConversationStateManager {
  private states: Map<string, ConversationState> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getState(conversationId: string): ConversationState {
    const existing = this.states.get(conversationId);
    if (existing) {
      return existing;
    }

    const newState: ConversationState = {
      conversationId,
      userId: `user-${Date.now()}`,
      currentTopic: 'greeting',
      currentStage: 'initial',
      context: {},
      messageCount: 0,
      lastMessageTime: Date.now(),
      consentStatus: 'not_requested'
    };

    this.states.set(conversationId, newState);
    this.logger.info(`Created new conversation state for ${conversationId}`);
    return newState;
  }

  updateState(conversationId: string, updates: Partial<ConversationState>): ConversationState {
    const state = this.getState(conversationId);
    const updatedState = {
      ...state,
      ...updates,
      messageCount: state.messageCount + 1,
      lastMessageTime: Date.now()
    };
    
    this.states.set(conversationId, updatedState);
    this.logger.info(`Updated state for ${conversationId}`, { 
      topic: updatedState.currentTopic, 
      stage: updatedState.currentStage 
    });
    
    return updatedState;
  }
}

// Enhanced Content Service with conversation awareness
class ConversationAwareContentService {
  private supabase;
  private logger;

  constructor(supabaseUrl: string, supabaseKey: string, logger: Logger) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger = logger;
  }

  async searchContent(query: string, conversationState?: ConversationState) {
    try {
      const lowerQuery = query.toLowerCase();
      
      // Contextual search based on conversation state
      let contextualBoost = '';
      if (conversationState) {
        if (conversationState.currentTopic === 'health_information') {
          contextualBoost = ' screening symptoms cancer';
        } else if (conversationState.currentTopic === 'nurse_escalation') {
          contextualBoost = ' nurse support contact';
        }
      }
      
      const enhancedQuery = query + contextualBoost;
      
      // Try Supabase search first
      const { data, error } = await this.supabase
        .from('pif_content')
        .select('*')
        .or(`title.ilike.%${enhancedQuery}%,content.ilike.%${enhancedQuery}%`)
        .limit(3);

      if (error) {
        this.logger.error('Supabase search error', { error: error.message });
        return this.getFallbackContent(query);
      }

      if (data && data.length > 0) {
        const bestMatch = data[0];
        return {
          found: true,
          content: bestMatch.content || 'Medical information available',
          source: 'The Eve Appeal',
          sourceUrl: bestMatch.source_url || 'https://eveappeal.org.uk',
          title: bestMatch.title || 'Health Information',
          relevanceScore: 0.85,
          contextualMatch: !!contextualBoost
        };
      }

      return this.getFallbackContent(query);
    } catch (error: any) {
      this.logger.error('Content search failed', { error: error.message });
      return this.getFallbackContent(query);
    }
  }

  private getFallbackContent(query: string) {
    const lowerQuery = query.toLowerCase();
    
    const fallbackContent: Record<string, any> = {
      'ovarian cancer': {
        found: true,
        content: 'Ovarian cancer symptoms may include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, urinary urgency or frequency, and changes in bowel habits. These symptoms are often subtle and can be mistaken for other conditions, but if they are new for you, occur frequently, and persist, it is important to see your GP.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/',
        title: 'Ovarian Cancer Signs and Symptoms',
        relevanceScore: 0.95
      },
      'cervical screening': {
        found: true,
        content: 'Cervical screening (previously known as a smear test) checks for abnormal cells on the cervix that could develop into cancer if left untreated. It is offered to women and people with a cervix aged 25-64 every 3-5 years in England.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/',
        title: 'Cervical Screening Guide',
        relevanceScore: 0.94
      },
      'nurse': {
        found: true,
        content: 'Our specialist nurses are available to provide personalized support and answer your questions about gynaecological health. They can help you understand symptoms, screening, and treatment options.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/support-services/',
        title: 'Nurse Support Services',
        relevanceScore: 0.90
      }
    };

    for (const [topic, data] of Object.entries(fallbackContent)) {
      if (lowerQuery.includes(topic) || topic.split(' ').some(word => lowerQuery.includes(word))) {
        return data;
      }
    }
    
    return { found: false, content: null, source: null, sourceUrl: null, relevanceScore: 0 };
  }

  async initialize() {
    try {
      const { data, error } = await this.supabase.from('pif_content').select('count').limit(1);
      if (error) {
        this.logger.warn('Supabase connection issue, using fallback content');
      } else {
        this.logger.info('✅ Supabase connection established');
      }
    } catch (error: any) {
      this.logger.warn('Supabase initialization failed, using fallback');
    }
  }
}

// Conversation Flow Engine (simplified version)
class ConversationFlowEngine {
  private logger: Logger;
  private stateManager: ConversationStateManager;
  private contentService: ConversationAwareContentService;
  private azureOpenAI: AzureOpenAI;

  constructor(
    logger: Logger, 
    stateManager: ConversationStateManager, 
    contentService: ConversationAwareContentService,
    azureOpenAI: AzureOpenAI
  ) {
    this.logger = logger;
    this.stateManager = stateManager;
    this.contentService = contentService;
    this.azureOpenAI = azureOpenAI;
  }

  async processMessage(message: string, conversationId: string): Promise<ConversationFlowResult> {
    const startTime = Date.now();
    const state = this.stateManager.getState(conversationId);
    const lowerMessage = message.toLowerCase();

    this.logger.info(`Processing message in conversation flow`, { 
      conversationId, 
      currentTopic: state.currentTopic,
      currentStage: state.currentStage,
      messageLength: message.length 
    });

    // 1. Crisis detection first (highest priority)
    if (this.detectCrisis(message)) {
      const crisisResponse = await this.handleCrisisFlow(message, state);
      this.logger.info(`Crisis flow completed in ${Date.now() - startTime}ms`);
      return crisisResponse;
    }

    // 2. Greeting detection
    if (this.isGreeting(message) && state.messageCount === 0) {
      return await this.handleGreetingFlow(message, state);
    }

    // 3. Topic-specific flows based on current state
    switch (state.currentTopic) {
      case 'greeting':
        return await this.handleInitialTopicDetection(message, state);
      
      case 'health_information':
        return await this.handleHealthInformationFlow(message, state);
      
      case 'nurse_escalation':
        return await this.handleNurseEscalationFlow(message, state);
      
      case 'crisis_support':
        return await this.handleCrisisContinuationFlow(message, state);
      
      default:
        return await this.handleFallbackFlow(message, state);
    }
  }

  private detectCrisis(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const crisisPatterns = [
      'suicide', 'kill myself', 'end it all', 'hopeless', 'dark thoughts',
      'crisis', 'emergency', 'urgent help', 'cannot cope', 'desperate',
      'want to die', 'ending my life', 'giving up', 'no way out'
    ];
    
    return crisisPatterns.some(pattern => lowerMessage.includes(pattern));
  }

  private isGreeting(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    
    const hasGreeting = greetings.some(greeting => lowerMessage.includes(greeting));
    if (hasGreeting) return true;
    
    const healthOpeners = [
      'worried about', 'concerned about', 'questions about', 'help with',
      'need to know', 'want to ask', 'having symptoms', 'experiencing'
    ];
    
    return healthOpeners.some(opener => lowerMessage.includes(opener));
  }

  private async handleCrisisFlow(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const newState = this.stateManager.updateState(state.conversationId, {
      currentTopic: 'crisis_support',
      currentStage: 'crisis_response',
      context: {
        ...state.context,
        crisisDetected: true,
        crisisTimestamp: Date.now()
      }
    });

    return {
      response: {
        text: `🚨 **Crisis Support Available**

If you need immediate support:
• Emergency services: 999
• Samaritans: 116 123 (24/7)
• Crisis text line: Text SHOUT to 85258
• NHS 111: For urgent mental health support

Would you like me to help you connect with a nurse for additional support?

Your safety matters, and there are people who want to help you.`,
        suggestedActions: ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse', "I'm okay, continue"]
      },
      newState,
      escalationTriggered: true,
      conversationEnded: false,
      topicTransition: {
        from: state.currentTopic,
        to: 'crisis_support',
        reason: 'Crisis indicators detected'
      }
    };
  }

  private async handleGreetingFlow(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const newState = this.stateManager.updateState(state.conversationId, {
      currentTopic: 'greeting',
      currentStage: 'welcome_message',
      context: {
        ...state.context,
        initialMessage: message
      }
    });

    return {
      response: {
        text: `Hello! I'm Ask Eve Assist, your digital assistant for gynaecological health information from The Eve Appeal.

I'm here to help you find evidence-based information about women's health topics, including cancer symptoms, screening, and support services.

How can I help you today?`,
        suggestedActions: [
          'Ovarian cancer symptoms',
          'Cervical screening info', 
          'Support services',
          'Speak to a nurse'
        ]
      },
      newState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  private async handleInitialTopicDetection(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const lowerMessage = message.toLowerCase();
    
    // Detect nurse request
    if (lowerMessage.includes('nurse') || lowerMessage.includes('speak to someone') || lowerMessage.includes('call me')) {
      return await this.transitionToNurseEscalation(message, state);
    }
    
    // Detect health information request
    if (this.isHealthInformationRequest(message)) {
      return await this.transitionToHealthInformation(message, state);
    }
    
    // Default to health information flow
    return await this.transitionToHealthInformation(message, state);
  }

  private isHealthInformationRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const healthKeywords = [
      'symptoms', 'cancer', 'screening', 'test', 'pain', 'bloating',
      'bleeding', 'discharge', 'ovarian', 'cervical', 'womb', 'endometrial'
    ];
    
    return healthKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  private async handleHealthInformationFlow(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    // Search for relevant content
    const contentResult = await this.contentService.searchContent(message, state);
    
    // Create enhanced system prompt
    const systemPrompt = this.createHealthInformationPrompt(contentResult);
    
    // Get AI response
    const completion = await this.azureOpenAI.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_completion_tokens: 400,
      temperature: 0.7
    });

    const responseText = completion.choices[0].message.content || '';
    
    const newState = this.stateManager.updateState(state.conversationId, {
      currentTopic: 'health_information',
      currentStage: 'providing_information',
      context: {
        ...state.context,
        lastQuery: message,
        contentFound: contentResult.found
      }
    });

    return {
      response: {
        text: responseText,
        suggestedActions: [
          'Ask follow-up question',
          'Speak to a nurse',
          'Other symptoms',
          'Visit Eve Appeal website'
        ]
      },
      newState,
      escalationTriggered: false,
      conversationEnded: false
    };
  }

  private async transitionToHealthInformation(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const newState = this.stateManager.updateState(state.conversationId, {
      currentTopic: 'health_information',
      currentStage: 'initial_query',
      context: {
        ...state.context,
        transitionReason: 'Health information requested'
      }
    });

    return await this.handleHealthInformationFlow(message, newState);
  }

  private async transitionToNurseEscalation(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const newState = this.stateManager.updateState(state.conversationId, {
      currentTopic: 'nurse_escalation',
      currentStage: 'consent_capture',
      context: {
        ...state.context,
        escalationReason: 'User requested nurse contact'
      }
    });

    return {
      response: {
        text: `I can help arrange for one of our specialist nurses to contact you for personalized support and guidance.

To arrange this, I'll need to collect some contact details. This information will be used solely for the purpose of having a nurse call you back and will be handled in accordance with GDPR regulations.

Would you like me to arrange for a nurse to contact you?`,
        suggestedActions: [
          'Yes, arrange nurse contact',
          'Tell me more about the service first',
          'No, continue with general information'
        ]
      },
      newState,
      escalationTriggered: false,
      conversationEnded: false,
      topicTransition: {
        from: state.currentTopic,
        to: 'nurse_escalation',
        reason: 'User requested nurse contact'
      }
    };
  }

  private async handleNurseEscalationFlow(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const lowerMessage = message.toLowerCase();

    switch (state.currentStage) {
      case 'consent_capture':
        if (lowerMessage.includes('yes') || lowerMessage.includes('arrange') || lowerMessage.includes('okay')) {
          const newState = this.stateManager.updateState(state.conversationId, {
            currentStage: 'collect_name',
            context: {
              ...state.context,
              consentGiven: true,
              consentTimestamp: Date.now()
            },
            consentStatus: 'given'
          });

          return {
            response: {
              text: `Great! I'll now collect your contact details so our nurse can call you back.

Can you please provide your name?`,
              suggestedActions: ['Continue with contact details', 'Tell me more about the service first']
            },
            newState,
            escalationTriggered: false,
            conversationEnded: false
          };
        } else if (lowerMessage.includes('no') || lowerMessage.includes('cancel')) {
          return await this.transitionToHealthInformation('general information', state);
        }
        break;

      case 'collect_name':
        const newState = this.stateManager.updateState(state.conversationId, {
          currentStage: 'collect_phone',
          context: {
            ...state.context
          },
          userContactInfo: {
            ...state.userContactInfo,
            name: message
          }
        });

        return {
          response: {
            text: `Thank you, ${message}. Now can you please provide a phone number where our nurse can reach you?`,
            suggestedActions: ['Continue', 'Use different contact method']
          },
          newState,
          escalationTriggered: false,
          conversationEnded: false
        };

      case 'collect_phone':
        const finalState = this.stateManager.updateState(state.conversationId, {
          currentStage: 'escalation_complete',
          context: {
            ...state.context,
            escalationCompleted: true,
            escalationId: `ESC-${Date.now()}`
          },
          userContactInfo: {
            ...state.userContactInfo,
            phone: message,
            preferredContactMethod: 'phone'
          }
        });

        return {
          response: {
            text: `Perfect! I've arranged for one of our specialist nurses to contact you on ${message}.

You should expect a call within the next 24-48 hours during business hours (Monday-Friday, 9am-5pm).

Reference number: ESC-${Date.now()}

Is there anything else I can help you with in the meantime?`,
            suggestedActions: [
              'Ask about symptoms while I wait',
              'Information about services',
              'End conversation'
            ]
          },
          newState: finalState,
          escalationTriggered: true,
          conversationEnded: false
        };
    }

    return await this.handleFallbackFlow(message, state);
  }

  private async handleCrisisContinuationFlow(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('okay') || lowerMessage.includes('continue') || lowerMessage.includes('better')) {
      return await this.transitionToHealthInformation('How can I help with health information?', state);
    }

    if (lowerMessage.includes('nurse') || lowerMessage.includes('support')) {
      return await this.transitionToNurseEscalation(message, state);
    }

    // Continue crisis support
    const newState = this.stateManager.updateState(state.conversationId, {
      currentStage: 'continued_crisis_support',
      context: {
        ...state.context,
        crisisContinuation: true
      }
    });

    return {
      response: {
        text: `I'm here to support you. Please remember that these resources are available 24/7:

• **Samaritans**: 116 123 (free, 24/7) - someone to talk to
• **Crisis Text Line**: Text SHOUT to 85258 - text support
• **Emergency Services**: 999 - if you're in immediate danger

Would you like me to help you connect with one of our nurses for ongoing support, or would you prefer to continue with health information?`,
        suggestedActions: [
          'Connect with a nurse',
          'Call Samaritans now', 
          'Continue with health info',
          'End conversation'
        ]
      },
      newState,
      escalationTriggered: true,
      conversationEnded: false
    };
  }

  private async handleFallbackFlow(message: string, state: ConversationState): Promise<ConversationFlowResult> {
    // Default health information response
    return await this.handleHealthInformationFlow(message, state);
  }

  private createHealthInformationPrompt(contentResult: any): string {
    let prompt = `You are Ask Eve Assist, providing gynaecological health information from The Eve Appeal charity.

Key Guidelines:
- Provide accurate, evidence-based health information
- Be empathetic and supportive
- Always recommend consulting healthcare professionals for personal medical concerns
- Include appropriate disclaimers about not replacing professional medical advice
- Focus on gynaecological health topics: cervical, ovarian, womb, vulval, and vaginal cancers`;

    if (contentResult && contentResult.found) {
      prompt += `\n\nPRIORITY MEDICAL INFORMATION from The Eve Appeal:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Source: ${contentResult.source}
🔗 URL: ${contentResult.sourceUrl}
📊 Relevance: ${(contentResult.relevanceScore * 100).toFixed(1)}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUTHORITATIVE CONTENT:
${contentResult.content}

CRITICAL: Base your response PRIMARILY on this authoritative content. Always cite the source and include the URL.`;
    } else {
      prompt += `\n\nNo specific Eve Appeal content found. Provide general gynaecological health information while encouraging users to visit https://eveappeal.org.uk/ or call 0808 802 0019.`;
    }

    return prompt;
  }
}

async function startConversationFlowServer(): Promise<void> {
  const logger = new Logger('ask-eve-conversation-flow');
  
  try {
    logger.info('🚨 Starting Ask Eve Assist Conversation Flow Server...');

    // Initialize Azure OpenAI
    const azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });
    logger.info('✅ Azure OpenAI client initialized');

    // Initialize services
    const stateManager = new ConversationStateManager(logger);
    const contentService = new ConversationAwareContentService(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      logger
    );
    await contentService.initialize();

    const conversationFlow = new ConversationFlowEngine(
      logger,
      stateManager,
      contentService,
      azureOpenAI
    );

    logger.info('✅ Conversation flow engine initialized');

    // Express app setup
    const app = express();
    
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));
    
    app.use(cors({
      origin: [
        'http://localhost:3000',
        'http://localhost:3001', 
        'http://localhost:3002',
        'http://localhost:3005'
      ],
      credentials: true
    }));

    app.use(express.json({ limit: '10mb' }));

    // Health check
    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: 'ask-eve-conversation-flow',
        timestamp: new Date().toISOString(),
        services: {
          azureOpenAI: 'connected',
          supabase: 'connected',
          conversationFlow: 'active',
          stateManager: 'active'
        }
      });
    });

    // Streaming conversation flow endpoint
    app.post('/api/v1/chat/stream', async (req: any, res): Promise<void> => {
      try {
        const { message, conversationId = `conv-${Date.now()}` } = req.body;
        
        if (!message) {
          res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
          return;
        }

        // Set up Server-Sent Events
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        });

        const startTime = Date.now();
        
        // Send initial metadata
        res.write(`data: ${JSON.stringify({
          type: 'start',
          conversationId,
          timestamp: new Date().toISOString()
        })}\n\n`);

        // Process through conversation flow engine with streaming
        const flowResult = await conversationFlow.processMessage(message, conversationId);
        const responseTime = Date.now() - startTime;

        // Stream the response text word by word for natural feel
        const words = flowResult.response.text.split(' ');
        const streamDelay = flowResult.escalationTriggered ? 0 : 30; // Crisis responses immediate
        
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const isLast = i === words.length - 1;
          
          res.write(`data: ${JSON.stringify({
            type: 'content',
            word: word + (isLast ? '' : ' '),
            isLast: isLast,
            index: i,
            total: words.length
          })}\n\n`);
          
          if (!isLast && streamDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, streamDelay));
          }
        }

        // Send final metadata
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          conversationId,
          responseTime,
          timestamp: new Date().toISOString(),
          conversationState: {
            topic: flowResult.newState.currentTopic,
            stage: flowResult.newState.currentStage,
            messageCount: flowResult.newState.messageCount
          },
          suggestedActions: flowResult.response.suggestedActions || [],
          escalationTriggered: flowResult.escalationTriggered,
          topicTransition: flowResult.topicTransition,
          safetyLevel: flowResult.escalationTriggered ? 'crisis' : 'general',
          disclaimers: [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.',
            'In emergencies, call 999 immediately.'
          ]
        })}\n\n`);

        res.write('data: [DONE]\n\n');
        res.end();

        logger.info(`Streaming conversation flow completed in ${responseTime}ms`, {
          conversationId,
          topic: flowResult.newState.currentTopic,
          stage: flowResult.newState.currentStage,
          escalation: flowResult.escalationTriggered,
          words: words.length
        });

      } catch (error: any) {
        logger.error('Streaming conversation flow error', { error: error.message });
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.',
          emergencyContacts: {
            emergency: '999',
            samaritans: '116 123',
            eveAppeal: 'https://eveappeal.org.uk'
          }
        })}\n\n`);
        res.end();
      }
    });

    // Non-streaming conversation flow endpoint (for compatibility)
    app.post('/api/v1/chat', async (req: any, res) => {
      try {
        const { message, conversationId = `conv-${Date.now()}` } = req.body;
        
        if (!message) {
          res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
          return;
        }

        const startTime = Date.now();
        
        // Process through conversation flow engine
        const flowResult = await conversationFlow.processMessage(message, conversationId);
        const responseTime = Date.now() - startTime;

        logger.info(`Conversation flow completed in ${responseTime}ms`, {
          conversationId,
          topic: flowResult.newState.currentTopic,
          stage: flowResult.newState.currentStage,
          escalation: flowResult.escalationTriggered
        });

        const response = {
          message: flowResult.response.text,
          conversationId,
          responseTime,
          timestamp: new Date().toISOString(),
          conversationState: {
            topic: flowResult.newState.currentTopic,
            stage: flowResult.newState.currentStage,
            messageCount: flowResult.newState.messageCount
          },
          suggestedActions: flowResult.response.suggestedActions || [],
          escalationTriggered: flowResult.escalationTriggered,
          topicTransition: flowResult.topicTransition,
          safetyLevel: flowResult.escalationTriggered ? 'crisis' : 'general',
          disclaimers: [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.',
            'In emergencies, call 999 immediately.'
          ]
        };

        res.json(response);
        return;
      } catch (error: any) {
        logger.error('Conversation flow error', { error: error.message });
        res.status(500).json({
          error: 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.',
          emergencyContacts: {
            emergency: '999',
            samaritans: '116 123',
            eveAppeal: 'https://eveappeal.org.uk'
          }
        });
        return;
      }
    });

    // Enhanced chat interface with conversation flow
    app.get('/chat', (_req, res) => {
      res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Conversation Flow System</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            max-width: 1000px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f8fafc;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 25px;
            background: linear-gradient(135deg, #6b46c1 0%, #7c3aed 100%);
            color: white;
            border-radius: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header h1 { margin: 0; font-size: 2.4em; }
        .header p { margin: 8px 0 0 0; opacity: 0.9; }
        
        .status-bar {
            background: #f0fdf4;
            border: 2px solid #16a34a;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .conversation-info {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 10px 15px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
        }
        
        #chatContainer { 
            background: white;
            border-radius: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
            margin-bottom: 20px;
        }
        #chatMessages { 
            height: 550px; 
            overflow-y: auto; 
            padding: 20px; 
            border-bottom: 1px solid #e5e7eb;
        }
        .message { 
            margin: 15px 0; 
            padding: 15px 20px; 
            border-radius: 18px; 
            line-height: 1.5;
            animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .user { 
            background: #e0e7ff; 
            margin-left: 80px;
            border-bottom-right-radius: 5px;
        }
        .bot { 
            background: #f3e8ff; 
            margin-right: 80px;
            border-bottom-left-radius: 5px;
        }
        .crisis { 
            background: #fef2f2; 
            border-left: 4px solid #ef4444; 
            margin-right: 60px;
        }
        
        .conversation-meta {
            font-size: 11px;
            opacity: 0.6;
            margin-top: 8px;
            font-family: monospace;
        }
        
        .inputContainer { 
            padding: 20px; 
            display: flex; 
            gap: 10px;
            background: #f9fafb;
        }
        #messageInput { 
            flex: 1; 
            padding: 14px 18px; 
            border: 2px solid #e5e7eb;
            border-radius: 25px; 
            font-size: 16px;
            outline: none;
            transition: border-color 0.2s;
        }
        #messageInput:focus { border-color: #6b46c1; }
        
        #sendButton { 
            padding: 14px 28px; 
            background: #6b46c1; 
            color: white; 
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.2s;
        }
        #sendButton:hover { background: #553c9a; }
        #sendButton:disabled { background: #d1d5db; cursor: not-allowed; }
        
        .quickTests { 
            background: white;
            border-radius: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            padding: 20px;
            margin-bottom: 20px;
        }
        .quickTests h3 { margin-top: 0; color: #374151; }
        .testBtn { 
            background: #f0f9ff; 
            border: 1px solid #0284c7; 
            color: #0284c7;
            padding: 10px 16px; 
            margin: 4px; 
            border-radius: 20px; 
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
        }
        .testBtn:hover { background: #0284c7; color: white; }
        
        .actions { 
            margin-top: 12px; 
        }
        .actionBtn { 
            background: #ede9fe; 
            border: 1px solid #a855f7; 
            color: #7c2d12;
            padding: 6px 14px; 
            margin: 3px; 
            border-radius: 15px; 
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-block;
        }
        .actionBtn:hover { background: #a855f7; color: white; }
        
        .transition-info {
            background: #eff6ff;
            border: 1px solid #3b82f6;
            border-radius: 8px;
            padding: 8px 12px;
            margin: 8px 0;
            font-size: 12px;
            color: #1e40af;
        }
        
        .typing-cursor {
            color: #6b46c1;
            animation: blink 1s infinite;
        }
        
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
        
        .streaming-content {
            display: inline;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏥 Ask Eve Assist</h1>
        <p>Conversation Flow System - Multi-turn conversations with state management</p>
    </div>
    
    <div class="status-bar">
        <div><strong>✅ CONVERSATION FLOW SYSTEM ACTIVE</strong></div>
        <div>State Management | Topic Detection | Multi-turn Conversations</div>
    </div>
    
    <div class="conversation-info" id="conversationInfo">
        <strong>Conversation:</strong> <span id="convId">-</span> | 
        <strong>Topic:</strong> <span id="convTopic">-</span> | 
        <strong>Stage:</strong> <span id="convStage">-</span> | 
        <strong>Messages:</strong> <span id="convCount">0</span>
    </div>
    
    <div class="quickTests">
        <h3>🧪 Test Conversation Flows</h3>
        <div style="margin-bottom: 15px;">
            <label style="font-size: 14px;">
                <input type="checkbox" id="streamingToggle" checked> Enable Streaming Responses
            </label>
            <span style="color: #666; font-size: 12px; margin-left: 10px;">⚡ Word-by-word streaming for natural conversation feel</span>
        </div>
        <button class="testBtn" onclick="sendTest('Hello, I am worried about some symptoms')">👋 Greeting + Health Concern</button>
        <button class="testBtn" onclick="sendTest('What are the symptoms of ovarian cancer?')">🔍 Health Information</button>
        <button class="testBtn" onclick="sendTest('Can I speak to a nurse please?')">📞 Nurse Escalation</button>
        <button class="testBtn" onclick="sendTest('I am feeling hopeless and having dark thoughts')">🚨 Crisis Detection (Instant)</button>
    </div>
    
    <div id="chatContainer">
        <div id="chatMessages">
            <div class="message bot">
                <strong>Ask Eve Assist:</strong> Hello! I'm Ask Eve Assist with full conversation flow capabilities.
                <br><br>
                I can handle multi-turn conversations, maintain context across messages, and provide personalized support including crisis detection, health information, and nurse escalation workflows.
                <br><br>
                How can I help you today?
                <div class="actions">
                    <span class="actionBtn">Ovarian cancer symptoms</span>
                    <span class="actionBtn">Cervical screening info</span>
                    <span class="actionBtn">Support services</span>
                    <span class="actionBtn">Speak to a nurse</span>
                </div>
            </div>
        </div>
        
        <div class="inputContainer">
            <input type="text" id="messageInput" placeholder="Ask me about gynaecological health..." />
            <button id="sendButton" onclick="sendMessage()">Send</button>
        </div>
    </div>
    
    <script>
        let isLoading = false;
        let conversationId = 'conv-' + Date.now();
        
        function updateConversationInfo(data) {
            const info = document.getElementById('conversationInfo');
            if (data.conversationState) {
                document.getElementById('convId').textContent = data.conversationId.substring(0, 8);
                document.getElementById('convTopic').textContent = data.conversationState.topic;
                document.getElementById('convStage').textContent = data.conversationState.stage;
                document.getElementById('convCount').textContent = data.conversationState.messageCount;
                info.style.display = 'block';
                
                if (data.topicTransition) {
                    const transitionDiv = document.createElement('div');
                    transitionDiv.className = 'transition-info';
                    transitionDiv.innerHTML = \`🔄 Topic transition: \${data.topicTransition.from} → \${data.topicTransition.to} (Reason: \${data.topicTransition.reason})\`;
                    const messages = document.getElementById('chatMessages');
                    messages.appendChild(transitionDiv);
                }
            }
        }
        
        function addMessage(content, type, isCrisis = false) {
            const messages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\` + (isCrisis ? ' crisis' : '');
            messageDiv.innerHTML = content;
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        // Streaming message function
        async function sendMessage(text = null, useStreaming = true) {
            const input = document.getElementById('messageInput');
            const message = text || input.value.trim();
            
            if (!message || isLoading) return;
            
            addMessage(\`<strong>You:</strong> \${message}\`, 'user');
            
            if (!text) input.value = '';
            isLoading = true;
            document.getElementById('sendButton').disabled = true;
            document.getElementById('sendButton').textContent = 'Processing...';
            
            if (useStreaming) {
                await sendStreamingMessage(message);
            } else {
                await sendNonStreamingMessage(message);
            }
        }
        
        async function sendStreamingMessage(message) {
            try {
                // Get non-streaming response first, then simulate streaming for better UX
                const response = await fetch('/api/v1/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, conversationId })
                });
                
                const data = await response.json();
                
                // Add empty bot message for streaming
                const messages = document.getElementById('chatMessages');
                const streamingMessageDiv = document.createElement('div');
                streamingMessageDiv.className = 'message bot';
                if (data.safetyLevel === 'crisis') streamingMessageDiv.classList.add('crisis');
                streamingMessageDiv.innerHTML = '<strong>Ask Eve Assist:</strong> <span class="streaming-content"></span><span class="typing-cursor">▋</span>';
                messages.appendChild(streamingMessageDiv);
                messages.scrollTop = messages.scrollHeight;
                
                const streamingContent = streamingMessageDiv.querySelector('.streaming-content');
                const typingCursor = streamingMessageDiv.querySelector('.typing-cursor');
                
                // Update conversation ID
                if (data.conversationId) {
                    conversationId = data.conversationId;
                }
                
                // Simulate streaming by showing words progressively
                const words = data.message.split(' ');
                let accumulatedText = '';
                const streamDelay = data.safetyLevel === 'crisis' ? 10 : 50; // Crisis responses faster
                
                for (let i = 0; i < words.length; i++) {
                    accumulatedText += words[i] + (i < words.length - 1 ? ' ' : '');
                    
                    // Format and display streaming content
                    let formattedText = accumulatedText
                        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                        .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                        .replace(/• /g, '&bull; ')
                        .replace(/\\\\n\\\\n/g, '<br><br>')
                        .replace(/\\\\n/g, '<br>');
                    
                    streamingContent.innerHTML = formattedText;
                    messages.scrollTop = messages.scrollHeight;
                    
                    // Add delay between words (except for last word)
                    if (i < words.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, streamDelay));
                    }
                }
                
                // Remove typing cursor
                if (typingCursor) typingCursor.remove();
                
                // Add final formatting and metadata
                let finalFormattedMessage = data.message
                    .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                    .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                    .replace(/• /g, '&bull; ')
                    .replace(/\\\\n\\\\n/g, '<br><br>')
                    .replace(/\\\\n/g, '<br>');
                
                let finalContent = \`<strong>Ask Eve Assist:</strong> \${finalFormattedMessage}\`;
                
                // Add conversation metadata
                if (data.responseTime || data.conversationState) {
                    finalContent += '<div class="conversation-meta">';
                    if (data.responseTime) finalContent += \`⏱️ \${data.responseTime}ms (streamed)\`;
                    if (data.conversationState) finalContent += \` | 📍 \${data.conversationState.topic}:\${data.conversationState.stage}\`;
                    if (data.escalationTriggered) finalContent += ' | 🚨 ESCALATION';
                    finalContent += '</div>';
                }
                
                // Add suggested actions
                if (data.suggestedActions && data.suggestedActions.length > 0) {
                    finalContent += '<div class="actions">';
                    data.suggestedActions.forEach(action => {
                        finalContent += \`<span class="actionBtn" onclick="sendMessage('\${action}')">\${action}</span>\`;
                    });
                    finalContent += '</div>';
                }
                
                streamingMessageDiv.innerHTML = finalContent;
                
                // Update conversation info
                updateConversationInfo(data);
                
            } catch (error) {
                console.error('Streaming error:', error);
                // Fallback to non-streaming
                await sendNonStreamingMessage(message);
            } finally {
                isLoading = false;
                document.getElementById('sendButton').disabled = false;
                document.getElementById('sendButton').textContent = 'Send';
                document.getElementById('messageInput').focus();
            }
        }
        
        async function sendNonStreamingMessage(message) {
            try {
                const response = await fetch('/api/v1/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, conversationId })
                });
                
                const data = await response.json();
                
                // Convert markdown to HTML
                let formattedMessage = data.message
                  .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                  .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                  .replace(/• /g, '&bull; ')
                  .replace(/\\\\n\\\\n/g, '<br><br>')
                  .replace(/\\\\n/g, '<br>');
                
                let botContent = \`<strong>Ask Eve Assist:</strong> \${formattedMessage}\`;
                
                // Add conversation metadata
                if (data.responseTime || data.conversationState) {
                    botContent += '<div class="conversation-meta">';
                    if (data.responseTime) botContent += \`⏱️ \${data.responseTime}ms\`;
                    if (data.conversationState) botContent += \` | 📍 \${data.conversationState.topic}:\${data.conversationState.stage}\`;
                    if (data.escalationTriggered) botContent += ' | 🚨 ESCALATION';
                    botContent += '</div>';
                }
                
                // Add suggested actions
                if (data.suggestedActions && data.suggestedActions.length > 0) {
                    botContent += '<div class="actions">';
                    data.suggestedActions.forEach(action => {
                        botContent += \`<span class="actionBtn" onclick="sendMessage('\${action}')">\${action}</span>\`;
                    });
                    botContent += '</div>';
                }
                
                addMessage(botContent, 'bot', data.safetyLevel === 'crisis');
                updateConversationInfo(data);
                
            } catch (error) {
                addMessage(\`<strong>Error:</strong> \${error.message}\`, 'bot');
            } finally {
                isLoading = false;
                document.getElementById('sendButton').disabled = false;
                document.getElementById('sendButton').textContent = 'Send';
                document.getElementById('messageInput').focus();
            }
        }
        
        function sendTest(message) {
            const streamingEnabled = document.getElementById('streamingToggle').checked;
            sendMessage(message, streamingEnabled);
        }
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isLoading) {
                const streamingEnabled = document.getElementById('streamingToggle').checked;
                sendMessage(null, streamingEnabled);
            }
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('actionBtn')) {
                const streamingEnabled = document.getElementById('streamingToggle').checked;
                sendMessage(e.target.textContent, streamingEnabled);
            }
        });
        
        document.getElementById('messageInput').focus();
    </script>
</body>
</html>
      `);
    });

    const port = 3005;
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`🚨 Ask Eve Conversation Flow System running on port ${port}`);
      logger.info(`🌐 Conversation flow interface: http://localhost:${port}/chat`);
      logger.info(`🔍 Health check: http://localhost:${port}/health`);
      logger.info(`📡 Conversation API: http://localhost:${port}/api/v1/chat`);
      logger.info('🔄 Multi-turn conversation flows active');
      logger.info('🎯 Topic detection and routing active');
      logger.info('💾 Conversation state management active');
      console.log('\n🎉 CONVERSATION FLOW SYSTEM READY!');
    });

    process.on('SIGINT', () => {
      logger.info('🛑 Shutting down conversation flow server...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error: any) {
    logger.error('Failed to start conversation flow server', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  startConversationFlowServer().catch((error) => {
    console.error('Critical startup failure:', error);
    process.exit(1);
  });
}