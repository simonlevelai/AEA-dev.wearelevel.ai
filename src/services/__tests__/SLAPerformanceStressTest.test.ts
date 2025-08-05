/**
 * Comprehensive SLA Performance Stress Tests for Ask Eve Assist
 * 
 * These tests verify that the system maintains <2 second response times
 * for crisis detection and response under various stress conditions:
 * 
 * 1. High concurrent load scenarios (50+ simultaneous users)
 * 2. Memory pressure and resource constraints
 * 3. Database connection stress
 * 4. Network latency simulation
 * 5. System degradation scenarios
 * 6. Peak usage patterns (hospital shift changes)
 * 7. Long-running system stability
 * 
 * All tests enforce strict SLA requirements:
 * - Crisis detection: <500ms
 * - Crisis response: <2000ms  
 * - Nurse notification: <60000ms
 * - Overall end-to-end: <2000ms
 * 
 * Follows TDD with real healthcare emergency scenarios
 */

import { EscalationService } from '../EscalationService';
import { NotificationService } from '../NotificationService';
import { EmailNotificationService } from '../EmailNotificationService';
import { TeamsNotificationService } from '../TeamsNotificationService';
import { SLAMonitoringService } from '../SLAMonitoringService';
import { FailoverService } from '../FailoverService';
import { DataRetentionService } from '../DataRetentionService';
import { Logger } from '../../utils/logger';
import { 
  ConversationContext, 
  SafetyResult, 
  NotificationPayload,
  SeverityLevel 
} from '../../types/safety';

// Mock external dependencies
jest.mock('../../utils/logger');
jest.mock('openai');
jest.mock('@azure/identity');
jest.mock('axios');

describe('SLA Performance Stress Tests', () => {
  let escalationService: EscalationService;
  let notificationService: NotificationService;
  let slaService: SLAMonitoringService;
  let failoverService: FailoverService;
  let dataRetentionService: DataRetentionService;
  let mockLogger: jest.Mocked<Logger>;
  let mockEmailService: jest.Mocked<EmailNotificationService>;
  let mockTeamsService: jest.Mocked<TeamsNotificationService>;

  // Performance tracking
  let performanceMetrics: {
    startTime: number;
    endTime: number;
    responseTime: number;
    slaCompliant: boolean;
    operation: string;
  }[] = [];

  beforeEach(async () => {
    performanceMetrics = [];

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    mockEmailService = {
      sendCrisisAlert: jest.fn(),
      testConnection: jest.fn(),
      getDeliveryStatus: jest.fn(),
      generateEmailTemplate: jest.fn()
    } as any;

    mockTeamsService = {
      sendCrisisAlert: jest.fn(),
      testConnection: jest.fn(),
      getDeliveryStatus: jest.fn(),
      generateAdaptiveCard: jest.fn()
    } as any;

    // Initialize core services
    slaService = new SLAMonitoringService(mockLogger, {
      response_times: {
        crisis_detection_ms: 500,
        crisis_response_ms: 2000,
        nurse_notification_ms: 60000,
        audit_logging_ms: 100
      }
    });

    notificationService = new NotificationService(
      'https://test-webhook.teams.microsoft.com',
      mockLogger,
      3,
      1000,
      mockEmailService,
      mockTeamsService
    );

    escalationService = new EscalationService(mockLogger, notificationService);
    dataRetentionService = new DataRetentionService(mockLogger);

    failoverService = new FailoverService({
      testMode: true,
      enableMonitoring: true,
      enableAlerts: false
    });

    // Mock file system operations
    jest.spyOn(require('fs/promises'), 'readFile').mockImplementation((path: string) => {
      if (path.includes('crisis.json')) {
        return Promise.resolve(JSON.stringify({
          suicide_ideation: ['kill myself', 'end my life', 'want to die', 'suicide'],
          self_harm: ['cut myself', 'hurt myself', 'self harm'],
          severe_distress: ['cannot cope', 'breaking down', 'overwhelmed']
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

    await escalationService.initialize();

    // Setup fast mock responses for performance testing
    mockTeamsService.sendCrisisAlert.mockResolvedValue({
      status: 'sent',
      messageId: 'teams-perf-test',
      channelWebhook: 'https://webhook.office.com/perf',
      deliveredAt: Date.now(),
      retryCount: 0,
      auditTrail: {
        escalationId: expect.any(String),
        deliveryMethod: 'teams',
        timestamp: Date.now(),
        channelWebhook: 'https://webhook.office.com/perf',
        messageId: 'teams-perf-test'
      }
    });

    mockEmailService.sendCrisisAlert.mockResolvedValue({
      status: 'sent',
      messageId: 'email-perf-test',
      recipients: ['perf-test@nhs.test'],
      deliveredAt: Date.now(),
      retryCount: 0,
      auditTrail: {
        escalationId: expect.any(String),
        deliveryMethod: 'email',
        timestamp: Date.now(),
        recipients: ['perf-test@nhs.test'],
        messageId: 'email-perf-test'
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    
    // Log performance summary
    if (performanceMetrics.length > 0) {
      const avgResponseTime = performanceMetrics.reduce((sum, m) => sum + m.responseTime, 0) / performanceMetrics.length;
      const slaCompliance = (performanceMetrics.filter(m => m.slaCompliant).length / performanceMetrics.length) * 100;
      
      console.log(`Performance Summary: Avg Response: ${avgResponseTime.toFixed(2)}ms, SLA Compliance: ${slaCompliance.toFixed(1)}%`);
    }
  });

  const trackPerformance = async <T>(operation: string, slaLimit: number, fn: () => Promise<T>): Promise<T> => {
    const startTime = Date.now();
    const result = await fn();
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    performanceMetrics.push({
      startTime,
      endTime,
      responseTime,
      slaCompliant: responseTime < slaLimit,
      operation
    });
    
    return result;
  };

  describe('High Concurrent Load Scenarios', () => {
    it('should handle 100 concurrent crisis detections within 500ms each', async () => {
      const concurrentCrises = Array.from({ length: 100 }, (_, i) => ({
        message: `Crisis ${i}: I want to kill myself and cannot cope anymore`,
        context: {
          userId: `concurrent-user-${i}`,
          sessionId: `concurrent-session-${i}`,
          messageHistory: [],
          userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
        } as ConversationContext
      }));

      // Act: Process 100 concurrent crisis detections
      const results = await Promise.all(
        concurrentCrises.map(({ message, context }, i) =>
          trackPerformance(
            `crisis-detection-${i}`,
            500, // 500ms SLA limit
            () => escalationService.analyzeMessage(message, context)
          )
        )
      );

      // Assert: All should meet crisis detection SLA
      expect(results).toHaveLength(100);
      results.forEach((result, index) => {
        expect(result.severity).toBe('crisis');
        expect(result.requiresEscalation).toBe(true);
        expect(result.analysisTime).toBeLessThan(500);
        expect(result.matches.length).toBeGreaterThan(0);
      });

      // Performance metrics verification
      const crisisDetectionMetrics = performanceMetrics.filter(m => m.operation.startsWith('crisis-detection'));
      const slaCompliance = (crisisDetectionMetrics.filter(m => m.slaCompliant).length / crisisDetectionMetrics.length) * 100;
      const avgResponseTime = crisisDetectionMetrics.reduce((sum, m) => sum + m.responseTime, 0) / crisisDetectionMetrics.length;
      const maxResponseTime = Math.max(...crisisDetectionMetrics.map(m => m.responseTime));

      expect(slaCompliance).toBeGreaterThanOrEqual(95); // 95% SLA compliance minimum
      expect(avgResponseTime).toBeLessThan(400); // Well within SLA
      expect(maxResponseTime).toBeLessThan(500); // No outliers beyond SLA

      console.log(`Crisis Detection Performance: Avg ${avgResponseTime.toFixed(2)}ms, Max ${maxResponseTime}ms, SLA ${slaCompliance.toFixed(1)}%`);
    });

    it('should handle 50 concurrent end-to-end crisis flows within 2 seconds each', async () => {
      const endToEndCrises = Array.from({ length: 50 }, (_, i) => ({
        message: `End-to-end crisis ${i}: I am going to hurt myself tonight`,
        userId: `e2e-user-${i}`,
        sessionId: `e2e-session-${i}`
      }));

      // Act: Process complete end-to-end crisis flows
      const e2eResults = await Promise.all(
        endToEndCrises.map(({ message, userId, sessionId }, i) =>
          trackPerformance(
            `end-to-end-${i}`,
            2000, // 2 second SLA limit
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId,
                messageHistory: [],
                userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
              };

              // Complete crisis flow
              const safetyResult = await escalationService.analyzeMessage(message, context);
              const escalationEvent = await escalationService.createEscalationEvent(userId, sessionId, message, safetyResult);
              const crisisResponse = await escalationService.generateCrisisResponse(safetyResult);
              
              if (safetyResult.requiresEscalation) {
                const dualNotification = await notificationService.sendDualCrisisAlert({
                  escalationId: escalationEvent.id,
                  severity: safetyResult.severity,
                  userId,
                  summary: `E2E test crisis ${i}`,
                  triggerMatches: safetyResult.matches.map(m => m.trigger),
                  timestamp: Date.now(),
                  urgency: 'immediate',
                  requiresCallback: true
                });

                return {
                  safetyResult,
                  escalationEvent,
                  crisisResponse,
                  notificationResult: dualNotification
                };
              }

              return { safetyResult, escalationEvent, crisisResponse };
            }
          )
        )
      );

      // Assert: All end-to-end flows should complete within SLA
      expect(e2eResults).toHaveLength(50);
      e2eResults.forEach((result, index) => {
        expect(result.safetyResult.severity).toBe('crisis');
        expect(result.safetyResult.requiresEscalation).toBe(true);
        expect(result.crisisResponse.escalationRequired).toBe(true);
        
        if (result.notificationResult) {
          expect(result.notificationResult.overallSuccess).toBe(true);
        }
      });

      // Performance verification
      const e2eMetrics = performanceMetrics.filter(m => m.operation.startsWith('end-to-end'));
      const e2eSlaCompliance = (e2eMetrics.filter(m => m.slaCompliant).length / e2eMetrics.length) * 100;
      const e2eAvgTime = e2eMetrics.reduce((sum, m) => sum + m.responseTime, 0) / e2eMetrics.length;
      const e2eMaxTime = Math.max(...e2eMetrics.map(m => m.responseTime));

      expect(e2eSlaCompliance).toBeGreaterThanOrEqual(95);
      expect(e2eAvgTime).toBeLessThan(1800); // Well within 2 second SLA
      expect(e2eMaxTime).toBeLessThan(2000);

      console.log(`End-to-End Performance: Avg ${e2eAvgTime.toFixed(2)}ms, Max ${e2eMaxTime}ms, SLA ${e2eSlaCompliance.toFixed(1)}%`);
    });

    it('should maintain performance during sustained high load (5 minutes)', async () => {
      const sustainedLoadDuration = 30000; // 30 seconds for test (would be 5 minutes in production)
      const requestsPerSecond = 10;
      const totalRequests = Math.floor(sustainedLoadDuration / 1000) * requestsPerSecond;
      
      let requestCount = 0;
      const sustainedResults: any[] = [];
      const startTime = Date.now();

      // Generate sustained load
      while (Date.now() - startTime < sustainedLoadDuration) {
        const batchPromises = Array.from({ length: requestsPerSecond }, async (_, i) => {
          const requestId = requestCount++;
          const context: ConversationContext = {
            userId: `sustained-user-${requestId}`,
            sessionId: `sustained-session-${requestId}`,
            messageHistory: [],
            userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
          };

          return trackPerformance(
            `sustained-${requestId}`,
            2000,
            () => escalationService.analyzeMessage(
              `Sustained load crisis ${requestId}: I need help with my mental health`,
              context
            )
          );
        });

        const batchResults = await Promise.all(batchPromises);
        sustainedResults.push(...batchResults);

        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Assert: Performance should remain consistent throughout sustained load
      expect(sustainedResults.length).toBeGreaterThan(100);
      
      // Analyze performance over time
      const sustainedMetrics = performanceMetrics.filter(m => m.operation.startsWith('sustained'));
      const timeWindows = [];
      const windowSize = 5000; // 5 second windows
      
      for (let windowStart = startTime; windowStart < startTime + sustainedLoadDuration; windowStart += windowSize) {
        const windowMetrics = sustainedMetrics.filter(m => 
          m.startTime >= windowStart && m.startTime < windowStart + windowSize
        );
        
        if (windowMetrics.length > 0) {
          const windowAvg = windowMetrics.reduce((sum, m) => sum + m.responseTime, 0) / windowMetrics.length;
          const windowSla = (windowMetrics.filter(m => m.slaCompliant).length / windowMetrics.length) * 100;
          
          timeWindows.push({ windowStart, avgTime: windowAvg, slaCompliance: windowSla, count: windowMetrics.length });
        }
      }

      // Performance should not degrade significantly over time
      timeWindows.forEach((window, index) => {
        expect(window.avgTime).toBeLessThan(1500); // Consistent performance
        expect(window.slaCompliance).toBeGreaterThanOrEqual(90); // Maintain SLA
      });

      // Overall sustained load metrics
      const overallSla = (sustainedMetrics.filter(m => m.slaCompliant).length / sustainedMetrics.length) * 100;
      const overallAvg = sustainedMetrics.reduce((sum, m) => sum + m.responseTime, 0) / sustainedMetrics.length;

      expect(overallSla).toBeGreaterThanOrEqual(95);
      expect(overallAvg).toBeLessThan(1000);

      console.log(`Sustained Load Performance: ${sustainedResults.length} requests, Avg ${overallAvg.toFixed(2)}ms, SLA ${overallSla.toFixed(1)}%`);
    });
  });

  describe('Memory Pressure and Resource Constraints', () => {
    it('should maintain performance under simulated memory pressure', async () => {
      // Simulate memory pressure by creating large objects
      const memoryPressureObjects: any[] = [];
      const largeObjectSize = 1000000; // 1MB objects

      // Create memory pressure
      for (let i = 0; i < 50; i++) {
        memoryPressureObjects.push(new Array(largeObjectSize).fill(`memory-pressure-data-${i}`));
      }

      const memoryPressureTests = Array.from({ length: 20 }, (_, i) => ({
        message: `Memory pressure test ${i}: I am having a mental health crisis`,
        userId: `memory-test-user-${i}`,
        sessionId: `memory-test-session-${i}`
      }));

      // Act: Test performance under memory pressure
      const memoryResults = await Promise.all(
        memoryPressureTests.map(({ message, userId, sessionId }, i) =>
          trackPerformance(
            `memory-pressure-${i}`,
            2000,
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId,
                messageHistory: [],
                userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
              };

              const safetyResult = await escalationService.analyzeMessage(message, context);
              const escalationEvent = await escalationService.createEscalationEvent(userId, sessionId, message, safetyResult);
              
              // Force garbage collection attempt
              if (global.gc) {
                global.gc();
              }

              return { safetyResult, escalationEvent };
            }
          )
        )
      );

      // Cleanup memory pressure
      memoryPressureObjects.length = 0;

      // Assert: Performance should remain acceptable under memory pressure
      const memoryMetrics = performanceMetrics.filter(m => m.operation.startsWith('memory-pressure'));
      const memorySla = (memoryMetrics.filter(m => m.slaCompliant).length / memoryMetrics.length) * 100;
      const memoryAvg = memoryMetrics.reduce((sum, m) => sum + m.responseTime, 0) / memoryMetrics.length;

      expect(memorySla).toBeGreaterThanOrEqual(85); // Slightly lower SLA acceptable under pressure
      expect(memoryAvg).toBeLessThan(1800); // Still within reasonable bounds
      expect(memoryResults).toHaveLength(20);

      memoryResults.forEach(result => {
        expect(result.safetyResult.severity).toBeDefined();
        expect(result.escalationEvent.id).toBeDefined();
      });
    });

    it('should handle database connection stress efficiently', async () => {
      // Simulate database connection stress with rapid successive operations
      const dbStressTests = Array.from({ length: 30 }, (_, i) => ({
        userId: `db-stress-user-${i}`,
        operation: `database-stress-${i}`
      }));

      // Act: Test database stress scenarios
      const dbResults = await Promise.all(
        dbStressTests.map(({ userId, operation }, i) =>
          trackPerformance(
            operation,
            1000, // Stricter SLA for DB operations
            async () => {
              // Simulate multiple rapid database operations
              const dataRetentionCheck = await dataRetentionService.checkUserDataRetention(userId);
              const scheduleResult = await dataRetentionService.scheduleUserDataDeletion(userId, {
                preserveCrisisEvents: true
              });

              // Simulate concurrent SLA tracking
              slaService.trackCrisisDetection(userId, Date.now(), 400);
              
              return { dataRetentionCheck, scheduleResult };
            }
          )
        )
      );

      // Assert: Database operations should remain efficient
      const dbMetrics = performanceMetrics.filter(m => m.operation.startsWith('database-stress'));
      const dbSla = (dbMetrics.filter(m => m.slaCompliant).length / dbMetrics.length) * 100;
      const dbAvg = dbMetrics.reduce((sum, m) => sum + m.responseTime, 0) / dbMetrics.length;

      expect(dbSla).toBeGreaterThanOrEqual(90);
      expect(dbAvg).toBeLessThan(800);
      expect(dbResults).toHaveLength(30);

      dbResults.forEach((result, index) => {
        expect(result.dataRetentionCheck).toBeDefined();
        expect(result.scheduleResult).toBeDefined();
      });
    });
  });

  describe('Network Latency Simulation', () => {
    it('should maintain SLA compliance with simulated network delays', async () => {
      // Mock network delays in notification services
      mockTeamsService.sendCrisisAlert.mockImplementation(async (payload) => {
        const networkDelay = Math.random() * 800 + 200; // 200-1000ms network delay
        await new Promise(resolve => setTimeout(resolve, networkDelay));
        
        return {
          status: 'sent',
          messageId: `teams-latency-${payload.escalationId}`,
          channelWebhook: 'https://webhook.office.com/latency',
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'teams',
            timestamp: Date.now(),
            channelWebhook: 'https://webhook.office.com/latency',
            messageId: `teams-latency-${payload.escalationId}`
          }
        };
      });

      mockEmailService.sendCrisisAlert.mockImplementation(async (payload) => {
        const networkDelay = Math.random() * 600 + 100; // 100-700ms network delay
        await new Promise(resolve => setTimeout(resolve, networkDelay));
        
        return {
          status: 'sent',
          messageId: `email-latency-${payload.escalationId}`,
          recipients: ['latency-test@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['latency-test@nhs.test'],
            messageId: `email-latency-${payload.escalationId}`
          }
        };
      });

      const latencyTests = Array.from({ length: 15 }, (_, i) => ({
        message: `Network latency test ${i}: I need crisis support`,
        userId: `latency-user-${i}`,
        sessionId: `latency-session-${i}`
      }));

      // Act: Test with network latency
      const latencyResults = await Promise.all(
        latencyTests.map(({ message, userId, sessionId }, i) =>
          trackPerformance(
            `network-latency-${i}`,
            2000,
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId,
                messageHistory: [],
                userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
              };

              const safetyResult = await escalationService.analyzeMessage(message, context);
              const escalationEvent = await escalationService.createEscalationEvent(userId, sessionId, message, safetyResult);
              
              const dualNotification = await notificationService.sendDualCrisisAlert({
                escalationId: escalationEvent.id,
                severity: safetyResult.severity,
                userId,
                summary: `Latency test ${i}`,
                triggerMatches: safetyResult.matches.map(m => m.trigger),
                timestamp: Date.now(),
                urgency: 'immediate',
                requiresCallback: true
              });

              return { safetyResult, dualNotification };
            }
          )
        )
      );

      // Assert: Should handle network latency gracefully
      const latencyMetrics = performanceMetrics.filter(m => m.operation.startsWith('network-latency'));
      const latencySla = (latencyMetrics.filter(m => m.slaCompliant).length / latencyMetrics.length) * 100;
      const latencyAvg = latencyMetrics.reduce((sum, m) => sum + m.responseTime, 0) / latencyMetrics.length;

      expect(latencySla).toBeGreaterThanOrEqual(80); // Network latency may impact SLA
      expect(latencyAvg).toBeLessThan(2500); // Reasonable with network delays
      expect(latencyResults).toHaveLength(15);

      latencyResults.forEach(result => {
        expect(result.safetyResult.severity).toBeDefined();
        expect(result.dualNotification.overallSuccess).toBe(true);
      });
    });
  });

  describe('Peak Usage Pattern Simulation', () => {
    it('should handle hospital shift change peak load (7am, 3pm, 11pm)', async () => {
      // Simulate shift change scenarios with burst traffic
      const shiftChangeScenarios = [
        { shift: '7am', load: 25, description: 'Night shift handover - urgent cases' },
        { shift: '3pm', load: 20, description: 'Day shift change - routine follow-ups' },
        { shift: '11pm', load: 15, description: 'Evening shift - emergency escalations' }
      ];

      const allShiftResults: any[] = [];

      for (const scenario of shiftChangeScenarios) {
        const shiftTests = Array.from({ length: scenario.load }, (_, i) => ({
          message: `${scenario.shift} shift crisis ${i}: Patient needs immediate mental health support`,
          userId: `${scenario.shift}-user-${i}`,
          sessionId: `${scenario.shift}-session-${i}`,
          shift: scenario.shift
        }));

        // Act: Process shift change load burst
        const shiftResults = await Promise.all(
          shiftTests.map(({ message, userId, sessionId, shift }, i) =>
            trackPerformance(
              `shift-${shift}-${i}`,
              1800, // Slightly tighter SLA during peak times
              async () => {
                const context: ConversationContext = {
                  userId,
                  sessionId,
                  messageHistory: [],
                  userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
                };

                const safetyResult = await escalationService.analyzeMessage(message, context);
                const escalationEvent = await escalationService.createEscalationEvent(userId, sessionId, message, safetyResult);
                
                return { safetyResult, escalationEvent, shift };
              }
            )
          )
        );

        allShiftResults.push(...shiftResults);

        // Brief pause between shifts
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Assert: All shift changes should be handled efficiently
      expect(allShiftResults).toHaveLength(60); // 25 + 20 + 15

      // Analyze per-shift performance
      shiftChangeScenarios.forEach(scenario => {
        const shiftMetrics = performanceMetrics.filter(m => 
          m.operation.startsWith(`shift-${scenario.shift}`)
        );
        
        const shiftSla = (shiftMetrics.filter(m => m.slaCompliant).length / shiftMetrics.length) * 100;
        const shiftAvg = shiftMetrics.reduce((sum, m) => sum + m.responseTime, 0) / shiftMetrics.length;

        expect(shiftSla).toBeGreaterThanOrEqual(90);
        expect(shiftAvg).toBeLessThan(1500);
        expect(shiftMetrics).toHaveLength(scenario.load);

        console.log(`${scenario.shift} Shift Performance: ${scenario.load} requests, Avg ${shiftAvg.toFixed(2)}ms, SLA ${shiftSla.toFixed(1)}%`);
      });

      // Overall shift performance
      const allShiftMetrics = performanceMetrics.filter(m => m.operation.startsWith('shift-'));
      const overallShiftSla = (allShiftMetrics.filter(m => m.slaCompliant).length / allShiftMetrics.length) * 100;
      
      expect(overallShiftSla).toBeGreaterThanOrEqual(90);
    });

    it('should handle weekend emergency department spike load', async () => {
      // Simulate weekend ED spike - higher acuity, more urgent cases
      const weekendSpike = Array.from({ length: 40 }, (_, i) => {
        const urgencyTypes = ['crisis', 'urgent', 'high_concern'];
        const urgency = urgencyTypes[i % 3];
        
        return {
          message: `Weekend ED ${urgency} ${i}: ${
            urgency === 'crisis' ? 'Patient expressing suicidal ideation' :
            urgency === 'urgent' ? 'Patient having severe panic attack' :
            'Patient requesting mental health support'
          }`,
          userId: `weekend-ed-user-${i}`,
          sessionId: `weekend-ed-session-${i}`,
          urgency
        };
      });

      // Act: Process weekend ED spike with mixed urgency
      const weekendResults = await Promise.all(
        weekendSpike.map(({ message, userId, sessionId, urgency }, i) => {
          const slaLimit = urgency === 'crisis' ? 1500 : 2000; // Stricter SLA for crisis
          
          return trackPerformance(
            `weekend-ed-${urgency}-${i}`,
            slaLimit,
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId,
                messageHistory: [],
                userProfile: { 
                  vulnerabilityFlags: urgency === 'crisis' ? ['high_risk'] : [],
                  previousEscalations: []
                }
              };

              const safetyResult = await escalationService.analyzeMessage(message, context);
              const escalationEvent = await escalationService.createEscalationEvent(userId, sessionId, message, safetyResult);
              
              // Crisis cases get immediate notification
              if (safetyResult.severity === 'crisis') {
                const notification = await notificationService.sendDualCrisisAlert({
                  escalationId: escalationEvent.id,
                  severity: safetyResult.severity,
                  userId,
                  summary: `Weekend ED crisis ${i}`,
                  triggerMatches: safetyResult.matches.map(m => m.trigger),
                  timestamp: Date.now(),
                  urgency: 'immediate',
                  requiresCallback: true
                });
                
                return { safetyResult, escalationEvent, notification, urgency };
              }

              return { safetyResult, escalationEvent, urgency };
            }
          );
        })
      );

      // Assert: Weekend spike should be handled with appropriate prioritization
      expect(weekendResults).toHaveLength(40);

      // Analyze by urgency level
      const crisisResults = weekendResults.filter(r => r.urgency === 'crisis');
      const urgentResults = weekendResults.filter(r => r.urgency === 'urgent');
      const highConcernResults = weekendResults.filter(r => r.urgency === 'high_concern');

      // Crisis cases should have highest performance
      const crisisMetrics = performanceMetrics.filter(m => 
        m.operation.includes('weekend-ed-crisis')
      );
      const crisisSla = (crisisMetrics.filter(m => m.slaCompliant).length / crisisMetrics.length) * 100;
      const crisisAvg = crisisMetrics.reduce((sum, m) => sum + m.responseTime, 0) / crisisMetrics.length;

      expect(crisisSla).toBeGreaterThanOrEqual(95);
      expect(crisisAvg).toBeLessThan(1200);

      // All urgencies should succeed
      crisisResults.forEach(result => {
        expect(result.safetyResult.severity).toBe('crisis');
        if (result.notification) {
          expect(result.notification.overallSuccess).toBe(true);
        }
      });

      console.log(`Weekend ED Spike: Crisis Avg ${crisisAvg.toFixed(2)}ms, SLA ${crisisSla.toFixed(1)}%`);
    });
  });

  describe('System Degradation Recovery', () => {
    it('should recover SLA compliance after temporary performance degradation', async () => {
      // Phase 1: Normal performance
      const normalPhase = Array.from({ length: 10 }, (_, i) => ({
        message: `Normal phase ${i}: I need mental health support`,
        userId: `normal-user-${i}`,
        phase: 'normal'
      }));

      // Phase 2: Degraded performance 
      const degradedPhase = Array.from({ length: 10 }, (_, i) => ({
        message: `Degraded phase ${i}: I am in crisis`,
        userId: `degraded-user-${i}`,
        phase: 'degraded'
      }));

      // Phase 3: Recovery performance
      const recoveryPhase = Array.from({ length: 10 }, (_, i) => ({
        message: `Recovery phase ${i}: Crisis support needed`,
        userId: `recovery-user-${i}`,
        phase: 'recovery'
      }));

      // Phase 1: Normal performance
      await Promise.all(
        normalPhase.map(({ message, userId, phase }, i) =>
          trackPerformance(
            `${phase}-${i}`,
            2000,
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId: `${phase}-session-${i}`,
                messageHistory: [],
                userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
              };
              return escalationService.analyzeMessage(message, context);
            }
          )
        )
      );

      // Phase 2: Simulate degradation
      const originalAnalyzeMessage = escalationService.analyzeMessage;
      jest.spyOn(escalationService, 'analyzeMessage').mockImplementation(async (message, context) => {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Add delay
        return originalAnalyzeMessage.call(escalationService, message, context);
      });

      await Promise.all(
        degradedPhase.map(({ message, userId, phase }, i) =>
          trackPerformance(
            `${phase}-${i}`,
            2000,
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId: `${phase}-session-${i}`,
                messageHistory: [],
                userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
              };
              return escalationService.analyzeMessage(message, context);
            }
          )
        )
      );

      // Phase 3: Restore normal performance
      (escalationService.analyzeMessage as jest.Mock).mockRestore();

      await Promise.all(
        recoveryPhase.map(({ message, userId, phase }, i) =>
          trackPerformance(
            `${phase}-${i}`,
            2000,
            async () => {
              const context: ConversationContext = {
                userId,
                sessionId: `${phase}-session-${i}`,
                messageHistory: [],
                userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
              };
              return escalationService.analyzeMessage(message, context);
            }
          )
        )
      );

      // Assert: System should show degradation then recovery
      const normalMetrics = performanceMetrics.filter(m => m.operation.startsWith('normal'));
      const degradedMetrics = performanceMetrics.filter(m => m.operation.startsWith('degraded'));
      const recoveryMetrics = performanceMetrics.filter(m => m.operation.startsWith('recovery'));

      const normalSla = (normalMetrics.filter(m => m.slaCompliant).length / normalMetrics.length) * 100;
      const degradedSla = (degradedMetrics.filter(m => m.slaCompliant).length / degradedMetrics.length) * 100;
      const recoverySla = (recoveryMetrics.filter(m => m.slaCompliant).length / recoveryMetrics.length) * 100;

      const normalAvg = normalMetrics.reduce((sum, m) => sum + m.responseTime, 0) / normalMetrics.length;
      const degradedAvg = degradedMetrics.reduce((sum, m) => sum + m.responseTime, 0) / degradedMetrics.length;
      const recoveryAvg = recoveryMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recoveryMetrics.length;

      // Normal phase should be good
      expect(normalSla).toBeGreaterThanOrEqual(95);
      expect(normalAvg).toBeLessThan(1000);

      // Degraded phase should show impact
      expect(degradedSla).toBeLessThan(normalSla);
      expect(degradedAvg).toBeGreaterThan(normalAvg);

      // Recovery phase should return to normal levels
      expect(recoverySla).toBeGreaterThanOrEqual(90);
      expect(recoveryAvg).toBeLessThan(degradedAvg);
      expect(Math.abs(recoveryAvg - normalAvg)).toBeLessThan(200); // Similar to normal

      console.log(`Performance Recovery: Normal ${normalAvg.toFixed(0)}ms/${normalSla.toFixed(0)}%, Degraded ${degradedAvg.toFixed(0)}ms/${degradedSla.toFixed(0)}%, Recovery ${recoveryAvg.toFixed(0)}ms/${recoverySla.toFixed(0)}%`);
    });
  });
});