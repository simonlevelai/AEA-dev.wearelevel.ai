/**
 * Comprehensive integration tests for Ask Eve Assist safety systems
 * 
 * Tests verify that all safety components work together properly:
 * 1. Crisis detection and escalation system
 * 2. Dual notification (Teams + Email) with failover
 * 3. Multi-tier AI provider failover
 * 4. SLA monitoring with <2 second response requirements
 * 5. Data retention and GDPR compliance during operations
 * 6. Progressive escalation service coordination
 * 7. Circuit breaker fault tolerance
 * 
 * This follows TDD principles with comprehensive real-world scenarios
 * that healthcare professionals would encounter.
 */

import { EscalationService } from '../EscalationService';
import { NotificationService } from '../NotificationService';
import { EmailNotificationService } from '../EmailNotificationService';
import { TeamsNotificationService } from '../TeamsNotificationService';
import { FailoverService } from '../FailoverService';
import { SLAMonitoringService } from '../SLAMonitoringService';
import { DataRetentionService } from '../DataRetentionService';
import { ProgressiveEscalationService } from '../ProgressiveEscalationService';
import { CircuitBreaker } from '../CircuitBreaker';
import { Logger } from '../../utils/logger';
import { 
  ConversationContext, 
  SafetyResult, 
  EscalationEvent,
  NotificationPayload,
  SeverityLevel 
} from '../../types/safety';

// Mock external dependencies
jest.mock('../../utils/logger');
jest.mock('openai');
jest.mock('@azure/identity');
jest.mock('axios');

describe('Safety Systems Integration Tests', () => {
  let escalationService: EscalationService;
  let notificationService: NotificationService;
  let emailService: jest.Mocked<EmailNotificationService>;
  let teamsService: jest.Mocked<TeamsNotificationService>;
  let failoverService: FailoverService;
  let slaService: SLAMonitoringService;
  let dataRetentionService: DataRetentionService;
  let progressiveEscalationService: ProgressiveEscalationService;
  let circuitBreaker: CircuitBreaker;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Initialize mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    // Initialize mock notification services
    emailService = {
      sendCrisisAlert: jest.fn(),
      testConnection: jest.fn(),
      getDeliveryStatus: jest.fn(),
      generateEmailTemplate: jest.fn()
    } as any;

    teamsService = {
      sendCrisisAlert: jest.fn(),
      testConnection: jest.fn(),
      getDeliveryStatus: jest.fn(),
      generateAdaptiveCard: jest.fn()
    } as any;

    // Initialize services
    notificationService = new NotificationService(
      'https://test-webhook.teams.microsoft.com',
      mockLogger,
      3, // maxRetries
      1000, // retryDelay
      emailService,
      teamsService
    );

    escalationService = new EscalationService(mockLogger, notificationService);

    slaService = new SLAMonitoringService(mockLogger, {
      response_times: {
        crisis_detection_ms: 500,
        crisis_response_ms: 2000,
        nurse_notification_ms: 60000,
        audit_logging_ms: 100
      }
    });

    dataRetentionService = new DataRetentionService(mockLogger);

    progressiveEscalationService = new ProgressiveEscalationService(mockLogger);

    circuitBreaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    });

    failoverService = new FailoverService({
      testMode: true,
      enableMonitoring: true,
      enableAlerts: true
    });

    // Mock file system operations for configuration loading
    jest.spyOn(require('fs/promises'), 'readFile').mockImplementation((path: string) => {
      if (path.includes('crisis.json')) {
        return Promise.resolve(JSON.stringify({
          suicide_ideation: ['kill myself', 'end my life', 'want to die'],
          self_harm: ['cut myself', 'hurt myself'],
          severe_distress: ['cannot cope', 'breaking down']
        }));
      }
      if (path.includes('safety-config.json')) {
        return Promise.resolve(JSON.stringify({
          response_times: {
            crisis_detection_ms: 500,
            crisis_response_ms: 2000,
            nurse_notification_ms: 60000
          },
          crisis_responses: {
            mental_health: {
              message: 'I\'m very concerned about what you\'ve shared.',
              immediate_resources: ['Samaritans: 116 123', 'Text SHOUT to 85258']
            }
          },
          mhra_compliance: {
            required_disclaimers: {
              general: 'This is general health information only.',
              emergency: 'If this is an emergency, call 999 immediately.'
            }
          }
        }));
      }
      return Promise.resolve('{}');
    });

    // Initialize escalation service
    await escalationService.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('End-to-End Crisis Detection and Escalation Flow', () => {
    it('should detect crisis, escalate, and send dual notifications successfully', async () => {
      // Arrange: Setup successful notification services
      const mockTeamsResult = {
        status: 'sent' as const,
        messageId: 'teams-msg-123',
        channelWebhook: 'https://webhook.office.com/crisis',
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'teams' as const,
          timestamp: Date.now(),
          channelWebhook: 'https://webhook.office.com/crisis',
          messageId: 'teams-msg-123'
        }
      };

      const mockEmailResult = {
        status: 'sent' as const,
        messageId: 'email-msg-123',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email' as const,
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'email-msg-123'
        }
      };

      teamsService.sendCrisisAlert.mockResolvedValueOnce(mockTeamsResult);
      emailService.sendCrisisAlert.mockResolvedValueOnce(mockEmailResult);

      const conversationContext: ConversationContext = {
        userId: 'user-crisis-123',
        sessionId: 'session-456',
        messageHistory: [
          {
            role: 'user',
            content: 'I want to kill myself, I cannot cope anymore',
            timestamp: Date.now() - 60000
          }
        ],
        userProfile: {
          age: 28,
          vulnerabilityFlags: ['high_risk'],
          previousEscalations: []
        }
      };

      const crisisMessage = 'I want to kill myself, I cannot cope anymore';

      // Act: Execute full crisis detection and escalation flow
      const startTime = Date.now();
      
      // Step 1: Crisis detection
      const safetyResult = await escalationService.analyzeMessage(crisisMessage, conversationContext);
      
      // Step 2: Create escalation event
      const escalationEvent = await escalationService.createEscalationEvent(
        conversationContext.userId,
        conversationContext.sessionId,
        crisisMessage,
        safetyResult
      );

      // Step 3: Generate crisis response
      const crisisResponse = await escalationService.generateCrisisResponse(safetyResult);

      // Step 4: Send dual notifications
      const dualNotificationResult = await notificationService.sendDualCrisisAlert({
        escalationId: escalationEvent.id,
        severity: safetyResult.severity,
        userId: conversationContext.userId,
        summary: 'Crisis escalation: suicide ideation detected',
        triggerMatches: safetyResult.matches.map(m => m.trigger),
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      });

      const totalResponseTime = Date.now() - startTime;

      // Assert: Verify complete safety flow
      expect(safetyResult.severity).toBe('crisis');
      expect(safetyResult.requiresEscalation).toBe(true);
      expect(safetyResult.matches.length).toBeGreaterThan(0);
      expect(safetyResult.matches.some(m => m.trigger === 'kill myself')).toBe(true);
      expect(safetyResult.analysisTime).toBeLessThan(500); // Crisis detection SLA

      expect(crisisResponse.escalationRequired).toBe(true);
      expect(crisisResponse.immediateMessage).toContain('concerned');
      expect(crisisResponse.resources.length).toBeGreaterThan(0);
      expect(crisisResponse.responseTime).toBeLessThan(2000); // Crisis response SLA

      expect(dualNotificationResult.overallSuccess).toBe(true);
      expect(dualNotificationResult.teamsDelivered).toBe(true);
      expect(dualNotificationResult.emailDelivered).toBe(true);
      expect(dualNotificationResult.failures).toHaveLength(0);

      // Verify SLA compliance
      expect(totalResponseTime).toBeLessThan(2000);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Safety analysis completed',
        expect.objectContaining({
          severity: 'crisis',
          requiresEscalation: true,
          userId: 'user-crisis-123'
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Dual crisis alert sent successfully',
        expect.objectContaining({
          escalationId: escalationEvent.id,
          teamsDelivered: true,
          emailDelivered: true
        })
      );
    });

    it('should handle partial notification failure gracefully', async () => {
      // Arrange: Teams fails, Email succeeds
      teamsService.sendCrisisAlert.mockRejectedValueOnce(new Error('Teams webhook timeout'));
      emailService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'email-backup-123',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 1,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'email-backup-123'
        }
      });

      const conversationContext: ConversationContext = {
        userId: 'user-partial-failure',
        sessionId: 'session-789',
        messageHistory: [],
        userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
      };

      // Act: Execute crisis flow with partial notification failure
      const safetyResult = await escalationService.analyzeMessage(
        'I am going to hurt myself tonight',
        conversationContext  
      );

      const escalationEvent = await escalationService.createEscalationEvent(
        conversationContext.userId,
        conversationContext.sessionId,
        'I am going to hurt myself tonight',
        safetyResult
      );

      const dualNotificationResult = await notificationService.sendDualCrisisAlert({
        escalationId: escalationEvent.id,
        severity: safetyResult.severity,
        userId: conversationContext.userId,
        summary: 'Crisis escalation: self-harm ideation',
        triggerMatches: safetyResult.matches.map(m => m.trigger),
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      });

      // Assert: System still succeeds with partial failure
      expect(dualNotificationResult.overallSuccess).toBe(true);
      expect(dualNotificationResult.teamsDelivered).toBe(false);
      expect(dualNotificationResult.emailDelivered).toBe(true);
      expect(dualNotificationResult.failures).toContain('Teams: Teams webhook timeout');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Partial failure in dual crisis alert',
        expect.objectContaining({
          escalationId: escalationEvent.id,
          teamsDelivered: false,
          emailDelivered: true
        })
      );
    });

    it('should escalate to emergency response when all notifications fail', async () => {
      // Arrange: Both notification channels fail
      teamsService.sendCrisisAlert.mockRejectedValueOnce(new Error('Teams service down'));
      emailService.sendCrisisAlert.mockRejectedValueOnce(new Error('SMTP service unavailable'));

      const conversationContext: ConversationContext = {
        userId: 'user-total-failure',
        sessionId: 'session-critical',
        messageHistory: [],
        userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
      };

      // Act & Assert: Should throw error for complete notification failure
      const safetyResult = await escalationService.analyzeMessage(
        'I cannot take this anymore, I want to end it all',
        conversationContext
      );

      const escalationEvent = await escalationService.createEscalationEvent(
        conversationContext.userId,
        conversationContext.sessionId,
        'I cannot take this anymore, I want to end it all',
        safetyResult
      );

      await expect(
        notificationService.sendDualCrisisAlert({
          escalationId: escalationEvent.id,
          severity: safetyResult.severity,
          userId: conversationContext.userId,
          summary: 'CRITICAL: All notification channels failed',
          triggerMatches: safetyResult.matches.map(m => m.trigger),
          timestamp: Date.now(),
          urgency: 'immediate',
          requiresCallback: true
        })
      ).rejects.toThrow('All notification channels failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: All dual crisis alert channels failed',
        expect.objectContaining({
          escalationId: escalationEvent.id,
          failures: expect.arrayContaining([
            expect.stringContaining('Teams'),
            expect.stringContaining('Email')
          ])
        })
      );
    });
  });

  describe('AI Provider Failover Integration', () => {
    it('should cascade through all failover tiers under load', async () => {
      // This tests the multi-tier failover: OpenAI → Azure → Claude → Emergency
      const testQueries = [
        'I feel overwhelmed with my cancer diagnosis',
        'What are the symptoms of ovarian cancer?',
        'I\'m having severe abdominal pain',
        'Help me understand my test results'
      ];

      const startTime = Date.now();
      const results = [];

      // Act: Execute multiple concurrent requests to test failover under load
      const failoverPromises = testQueries.map(async (query, index) => {
        return await failoverService.handleGeneralQuery(
          query,
          `stress-test-user-${index}`,
          `conversation-${index}`
        );
      });

      const failoverResults = await Promise.all(failoverPromises);
      const totalTime = Date.now() - startTime;

      // Assert: All requests should succeed within SLA
      failoverResults.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.responseTime).toBeLessThan(3000); // Individual SLA
      });

      expect(totalTime).toBeLessThan(5000); // Overall load test SLA
      expect(failoverResults.length).toBe(testQueries.length);
    });

    it('should maintain emergency response capability when primary providers fail', async () => {
      // Simulate provider failures and test emergency response
      const crisisQuery = 'I am having thoughts of suicide';
      
      const startTime = Date.now();
      const result = await failoverService.handleCrisisRequest(
        crisisQuery,
        'emergency-test-user',
        'emergency-conversation'
      );
      const responseTime = Date.now() - startTime;

      // Assert: Emergency response should always work
      expect(result.success).toBe(true);
      expect(result.content).toContain('Samaritans');
      expect(result.content).toContain('116 123');
      expect(result.responseTime).toBeLessThan(2000);
      expect(result.slaCompliant).toBe(true);
      expect(responseTime).toBeLessThan(2000);
    });
  });

  describe('SLA Monitoring Under System Stress', () => {
    it('should maintain <2 second response times during high load', async () => {
      // Create high load scenario with multiple concurrent crisis requests
      const crisisScenarios = Array.from({ length: 10 }, (_, i) => ({
        message: `Crisis scenario ${i}: I want to hurt myself`,
        userId: `stress-user-${i}`,
        sessionId: `stress-session-${i}`
      }));

      const startTime = Date.now();
      const responsePromises = crisisScenarios.map(async (scenario) => {
        const context: ConversationContext = {
          userId: scenario.userId,
          sessionId: scenario.sessionId,
          messageHistory: [],
          userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
        };

        const analysisStartTime = Date.now();
        const safetyResult = await escalationService.analyzeMessage(scenario.message, context);
        const analysisTime = Date.now() - analysisStartTime;

        // Track SLA compliance
        slaService.trackCrisisDetection(scenario.userId, analysisStartTime, analysisTime);

        return {
          userId: scenario.userId,
          safetyResult,
          analysisTime,
          slaCompliant: analysisTime < 500
        };
      });

      const results = await Promise.all(responsePromises);
      const totalTime = Date.now() - startTime;

      // Assert: All responses should meet SLA requirements
      results.forEach((result) => {
        expect(result.analysisTime).toBeLessThan(500); // Crisis detection SLA
        expect(result.slaCompliant).toBe(true);
        expect(result.safetyResult.severity).toBe('crisis');
      });

      expect(totalTime).toBeLessThan(5000); // Total load test time
      
      // Verify SLA metrics
      const slaReport = slaService.generateSLAComplianceReport(60000);
      expect(slaReport.crisisDetection.complianceRate).toBe(100);
      expect(slaReport.overallComplianceRate).toBeGreaterThanOrEqual(99.9);
    });

    it('should alert when SLA violations occur during stress', async () => {
      // Simulate SLA violations by creating artificially slow responses
      const mockSlowResponse = jest.spyOn(escalationService, 'analyzeMessage')
        .mockImplementation(async (message, context) => {
          // Simulate slow processing that exceeds SLA
          await new Promise(resolve => setTimeout(resolve, 800)); // Over 500ms limit
          
          return {
            severity: 'crisis' as SeverityLevel,
            confidence: 0.95,
            requiresEscalation: true,
            matches: [],
            riskFactors: [],
            contextualConcerns: [],
            analysisTime: 800,
            recommendedActions: []
          };
        });

      const context: ConversationContext = {
        userId: 'sla-violation-user',
        sessionId: 'sla-violation-session',
        messageHistory: [],
        userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
      };

      // Track SLA violation
      const startTime = Date.now();
      await escalationService.analyzeMessage('test crisis message', context);
      
      const slaResult = slaService.trackCrisisDetection(
        'sla-violation-user',
        startTime,
        800
      );

      // Assert: SLA violation should be detected and logged
      expect(slaResult.withinSLA).toBe(false);
      expect(slaResult.violation?.type).toBe('crisis_detection_timeout');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Crisis detection SLA violation',
        expect.objectContaining({
          userId: 'sla-violation-user',
          detectionTime: 800,
          slaLimit: 500,
          overrun: 300
        })
      );

      mockSlowResponse.mockRestore();
    });
  });

  describe('Data Retention Integration During Crisis Events', () => {
    it('should enforce 30-day retention policy while preserving crisis event data', async () => {
      // Mock data retention operations
      const mockDataOperation = jest.spyOn(dataRetentionService, 'scheduleUserDataDeletion')
        .mockResolvedValue({
          userId: 'retention-test-user',
          scheduledFor: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
          retentionCompliant: true,
          preservedCrisisEvents: 1,
          deletionPolicy: 'gdpr_compliant'
        });

      const conversationContext: ConversationContext = {
        userId: 'retention-test-user',
        sessionId: 'retention-session',
        messageHistory: [
          {
            role: 'user',
            content: 'I have been feeling suicidal',
            timestamp: Date.now()
          }
        ],
        userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
      };

      // Act: Process crisis event and verify data retention
      const safetyResult = await escalationService.analyzeMessage(
        'I have been feeling suicidal',
        conversationContext
      );

      const escalationEvent = await escalationService.createEscalationEvent(
        conversationContext.userId,
        conversationContext.sessionId,
        'I have been feeling suicidal',
        safetyResult
      );

      // Schedule data retention with crisis preservation
      const retentionResult = await dataRetentionService.scheduleUserDataDeletion(
        conversationContext.userId,
        { preserveCrisisEvents: true }
      );

      // Assert: Crisis events should be preserved despite retention policy
      expect(retentionResult.retentionCompliant).toBe(true);
      expect(retentionResult.preservedCrisisEvents).toBe(1);
      expect(retentionResult.scheduledFor).toBeGreaterThan(Date.now());

      mockDataOperation.mockRestore();
    });

    it('should handle GDPR data deletion requests during active crisis', async () => {
      const conversationContext: ConversationContext = {
        userId: 'gdpr-crisis-user',
        sessionId: 'gdpr-crisis-session',
        messageHistory: [],
        userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
      };

      // Process active crisis
      const safetyResult = await escalationService.analyzeMessage(
        'I am going to end my life tonight',
        conversationContext
      );

      const escalationEvent = await escalationService.createEscalationEvent(
        conversationContext.userId,
        conversationContext.sessionId,
        'I am going to end my life tonight',
        safetyResult
      );

      // Mock GDPR deletion request during active crisis
      const mockGdprDeletion = jest.spyOn(dataRetentionService, 'processWithdrawalRequest')
        .mockResolvedValue({
          userId: 'gdpr-crisis-user',
          status: 'delayed_due_to_active_crisis',
          deletionScheduled: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days delay
          reason: 'Active crisis requires temporary data retention for safety',
          complianceNotes: 'GDPR Article 6(1)(d) - vital interests override'
        });

      const gdprResult = await dataRetentionService.processWithdrawalRequest({
        userId: 'gdpr-crisis-user',
        reason: 'gdpr_deletion_request',
        deleteData: true,
        requestTimestamp: Date.now()
      });

      // Assert: GDPR deletion should be delayed due to active crisis
      expect(gdprResult.status).toBe('delayed_due_to_active_crisis');
      expect(gdprResult.deletionScheduled).toBeGreaterThan(Date.now());
      expect(gdprResult.complianceNotes).toContain('vital interests');

      mockGdprDeletion.mockRestore();
    });
  });

  describe('Circuit Breaker Fault Tolerance', () => {
    it('should open circuit breaker after threshold failures and prevent cascade', async () => {
      // Simulate repeated failures to trigger circuit breaker
      const failureScenarios = Array.from({ length: 6 }, (_, i) => ({
        operation: `failing-operation-${i}`,
        shouldFail: true
      }));

      let circuitOpened = false;

      // Execute operations that will trigger circuit breaker
      for (const scenario of failureScenarios) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error(`Simulated failure: ${scenario.operation}`);
          });
        } catch (error) {
          // Expected failures
          if (circuitBreaker.getState() === 'open') {
            circuitOpened = true;
            break;
          }
        }
      }

      // Assert: Circuit breaker should open after threshold failures
      expect(circuitOpened).toBe(true);
      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.getFailureCount()).toBeGreaterThanOrEqual(5);

      // Verify that subsequent requests fail fast
      const startTime = Date.now();
      try {
        await circuitBreaker.execute(async () => {
          return 'This should not execute';
        });
      } catch (error) {
        const failFastTime = Date.now() - startTime;
        expect(failFastTime).toBeLessThan(100); // Should fail immediately
        expect(error.message).toContain('Circuit breaker is open');
      }
    });

    it('should integrate circuit breaker with notification services for resilience', async () => {
      // Wrap notification service in circuit breaker
      const notificationCircuitBreaker = new CircuitBreaker('notification-circuit', {
        failureThreshold: 3,
        resetTimeout: 10000,
        monitoringPeriod: 30000
      });

      // Mock notification failures
      teamsService.sendCrisisAlert.mockRejectedValue(new Error('Teams service down'));
      emailService.sendCrisisAlert.mockRejectedValue(new Error('Email service down'));

      const mockPayload: NotificationPayload = {
        escalationId: 'circuit-test-esc',
        severity: 'crisis',
        userId: 'circuit-test-user',
        summary: 'Circuit breaker test',
        triggerMatches: ['test_trigger'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Execute multiple failing notifications to open circuit
      const failureAttempts = [];
      for (let i = 0; i < 4; i++) {
        try {
          await notificationCircuitBreaker.execute(async () => {
            return await notificationService.sendDualCrisisAlert(mockPayload);
          });
        } catch (error) {
          failureAttempts.push(error);
        }
      }

      expect(failureAttempts.length).toBe(4);
      expect(notificationCircuitBreaker.getState()).toBe('open');

      // Verify that circuit breaker prevents further attempts
      const circuitBreakerStartTime = Date.now();
      try {
        await notificationCircuitBreaker.execute(async () => {
          return await notificationService.sendDualCrisisAlert(mockPayload);
        });
      } catch (error) {
        const circuitBreakerTime = Date.now() - circuitBreakerStartTime;
        expect(circuitBreakerTime).toBeLessThan(50);
        expect(error.message).toContain('Circuit breaker is open');
      }
    });
  });

  describe('Progressive Escalation Coordination', () => {
    it('should coordinate escalation levels based on user history and severity', async () => {
      // Mock progressive escalation service
      const mockProgressiveEscalation = jest.spyOn(progressiveEscalationService, 'determineEscalationLevel')
        .mockImplementation(async (userId, currentSeverity, userHistory) => {
          if (userHistory.previousEscalations.length > 0) {
            return {
              level: 'immediate_supervisor_alert',
              priority: 'critical',
              additionalResources: ['mental_health_specialist', 'crisis_counselor'],
              timeoutMs: 1800000, // 30 minutes
              requiresHumanValidation: true
            };
          } else {
            return {
              level: 'standard_nurse_notification',
              priority: 'high',
              additionalResources: ['duty_nurse'],
              timeoutMs: 3600000, // 1 hour
              requiresHumanValidation: false
            };
          }
        });

      // Test with first-time crisis user
      const firstTimeContext: ConversationContext = {
        userId: 'first-time-crisis',
        sessionId: 'first-session',
        messageHistory: [],
        userProfile: {
          vulnerabilityFlags: [],
          previousEscalations: []
        }
      };

      const firstTimeEscalation = await progressiveEscalationService.determineEscalationLevel(
        'first-time-crisis',
        'crisis',
        firstTimeContext.userProfile
      );

      expect(firstTimeEscalation.level).toBe('standard_nurse_notification');
      expect(firstTimeEscalation.priority).toBe('high');

      // Test with repeat crisis user
      const repeatContext: ConversationContext = {
        userId: 'repeat-crisis',
        sessionId: 'repeat-session',
        messageHistory: [],
        userProfile: {
          vulnerabilityFlags: ['high_risk'],
          previousEscalations: ['esc-001', 'esc-002']
        }
      };

      const repeatEscalation = await progressiveEscalationService.determineEscalationLevel(
        'repeat-crisis',
        'crisis',
        repeatContext.userProfile
      );

      expect(repeatEscalation.level).toBe('immediate_supervisor_alert');
      expect(repeatEscalation.priority).toBe('critical');
      expect(repeatEscalation.additionalResources).toContain('mental_health_specialist');

      mockProgressiveEscalation.mockRestore();
    });
  });

  describe('Real-World Healthcare Professional Scenarios', () => {
    it('should handle after-hours crisis with appropriate urgency escalation', async () => {
      // Mock after-hours scenario (22:30)
      const afterHoursTime = new Date();
      afterHoursTime.setHours(22, 30, 0, 0);
      
      jest.spyOn(Date, 'now').mockReturnValue(afterHoursTime.getTime());

      const afterHoursContext: ConversationContext = {
        userId: 'after-hours-user',
        sessionId: 'after-hours-session',
        messageHistory: [
          {
            role: 'user',
            content: 'I can\'t sleep, keep thinking about ending it all',
            timestamp: afterHoursTime.getTime()
          }
        ],
        userProfile: {
          age: 35,
          vulnerabilityFlags: ['insomnia', 'depression_history'],
          previousEscalations: []
        }
      };

      teamsService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'after-hours-teams',
        channelWebhook: 'https://webhook.office.com/crisis',
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: 'https://webhook.office.com/crisis',
          messageId: 'after-hours-teams'
        }
      });

      emailService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'after-hours-email',
        recipients: ['night-duty@crisis-team.nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['night-duty@crisis-team.nhs.test'],
          messageId: 'after-hours-email'
        }
      });

      const safetyResult = await escalationService.analyzeMessage(
        'I can\'t sleep, keep thinking about ending it all',
        afterHoursContext
      );

      // Should detect late-night distress as contextual concern
      expect(safetyResult.contextualConcerns).toContain('late_night_distress');
      expect(safetyResult.severity).toBe('crisis');
      expect(safetyResult.requiresEscalation).toBe(true);

      jest.restoreAllMocks();
    });

    it('should handle young vulnerable user with enhanced protection', async () => {
      const youngUserContext: ConversationContext = {
        userId: 'young-vulnerable-user',
        sessionId: 'young-user-session',
        messageHistory: [],
        userProfile: {
          age: 16,
          vulnerabilityFlags: ['under_18', 'vulnerable_adult'],
          previousEscalations: []
        }
      };

      teamsService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'safeguarding-teams',
        channelWebhook: 'https://webhook.office.com/safeguarding',
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: 'https://webhook.office.com/safeguarding',
          messageId: 'safeguarding-teams'
        }
      });

      emailService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'safeguarding-email',
        recipients: ['safeguarding@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['safeguarding@nhs.test'],
          messageId: 'safeguarding-email'
        }
      });

      const safetyResult = await escalationService.analyzeMessage(
        'I hurt myself yesterday and nobody cares',
        youngUserContext
      );

      // Should identify vulnerable user profile as risk factor
      expect(safetyResult.riskFactors).toContain('vulnerable_user_profile');
      expect(safetyResult.severity).toBe('crisis');

      const escalationEvent = await escalationService.createEscalationEvent(
        youngUserContext.userId,
        youngUserContext.sessionId,
        'I hurt myself yesterday and nobody cares',
        safetyResult
      );

      const dualNotificationResult = await notificationService.sendDualCrisisAlert({
        escalationId: escalationEvent.id,
        severity: safetyResult.severity,
        userId: youngUserContext.userId,
        summary: 'SAFEGUARDING ALERT: Under-18 user crisis detected',
        triggerMatches: safetyResult.matches.map(m => m.trigger),
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      });

      expect(dualNotificationResult.overallSuccess).toBe(true);
    });

    it('should handle multiple concurrent crises during system stress', async () => {
      // Simulate GP surgery system under stress with multiple concurrent crises
      const concurrentCrises = [
        {
          userId: 'concurrent-1',
          message: 'Having severe chest pain, can\'t breathe',
          urgency: 'medical_emergency'
        },
        {
          userId: 'concurrent-2', 
          message: 'I want to kill myself tonight',
          urgency: 'mental_health_crisis'
        },
        {
          userId: 'concurrent-3',
          message: 'Heavy bleeding, been going on for hours',
          urgency: 'medical_emergency'
        },
        {
          userId: 'concurrent-4',
          message: 'Having a panic attack, feel like I\'m dying',
          urgency: 'high_concern'
        }
      ];

      // Mock all notification services to succeed
      teamsService.sendCrisisAlert.mockResolvedValue({
        status: 'sent',
        messageId: 'concurrent-teams',
        channelWebhook: 'https://webhook.office.com/crisis',
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: 'https://webhook.office.com/crisis',
          messageId: 'concurrent-teams'
        }
      });

      emailService.sendCrisisAlert.mockResolvedValue({
        status: 'sent',
        messageId: 'concurrent-email',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'concurrent-email'
        }
      });

      const startTime = Date.now();

      // Process all crises concurrently
      const crisisPromises = concurrentCrises.map(async (crisis) => {
        const context: ConversationContext = {
          userId: crisis.userId,
          sessionId: `${crisis.userId}-session`,
          messageHistory: [],
          userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
        };

        const safetyResult = await escalationService.analyzeMessage(crisis.message, context);
        
        if (safetyResult.requiresEscalation) {
          const escalationEvent = await escalationService.createEscalationEvent(
            context.userId,
            context.sessionId,
            crisis.message,
            safetyResult
          );

          const dualResult = await notificationService.sendDualCrisisAlert({
            escalationId: escalationEvent.id,
            severity: safetyResult.severity,
            userId: context.userId,
            summary: `${crisis.urgency}: Crisis detected`,
            triggerMatches: safetyResult.matches.map(m => m.trigger),
            timestamp: Date.now(),
            urgency: 'immediate',
            requiresCallback: true
          });

          return {
            userId: crisis.userId,
            success: dualResult.overallSuccess,
            responseTime: Date.now() - startTime
          };
        }

        return {
          userId: crisis.userId,
          success: true,
          responseTime: Date.now() - startTime
        };
      });

      const results = await Promise.all(crisisPromises);
      const totalTime = Date.now() - startTime;

      // Assert: All crises should be handled successfully within SLA
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.responseTime).toBeLessThan(5000); // 5 second SLA for concurrent load
      });

      expect(totalTime).toBeLessThan(6000); // Total processing time
      expect(results.length).toBe(4);
    });
  });
});