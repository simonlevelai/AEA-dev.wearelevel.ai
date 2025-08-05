import { Logger } from '../utils/logger';
import { SafetyResult, SeverityLevel } from '../types/safety';
import { z } from 'zod';

// Type definitions for escalation responses
export const SupportResourceSchema = z.object({
  name: z.string(),
  contact: z.string(),
  description: z.string(),
  type: z.enum(['emotional_support', 'health_guidance', 'family_support', 'crisis_support']),
  availability: z.string()
});

export const EmergencyContactSchema = z.object({
  service: z.string(),
  number: z.string(),
  availability: z.string(),
  priority: z.enum(['immediate', 'urgent', 'standard']).optional()
});

export const AccessibilityFeaturesSchema = z.object({
  screenReaderCompatible: z.boolean(),
  highContrast: z.boolean(),
  keyboardNavigable: z.boolean(),
  textSizeAdjustable: z.boolean().optional()
});

export const EscalationMetadataSchema = z.object({
  priority: z.enum(['immediate', 'high', 'medium', 'low']),
  requiresCallback: z.boolean(),
  estimatedResponseTime: z.string(),
  nurseTeamAlert: z.boolean()
});

export const EscalationResponseSchema = z.object({
  escalationLevel: z.number().min(1).max(4),
  responseType: z.enum(['information', 'concern', 'warning', 'crisis']),
  text: z.string(),
  tone: z.enum(['informative', 'supportive', 'urgent', 'immediate']),
  disclaimers: z.array(z.string()),
  suggestedActions: z.array(z.string()),
  supportResources: z.array(SupportResourceSchema).optional(),
  emergencyContacts: z.array(EmergencyContactSchema).optional(),
  immediateActions: z.array(z.string()).optional(),
  requiresEscalation: z.boolean(),
  nurseEscalation: z.boolean(),
  contextualResponse: z.boolean(),
  mhraCompliant: z.boolean(),
  accessibilityFeatures: AccessibilityFeaturesSchema,
  escalationMetadata: EscalationMetadataSchema.optional(),
  responseTime: z.number()
});

export type SupportResource = z.infer<typeof SupportResourceSchema>;
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;
export type AccessibilityFeatures = z.infer<typeof AccessibilityFeaturesSchema>;
export type EscalationMetadata = z.infer<typeof EscalationMetadataSchema>;
export type EscalationResponse = z.infer<typeof EscalationResponseSchema>;

/**
 * ProgressiveEscalationService implements a 4-tier crisis response system
 * with context-appropriate templates and accessibility features.
 */
export class ProgressiveEscalationService {
  private readonly logger: Logger;

  // Standard support resources
  private readonly supportResources: Record<string, SupportResource[]> = {
    emotional_support: [
      {
        name: 'The Eve Appeal Support Line',
        contact: '0207 605 0100',
        description: 'Specialist gynaecological cancer support and information',
        type: 'emotional_support',
        availability: 'Monday-Friday, 9am-5pm'
      },
      {
        name: 'Macmillan Cancer Support',
        contact: '0808 808 00 00',
        description: 'Free cancer support and information service',
        type: 'emotional_support',
        availability: '24/7'
      }
    ],
    health_guidance: [
      {
        name: 'NHS 111',
        contact: '111',
        description: 'Free non-emergency health advice and guidance',
        type: 'health_guidance',
        availability: '24/7'
      },
      {
        name: 'GP Surgery',
        contact: 'Contact your local practice',
        description: 'Your primary healthcare provider',
        type: 'health_guidance',
        availability: 'Varies by practice'
      }
    ],
    family_support: [
      {
        name: 'Family Support Services',
        contact: 'Via The Eve Appeal',
        description: 'Support for families affected by gynaecological cancers',
        type: 'family_support',
        availability: 'Monday-Friday, 9am-5pm'
      }
    ],
    crisis_support: [
      {
        name: 'Samaritans',
        contact: '116 123',
        description: 'Free 24/7 emotional support for anyone in distress',
        type: 'crisis_support',
        availability: '24/7'
      },
      {
        name: 'Crisis Text Line',
        contact: 'Text SHOUT to 85258',
        description: 'Free 24/7 text support for crisis situations',
        type: 'crisis_support',
        availability: '24/7'
      }
    ]
  };

  // Emergency contacts by priority
  private readonly emergencyContacts: EmergencyContact[] = [
    {
      service: 'Emergency Services',
      number: '999',
      availability: '24/7',
      priority: 'immediate'
    },
    {
      service: 'NHS 111',
      number: '111',
      availability: '24/7',
      priority: 'urgent'
    },
    {
      service: 'Samaritans',
      number: '116 123',
      availability: '24/7',
      priority: 'urgent'
    },
    {
      service: 'Crisis Text Line',
      number: '85258',
      availability: '24/7',
      priority: 'urgent'
    }
  ];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Generate escalation response based on safety analysis results
   */
  async generateEscalationResponse(safetyResult: SafetyResult, userQuery: string): Promise<EscalationResponse> {
    const startTime = Date.now();
    
    try {
      const escalationLevel = this.determineEscalationLevel(safetyResult);
      const responseType = this.getResponseType(escalationLevel);
      const tone = this.getTone(escalationLevel);

      let response: EscalationResponse;

      switch (escalationLevel) {
        case 1:
          response = await this.generateLevel1Response(safetyResult, userQuery);
          break;
        case 2:
          response = await this.generateLevel2Response(safetyResult, userQuery);
          break;
        case 3:
          response = await this.generateLevel3Response(safetyResult, userQuery);
          break;
        case 4:
          response = await this.generateLevel4Response(safetyResult, userQuery);
          break;
        default:
          response = await this.generateLevel1Response(safetyResult, userQuery);
      }

      // Set common properties
      response.escalationLevel = escalationLevel;
      response.responseType = responseType;
      response.tone = tone;
      response.responseTime = Date.now() - startTime;
      response.mhraCompliant = true;
      response.accessibilityFeatures = this.getAccessibilityFeatures();

      // Validate response before returning
      const validatedResponse = EscalationResponseSchema.parse(response);

      this.logger.info('Escalation response generated', {
        escalationLevel,
        responseType,
        requiresEscalation: validatedResponse.requiresEscalation,
        nurseEscalation: validatedResponse.nurseEscalation,
        responseTime: validatedResponse.responseTime
      });

      return validatedResponse;

    } catch (error) {
      this.logger.error('Failed to generate escalation response', { error, safetyResult });
      
      // Return safe fallback response
      return this.generateFallbackResponse(safetyResult, userQuery);
    }
  }

  /**
   * Level 1: Information responses with general health disclaimers
   */
  private async generateLevel1Response(safetyResult: SafetyResult, userQuery: string): Promise<EscalationResponse> {
    const contextInfo = this.extractContextualInfo(userQuery);
    
    return {
      escalationLevel: 1,
      responseType: 'information',
      text: this.buildInformationalResponse(contextInfo, userQuery),
      tone: 'informative',
      disclaimers: [
        'This is general health information only and should not replace professional medical advice.',
        'Always consult your healthcare provider for medical concerns.',
        'The Eve Appeal is not a medical professional or healthcare provider.'
      ],
      suggestedActions: [
        'Learn more',
        'Contact your GP',
        'Visit The Eve Appeal website'
      ],
      requiresEscalation: false,
      nurseEscalation: false,
      contextualResponse: contextInfo.isContextual,
      mhraCompliant: true,
      accessibilityFeatures: this.getAccessibilityFeatures(),
      responseTime: 0
    };
  }

  /**
   * Level 2: Concern responses with GP referral guidance
   */
  private async generateLevel2Response(safetyResult: SafetyResult, userQuery: string): Promise<EscalationResponse> {
    const contextInfo = this.extractContextualInfo(userQuery);
    
    return {
      escalationLevel: 2,
      responseType: 'concern',
      text: this.buildConcernResponse(contextInfo, userQuery, safetyResult),
      tone: 'supportive',
      disclaimers: [
        'This is general health information and emotional support.',
        'Please speak to your GP about any health concerns.',
        'Your wellbeing is important - reach out for professional support when needed.'
      ],
      suggestedActions: [
        'Contact GP',
        'Speak to a nurse',
        'Access support services'
      ],
      supportResources: [
        ...this.supportResources.emotional_support,
        ...this.supportResources.health_guidance
      ],
      requiresEscalation: true,
      nurseEscalation: false,
      contextualResponse: contextInfo.isContextual,
      mhraCompliant: true,
      accessibilityFeatures: this.getAccessibilityFeatures(),
      responseTime: 0
    };
  }

  /**
   * Level 3: Warning responses with urgent medical attention guidance
   */
  private async generateLevel3Response(safetyResult: SafetyResult, userQuery: string): Promise<EscalationResponse> {
    const contextInfo = this.extractContextualInfo(userQuery);
    
    return {
      escalationLevel: 3,
      responseType: 'warning',
      text: this.buildWarningResponse(contextInfo, userQuery, safetyResult),
      tone: 'urgent',
      disclaimers: [
        'Urgent medical attention may be needed.',
        'This is not a substitute for emergency medical services.',
        'Trust your instincts - seek help if you feel something is seriously wrong.'
      ],
      suggestedActions: [
        'Call NHS 111',
        'Contact GP urgently',
        'Consider A&E if severe'
      ],
      supportResources: [
        ...this.supportResources.health_guidance,
        ...this.supportResources.emotional_support
      ],
      emergencyContacts: this.emergencyContacts.filter(contact => 
        contact.priority === 'urgent' || contact.service === 'NHS 111'
      ),
      requiresEscalation: true,
      nurseEscalation: false,
      contextualResponse: contextInfo.isContextual,
      mhraCompliant: true,
      accessibilityFeatures: this.getAccessibilityFeatures(),
      responseTime: 0
    };
  }

  /**
   * Level 4: Crisis responses with immediate emergency guidance
   */
  private async generateLevel4Response(safetyResult: SafetyResult, userQuery: string): Promise<EscalationResponse> {
    const contextInfo = this.extractContextualInfo(userQuery);
    const isSelfHarm = this.isSelfHarmCrisis(safetyResult);
    const isMedicalEmergency = this.isMedicalEmergency(safetyResult);
    
    return {
      escalationLevel: 4,
      responseType: 'crisis',
      text: this.buildCrisisResponse(contextInfo, userQuery, safetyResult, isSelfHarm, isMedicalEmergency),
      tone: 'immediate',
      disclaimers: [
        'This is a crisis situation requiring immediate attention.',
        'Professional help is available and support is here for you.',
        'Your safety and wellbeing are the top priority.'
      ],
      suggestedActions: isSelfHarm ? [
        'Call Samaritans now',
        'Text SHOUT',
        'Call 999 if immediate danger'
      ] : [
        'Call 999 immediately',
        'Get emergency medical help',
        'Contact emergency services'
      ],
      supportResources: [
        ...this.supportResources.crisis_support,
        ...this.supportResources.emotional_support
      ],
      emergencyContacts: this.emergencyContacts,
      immediateActions: isSelfHarm ? [
        'Reach out for support',
        'Call crisis helpline',
        'Stay safe'
      ] : [
        'Call 999 immediately',
        'Get to A&E',
        'Seek immediate medical help'
      ],
      requiresEscalation: true,
      nurseEscalation: true,
      contextualResponse: contextInfo.isContextual,
      mhraCompliant: true,
      accessibilityFeatures: this.getAccessibilityFeatures(),
      escalationMetadata: {
        priority: 'immediate',
        requiresCallback: true,
        estimatedResponseTime: 'Immediate',
        nurseTeamAlert: true
      },
      responseTime: 0
    };
  }

  /**
   * Helper methods
   */
  private determineEscalationLevel(safetyResult: SafetyResult): number {
    switch (safetyResult.severity) {
      case 'crisis':
        return 4;
      case 'high_concern':
        return 3;
      case 'emotional_support':
        return 2;
      case 'general':
      default:
        return 1;
    }
  }

  private getResponseType(level: number): EscalationResponse['responseType'] {
    const types: EscalationResponse['responseType'][] = ['information', 'concern', 'warning', 'crisis'];
    return types[level - 1] || 'information';
  }

  private getTone(level: number): EscalationResponse['tone'] {
    const tones: EscalationResponse['tone'][] = ['informative', 'supportive', 'urgent', 'immediate'];
    return tones[level - 1] || 'informative';
  }

  private getAccessibilityFeatures(): AccessibilityFeatures {
    return {
      screenReaderCompatible: true,
      highContrast: true,
      keyboardNavigable: true,
      textSizeAdjustable: true
    };
  }

  private extractContextualInfo(userQuery: string): { isContextual: boolean; topics: string[]; concerns: string[] } {
    const query = userQuery.toLowerCase();
    const topics: string[] = [];
    const concerns: string[] = [];
    
    // Extract health topics
    const healthTopics = ['cervical', 'ovarian', 'screening', 'cancer', 'symptoms', 'diagnosis'];
    healthTopics.forEach(topic => {
      if (query.includes(topic)) {
        topics.push(topic);
      }
    });

    // Extract concern indicators
    const concernWords = ['worried', 'scared', 'terrified', 'anxious', 'family', 'daughter', 'mother'];
    concernWords.forEach(concern => {
      if (query.includes(concern)) {
        concerns.push(concern);
      }
    });

    return {
      isContextual: topics.length > 0 || concerns.length > 0,
      topics,
      concerns
    };
  }

  private buildInformationalResponse(contextInfo: any, userQuery: string): string {
    if (contextInfo.topics.includes('cervical') && contextInfo.topics.includes('screening')) {
      return 'Cervical screening is an important preventive health measure that helps detect early changes in cervical cells. Regular screening can help prevent cervical cancer by identifying abnormal cells before they become cancerous.';
    }
    
    if (contextInfo.topics.includes('ovarian') && contextInfo.topics.includes('symptoms')) {
      return 'Ovarian cancer symptoms can include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, and needing to urinate more frequently. These symptoms can be common and have many causes, but if they persist or worsen, it\'s important to speak with your healthcare provider.';
    }

    return 'I understand you\'re looking for health information. While I can provide general guidance, it\'s always best to discuss specific health concerns with a qualified healthcare professional who can provide personalized advice based on your individual circumstances.';
  }

  private buildConcernResponse(contextInfo: any, userQuery: string, safetyResult: SafetyResult): string {
    let response = 'I can hear that you\'re concerned, and it\'s completely understandable to feel worried about health issues. ';

    if (contextInfo.concerns.includes('family') || contextInfo.concerns.includes('daughter') || contextInfo.concerns.includes('mother')) {
      response += 'When someone we love receives a diagnosis or has health concerns, it can be overwhelming for the whole family. ';
    }

    if (contextInfo.topics.includes('diagnosis')) {
      response += 'Receiving a diagnosis can bring up many emotions and questions. ';
    }

    response += 'It would be helpful to speak to your GP about your concerns, as they can provide personalized guidance and support. ';
    response += 'Remember that support services are available to help you through this time.';

    return response;
  }

  private buildWarningResponse(contextInfo: any, userQuery: string, safetyResult: SafetyResult): string {
    let response = 'Based on what you\'ve described, this may require urgent medical attention. ';

    if (safetyResult.matches.some(match => match.category === 'severe_bleeding')) {
      response += 'Heavy or unusual bleeding should be evaluated by a healthcare professional as soon as possible. ';
    }

    if (safetyResult.matches.some(match => match.category === 'extreme_pain')) {
      response += 'Severe pain that is persistent or worsening needs prompt medical assessment. ';
    }

    response += 'Please contact NHS 111 for urgent health advice, or speak to your GP as soon as possible. ';
    response += 'If symptoms are severe or getting rapidly worse, consider going to A&E for immediate assessment.';

    return response;
  }

  private buildCrisisResponse(
    contextInfo: any, 
    userQuery: string, 
    safetyResult: SafetyResult, 
    isSelfHarm: boolean, 
    isMedicalEmergency: boolean
  ): string {
    if (isSelfHarm) {
      return 'I\'m very concerned about what you\'ve shared. If you\'re having thoughts of self-harm or suicide, please know that you\'re not alone and help is available. Your life has value and there are people who want to support you through this difficult time. Please reach out to the Samaritans on 116 123 (free and available 24/7) or text SHOUT to 85258. If you\'re in immediate danger, please call 999.';
    }

    if (isMedicalEmergency) {
      return 'This sounds like a medical emergency that requires immediate attention. Please call 999 right now for emergency medical services. If someone has collapsed or is unconscious, ensure they are safe and breathing while waiting for help to arrive. Time is critical in emergency situations - don\'t delay seeking help.';
    }

    return 'This appears to be a crisis situation requiring immediate professional help. Please call 999 for emergency services or contact NHS 111 if you need urgent medical guidance. Your safety is the most important thing right now.';
  }

  private isSelfHarmCrisis(safetyResult: SafetyResult): boolean {
    return safetyResult.matches.some(match => 
      match.category === 'suicide_ideation' || match.category === 'self_harm'
    ) || safetyResult.riskFactors.includes('suicide_risk');
  }

  private isMedicalEmergency(safetyResult: SafetyResult): boolean {
    return safetyResult.matches.some(match => 
      match.category === 'life_threatening' || match.category === 'consciousness_issues'
    ) || safetyResult.riskFactors.includes('medical_emergency');
  }

  private generateFallbackResponse(safetyResult: SafetyResult, userQuery: string): EscalationResponse {
    return {
      escalationLevel: 2,
      responseType: 'concern',
      text: 'I want to make sure you get the right support. Please speak to your GP or contact NHS 111 for health guidance. If this is an emergency, call 999 immediately.',
      tone: 'supportive',
      disclaimers: [
        'This is a safety response due to system limitations.',
        'Please seek professional medical advice.',
        'Your safety and wellbeing are important.'
      ],
      suggestedActions: [
        'Contact GP',
        'Call NHS 111',
        'Emergency: 999'
      ],
      supportResources: this.supportResources.health_guidance,
      emergencyContacts: this.emergencyContacts.filter(contact => contact.priority === 'urgent'),
      requiresEscalation: true,
      nurseEscalation: true,
      contextualResponse: false,
      mhraCompliant: true,
      accessibilityFeatures: this.getAccessibilityFeatures(),
      responseTime: 0
    };
  }
}