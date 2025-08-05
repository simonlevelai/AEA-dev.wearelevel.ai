import { ProgressiveEscalationService } from '../ProgressiveEscalationService';
import { SafetyResult } from '../../types/safety';
import { Logger } from '../../utils/logger';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as unknown as Logger;

describe('ProgressiveEscalationService', () => {
  let escalationService: ProgressiveEscalationService;

  beforeEach(() => {
    jest.clearAllMocks();
    escalationService = new ProgressiveEscalationService(mockLogger);
  });

  describe('Level 1: Information Responses', () => {
    test('should provide general health information with disclaimers', async () => {
      const safetyResult: SafetyResult = {
        severity: 'general',
        confidence: 0.3,
        requiresEscalation: false,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: ['provide_information']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'Tell me about cervical screening');

      expect(response.escalationLevel).toBe(1);
      expect(response.responseType).toBe('information');
      expect(response.text).toContain('Cervical screening');
      expect(response.disclaimers.join(' ')).toContain('This is general health information only');
      expect(response.suggestedActions).toContain('Learn more');
      expect(response.requiresEscalation).toBe(false);
    });

    test('should include appropriate medical disclaimers for Level 1', async () => {
      const safetyResult: SafetyResult = {
        severity: 'general',
        confidence: 0.2,
        requiresEscalation: false,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 80,
        recommendedActions: ['provide_information']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'What are ovarian cancer symptoms?');

      expect(response.disclaimers.join(' ')).toContain('This is general health information only');
      expect(response.disclaimers.join(' ')).toContain('should not replace professional medical advice');
      expect(response.disclaimers.join(' ')).toContain('Always consult your healthcare provider');
    });
  });

  describe('Level 2: Concern Responses', () => {
    test('should provide GP referral guidance with support resources', async () => {
      const safetyResult: SafetyResult = {
        severity: 'emotional_support',
        confidence: 0.6,
        requiresEscalation: true,
        matches: [{
          trigger: 'worried about symptoms',
          confidence: 0.6,
          category: 'medical_concerns',
          severity: 'emotional_support',
          position: { start: 0, end: 20 },
          matchType: 'fuzzy'
        }],
        riskFactors: ['health_anxiety'],
        contextualConcerns: ['symptom_worry'],
        analysisTime: 150,
        recommendedActions: ['gp_referral', 'emotional_support']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'I am really worried about these symptoms');

      expect(response.escalationLevel).toBe(2);
      expect(response.responseType).toBe('concern');
      expect(response.text).toContain('concerned');
      expect(response.text).toContain('speak to your GP');
      expect(response.suggestedActions).toContain('Contact GP');
      expect(response.supportResources).toBeDefined();
      expect(response.supportResources.length).toBeGreaterThan(0);
    });

    test('should include support resources for Level 2 responses', async () => {
      const safetyResult: SafetyResult = {
        severity: 'emotional_support',
        confidence: 0.7,
        requiresEscalation: true,
        matches: [],
        riskFactors: ['emotional_distress'],
        contextualConcerns: ['worried'],
        analysisTime: 120,
        recommendedActions: ['emotional_support']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'I am feeling overwhelmed');

      expect(response.supportResources).toContainEqual(
        expect.objectContaining({
          name: 'The Eve Appeal Support Line',
          contact: expect.stringContaining('0207'),
          type: 'emotional_support'
        })
      );
      expect(response.supportResources).toContainEqual(
        expect.objectContaining({
          name: 'NHS 111',
          contact: '111',
          type: 'health_guidance'
        })
      );
    });
  });

  describe('Level 3: Warning Responses', () => {
    test('should provide urgent medical attention guidance', async () => {
      const safetyResult: SafetyResult = {
        severity: 'high_concern',
        confidence: 0.8,
        requiresEscalation: true,
        matches: [{
          trigger: 'severe pain',
          confidence: 0.8,
          category: 'severe_bleeding',
          severity: 'high_concern',
          position: { start: 0, end: 11 },
          matchType: 'exact'
        }],
        riskFactors: ['severe_symptoms'],
        contextualConcerns: ['pain_intensity'],
        analysisTime: 200,
        recommendedActions: ['urgent_medical_attention']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'I have severe abdominal pain');

      expect(response.escalationLevel).toBe(3);
      expect(response.responseType).toBe('warning');
      expect(response.text).toContain('urgent medical attention');
      expect(response.text).toContain('NHS 111');
      expect(response.suggestedActions).toContain('Call NHS 111');
      expect(response.suggestedActions).toContain('Contact GP urgently');
      expect(response.requiresEscalation).toBe(true);
    });

    test('should include emergency contact information for Level 3', async () => {
      const safetyResult: SafetyResult = {
        severity: 'high_concern',
        confidence: 0.9,
        requiresEscalation: true,
        matches: [],
        riskFactors: ['urgent_symptoms'],
        contextualConcerns: ['severity'],
        analysisTime: 180,
        recommendedActions: ['urgent_care']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'heavy bleeding wont stop');

      expect(response.emergencyContacts).toBeDefined();
      expect(response.emergencyContacts.length).toBeGreaterThan(0);
      expect(response.emergencyContacts).toContainEqual(
        expect.objectContaining({
          service: 'NHS 111',
          number: '111',
          availability: '24/7'
        })
      );
    });
  });

  describe('Level 4: Crisis Responses', () => {
    test('should provide immediate emergency guidance for medical emergencies', async () => {
      const safetyResult: SafetyResult = {
        severity: 'crisis',
        confidence: 0.95,
        requiresEscalation: true,
        matches: [{
          trigger: 'unconscious',
          confidence: 0.95,
          category: 'life_threatening',
          severity: 'crisis',
          position: { start: 0, end: 10 },
          matchType: 'exact'
        }],
        riskFactors: ['medical_emergency'],
        contextualConcerns: ['consciousness'],
        analysisTime: 50,
        recommendedActions: ['emergency_services']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'someone collapsed and is unconscious');

      expect(response.escalationLevel).toBe(4);
      expect(response.responseType).toBe('crisis');
      expect(response.text).toContain('999');
      expect(response.text).toContain('medical emergency');
      expect(response.immediateActions).toContain('Call 999 immediately');
      expect(response.nurseEscalation).toBe(true);
      expect(response.requiresEscalation).toBe(true);
    });

    test('should provide self-harm crisis response with multiple support options', async () => {
      const safetyResult: SafetyResult = {
        severity: 'crisis',
        confidence: 0.92,
        requiresEscalation: true,
        matches: [{
          trigger: 'want to die',
          confidence: 0.92,
          category: 'suicide_ideation',
          severity: 'crisis',
          position: { start: 0, end: 11 },
          matchType: 'pattern'
        }],
        riskFactors: ['suicide_risk'],
        contextualConcerns: ['suicidal_ideation'],
        analysisTime: 75,
        recommendedActions: ['crisis_intervention', 'immediate_support']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'I want to die');

      expect(response.escalationLevel).toBe(4);
      expect(response.responseType).toBe('crisis');
      expect(response.text).toContain('concerned about what you\'ve shared');
      expect(response.emergencyContacts).toContainEqual(
        expect.objectContaining({
          service: 'Samaritans',
          number: '116 123'
        })
      );
      expect(response.emergencyContacts).toContainEqual(
        expect.objectContaining({
          service: 'Crisis Text Line',
          number: '85258'
        })
      );
      expect(response.immediateActions).toContain('Reach out for support');
    });

    test('should trigger nurse team escalation for Level 4 responses', async () => {
      const safetyResult: SafetyResult = {
        severity: 'crisis',
        confidence: 0.98,
        requiresEscalation: true,
        matches: [],
        riskFactors: ['immediate_danger'],
        contextualConcerns: ['crisis'],
        analysisTime: 60,
        recommendedActions: ['immediate_intervention']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'emergency situation');

      expect(response.nurseEscalation).toBe(true);
      expect(response.escalationMetadata).toBeDefined();
      expect(response.escalationMetadata.priority).toBe('immediate');
      expect(response.escalationMetadata.requiresCallback).toBe(true);
    });
  });

  describe('Context-Aware Response Generation', () => {
    test('should tailor response based on user query content', async () => {
      const safetyResult: SafetyResult = {
        severity: 'emotional_support',
        confidence: 0.65,
        requiresEscalation: true,
        matches: [],
        riskFactors: ['emotional_distress'],
        contextualConcerns: ['family_concern'],
        analysisTime: 140,
        recommendedActions: ['family_support']
      };

      const response = await escalationService.generateEscalationResponse(
        safetyResult, 
        'My daughter has been diagnosed with ovarian cancer and I am terrified'
      );

      expect(response.text).toContain('diagnosis');
      expect(response.text).toContain('support');
      expect(response.contextualResponse).toBe(true);
      // Family support should be available for family-related concerns
      const hasFamily = response.text.includes('family') || response.text.includes('diagnosis');
      expect(hasFamily).toBe(true);
    });

    test('should maintain consistent tone across escalation levels', async () => {
      const testCases = [
        { severity: 'general' as const, expectedTone: 'informative' },
        { severity: 'emotional_support' as const, expectedTone: 'supportive' },
        { severity: 'high_concern' as const, expectedTone: 'urgent' },
        { severity: 'crisis' as const, expectedTone: 'immediate' }
      ];

      for (const testCase of testCases) {
        const safetyResult: SafetyResult = {
          severity: testCase.severity,
          confidence: 0.7,
          requiresEscalation: testCase.severity !== 'general',
          matches: [],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 100,
          recommendedActions: []
        };

        const response = await escalationService.generateEscalationResponse(safetyResult, 'test query');

        expect(response.tone).toBe(testCase.expectedTone);
        expect(response.text).toBeTruthy();
        expect(response.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Resource Management', () => {
    test('should provide appropriate resources for different escalation levels', async () => {
      const levelConfigs = [
        { level: 1, severity: 'general' as const, expectsSupport: false, expectsEmergency: false },
        { level: 2, severity: 'emotional_support' as const, expectsSupport: true, expectsEmergency: false },
        { level: 3, severity: 'high_concern' as const, expectsSupport: true, expectsEmergency: true },
        { level: 4, severity: 'crisis' as const, expectsSupport: true, expectsEmergency: true }
      ];

      for (const config of levelConfigs) {
        const safetyResult: SafetyResult = {
          severity: config.severity,
          confidence: 0.8,
          requiresEscalation: config.level > 1,
          matches: [],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 100,
          recommendedActions: []
        };

        const response = await escalationService.generateEscalationResponse(safetyResult, 'test query');

        expect(response.escalationLevel).toBe(config.level);
        
        if (config.expectsSupport) {
          expect(response.supportResources).toBeDefined();
          expect(response.supportResources.length).toBeGreaterThan(0);
        }
        
        if (config.expectsEmergency) {
          expect(response.emergencyContacts).toBeDefined();
          expect(response.emergencyContacts.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Accessibility and Compliance', () => {
    test('should generate screen reader compatible responses', async () => {
      const safetyResult: SafetyResult = {
        severity: 'crisis',
        confidence: 0.9,
        requiresEscalation: true,
        matches: [],
        riskFactors: ['medical_emergency'],
        contextualConcerns: [],
        analysisTime: 80,
        recommendedActions: ['emergency_services']
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'medical emergency');

      expect(response.accessibilityFeatures).toBeDefined();
      expect(response.accessibilityFeatures.screenReaderCompatible).toBe(true);
      expect(response.accessibilityFeatures.highContrast).toBe(true);
      expect(response.accessibilityFeatures.keyboardNavigable).toBe(true);
    });

    test('should comply with MHRA medical device regulations', async () => {
      const safetyResult: SafetyResult = {
        severity: 'general',
        confidence: 0.4,
        requiresEscalation: false,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 90,
        recommendedActions: []
      };

      const response = await escalationService.generateEscalationResponse(safetyResult, 'health question');

      expect(response.mhraCompliant).toBe(true);
      expect(response.disclaimers.join(' ')).toContain('not a medical professional');
      expect(response.disclaimers.join(' ')).toContain('should not replace professional medical advice');
      
      // Should not contain prohibited language
      expect(response.text).not.toMatch(/you should (take|stop|start|change)/i);
      expect(response.text).not.toMatch(/definitely|certainly/i);
      expect(response.text).not.toMatch(/you (have|might have|probably have)/i);
    });
  });
});