import { SafetyServiceAdapter } from '../SafetyServiceAdapter';
import { EscalationService } from '../EscalationService';
import { Logger } from '../../utils/logger';

describe('SafetyServiceAdapter', () => {
  let adapter: SafetyServiceAdapter;
  let mockEscalationService: jest.Mocked<EscalationService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    mockEscalationService = {
      analyzeMessage: jest.fn()
    } as any;

    adapter = new SafetyServiceAdapter(mockEscalationService, mockLogger);
  });

  describe('analyzeMessage', () => {
    it('should convert conversation history format correctly', async () => {
      const conversationHistory = [
        { text: 'Hello', isUser: true, timestamp: new Date() },
        { text: 'Hi there', isUser: false, timestamp: new Date() }
      ];

      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'general',
        requiresEscalation: false,
        matches: [],
        confidence: 0.1,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      });

      await adapter.analyzeMessage('test message', conversationHistory);

      expect(mockEscalationService.analyzeMessage).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          messageHistory: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Hello'
            }),
            expect.objectContaining({
              role: 'assistant', 
              content: 'Hi there'
            })
          ])
        })
      );
    });

    it('should map crisis severity to critical', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'suicide_ideation' }],
        confidence: 0.9,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      } as any);

      const result = await adapter.analyzeMessage('I want to die', []);

      expect(result).toEqual({
        shouldEscalate: true,
        severity: 'critical',
        reason: expect.stringContaining('suicide_ideation'),
        escalationType: 'self_harm'
      });
    });

    it('should map high_concern severity to high', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'high_concern',
        requiresEscalation: true,
        matches: [{ category: 'life_threatening' }],
        confidence: 0.8,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      } as any);

      const result = await adapter.analyzeMessage('chest pain', []);

      expect(result).toEqual({
        shouldEscalate: true,
        severity: 'high',
        reason: expect.stringContaining('life_threatening'),
        escalationType: 'medical_emergency'
      });
    });

    it('should handle analysis failures safely', async () => {
      mockEscalationService.analyzeMessage.mockRejectedValue(new Error('Analysis failed'));

      const result = await adapter.analyzeMessage('test message', []);

      expect(result).toEqual({
        shouldEscalate: true,
        severity: 'critical',
        reason: 'Safety analysis failed - defaulting to escalation',
        escalationType: 'inappropriate_content'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'SafetyServiceAdapter analysis failed',
        expect.objectContaining({
          error: expect.any(Error),
          text: 'test message'
        })
      );
    });

    it('should return no escalation for general messages', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'general',
        requiresEscalation: false,
        matches: [],
        confidence: 0.1,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 50,
        recommendedActions: []
      });

      const result = await adapter.analyzeMessage('ovarian cancer symptoms', []);

      expect(result).toEqual({
        shouldEscalate: false,
        severity: 'low',
        reason: undefined,
        escalationType: undefined
      });
    });

    it('should maintain sub-2-second response time for crisis detection', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'suicide_ideation' }],
        confidence: 0.95,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 500, // 500ms - under the limit
        recommendedActions: []
      } as any);

      const startTime = Date.now();
      const result = await adapter.analyzeMessage('I want to kill myself', []);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(2000);
      expect(result.shouldEscalate).toBe(true);
      expect(result.severity).toBe('critical');
    });
  });

  describe('severity mapping', () => {
    it('should correctly map all severity levels', async () => {
      const testCases = [
        { input: 'crisis', expected: 'critical' },
        { input: 'high_concern', expected: 'high' },
        { input: 'emotional_support', expected: 'medium' },
        { input: 'general', expected: 'low' },
        { input: 'unknown', expected: 'low' }
      ];

      for (const testCase of testCases) {
        mockEscalationService.analyzeMessage.mockResolvedValue({
          severity: testCase.input,
          requiresEscalation: false,
          matches: [],
          confidence: 0.1,
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 50,
          recommendedActions: []
        } as any);

        const result = await adapter.analyzeMessage('test', []);
        expect(result.severity).toBe(testCase.expected);
      }
    });
  });

  describe('escalation type mapping', () => {
    it('should map life-threatening matches to medical_emergency', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'life_threatening' }],
        confidence: 0.9,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      } as any);

      const result = await adapter.analyzeMessage('chest pain', []);
      expect(result.escalationType).toBe('medical_emergency');
    });

    it('should map self-harm matches to self_harm', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'self_harm' }],
        confidence: 0.9,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      } as any);

      const result = await adapter.analyzeMessage('cutting myself', []);
      expect(result.escalationType).toBe('self_harm');
    });

    it('should default to inappropriate_content for other crisis types', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'general_crisis' }],
        confidence: 0.9,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      } as any);

      const result = await adapter.analyzeMessage('crisis message', []);
      expect(result.escalationType).toBe('inappropriate_content');
    });
  });
});