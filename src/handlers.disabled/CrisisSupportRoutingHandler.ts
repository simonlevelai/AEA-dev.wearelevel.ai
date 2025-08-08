import { BaseTopicHandler, TopicHandlerOptions } from './BaseTopicHandler';
import { Logger } from '../utils/logger';
import {
  ConversationState,
  ConversationFlowResult
} from '../types/conversation';
import { ConversationFlowContext } from '../services/ConversationFlowEngine';

interface CrisisResource {
  name: string;
  contact: string;
  description: string;
  availability: string;
  urgency: 'immediate' | 'urgent' | 'support';
}

interface CrisisCategory {
  category: string;
  confidence: number;
  resources: CrisisResource[];
  immediateMessage: string;
}

/**
 * CrisisSupportRoutingHandler handles crisis situations with <2 second response times
 * Provides immediate emergency contacts and routes to appropriate crisis resources
 */
export class CrisisSupportRoutingHandler extends BaseTopicHandler {
  private readonly CRISIS_RESPONSE_TIMEOUT_MS = 2000; // 2 second max response time
  private readonly crisisResources: Map<string, CrisisResource[]> = new Map();

  constructor(logger: Logger) {
    super(
      'crisis_support_routing',
      {
        name: 'Crisis Support Routing',
        description: 'Handles crisis situations and emergency support routing',
        keywords: [
          'help', 'crisis', 'emergency', 'urgent', 'suicide', 'self-harm',
          'hurt myself', 'end my life', 'can\'t cope', 'hopeless', 'desperate',
          'scared', 'afraid', 'don\'t know what to do', 'breaking down',
          'giving up', 'want to die', 'kill myself', 'cutting', 'harm'
        ],
        supportedStages: ['escalation', 'crisis_response', 'safety_planning'],
        requiresConsent: false,
        canEscalate: true,
        priority: 10 // Highest priority - override everything else for crisis
      },
      logger
    );

    this.initializeCrisisResources();
  }

  protected initializeIntentPatterns(): void {
    this.intentPatterns = [
      // Suicide ideation patterns (highest confidence)
      {
        pattern: /(want|wanna|gonna|going to)\s+(die|kill\s+myself|end\s+my\s+life)/i,
        confidence: 1.0,
        description: 'Direct suicide ideation'
      },
      {
        pattern: /(don't|can't|cannot)\s+(live|go\s+on|take\s+it|cope)/i,
        confidence: 0.95,
        description: 'Indirect suicide ideation'
      },
      
      // Self-harm patterns
      {
        pattern: /(cut|cutting|hurt|hurting|harm|harming)\s+(myself|me)/i,
        confidence: 0.9,
        description: 'Self-harm indicators'
      },
      {
        pattern: /self\s*(harm|injury|hurt)/i,
        confidence: 0.9,
        description: 'Self-harm terminology'
      },
      
      // Crisis emotional states
      {
        pattern: /(hopeless|desperate|breaking\s+down|can't\s+handle)/i,
        confidence: 0.8,
        description: 'Crisis emotional indicators'
      },
      {
        pattern: /(giving\s+up|no\s+point|nothing\s+left)/i,
        confidence: 0.75,
        description: 'Hopelessness indicators'
      },
      
      // Medical emergencies
      {
        pattern: /(can't\s+breathe|chest\s+pain|heart\s+attack|bleeding\s+(heavily|badly))/i,
        confidence: 0.95,
        description: 'Medical emergency indicators'
      },
      {
        pattern: /(unconscious|passed\s+out|severe\s+pain|emergency)/i,
        confidence: 0.8,
        description: 'Medical crisis indicators'
      },
      
      // General crisis help
      {
        pattern: /(help\s+me|need\s+help|urgent|crisis)/i,
        confidence: 0.6,
        description: 'General crisis help requests'
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
      this.logHandlerActivity(message, 'crisis_support_handle', true, {
        urgencyLevel: 'critical'
      });

      // Fast-track crisis detection and response
      const crisisAnalysis = await this.analyzeCrisisType(message, state, context);
      
      // Ensure we respond within the crisis timeout
      const analysisTime = Date.now() - startTime;
      if (analysisTime > this.CRISIS_RESPONSE_TIMEOUT_MS / 2) {
        this.logger.warn('Crisis analysis taking too long, providing immediate response', {
          analysisTime,
          conversationId: state.conversationId
        });
        return this.provideImmediateEmergencyResponse(message, state, context);
      }

      // Provide appropriate crisis response
      const response = await this.provideCrisisResponse(crisisAnalysis, message, state, context);

      // Log crisis escalation
      await this.logCrisisEscalation(crisisAnalysis, message, state, context);

      // Verify response time compliance
      const totalTime = Date.now() - startTime;
      if (totalTime > this.CRISIS_RESPONSE_TIMEOUT_MS) {
        this.logger.error('Crisis response exceeded timeout', {
          totalTime,
          timeout: this.CRISIS_RESPONSE_TIMEOUT_MS,
          conversationId: state.conversationId
        });
      } else {
        this.logger.info('Crisis response completed within timeout', {
          totalTime,
          conversationId: state.conversationId,
          crisisCategory: crisisAnalysis.category
        });
      }

      return response;

    } catch (error) {
      this.logger.error('Crisis support handler failed, providing emergency fallback', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        responseTime: Date.now() - startTime
      });

      // Emergency fallback - always provide basic crisis contacts
      return this.provideImmediateEmergencyResponse(message, state, context);
    }
  }

  /**
   * Analyze the type of crisis from the user's message
   */
  private async analyzeCrisisType(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<CrisisCategory> {
    const normalizedMessage = this.normalizeMessage(message);
    
    // Check for immediate life-threatening situations
    if (this.isMedicalEmergency(normalizedMessage)) {
      return {
        category: 'medical_emergency',
        confidence: 0.95,
        resources: this.crisisResources.get('medical_emergency') || [],
        immediateMessage: "This sounds like it could be a medical emergency. Please seek immediate medical attention."
      };
    }

    // Check for suicide ideation
    if (this.isSuicideIdeation(normalizedMessage)) {
      return {
        category: 'suicide_ideation',
        confidence: 0.9,
        resources: this.crisisResources.get('suicide_ideation') || [],
        immediateMessage: "I'm very concerned about what you've shared. Your safety is the most important thing right now."
      };
    }

    // Check for self-harm
    if (this.isSelfHarm(normalizedMessage)) {
      return {
        category: 'self_harm',
        confidence: 0.85,
        resources: this.crisisResources.get('self_harm') || [],
        immediateMessage: "I'm concerned about your wellbeing. Please reach out for support right away."
      };
    }

    // Check for severe emotional distress
    if (this.isSevereDistress(normalizedMessage)) {
      return {
        category: 'severe_distress',
        confidence: 0.7,
        resources: this.crisisResources.get('severe_distress') || [],
        immediateMessage: "I understand you're going through a very difficult time. Let me help you find support."
      };
    }

    // Default crisis support
    return {
      category: 'general_crisis',
      confidence: 0.6,
      resources: this.crisisResources.get('general_crisis') || [],
      immediateMessage: "I want to make sure you get the right support. Here are some resources that can help."
    };
  }

  /**
   * Provide appropriate crisis response based on analysis
   */
  private async provideCrisisResponse(
    analysis: CrisisCategory,
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    // Update state to crisis escalation
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      currentStage: 'escalation',
      escalationRequired: true,
      context: {
        ...state.context,
        crisisCategory: analysis.category,
        crisisConfidence: analysis.confidence
      }
    });

    // Build response with immediate resources
    const immediateResources = analysis.resources
      .filter(r => r.urgency === 'immediate')
      .slice(0, 4); // Limit to top 4 for UI clarity

    let responseText = analysis.immediateMessage + '\n\n**Immediate Support:**\n';
    
    immediateResources.forEach(resource => {
      responseText += `• **${resource.name}**: ${resource.contact} - ${resource.description}\n`;
    });

    // Add additional context based on crisis type
    if (analysis.category === 'medical_emergency') {
      responseText += '\n**If this is a medical emergency, call 999 immediately.**';
    } else if (analysis.category === 'suicide_ideation' || analysis.category === 'self_harm') {
      responseText += '\n**You are not alone. People care about you and want to help. Please reach out to one of these services right now.**';
    }

    const suggestedActions = immediateResources.map(r => 
      r.contact.includes('999') ? 'Call 999' : 
      r.contact.includes('116 123') ? 'Call Samaritans' :
      r.contact.includes('85258') ? 'Text SHOUT' : 
      `Call ${r.name}`
    );

    return this.createEscalationResponse(
      responseText,
      updatedState,
      suggestedActions
    );
  }

  /**
   * Provide immediate emergency response for timeout or error scenarios
   */
  private async provideImmediateEmergencyResponse(
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<ConversationFlowResult> {
    const updatedState = await context.stateManager.updateState(state.conversationId, {
      currentStage: 'escalation',
      escalationRequired: true
    });

    const responseText = `I'm concerned about what you've shared. Please contact emergency support immediately:

**Emergency Contacts:**
• **Emergency Services**: 999 - For immediate emergencies
• **Samaritans**: 116 123 - Free emotional support (24/7)
• **Crisis Text Line**: Text SHOUT to 85258 - Crisis support via text
• **NHS 111**: Call 111 - For urgent medical advice

Your safety matters. Please speak to someone who can help you right now.`;

    return this.createEscalationResponse(
      responseText,
      updatedState,
      ['Call 999', 'Call Samaritans', 'Text SHOUT', 'Call NHS 111']
    );
  }

  /**
   * Log crisis escalation for audit and follow-up
   */
  private async logCrisisEscalation(
    analysis: CrisisCategory,
    message: string,
    state: ConversationState,
    context: ConversationFlowContext
  ): Promise<void> {
    try {
      // Create escalation event for nurse team notification
      const escalationEvent = await context.escalationService.createEscalationEvent(
        state.userId,
        state.sessionId,
        message,
        {
          severity: 'crisis',
          confidence: analysis.confidence,
          requiresEscalation: true,
          matches: [{
            trigger: analysis.category,
            confidence: analysis.confidence,
            category: analysis.category as any,
            severity: 'crisis' as any,
            position: { start: 0, end: message.length },
            matchType: 'pattern'
          }],
          riskFactors: [analysis.category, 'immediate_intervention_needed'],
          contextualConcerns: ['crisis_situation_detected'],
          analysisTime: 0,
          recommendedActions: ['immediate_crisis_response', 'nurse_notification']
        }
      );

      // Send immediate notification to nurse team
      await context.escalationService.notifyNurseTeam(escalationEvent);

      this.logger.info('Crisis escalation logged and nurse team notified', {
        conversationId: state.conversationId,
        escalationId: escalationEvent.id,
        crisisCategory: analysis.category,
        confidence: analysis.confidence
      });

    } catch (error) {
      this.logger.error('Failed to log crisis escalation', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        conversationId: state.conversationId,
        crisisCategory: analysis.category
      });
    }
  }

  /**
   * Crisis detection helper methods
   */
  private isMedicalEmergency(message: string): boolean {
    const medicalEmergencyPatterns = [
      /can'?t breathe/i,
      /chest pain/i,
      /heart attack/i,
      /severe pain/i,
      /bleeding heavily/i,
      /unconscious/i,
      /passed out/i,
      /emergency/i
    ];
    
    return medicalEmergencyPatterns.some(pattern => pattern.test(message));
  }

  private isSuicideIdeation(message: string): boolean {
    const suicidePatterns = [
      /(want|wanna|gonna|going to).*(die|kill myself|end my life)/i,
      /(don't|can't|cannot).*(live|go on|take it)/i,
      /suicide/i,
      /kill myself/i,
      /want to die/i,
      /end my life/i
    ];
    
    return suicidePatterns.some(pattern => pattern.test(message));
  }

  private isSelfHarm(message: string): boolean {
    const selfHarmPatterns = [
      /(cut|cutting|hurt|hurting).*(myself|me)/i,
      /self harm/i,
      /self injury/i,
      /hurt myself/i,
      /cutting myself/i
    ];
    
    return selfHarmPatterns.some(pattern => pattern.test(message));
  }

  private isSevereDistress(message: string): boolean {
    const distressPatterns = [
      /hopeless/i,
      /desperate/i,
      /breaking down/i,
      /can'?t handle/i,
      /giving up/i,
      /no point/i,
      /nothing left/i,
      /overwhelmed/i
    ];
    
    return distressPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Initialize crisis resources
   */
  private initializeCrisisResources(): void {
    // Medical emergency resources
    this.crisisResources.set('medical_emergency', [
      {
        name: 'Emergency Services',
        contact: '999',
        description: 'For immediate life-threatening emergencies',
        availability: '24/7',
        urgency: 'immediate'
      },
      {
        name: 'NHS 111',
        contact: '111',
        description: 'For urgent medical advice and guidance',
        availability: '24/7',
        urgency: 'urgent'
      }
    ]);

    // Suicide ideation resources
    this.crisisResources.set('suicide_ideation', [
      {
        name: 'Emergency Services',
        contact: '999',
        description: 'For immediate danger to life',
        availability: '24/7',
        urgency: 'immediate'
      },
      {
        name: 'Samaritans',
        contact: '116 123',
        description: 'Free emotional support and suicide prevention',
        availability: '24/7',
        urgency: 'immediate'
      },
      {
        name: 'Crisis Text Line',
        contact: 'Text SHOUT to 85258',
        description: 'Crisis support via text message',
        availability: '24/7',
        urgency: 'immediate'
      }
    ]);

    // Self-harm resources
    this.crisisResources.set('self_harm', [
      {
        name: 'Samaritans',
        contact: '116 123',
        description: 'Emotional support for those who self-harm',
        availability: '24/7',
        urgency: 'immediate'
      },
      {
        name: 'Crisis Text Line',
        contact: 'Text SHOUT to 85258',
        description: 'Text-based crisis support',
        availability: '24/7',
        urgency: 'immediate'
      },
      {
        name: 'NHS 111',
        contact: '111',
        description: 'Medical advice for self-harm injuries',
        availability: '24/7',
        urgency: 'urgent'
      }
    ]);

    // Severe distress resources
    this.crisisResources.set('severe_distress', [
      {
        name: 'Samaritans',
        contact: '116 123',
        description: 'Emotional support and listening service',
        availability: '24/7',
        urgency: 'immediate'
      },
      {
        name: 'Crisis Text Line',
        contact: 'Text SHOUT to 85258',
        description: 'Support via text for those in crisis',
        availability: '24/7',
        urgency: 'urgent'
      },
      {
        name: 'NHS Mental Health Helpline',
        contact: '111',
        description: 'Mental health support and advice',
        availability: '24/7',
        urgency: 'support'
      }
    ]);

    // General crisis resources
    this.crisisResources.set('general_crisis', [
      {
        name: 'Samaritans',
        contact: '116 123',
        description: 'Free emotional support for anyone',
        availability: '24/7',
        urgency: 'urgent'
      },
      {
        name: 'NHS 111',
        contact: '111',
        description: 'Health advice and support',
        availability: '24/7',
        urgency: 'support'
      }
    ]);
  }

  /**
   * Override confidence calculation for crisis detection
   */
  public async getIntentConfidence(
    message: string,
    state: ConversationState
  ): Promise<number> {
    const normalizedMessage = this.normalizeMessage(message);
    
    // Crisis patterns get maximum confidence
    for (const pattern of this.intentPatterns) {
      if (pattern.pattern.test(normalizedMessage)) {
        return pattern.confidence;
      }
    }

    // Use keyword-based confidence
    return this.calculateKeywordConfidence(normalizedMessage);
  }
}