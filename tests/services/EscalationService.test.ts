import { EscalationService } from '../../src/services/EscalationService';
import { NotificationService } from '../../src/services/NotificationService';
import { Logger } from '../../src/utils/logger';
import { ConversationContext } from '../../src/types/safety';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../src/services/NotificationService');
jest.mock('../../src/utils/logger');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('EscalationService', () => {
  let escalationService: EscalationService;
  let mockLogger: jest.Mocked<Logger>;
  let mockNotificationService: jest.Mocked<NotificationService>;

  // Mock data for testing
  const mockCrisisTriggers = {
    mental_health_crisis: {
      suicide_ideation: [
        'want to die',
        'kill myself',
        'end it all',
        'suicide',
        'better off dead'
      ],
      self_harm: [
        'self harm',
        'hurt myself',
        'cut myself',
        'cutting'
      ],
      severe_distress: [
        'can\'t go on',
        'can\'t cope anymore',
        'given up',
        'no hope left'
      ]
    },
    medical_emergency: {
      life_threatening: [
        'can\'t breathe',
        'chest pain',
        'heart attack',
        'stroke'
      ],
      severe_bleeding: [
        'won\'t stop bleeding',
        'bleeding heavily',
        'hemorrhaging'
      ]
    }
  };

  const mockSafetyConfig = {
    response_times: {
      crisis_detection_ms: 500,
      crisis_response_ms: 2000,
      nurse_notification_ms: 60000,
      audit_logging_ms: 100
    },
    escalation_levels: {
      crisis: {
        priority: 1,
        immediate_response: true,
        nurse_notification: true,
        supervisor_alert: true,
        log_level: 'CRITICAL'
      }
    },
    mhra_compliance: {
      prohibited_patterns: [],
      required_disclaimers: {
        general: 'This is general health information only',
        medical: 'Always consult your healthcare provider',
        emergency: 'If this is an emergency, call 999'
      }
    },
    crisis_responses: {
      mental_health: {
        message: 'I\'m concerned about what you\'ve shared',
        immediate_resources: [
          'Samaritans: 116 123',
          'Crisis Text Line: Text SHOUT to 85258'
        ]
      },
      medical_emergency: {
        message: 'This sounds like a medical emergency',
        immediate_resources: [
          'Emergency Services: 999',
          'NHS 111: Call 111'
        ]
      }
    }
  };

  const mockContext: ConversationContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    messageHistory: []
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock logger
    mockLogger = new MockLogger() as jest.Mocked<Logger>;
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.debug = jest.fn();

    // Setup mock notification service
    mockNotificationService = new MockNotificationService('', mockLogger) as jest.Mocked<NotificationService>;
    mockNotificationService.sendCrisisAlert = jest.fn().mockResolvedValue(undefined);

    // Setup file system mocks
    mockFs.readFile = jest.fn()
      .mockImplementation((filePath: string) => {
        if (filePath.includes('crisis.json')) {
          return Promise.resolve(JSON.stringify(mockCrisisTriggers));
        }
        if (filePath.includes('high-concern.json')) {
          return Promise.resolve(JSON.stringify({}));
        }
        if (filePath.includes('emotional-support.json')) {
          return Promise.resolve(JSON.stringify({}));
        }
        if (filePath.includes('safety-config.json')) {
          return Promise.resolve(JSON.stringify(mockSafetyConfig));
        }
        return Promise.reject(new Error('File not found'));
      });

    // Create service instance
    escalationService = new EscalationService(mockLogger, mockNotificationService);
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      await escalationService.initialize();
      
      expect(mockFs.readFile).toHaveBeenCalledTimes(4);
      expect(mockLogger.info).toHaveBeenCalledWith('EscalationService initialized successfully');
    });

    it('should throw error if configuration files are missing', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      await expect(escalationService.initialize()).rejects.toThrow('Critical failure: Could not initialize safety systems');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize EscalationService', expect.any(Object));
    });
  });

  describe('crisis detection - mental health', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    // Test every suicide ideation trigger
    const suicideIdeationTriggers = [
      'want to die', 'kill myself', 'end it all', 'suicide', 'better off dead'
    ];

    test.each(suicideIdeationTriggers)(
      'should detect "%s" as crisis suicide ideation', 
      async (trigger) => {
        const result = await escalationService.analyzeMessage(
          `I ${trigger} and can't take this anymore`,
          mockContext
        );

        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0]?.trigger).toBe(trigger);
        expect(result.matches[0]?.category).toBe('suicide_ideation');
        expect(result.matches[0]?.confidence).toBe(1.0);
      }
    );

    // Test variations and typos
    test.each([
      ['I want to die', 'want to die'],
      ['i wanna die', 'want to die'], // Should catch fuzzy match
      ['I WANT TO DIE', 'want to die'], // Case insensitive
      ['gonna kill myself', 'kill myself'],
      ['thinking about suicide', 'suicide']
    ])('should detect variations: "%s" matches "%s"', async (input, expectedTrigger) => {
      const result = await escalationService.analyzeMessage(input, mockContext);
      
      expect(result.severity).toBe('crisis');
      expect(result.requiresEscalation).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      
      // Should have a match for the expected trigger or a close variation
      const hasMatch = result.matches.some(match => 
        match.trigger === expectedTrigger || 
        match.trigger.includes(expectedTrigger.split(' ')[0] ?? '')
      );
      expect(hasMatch).toBe(true);
    });

    // Test self-harm triggers
    const selfHarmTriggers = ['self harm', 'hurt myself', 'cut myself', 'cutting'];
    
    test.each(selfHarmTriggers)(
      'should detect "%s" as crisis self-harm',
      async (trigger) => {
        const result = await escalationService.analyzeMessage(
          `I need to ${trigger} to feel better`,
          mockContext
        );

        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.matches.some(m => m.trigger === trigger)).toBe(true);
        expect(result.matches.some(m => m.category === 'self_harm')).toBe(true);
      }
    );

    // Test severe distress triggers
    const severeDistressTriggers = ['can\'t go on', 'can\'t cope anymore', 'given up', 'no hope left'];
    
    test.each(severeDistressTriggers)(
      'should detect "%s" as crisis severe distress',
      async (trigger) => {
        const result = await escalationService.analyzeMessage(
          `I just ${trigger} with everything`,
          mockContext
        );

        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.matches.some(m => m.trigger === trigger)).toBe(true);
        expect(result.matches.some(m => m.category === 'severe_distress')).toBe(true);
      }
    );
  });

  describe('crisis detection - medical emergency', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    // Test life-threatening triggers
    const lifeThreatening = ['can\'t breathe', 'chest pain', 'heart attack', 'stroke'];
    
    test.each(lifeThreatening)(
      'should detect "%s" as crisis life-threatening',
      async (trigger) => {
        const result = await escalationService.analyzeMessage(
          `I have ${trigger} right now`,
          mockContext
        );

        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.matches.some(m => m.trigger === trigger)).toBe(true);
        expect(result.matches.some(m => m.category === 'life_threatening')).toBe(true);
      }
    );

    // Test severe bleeding triggers
    const severeBleedingTriggers = ['won\'t stop bleeding', 'bleeding heavily', 'hemorrhaging'];
    
    test.each(severeBleedingTriggers)(
      'should detect "%s" as crisis severe bleeding',
      async (trigger) => {
        const result = await escalationService.analyzeMessage(
          `The wound ${trigger} and I don't know what to do`,
          mockContext
        );

        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.matches.some(m => m.trigger === trigger)).toBe(true);
        expect(result.matches.some(m => m.category === 'severe_bleeding')).toBe(true);
      }
    );
  });

  describe('pattern-based detection', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should detect suicide ideation patterns', async () => {
      const patterns = [
        'I want to die tonight',
        'gonna kill myself tomorrow',
        'wanna end it all',
        'i want 2 die'
      ];

      for (const pattern of patterns) {
        const result = await escalationService.analyzeMessage(pattern, mockContext);
        
        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.matches.length).toBeGreaterThan(0);
      }
    });

    it('should detect severe distress patterns', async () => {
      const patterns = [
        'can\'t take this anymore',
        'cannot handle this',
        'can\'t go on like this',
        'cannot cope with life'
      ];

      for (const pattern of patterns) {
        const result = await escalationService.analyzeMessage(pattern, mockContext);
        
        expect(result.severity).toBe('crisis');
        expect(result.matches.length).toBeGreaterThan(0);
      }
    });

    it('should detect medical emergency patterns', async () => {
      const patterns = [
        'having chest pain',
        'can\'t breathe properly',
        'heart is hurting',
        'chest hurts badly'
      ];

      for (const pattern of patterns) {
        const result = await escalationService.analyzeMessage(pattern, mockContext);
        
        expect(result.severity).toBe('crisis');
        expect(result.matches.length).toBeGreaterThan(0);
      }
    });
  });

  describe('contextual analysis', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should escalate based on message history', async () => {
      const contextWithHistory: ConversationContext = {
        ...mockContext,
        messageHistory: [
          { role: 'user', content: 'feeling worse today', timestamp: Date.now() - 1800000 },
          { role: 'user', content: 'getting bad again', timestamp: Date.now() - 900000 },
          { role: 'user', content: 'can\'t handle this', timestamp: Date.now() - 300000 }
        ]
      };

      const result = await escalationService.analyzeMessage(
        'breaking down completely',
        contextWithHistory
      );

      expect(result.matches.some(m => m.matchType === 'context')).toBe(true);
    });

    it('should escalate high-risk users with distress language', async () => {
      const highRiskContext: ConversationContext = {
        ...mockContext,
        userProfile: {
          age: 25,
          vulnerabilityFlags: ['high_risk'],
          previousEscalations: []
        }
      };

      const result = await escalationService.analyzeMessage(
        'feeling overwhelmed and hopeless',
        highRiskContext
      );

      expect(result.matches.some(m => m.matchType === 'context')).toBe(true);
      expect(result.riskFactors).toContain('vulnerable_user_profile');
    });
  });

  describe('response generation', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should generate appropriate mental health crisis response', async () => {
      const safetyResult = await escalationService.analyzeMessage(
        'I want to kill myself',
        mockContext
      );

      const response = await escalationService.generateCrisisResponse(safetyResult);

      expect(response.immediateMessage).toContain('concerned about what you\'ve shared');
      expect(response.resources).toHaveLength(2);
      expect(response.resources[0]?.name).toBe('Samaritans');
      expect(response.resources[0]?.contact).toBe('116 123');
      expect(response.escalationRequired).toBe(true);
      expect(response.followUpRequired).toBe(true);
      expect(response.disclaimers).toContain('This is general health information only');
    });

    it('should generate appropriate medical emergency response', async () => {
      const safetyResult = await escalationService.analyzeMessage(
        'having severe chest pain',
        mockContext
      );

      const response = await escalationService.generateCrisisResponse(safetyResult);

      expect(response.immediateMessage).toContain('medical emergency');
      expect(response.resources[0]?.name).toBe('Emergency Services');
      expect(response.resources[0]?.contact).toBe('999');
      expect(response.disclaimers).toContain('If this is an emergency, call 999');
    });

    it('should handle response generation failures gracefully', async () => {
      const invalidSafetyResult = {
        severity: 'crisis' as const,
        confidence: 1.0,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      };

      // Force an error in response generation
      jest.spyOn(escalationService, 'generateCrisisResponse')
        .mockImplementationOnce(() => {
          throw new Error('Response generation failed');
        });

      const response = await escalationService.generateCrisisResponse(invalidSafetyResult);

      // Should return safe default response
      expect(response.immediateMessage).toContain('concerned about what you\'ve shared');
      expect(response.resources).toHaveLength(2);
      expect(response.escalationRequired).toBe(true);
    });
  });

  describe('nurse team notification', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should notify nurse team for crisis escalation', async () => {
      const escalationEvent = await escalationService.createEscalationEvent(
        'test-user',
        'test-session',
        'I want to die',
        {
          severity: 'crisis',
          confidence: 1.0,
          requiresEscalation: true,
          matches: [{
            trigger: 'want to die',
            confidence: 1.0,
            category: 'suicide_ideation',
            severity: 'crisis',
            position: { start: 2, end: 12 },
            matchType: 'exact'
          }],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 50,
          recommendedActions: ['immediate_nurse_notification']
        }
      );

      await escalationService.notifyNurseTeam(escalationEvent);

      expect(mockNotificationService.sendCrisisAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          escalationId: escalationEvent.id,
          severity: 'crisis',
          userId: 'test-user',
          urgency: 'immediate',
          requiresCallback: true
        })
      );
    });

    it('should handle notification failures gracefully', async () => {
      mockNotificationService.sendCrisisAlert.mockRejectedValue(new Error('Notification failed'));

      const escalationEvent = await escalationService.createEscalationEvent(
        'test-user',
        'test-session',
        'crisis message',
        {
          severity: 'crisis',
          confidence: 1.0,
          requiresEscalation: true,
          matches: [],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 50,
          recommendedActions: []
        }
      );

      await expect(escalationService.notifyNurseTeam(escalationEvent)).rejects.toThrow('Notification failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to notify nurse team',
        expect.objectContaining({ escalationId: escalationEvent.id })
      );
    });
  });

  describe('performance requirements', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should complete crisis detection within 500ms', async () => {
      const startTime = Date.now();
      
      await escalationService.analyzeMessage(
        'I want to kill myself and end it all',
        mockContext
      );
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
    });

    it('should generate crisis response within 2 seconds', async () => {
      const safetyResult = await escalationService.analyzeMessage(
        'I want to die',
        mockContext
      );

      const startTime = Date.now();
      const response = await escalationService.generateCrisisResponse(safetyResult);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
      expect(response.responseTime).toBeLessThan(2000);
    });
  });

  describe('edge cases and safety', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should handle empty messages safely', async () => {
      const result = await escalationService.analyzeMessage('', mockContext);
      
      expect(result.severity).toBe('general');
      expect(result.matches).toHaveLength(0);
      expect(result.requiresEscalation).toBe(false);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'I am feeling ' + 'very '.repeat(1000) + 'sad and want to die';
      
      const result = await escalationService.analyzeMessage(longMessage, mockContext);
      
      expect(result.severity).toBe('crisis');
      expect(result.matches.some(m => m.trigger === 'want to die')).toBe(true);
    });

    it('should handle malformed context gracefully', async () => {
      const malformedContext = {
        userId: '',
        sessionId: '',
        messageHistory: []
      };

      const result = await escalationService.analyzeMessage(
        'test message',
        malformedContext as ConversationContext
      );

      expect(result).toBeDefined();
      expect(result.severity).toBeDefined();
    });

    it('should fail safe on analysis errors', async () => {
      // Mock an internal error
      jest.spyOn(escalationService as any, 'exactMatchDetection')
        .mockRejectedValue(new Error('Analysis failed'));

      const result = await escalationService.analyzeMessage(
        'test message',
        mockContext
      );

      // Should return crisis-level result to err on the side of caution
      expect(result.severity).toBe('crisis');
      expect(result.requiresEscalation).toBe(true);
      expect(result.riskFactors).toContain('analysis_failure');
    });
  });

  describe('fuzzy matching', () => {
    beforeEach(async () => {
      await escalationService.initialize();
    });

    it('should detect typos and variations', async () => {
      const typoVariations = [
        'wnat to die',     // typo
        'kil myself',     // missing letter
        'suicde',         // transposed letters
        'cant breath',    // missing apostrophe
        'chst pain'       // missing letter
      ];

      for (const variation of typoVariations) {
        const result = await escalationService.analyzeMessage(variation, mockContext);
        
        // Should still detect as crisis due to fuzzy matching
        expect(result.severity).toBe('crisis');
        expect(result.matches.length).toBeGreaterThan(0);
      }
    });
  });
});