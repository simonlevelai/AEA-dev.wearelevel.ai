import { CrisisDetectionTestFramework, TestEntity, TestResult, TestSuite } from '../CrisisDetectionTestFramework';
import { EscalationService } from '../EscalationService';
import { Logger } from '../../utils/logger';
import { ConversationContext, SeverityLevel } from '../../types/safety';

describe('CrisisDetectionTestFramework', () => {
  let testFramework: CrisisDetectionTestFramework;
  let mockEscalationService: jest.Mocked<EscalationService>;
  let mockLogger: jest.Mocked<Logger>;

  const mockConversationContext: ConversationContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    messageHistory: [],
    userProfile: {
      age: 25,
      vulnerabilityFlags: [],
      previousEscalations: []
    }
  };

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    mockEscalationService = {
      analyzeMessage: jest.fn(),
      generateCrisisResponse: jest.fn(),
      notifyNurseTeam: jest.fn(),
      createEscalationEvent: jest.fn(),
      initialize: jest.fn()
    } as any;

    testFramework = new CrisisDetectionTestFramework(mockEscalationService, mockLogger);
  });

  describe('Test Entity Processing', () => {
    it('should process crisis detection entities and validate triggers', async () => {
      const testEntities: TestEntity[] = [
        {
          id: 'crisis-001',
          message: 'I want to kill myself',
          expectedSeverity: 'crisis',
          expectedTriggers: ['kill myself'],
          expectedConfidence: 0.95,
          category: 'suicide_ideation',
          description: 'Direct suicide ideation statement'
        },
        {
          id: 'crisis-002',
          message: 'I can\'t breathe and have chest pain',
          expectedSeverity: 'crisis',
          expectedTriggers: ['can\'t breathe'],
          expectedConfidence: 0.85, // Match the mocked confidence
          category: 'life_threatening',
          description: 'Medical emergency symptoms'
        }
      ];

      // Mock escalation service responses
      mockEscalationService.analyzeMessage
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.95,
          requiresEscalation: true,
          matches: [
            {
              trigger: 'kill myself',
              confidence: 0.95,
              category: 'suicide_ideation',
              severity: 'crisis',
              position: { start: 10, end: 21 },
              matchType: 'exact'
            }
          ],
          riskFactors: ['high_confidence_triggers'],
          contextualConcerns: [],
          analysisTime: 250,
          recommendedActions: ['immediate_nurse_notification']
        })
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.85,
          requiresEscalation: true,
          matches: [
            {
              trigger: 'can\'t breathe',
              confidence: 0.9,
              category: 'life_threatening',
              severity: 'crisis',
              position: { start: 2, end: 13 },
              matchType: 'exact'
            },
            {
              trigger: 'chest pain',
              confidence: 0.8,
              category: 'life_threatening',
              severity: 'crisis',
              position: { start: 22, end: 32 },
              matchType: 'exact'
            }
          ],
          riskFactors: ['multiple_crisis_indicators'],
          contextualConcerns: [],
          analysisTime: 300,
          recommendedActions: ['emergency_services_guidance']
        });

      const results = await testFramework.runEntityTests(testEntities, mockConversationContext);

      expect(results.totalTests).toBe(2);
      expect(results.passed).toBe(2);
      expect(results.failed).toBe(0);
      expect(results.overallAccuracy).toBe(100);

      // Verify individual test results
      expect(results.testResults[0].passed).toBe(true);
      expect(results.testResults[0].actualSeverity).toBe('crisis');
      expect(results.testResults[0].actualConfidence).toBe(0.95);
      expect(results.testResults[0].detectionTime).toBeLessThan(500); // Within SLA

      expect(results.testResults[1].passed).toBe(true);
      expect(results.testResults[1].actualSeverity).toBe('crisis');
      expect(results.testResults[1].actualConfidence).toBe(0.85);
    });

    it('should detect false positives and negatives', async () => {
      const testEntities: TestEntity[] = [
        {
          id: 'false-positive',
          message: 'I want to kill some time before dinner',
          expectedSeverity: 'general',
          expectedTriggers: [],
          expectedConfidence: 0.1,
          category: 'general_conversation',
          description: 'Should not trigger suicide detection'
        },
        {
          id: 'false-negative',
          message: 'I\'m done with everything, ready to end it all',
          expectedSeverity: 'crisis',
          expectedTriggers: ['end it all', 'done with everything'],
          expectedConfidence: 0.8,
          category: 'suicide_ideation',
          description: 'Indirect suicide ideation'
        }
      ];

      // Mock false positive (incorrectly detected as crisis)
      mockEscalationService.analyzeMessage
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel, // Wrong - should be general
          confidence: 0.9,
          requiresEscalation: true,
          matches: [
            {
              trigger: 'kill',
              confidence: 0.9,
              category: 'suicide_ideation',
              severity: 'crisis',
              position: { start: 10, end: 14 },
              matchType: 'exact'
            }
          ],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 200,
          recommendedActions: []
        })
        // Mock false negative (not detected as crisis)
        .mockResolvedValueOnce({
          severity: 'general' as SeverityLevel, // Wrong - should be crisis
          confidence: 0.2,
          requiresEscalation: false,
          matches: [],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 150,
          recommendedActions: []
        });

      const results = await testFramework.runEntityTests(testEntities, mockConversationContext);

      expect(results.totalTests).toBe(2);
      expect(results.passed).toBe(0);
      expect(results.failed).toBe(2);
      expect(results.overallAccuracy).toBe(0);

      // Check false positive
      expect(results.testResults[0].passed).toBe(false);
      expect(results.testResults[0].failureReason).toContain('False positive');
      expect(results.testResults[0].actualSeverity).toBe('crisis');
      expect(results.testResults[0].expectedSeverity).toBe('general');

      // Check false negative
      expect(results.testResults[1].passed).toBe(false);
      expect(results.testResults[1].failureReason).toContain('False negative');
      expect(results.testResults[1].actualSeverity).toBe('general');
      expect(results.testResults[1].expectedSeverity).toBe('crisis');
    });

    it('should benchmark response times and detect SLA violations', async () => {
      const testEntities: TestEntity[] = [
        {
          id: 'slow-detection',
          message: 'I need help right now',
          expectedSeverity: 'crisis',
          expectedTriggers: ['need help'],
          expectedConfidence: 0.7,
          category: 'immediate_danger',
          description: 'Should be detected quickly'
        }
      ];

      // Mock slow response (exceeds SLA)
      mockEscalationService.analyzeMessage.mockResolvedValueOnce({
        severity: 'crisis' as SeverityLevel,
        confidence: 0.7,
        requiresEscalation: true,
        matches: [
          {
            trigger: 'need help',
            confidence: 0.7,
            category: 'immediate_danger',
            severity: 'crisis',
            position: { start: 2, end: 11 },
            matchType: 'exact'
          }
        ],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 800, // Exceeds 500ms SLA
        recommendedActions: []
      });

      const results = await testFramework.runEntityTests(testEntities, mockConversationContext);

      expect(results.testResults[0].slaViolation).toBe(true);
      expect(results.testResults[0].detectionTime).toBeGreaterThan(500);
      expect(results.slaViolations).toBe(1);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Crisis detection SLA violation during testing',
        expect.objectContaining({
          entityId: 'slow-detection',
          detectionTime: 800,
          slaLimit: 500
        })
      );
    });
  });

  describe('Test Suite Management', () => {
    it('should run multiple test suites and generate comprehensive report', async () => {
      const suicideIdeationSuite: TestSuite = {
        name: 'Suicide Ideation Detection',
        description: 'Tests for detecting various forms of suicide ideation',
        entities: [
          {
            id: 'direct-suicide-1',
            message: 'I want to die',
            expectedSeverity: 'crisis',
            expectedTriggers: ['want to die'],
            expectedConfidence: 0.9,
            category: 'suicide_ideation',
            description: 'Direct suicide statement'
          },
          {
            id: 'indirect-suicide-1',
            message: 'Life isn\'t worth living anymore',
            expectedSeverity: 'crisis',
            expectedTriggers: ['life isn\'t worth living'],
            expectedConfidence: 0.8,
            category: 'suicide_ideation',
            description: 'Indirect suicide ideation'
          }
        ]
      };

      const medicalEmergencySuite: TestSuite = {
        name: 'Medical Emergency Detection',
        description: 'Tests for detecting medical emergencies',
        entities: [
          {
            id: 'chest-pain-1',
            message: 'I have severe chest pain',
            expectedSeverity: 'crisis',
            expectedTriggers: ['chest pain'],
            expectedConfidence: 0.8,
            category: 'life_threatening',
            description: 'Chest pain symptom'
          }
        ]
      };

      // Mock responses for all entities
      mockEscalationService.analyzeMessage
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.95,
          requiresEscalation: true,
          matches: [{ trigger: 'want to die', confidence: 0.95, category: 'suicide_ideation', severity: 'crisis', position: { start: 2, end: 12 }, matchType: 'exact' }],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 200,
          recommendedActions: []
        })
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.85,
          requiresEscalation: true,
          matches: [{ trigger: 'life isn\'t worth living', confidence: 0.85, category: 'suicide_ideation', severity: 'crisis', position: { start: 0, end: 25 }, matchType: 'exact' }],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 300,
          recommendedActions: []
        })
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.8,
          requiresEscalation: true,
          matches: [{ trigger: 'chest pain', confidence: 0.8, category: 'life_threatening', severity: 'crisis', position: { start: 14, end: 24 }, matchType: 'exact' }],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 250,
          recommendedActions: []
        });

      const results = await testFramework.runTestSuites([suicideIdeationSuite, medicalEmergencySuite], mockConversationContext);

      expect(results.totalSuites).toBe(2);
      expect(results.totalTests).toBe(3);
      expect(results.overallAccuracy).toBe(100);

      expect(results.suiteResults[0].name).toBe('Suicide Ideation Detection');
      expect(results.suiteResults[0].passed).toBe(2);
      expect(results.suiteResults[0].failed).toBe(0);

      expect(results.suiteResults[1].name).toBe('Medical Emergency Detection');
      expect(results.suiteResults[1].passed).toBe(1);
      expect(results.suiteResults[1].failed).toBe(0);
    });

    it('should track performance metrics across test suites', async () => {
      const testSuite: TestSuite = {
        name: 'Performance Test Suite',
        description: 'Tests for performance metrics',
        entities: [
          {
            id: 'perf-1',
            message: 'Crisis message 1',
            expectedSeverity: 'crisis',
            expectedTriggers: ['crisis'],
            expectedConfidence: 0.8,
            category: 'general_crisis',
            description: 'Performance test 1'
          },
          {
            id: 'perf-2',
            message: 'Crisis message 2',
            expectedSeverity: 'crisis',
            expectedTriggers: ['crisis'],
            expectedConfidence: 0.8,
            category: 'general_crisis',
            description: 'Performance test 2'
          }
        ]
      };

      mockEscalationService.analyzeMessage
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.8,
          requiresEscalation: true,
          matches: [],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 150,
          recommendedActions: []
        })
        .mockResolvedValueOnce({
          severity: 'crisis' as SeverityLevel,
          confidence: 0.8,
          requiresEscalation: true,
          matches: [],
          riskFactors: [],
          contextualConcerns: [],
          analysisTime: 350,
          recommendedActions: []
        });

      const results = await testFramework.runTestSuites([testSuite], mockConversationContext);

      expect(results.performanceMetrics).toBeDefined();
      expect(results.performanceMetrics.averageDetectionTime).toBe(250); // (150 + 350) / 2
      expect(results.performanceMetrics.minDetectionTime).toBe(150);
      expect(results.performanceMetrics.maxDetectionTime).toBe(350);
      expect(results.performanceMetrics.slaViolations).toBe(0);
      expect(results.performanceMetrics.slaCompliance).toBe(100);
    });
  });

  describe('Advanced Testing Features', () => {
    it('should test context-aware detection with user profile flags', async () => {
      const contextualEntity: TestEntity = {
        id: 'context-aware-1',
        message: 'I\'m feeling overwhelmed',
        expectedSeverity: 'crisis', // Should be escalated to crisis due to high-risk profile
        expectedTriggers: ['high_risk_user_distress'],
        expectedConfidence: 0.9,
        category: 'contextual_escalation',
        description: 'Should escalate due to high-risk user profile',
        contextModifiers: {
          userProfileFlags: ['high_risk', 'previous_escalation'],
          messageHistory: [
            { role: 'user', content: 'Things have been getting worse', timestamp: Date.now() - 300000 },
            { role: 'user', content: 'I can\'t handle this anymore', timestamp: Date.now() - 600000 }
          ]
        }
      };

      const contextWithFlags: ConversationContext = {
        ...mockConversationContext,
        userProfile: {
          age: 25,
          vulnerabilityFlags: ['high_risk', 'previous_escalation'],
          previousEscalations: ['esc-001']
        },
        messageHistory: [
          { role: 'user', content: 'Things have been getting worse', timestamp: Date.now() - 300000 },
          { role: 'user', content: 'I can\'t handle this anymore', timestamp: Date.now() - 600000 }
        ]
      };

      mockEscalationService.analyzeMessage.mockResolvedValueOnce({
        severity: 'crisis' as SeverityLevel,
        confidence: 0.9,
        requiresEscalation: true,
        matches: [
          {
            trigger: 'high_risk_user_distress',
            confidence: 0.9,
            category: 'severe_distress',
            severity: 'crisis',
            position: { start: 0, end: 20 },
            matchType: 'context'
          }
        ],
        riskFactors: ['vulnerable_user_profile', 'previous_escalation_history'],
        contextualConcerns: [],
        analysisTime: 200,
        recommendedActions: ['immediate_nurse_notification']
      });

      const results = await testFramework.runEntityTests([contextualEntity], contextWithFlags);

      expect(results.testResults[0].passed).toBe(true);
      expect(results.testResults[0].contextualFactors).toContain('vulnerable_user_profile');
      expect(results.testResults[0].contextualFactors).toContain('previous_escalation_history');
    });

    it('should generate detailed failure analysis for debugging', async () => {
      const problematicEntity: TestEntity = {
        id: 'debug-failure',
        message: 'I feel a bit sad today',
        expectedSeverity: 'emotional_support',
        expectedTriggers: ['sad'],
        expectedConfidence: 0.6,
        category: 'emotional_support',
        description: 'Should be classified as emotional support need'
      };

      mockEscalationService.analyzeMessage.mockResolvedValueOnce({
        severity: 'general' as SeverityLevel, // Wrong classification
        confidence: 0.2,
        requiresEscalation: false,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      });

      const results = await testFramework.runEntityTests([problematicEntity], mockConversationContext);

      const failedResult = results.testResults[0];
      expect(failedResult.passed).toBe(false);
      expect(failedResult.failureAnalysis).toBeDefined();
      expect(failedResult.failureAnalysis?.missingTriggers).toEqual(['sad']);
      expect(failedResult.failureAnalysis?.severityMismatch).toBe(true);
      expect(failedResult.failureAnalysis?.confidenceTooLow).toBe(true);
      expect(failedResult.failureAnalysis?.suggestions).toContain('Review trigger patterns for "sad"');
    });
  });

  describe('Export and Reporting', () => {
    it('should export test results in multiple formats', async () => {
      const testEntity: TestEntity = {
        id: 'export-test',
        message: 'Test message',
        expectedSeverity: 'general',
        expectedTriggers: [],
        expectedConfidence: 0.1,
        category: 'general',
        description: 'Test for export functionality'
      };

      mockEscalationService.analyzeMessage.mockResolvedValueOnce({
        severity: 'general' as SeverityLevel,
        confidence: 0.1,
        requiresEscalation: false,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      });

      const results = await testFramework.runEntityTests([testEntity], mockConversationContext);

      // Test JSON export
      const jsonExport = testFramework.exportResults(results, 'json');
      expect(jsonExport).toBeDefined();
      const parsedJson = JSON.parse(jsonExport);
      expect(parsedJson.totalTests).toBe(1);
      expect(parsedJson.overallAccuracy).toBe(100);

      // Test CSV export
      const csvExport = testFramework.exportResults(results, 'csv');
      expect(csvExport).toBeDefined();
      expect(csvExport).toContain('Entity ID,Message,Expected Severity,Actual Severity');

      // Test HTML export
      const htmlExport = testFramework.exportResults(results, 'html');
      expect(htmlExport).toBeDefined();
      expect(htmlExport).toContain('html>');
      expect(htmlExport).toContain('Crisis Detection Test Results');
    });
  });
});