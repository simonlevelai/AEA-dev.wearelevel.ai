import { SafetyService, SafetyResult } from '../types';
import { EscalationService } from './EscalationService';
import { ConversationContext } from '../types/safety';
import { Logger } from '../utils/logger';

/**
 * Adapter that bridges the SafetyService interface with the EscalationService implementation
 * This allows the AskEveAssistBot to use the existing safety infrastructure
 */
export class SafetyServiceAdapter implements SafetyService {
  private escalationService: EscalationService;
  private logger: Logger;

  constructor(escalationService: EscalationService, logger: Logger) {
    this.escalationService = escalationService;
    this.logger = logger;
  }

  async analyzeMessage(
    text: string, 
    conversationHistory: Array<{text: string; isUser: boolean; timestamp: Date}>
  ): Promise<SafetyResult> {
    try {
      // Convert conversation history format
      const context: ConversationContext = {
        userId: 'current-user', // Will be overridden by middleware
        sessionId: 'current-session', // Will be overridden by middleware
        messageHistory: conversationHistory.map((msg, index) => ({
          role: msg.isUser ? 'user' as const : 'assistant' as const,
          content: msg.text,
          timestamp: msg.timestamp.getTime()
        }))
      };

      // Use the EscalationService to analyze the message
      const escalationResult = await this.escalationService.analyzeMessage(text, context);

      // Convert EscalationService result to SafetyService result
      const safetyResult: SafetyResult = {
        shouldEscalate: escalationResult.requiresEscalation,
        severity: this.mapSeverityLevel(escalationResult.severity),
        reason: escalationResult.matches.length > 0 
          ? `Detected ${escalationResult.matches.length} safety concerns: ${escalationResult.matches.map(m => m.category).join(', ')}`
          : undefined,
        escalationType: this.mapEscalationType(escalationResult.severity, escalationResult.matches)
      };

      return safetyResult;
    } catch (error) {
      this.logger.error('SafetyServiceAdapter analysis failed', { error, text });
      
      // Return safe default that escalates
      return {
        shouldEscalate: true,
        severity: 'critical',
        reason: 'Safety analysis failed - defaulting to escalation',
        escalationType: 'inappropriate_content'
      };
    }
  }

  private mapSeverityLevel(escalationSeverity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (escalationSeverity) {
      case 'crisis':
        return 'critical';
      case 'high_concern':
        return 'high';
      case 'emotional_support':
        return 'medium';
      case 'general':
      default:
        return 'low';
    }
  }

  private mapEscalationType(
    severity: string, 
    matches: Array<{ category: string }>
  ): 'medical_emergency' | 'self_harm' | 'inappropriate_content' | undefined {
    if (severity === 'crisis' || severity === 'high_concern') {
      // Check for specific crisis types
      const hasLifeThreatening = matches.some(m => 
        ['life_threatening', 'severe_bleeding', 'extreme_pain', 'consciousness_issues'].includes(m.category)
      );
      const hasSelfHarm = matches.some(m => 
        ['suicide_ideation', 'self_harm'].includes(m.category)
      );

      if (hasLifeThreatening) {
        return 'medical_emergency';
      } else if (hasSelfHarm) {
        return 'self_harm';
      } else if (severity === 'crisis') {
        return 'inappropriate_content';
      }
    }

    return undefined;
  }
}