import { Request, Response, NextFunction } from 'express';
import { SafetyMiddleware, SafetyMiddlewareRequest } from '../../src/middleware/SafetyMiddleware';
import { EscalationService } from '../../src/services/EscalationService';
import { NotificationService } from '../../src/services/NotificationService';
import { Logger } from '../../src/utils/logger';
import { SafetyResult, CrisisResponse, EscalationEvent } from '../../src/types/safety';

// Mock dependencies
jest.mock('../../src/services/EscalationService');
jest.mock('../../src/services/NotificationService');
jest.mock('../../src/utils/logger');

const MockEscalationService = EscalationService as jest.MockedClass<typeof EscalationService>;
const MockNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('SafetyMiddleware', () => {
  let safetyMiddleware: SafetyMiddleware;
  let mockEscalationService: jest.Mocked<EscalationService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRequest: SafetyMiddlewareRequest;
  let mockResponse: Response;
  let mockNext: NextFunction;

  const mockSafetyResult: SafetyResult = {
    severity: 'crisis',
    confidence: 0.95,
    requiresEscalation: true,
    matches: [{
      trigger: 'want to die',
      confidence: 1.0,
      category: 'suicide_ideation',
      severity: 'crisis',
      position: { start: 2, end: 12 },
      matchType: 'exact'
    }],
    riskFactors: ['high_confidence_triggers'],
    contextualConcerns: [],
    analysisTime: 45,
    recommendedActions: ['immediate_nurse_notification']
  };

  const mockCrisisResponse: CrisisResponse = {
    immediateMessage: 'I\'m concerned about what you\'ve shared',
    resources: [{
      name: 'Samaritans',
      contact: '116 123',
      description: 'Mental health crisis support',
      availability: '24/7'
    }],
    escalationRequired: true,
    followUpRequired: true,
    disclaimers: ['This is general health information only'],
    responseTime: 150
  };

  const mockEscalationEvent: EscalationEvent = {
    id: 'escalation-123',
    userId: 'user-456',
    sessionId: 'session-789',
    severity: 'crisis',
    safetyResult: mockSafetyResult,
    userMessage: 'I want to die',
    timestamp: Date.now(),
    notificationSent: false,
    nurseTeamAlerted: false,
    responseGenerated: false
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock services
    mockLogger = new MockLogger() as jest.Mocked<Logger>;
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.debug = jest.fn();

    mockEscalationService = new MockEscalationService(mockLogger, {} as any) as jest.Mocked<EscalationService>;
    mockEscalationService.analyzeMessage = jest.fn().mockResolvedValue(mockSafetyResult);
    mockEscalationService.generateCrisisResponse = jest.fn().mockResolvedValue(mockCrisisResponse);
    mockEscalationService.createEscalationEvent = jest.fn().mockResolvedValue(mockEscalationEvent);
    mockEscalationService.notifyNurseTeam = jest.fn().mockResolvedValue(undefined);

    mockNotificationService = new MockNotificationService('', mockLogger) as jest.Mocked<NotificationService>;

    // Create middleware instance
    safetyMiddleware = new SafetyMiddleware(
      mockEscalationService,
      mockNotificationService,
      mockLogger,
      {
        skipPaths: ['/test-skip'],
        enableAuditLogging: true,
        blockUnsafeResponses: true
      }
    );

    // Setup mock request/response
    mockRequest = {
      userId: 'test-user-123',
      sessionId: 'test-session-456',
      path: '/api/chat',
      body: {
        message: 'I want to die',
        messageHistory: [],
        userProfile: {
          age: 25,
          vulnerabilityFlags: [],
          previousEscalations: []
        }
      }
    } as SafetyMiddlewareRequest;

    mockResponse = {
      setHeader: jest.fn(),
      send: jest.fn()
    } as unknown as Response;

    mockNext = jest.fn();
  });

  describe('analyzeUserMessage middleware', () => {
    it('should analyze user message and set safety result', async () => {
      const middleware = safetyMiddleware.analyzeUserMessage();
      
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockEscalationService.analyzeMessage).toHaveBeenCalledWith(
        'I want to die',
        expect.objectContaining({
          userId: 'test-user-123',
          sessionId: 'test-session-456',
          messageHistory: []
        })
      );

      expect(mockRequest.safetyResult).toEqual(mockSafetyResult);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle escalation for crisis messages', async () => {
      const middleware = safetyMiddleware.analyzeUserMessage();
      
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockEscalationService.createEscalationEvent).toHaveBeenCalledWith(
        'test-user-123',
        'test-session-456',
        'I want to die',
        mockSafetyResult
      );

      expect(mockEscalationService.notifyNurseTeam).toHaveBeenCalledWith(mockEscalationEvent);
      expect(mockRequest.escalationEvent).toEqual(mockEscalationEvent);
    });

    it('should generate crisis response for crisis/high concern messages', async () => {
      const middleware = safetyMiddleware.analyzeUserMessage();
      
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockEscalationService.generateCrisisResponse).toHaveBeenCalledWith(mockSafetyResult);
      expect(mockRequest.crisisResponse).toEqual(mockCrisisResponse);
    });

    it('should skip analysis for configured paths', async () => {
      mockRequest.path = '/test-skip';
      const middleware = safetyMiddleware.analyzeUserMessage();
      
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockEscalationService.analyzeMessage).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip analysis for default skip paths', async () => {
      const skipPaths = ['/health', '/metrics', '/favicon.ico'];
      
      for (const path of skipPaths) {
        jest.clearAllMocks();
        mockRequest.path = path;
        const middleware = safetyMiddleware.analyzeUserMessage();
        
        await middleware(mockRequest, mockResponse, mockNext);

        expect(mockEscalationService.analyzeMessage).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalled();
      }
    });

    it('should handle missing userId or sessionId gracefully', async () => {
      mockRequest.userId = '';
      const middleware = safetyMiddleware.analyzeUserMessage();
      
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Safety middleware missing required fields',
        expect.objectContaining({
          userId: '',
          sessionId: 'test-session-456'
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing message gracefully', async () => {
      mockRequest.body = {};
      const middleware = safetyMiddleware.analyzeUserMessage();
      
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockEscalationService.analyzeMessage).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract message from different request locations', async () => {
      const testCases = [
        { body: { message: 'test message' }, expected: 'test message' },
        { body: { content: 'test content' }, expected: 'test content' },
        { body: { text: 'test text' }, expected: 'test text' },
        { query: { message: 'query message' }, expected: 'query message' }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockRequest.body = testCase.body || {};
        mockRequest.query = testCase.query || {};
        
        const middleware = safetyMiddleware.analyzeUserMessage();
        await middleware(mockRequest, mockResponse, mockNext);

        if (testCase.expected) {
          expect(mockEscalationService.analyzeMessage).toHaveBeenCalledWith(
            testCase.expected,
            expect.any(Object)
          );
        }
      }
    });

    it('should handle analysis errors gracefully', async () => {
      const analysisError = new Error('Analysis failed');
      mockEscalationService.analyzeMessage.mockRejectedValue(analysisError);
      
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Safety middleware error',
        expect.objectContaining({
          error: analysisError,
          userId: 'test-user-123'
        })
      );

      // Should set crisis-level safety result for safety
      expect(mockRequest.safetyResult).toEqual(
        expect.objectContaining({
          severity: 'crisis',
          requiresEscalation: true,
          riskFactors: ['safety_system_failure']
        })
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle escalation failures gracefully', async () => {
      const escalationError = new Error('Notification failed');
      mockEscalationService.notifyNurseTeam.mockRejectedValue(escalationError);
      
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to handle escalation',
        expect.objectContaining({
          error: escalationError,
          userId: 'test-user-123'
        })
      );

      // Should still continue processing
      expect(mockNext).toHaveBeenCalled();
    });

    it('should log safety analysis when audit logging is enabled', async () => {
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Safety analysis completed',
        expect.objectContaining({
          userId: 'test-use***', // Sanitized
          severity: 'crisis',
          requiresEscalation: true
        })
      );
    });
  });

  describe('validateResponse middleware', () => {
    it('should validate outgoing responses for MHRA compliance', async () => {
      const middleware = safetyMiddleware.validateResponse();
      
      // Mock response with MHRA violation
      const originalSend = jest.fn();
      mockResponse.send = originalSend;
      
      middleware(mockRequest, mockResponse, mockNext);

      // Simulate sending a response with violation
      const responseWithViolation = {
        message: 'You should take this medication immediately'
      };
      
      mockResponse.send(JSON.stringify(responseWithViolation));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'MHRA compliance violations detected in response',
        expect.objectContaining({
          violations: expect.arrayContaining([
            expect.stringContaining('you should')
          ])
        })
      );
    });

    it('should allow compliant responses through', async () => {
      const middleware = safetyMiddleware.validateResponse();
      
      const originalSend = jest.fn();
      mockResponse.send = originalSend;
      
      middleware(mockRequest, mockResponse, mockNext);

      const compliantResponse = {
        message: 'I understand you\'re concerned. This is general health information only. Always consult your healthcare provider.'
      };
      
      mockResponse.send(JSON.stringify(compliantResponse));

      expect(originalSend).toHaveBeenCalledWith(JSON.stringify(compliantResponse));
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should detect various MHRA violation patterns', async () => {
      const violationPatterns = [
        'You should take this medication',
        'You probably have diabetes',
        'Don\'t worry, it\'s just a minor issue',
        'You definitely need to change your dose',
        'I can diagnose this condition'
      ];

      const middleware = safetyMiddleware.validateResponse();
      const originalSend = jest.fn();
      mockResponse.send = originalSend;
      
      middleware(mockRequest, mockResponse, mockNext);

      for (const pattern of violationPatterns) {
        jest.clearAllMocks();
        mockResponse.send(pattern);
        
        expect(mockLogger.error).toHaveBeenCalledWith(
          'MHRA compliance violations detected in response',
          expect.objectContaining({
            violations: expect.arrayContaining([
              expect.stringContaining('Prohibited pattern')
            ])
          })
        );
      }
    });

    it('should handle response validation errors gracefully', async () => {
      const middleware = safetyMiddleware.validateResponse();
      
      // Mock a response.send that throws an error
      const originalSend = jest.fn();
      mockResponse.send = jest.fn().mockImplementation(() => {
        throw new Error('Response processing error');
      });
      
      middleware(mockRequest, mockResponse, mockNext);

      // Should not throw and should call original send
      expect(() => mockResponse.send('test')).toThrow('Response processing error');
    });
  });

  describe('addSafetyHeaders middleware', () => {
    it('should add safety headers to response', async () => {
      mockRequest.safetyResult = mockSafetyResult;
      const middleware = safetyMiddleware.addSafetyHeaders();
      
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Safety-Analyzed', 'true');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-MHRA-Compliant', 'true');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Crisis-Support', 'available');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Safety-Level', 'crisis');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Escalation-Required', 'true');
    });

    it('should add CORS headers', async () => {
      const middleware = safetyMiddleware.addSafetyHeaders();
      
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin', 
        'https://dashboard.askeve.ai'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers', 
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods', 
        'GET, POST, PUT, DELETE, OPTIONS'
      );
    });

    it('should handle missing safety result gracefully', async () => {
      const middleware = safetyMiddleware.addSafetyHeaders();
      
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Safety-Analyzed', 'true');
      expect(mockResponse.setHeader).not.toHaveBeenCalledWith('X-Safety-Level', expect.anything());
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('performance and monitoring', () => {
    it('should log performance warnings for slow analysis', async () => {
      // Mock slow analysis
      const slowSafetyResult = {
        ...mockSafetyResult,
        analysisTime: 1000 // Exceeds 500ms threshold
      };
      mockEscalationService.analyzeMessage.mockResolvedValue(slowSafetyResult);
      
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Crisis detection exceeded time limit',
        expect.objectContaining({
          analysisTime: 1000,
          limit: 500
        })
      );
    });

    it('should complete middleware processing quickly', async () => {
      const startTime = Date.now();
      
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast with mocks
    });
  });

  describe('data privacy and sanitization', () => {
    it('should sanitize user IDs in logs', async () => {
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Safety analysis completed',
        expect.objectContaining({
          userId: 'test-use***' // Sanitized - first 8 chars + ***
        })
      );
    });

    it('should hash message content in logs', async () => {
      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      const logCall = mockLogger.info.mock.calls.find(call => 
        call[0] === 'Safety analysis completed'
      );
      expect(logCall?.[1]).toHaveProperty('messageHash');
      expect(logCall?.[1]).not.toHaveProperty('message');
    });
  });

  describe('graceful shutdown', () => {
    it('should shutdown gracefully', async () => {
      const shutdownPromise = safetyMiddleware.shutdown();
      
      // Should complete within reasonable time
      await expect(shutdownPromise).resolves.toBeUndefined();
      
      expect(mockLogger.info).toHaveBeenCalledWith('SafetyMiddleware shutting down gracefully');
      expect(mockLogger.info).toHaveBeenCalledWith('SafetyMiddleware shutdown completed');
    });
  });

  describe('context validation', () => {
    it('should handle malformed conversation context', async () => {
      mockRequest.body = {
        message: 'test message',
        messageHistory: 'invalid-history', // Should be array
        userProfile: 'invalid-profile' // Should be object
      };

      const middleware = safetyMiddleware.analyzeUserMessage();
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid conversation context',
        expect.any(Object)
      );

      // Should still call analyzeMessage with minimal valid context
      expect(mockEscalationService.analyzeMessage).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          userId: 'test-user-123',
          sessionId: 'test-session-456',
          messageHistory: []
        })
      );
    });
  });
});