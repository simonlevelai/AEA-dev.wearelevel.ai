import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { 
  SafetyResult, 
  CrisisResponse, 
  EscalationEvent, 
  ConversationContext,
  TriggerMatch,
  SeverityLevel,
  TriggerCategory,
  NotificationPayload,
  SafetyConfig,
  SafetyResultSchema,
  CrisisResponseSchema,
  EscalationEventSchema,
  ConversationContextSchema,
  NotificationPayloadSchema
} from '../types/safety';
import { Logger } from '../utils/logger';
import { NotificationService } from './NotificationService';

export class EscalationService {
  private crisisTriggers: Record<string, string[]> = {};
  private highConcernTriggers: Record<string, string[]> = {};
  private emotionalSupportTriggers: Record<string, string[]> = {};
  private safetyConfig: SafetyConfig;
  private logger: Logger;
  private notificationService: NotificationService;

  constructor(
    logger: Logger,
    notificationService: NotificationService
  ) {
    this.logger = logger;
    this.notificationService = notificationService;
    this.safetyConfig = {} as SafetyConfig; // Will be loaded in init
  }

  async initialize(): Promise<void> {
    try {
      // Load crisis triggers
      const crisisPath = path.join(process.cwd(), 'crisis-triggers.json');
      const crisisData = await fs.readFile(crisisPath, 'utf-8');
      this.crisisTriggers = JSON.parse(crisisData);

      // Load high concern triggers
      const highConcernPath = path.join(process.cwd(), 'high-concern-triggers.json');
      const highConcernData = await fs.readFile(highConcernPath, 'utf-8');
      this.highConcernTriggers = JSON.parse(highConcernData);

      // Load emotional support triggers
      const emotionalPath = path.join(process.cwd(), 'emotional-support-triggers.json');
      const emotionalData = await fs.readFile(emotionalPath, 'utf-8');
      this.emotionalSupportTriggers = JSON.parse(emotionalData);

      // Load safety configuration
      const configPath = path.join(process.cwd(), 'safety-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      this.safetyConfig = JSON.parse(configData);

      this.logger.info('EscalationService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EscalationService', { error });
      throw new Error('Critical failure: Could not initialize safety systems');
    }
  }

  async analyzeMessage(
    message: string, 
    context: ConversationContext
  ): Promise<SafetyResult> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      const validatedContext = ConversationContextSchema.parse(context);
      
      const normalizedMessage = this.normalizeMessage(message);
      const matches: TriggerMatch[] = [];

      // Multi-layer detection
      matches.push(...await this.exactMatchDetection(normalizedMessage));
      matches.push(...await this.fuzzyMatchDetection(normalizedMessage));
      matches.push(...await this.patternMatchDetection(normalizedMessage));
      matches.push(...await this.contextualAnalysis(normalizedMessage, validatedContext));

      // Determine overall severity and confidence
      const severity = this.determineSeverity(matches);
      const confidence = this.calculateConfidence(matches);
      const requiresEscalation = severity === 'crisis' || (severity === 'high_concern' && confidence > 0.8);

      // Risk factor analysis
      const riskFactors = this.identifyRiskFactors(matches, validatedContext);
      const contextualConcerns = this.analyzeContextualConcerns(validatedContext);
      const recommendedActions = this.generateRecommendedActions(severity, matches);

      const analysisTime = Date.now() - startTime;

      const result: SafetyResult = {
        severity,
        confidence,
        requiresEscalation,
        matches,
        riskFactors,
        contextualConcerns,
        analysisTime,
        recommendedActions
      };

      // Validate result before returning
      const validatedResult = SafetyResultSchema.parse(result);

      // Log the analysis
      this.logger.info('Safety analysis completed', {
        severity,
        confidence,
        requiresEscalation,
        matchCount: matches.length,
        analysisTime,
        userId: validatedContext.userId
      });

      // Check if we exceeded response time limits
      if (analysisTime > this.safetyConfig.response_times.crisis_detection_ms) {
        this.logger.warn('Crisis detection exceeded time limit', {
          analysisTime,
          limit: this.safetyConfig.response_times.crisis_detection_ms
        });
      }

      return validatedResult;
    } catch (error) {
      this.logger.error('Safety analysis failed', { error, message });
      // Return a safe default that triggers escalation
      return {
        severity: 'crisis',
        confidence: 1.0,
        requiresEscalation: true,
        matches: [],
        riskFactors: ['analysis_failure'],
        contextualConcerns: ['system_error'],
        analysisTime: Date.now() - startTime,
        recommendedActions: ['immediate_human_review']
      };
    }
  }

  async generateCrisisResponse(result: SafetyResult): Promise<CrisisResponse> {
    const startTime = Date.now();

    try {
      let immediateMessage = '';
      let resources: Array<{ name: string; contact: string; description: string; availability: string }> = [];
      
      if (result.severity === 'crisis') {
        // Determine specific crisis type
        const hasMentalHealthCrisis = result.matches.some(m => 
          ['suicide_ideation', 'self_harm', 'severe_distress'].includes(m.category)
        );
        const hasMedicalEmergency = result.matches.some(m => 
          ['life_threatening', 'severe_bleeding', 'extreme_pain', 'consciousness_issues'].includes(m.category)
        );
        const hasImmediateDanger = result.matches.some(m => m.category === 'immediate_danger');

        if (hasMedicalEmergency) {
          immediateMessage = this.safetyConfig.crisis_responses.medical_emergency.message;
          resources = this.safetyConfig.crisis_responses.medical_emergency.immediate_resources.map(resource => ({
            name: resource.split(':')[0]?.trim() ?? '',
            contact: resource.split(':')[1]?.trim() ?? '',
            description: 'Emergency medical support',
            availability: '24/7'
          }));
        } else if (hasMentalHealthCrisis) {
          immediateMessage = this.safetyConfig.crisis_responses.mental_health.message;
          resources = this.safetyConfig.crisis_responses.mental_health.immediate_resources.map(resource => ({
            name: resource.split(':')[0]?.trim() ?? '',
            contact: resource.split(':')[1]?.trim() ?? '',
            description: 'Mental health crisis support',
            availability: '24/7'
          }));
        } else if (hasImmediateDanger) {
          immediateMessage = this.safetyConfig.crisis_responses.domestic_violence.message;
          resources = this.safetyConfig.crisis_responses.domestic_violence.immediate_resources.map(resource => ({
            name: resource.split(':')[0]?.trim() ?? '',
            contact: resource.split(':')[1]?.trim() ?? '',
            description: 'Safety and protection support',
            availability: '24/7'
          }));
        }
      } else if (result.severity === 'high_concern') {
        immediateMessage = "I understand you're going through a difficult time. Let me help you find appropriate support.";
        resources = [
          {
            name: 'NHS 111',
            contact: '111',
            description: 'Non-emergency medical advice',
            availability: '24/7'
          },
          {
            name: 'Samaritans',
            contact: '116 123',
            description: 'Emotional support',
            availability: '24/7'
          }
        ];
      } else {
        immediateMessage = "Thank you for sharing. I'm here to provide information and support.";
        resources = [
          {
            name: 'NHS',
            contact: 'nhs.uk',
            description: 'Health information and services',
            availability: '24/7'
          }
        ];
      }

      const disclaimers = [
        this.safetyConfig.mhra_compliance.required_disclaimers.general,
        this.safetyConfig.mhra_compliance.required_disclaimers.medical
      ];

      if (result.severity === 'crisis') {
        disclaimers.push(this.safetyConfig.mhra_compliance.required_disclaimers.emergency);
      }

      const response: CrisisResponse = {
        immediateMessage,
        resources,
        escalationRequired: result.requiresEscalation,
        followUpRequired: result.severity === 'crisis' || result.severity === 'high_concern',
        disclaimers,
        responseTime: Date.now() - startTime
      };

      const validatedResponse = CrisisResponseSchema.parse(response);

      this.logger.info('Crisis response generated', {
        severity: result.severity,
        escalationRequired: result.requiresEscalation,
        resourceCount: resources.length,
        responseTime: validatedResponse.responseTime
      });

      return validatedResponse;
    } catch (error) {
      this.logger.error('Failed to generate crisis response', { error });
      // Return safe default response
      return {
        immediateMessage: "I'm concerned about what you've shared. Please contact emergency services at 999 if you're in immediate danger, or call Samaritans at 116 123 for support.",
        resources: [
          {
            name: 'Emergency Services',
            contact: '999',
            description: 'For immediate emergencies',
            availability: '24/7'
          },
          {
            name: 'Samaritans',
            contact: '116 123',
            description: 'Emotional support',
            availability: '24/7'
          }
        ],
        escalationRequired: true,
        followUpRequired: true,
        disclaimers: [
          'This is general health information only and should not replace professional medical advice.',
          'If this is an emergency, call 999 immediately.'
        ],
        responseTime: Date.now() - startTime
      };
    }
  }

  async notifyNurseTeam(escalation: EscalationEvent): Promise<void> {
    try {
      const validatedEscalation = EscalationEventSchema.parse(escalation);

      const notificationPayload: NotificationPayload = {
        escalationId: validatedEscalation.id,
        severity: validatedEscalation.severity,
        userId: validatedEscalation.userId,
        summary: this.generateEscalationSummary(validatedEscalation),
        triggerMatches: validatedEscalation.safetyResult.matches.map(m => m.trigger),
        timestamp: validatedEscalation.timestamp,
        urgency: this.determineUrgency(validatedEscalation.severity),
        requiresCallback: validatedEscalation.severity === 'crisis'
      };

      const validatedPayload = NotificationPayloadSchema.parse(notificationPayload);

      await this.notificationService.sendCrisisAlert(validatedPayload);

      this.logger.info('Nurse team notified successfully', {
        escalationId: validatedEscalation.id,
        severity: validatedEscalation.severity,
        userId: validatedEscalation.userId
      });
    } catch (error) {
      this.logger.error('Failed to notify nurse team', { error, escalationId: escalation.id });
      throw error;
    }
  }

  private normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private async exactMatchDetection(message: string): Promise<TriggerMatch[]> {
    const matches: TriggerMatch[] = [];

    // Check crisis triggers
    await this.checkTriggersInCategory(
      this.crisisTriggers, 
      message, 
      'crisis', 
      matches, 
      'exact'
    );

    // Check high concern triggers
    await this.checkTriggersInCategory(
      this.highConcernTriggers, 
      message, 
      'high_concern', 
      matches, 
      'exact'
    );

    // Check emotional support triggers
    await this.checkTriggersInCategory(
      this.emotionalSupportTriggers, 
      message, 
      'emotional_support', 
      matches, 
      'exact'
    );

    return matches;
  }

  private async fuzzyMatchDetection(message: string): Promise<TriggerMatch[]> {
    const matches: TriggerMatch[] = [];

    // Implement fuzzy matching for typos and variations
    const words = message.split(' ');
    
    for (const [category, triggers] of Object.entries(this.crisisTriggers)) {
      for (const [subcategory, triggerList] of Object.entries(triggers)) {
        if (Array.isArray(triggerList)) {
          for (const trigger of triggerList) {
            const fuzzyMatch = this.calculateFuzzyMatch(message, trigger);
            if (fuzzyMatch.confidence > 0.8) {
              matches.push({
                trigger,
                confidence: fuzzyMatch.confidence,
                category: subcategory as TriggerCategory,
                severity: 'crisis' as SeverityLevel,
                position: fuzzyMatch.position,
                matchType: 'fuzzy'
              });
            }
          }
        }
      }
    }

    return matches;
  }

  private async patternMatchDetection(message: string): Promise<TriggerMatch[]> {
    const matches: TriggerMatch[] = [];

    // Pattern-based detection for complex expressions
    const crisisPatterns = [
      { pattern: /(\bi\s+)?(want|wanna|gonna)\s+(to\s+)?(die|kill\s+myself)/i, category: 'suicide_ideation' },
      { pattern: /(can'?t|cannot)\s+(take|handle|cope|go\s+on)/i, category: 'severe_distress' },
      { pattern: /(chest|heart)\s+pain/i, category: 'life_threatening' },
      { pattern: /(can'?t|cannot)\s+breathe/i, category: 'life_threatening' },
      { pattern: /cut(ting)?\s+(myself|my)/i, category: 'self_harm' }
    ];

    for (const { pattern, category } of crisisPatterns) {
      const match = message.match(pattern);
      if (match) {
        matches.push({
          trigger: match[0],
          confidence: 0.9,
          category: category as TriggerCategory,
          severity: 'crisis' as SeverityLevel,
          position: {
            start: match.index ?? 0,
            end: (match.index ?? 0) + match[0].length
          },
          matchType: 'pattern'
        });
      }
    }

    return matches;
  }

  private async contextualAnalysis(
    message: string, 
    context: ConversationContext
  ): Promise<TriggerMatch[]> {
    const matches: TriggerMatch[] = [];

    // Analyze message history for escalating concerns
    const recentMessages = context.messageHistory
      .filter(msg => msg.timestamp > Date.now() - 3600000) // Last hour
      .map(msg => msg.content);

    // Check for escalating distress patterns
    const distressWords = ['worse', 'getting bad', 'can\'t handle', 'breaking down'];
    const distressCount = recentMessages.reduce((count, msg) => {
      return count + distressWords.filter(word => 
        msg.toLowerCase().includes(word)
      ).length;
    }, 0);

    if (distressCount >= 3) {
      matches.push({
        trigger: 'escalating_distress_pattern',
        confidence: 0.8,
        category: 'severe_distress',
        severity: 'high_concern',
        position: { start: 0, end: message.length },
        matchType: 'context'
      });
    }

    // Check vulnerability flags
    const vulnerabilityFlags = context.userProfile?.vulnerabilityFlags ?? [];
    if (vulnerabilityFlags.includes('high_risk') && this.containsDistressLanguage(message)) {
      matches.push({
        trigger: 'high_risk_user_distress',
        confidence: 0.9,
        category: 'severe_distress',
        severity: 'crisis',
        position: { start: 0, end: message.length },
        matchType: 'context'
      });
    }

    return matches;
  }

  private async checkTriggersInCategory(
    triggers: Record<string, unknown>,
    message: string,
    severity: SeverityLevel,
    matches: TriggerMatch[],
    matchType: 'exact' | 'fuzzy' | 'pattern' | 'context'
  ): Promise<void> {
    for (const [category, triggerData] of Object.entries(triggers)) {
      if (typeof triggerData === 'object' && triggerData !== null) {
        for (const [subcategory, triggerList] of Object.entries(triggerData)) {
          if (Array.isArray(triggerList)) {
            for (const trigger of triggerList) {
              if (typeof trigger === 'string' && message.includes(trigger)) {
                const start = message.indexOf(trigger);
                matches.push({
                  trigger,
                  confidence: 1.0,
                  category: subcategory as TriggerCategory,
                  severity,
                  position: {
                    start,
                    end: start + trigger.length
                  },
                  matchType
                });
              }
            }
          }
        }
      } else if (Array.isArray(triggerData)) {
        for (const trigger of triggerData) {
          if (typeof trigger === 'string' && message.includes(trigger)) {
            const start = message.indexOf(trigger);
            matches.push({
              trigger,
              confidence: 1.0,
              category: category as TriggerCategory,
              severity,
              position: {
                start,
                end: start + trigger.length
              },
              matchType
            });
          }
        }
      }
    }
  }

  private calculateFuzzyMatch(text: string, trigger: string): { confidence: number; position: { start: number; end: number } } {
    // Simple Levenshtein-based fuzzy matching
    const words = text.split(' ');
    const triggerWords = trigger.split(' ');
    
    for (let i = 0; i <= words.length - triggerWords.length; i++) {
      const slice = words.slice(i, i + triggerWords.length).join(' ');
      const distance = this.levenshteinDistance(slice, trigger);
      const maxLength = Math.max(slice.length, trigger.length);
      const similarity = 1 - (distance / maxLength);
      
      if (similarity > 0.8) {
        const start = words.slice(0, i).join(' ').length + (i > 0 ? 1 : 0);
        return {
          confidence: similarity,
          position: {
            start,
            end: start + slice.length
          }
        };
      }
    }
    
    return { confidence: 0, position: { start: 0, end: 0 } };
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private determineSeverity(matches: TriggerMatch[]): SeverityLevel {
    if (matches.some(m => m.severity === 'crisis')) {
      return 'crisis';
    }
    if (matches.some(m => m.severity === 'high_concern')) {
      return 'high_concern';
    }
    if (matches.some(m => m.severity === 'emotional_support')) {
      return 'emotional_support';
    }
    return 'general';
  }

  private calculateConfidence(matches: TriggerMatch[]): number {
    if (matches.length === 0) return 0;
    
    const totalConfidence = matches.reduce((sum, match) => sum + match.confidence, 0);
    const averageConfidence = totalConfidence / matches.length;
    
    // Boost confidence for multiple matches
    const matchBonus = Math.min(matches.length * 0.1, 0.3);
    
    return Math.min(averageConfidence + matchBonus, 1.0);
  }

  private identifyRiskFactors(matches: TriggerMatch[], context: ConversationContext): string[] {
    const riskFactors: string[] = [];

    // Multiple crisis indicators
    if (matches.filter(m => m.severity === 'crisis').length > 1) {
      riskFactors.push('multiple_crisis_indicators');
    }

    // High confidence matches
    if (matches.some(m => m.confidence > 0.9)) {
      riskFactors.push('high_confidence_triggers');
    }

    // Vulnerability flags
    const vulnerabilityFlags = context.userProfile?.vulnerabilityFlags ?? [];
    if (vulnerabilityFlags.length > 0) {
      riskFactors.push('vulnerable_user_profile');
    }

    // Previous escalations
    const previousEscalations = context.userProfile?.previousEscalations ?? [];
    if (previousEscalations.length > 0) {
      riskFactors.push('previous_escalation_history');
    }

    return riskFactors;
  }

  private analyzeContextualConcerns(context: ConversationContext): string[] {
    const concerns: string[] = [];

    // Recent message frequency
    const recentMessages = context.messageHistory.filter(
      msg => msg.timestamp > Date.now() - 3600000
    );
    if (recentMessages.length > 10) {
      concerns.push('high_message_frequency');
    }

    // Late night conversations
    const currentHour = new Date().getHours();
    if (currentHour < 6 || currentHour > 22) {
      concerns.push('late_night_distress');
    }

    return concerns;
  }

  private generateRecommendedActions(severity: SeverityLevel, matches: TriggerMatch[]): string[] {
    const actions: string[] = [];

    if (severity === 'crisis') {
      actions.push('immediate_nurse_notification');
      actions.push('crisis_resource_provision');
      actions.push('safety_plan_activation');
      
      if (matches.some(m => m.category === 'life_threatening')) {
        actions.push('emergency_services_guidance');
      }
    } else if (severity === 'high_concern') {
      actions.push('nurse_notification');
      actions.push('support_resource_provision');
      actions.push('follow_up_scheduling');
    } else if (severity === 'emotional_support') {
      actions.push('emotional_support_resources');
      actions.push('gentle_inquiry');
    }

    return actions;
  }

  private containsDistressLanguage(message: string): boolean {
    const distressWords = [
      'overwhelmed', 'can\'t cope', 'struggling', 'breaking down',
      'hopeless', 'desperate', 'exhausted', 'giving up'
    ];
    
    return distressWords.some(word => message.toLowerCase().includes(word));
  }

  private generateEscalationSummary(escalation: EscalationEvent): string {
    const { severity, safetyResult } = escalation;
    const triggerCount = safetyResult.matches.length;
    const primaryTriggers = safetyResult.matches
      .slice(0, 3)
      .map(m => m.category)
      .join(', ');

    return `${severity.toUpperCase()} escalation: ${triggerCount} triggers detected (${primaryTriggers})`;
  }

  private determineUrgency(severity: SeverityLevel): 'immediate' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'crisis':
        return 'immediate';
      case 'high_concern':
        return 'high';
      case 'emotional_support':
        return 'medium';
      default:
        return 'low';
    }
  }

  async createEscalationEvent(
    userId: string,
    sessionId: string,
    userMessage: string,
    safetyResult: SafetyResult
  ): Promise<EscalationEvent> {
    const escalationEvent: EscalationEvent = {
      id: uuidv4(),
      userId,
      sessionId,
      severity: safetyResult.severity,
      safetyResult,
      userMessage,
      timestamp: Date.now(),
      notificationSent: false,
      nurseTeamAlerted: false,
      responseGenerated: false
    };

    return EscalationEventSchema.parse(escalationEvent);
  }
}