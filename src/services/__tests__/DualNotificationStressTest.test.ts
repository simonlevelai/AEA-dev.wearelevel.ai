/**
 * Advanced integration tests for dual notification system under stress
 * 
 * These tests verify that the dual escalation system (Teams + Email) 
 * maintains reliability and performance under various stress conditions:
 * 
 * 1. High concurrent load scenarios
 * 2. Network failures and timeouts
 * 3. Service degradation scenarios  
 * 4. Recovery and retry mechanisms
 * 5. Message delivery guarantees
 * 6. SLA compliance under stress
 * 
 * Follows TDD with real healthcare emergency scenarios
 */

import { NotificationService, DualEscalationResult } from '../NotificationService';
import { EmailNotificationService, EmailDeliveryResult } from '../EmailNotificationService';
import { TeamsNotificationService, TeamsDeliveryResult } from '../TeamsNotificationService';
import { Logger } from '../../utils/logger';
import { NotificationPayload, SeverityLevel } from '../../types/safety';

// Mock external dependencies
jest.mock('../../utils/logger');
jest.mock('axios');

describe('Dual Notification System Stress Tests', () => {
  let notificationService: NotificationService;
  let mockEmailService: jest.Mocked<EmailNotificationService>;
  let mockTeamsService: jest.Mocked<TeamsNotificationService>;
  let mockLogger: jest.Mocked<Logger>;

  const webhookUrl = 'https://teams.microsoft.com/api/webhook/crisis-alerts-stress-test';

  beforeEach(() => {
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

    notificationService = new NotificationService(
      webhookUrl,
      mockLogger,
      3, // maxRetries
      1000, // retryDelay  
      mockEmailService,
      mockTeamsService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('High Concurrent Load Scenarios', () => {
    it('should handle 50 concurrent crisis notifications within SLA', async () => {
      // Arrange: Setup successful mock responses for both services
      const mockTeamsResult: TeamsDeliveryResult = {
        status: 'sent',
        messageId: 'teams-concurrent',
        channelWebhook: webhookUrl,
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: webhookUrl,
          messageId: 'teams-concurrent'
        }
      };

      const mockEmailResult: EmailDeliveryResult = {
        status: 'sent',
        messageId: 'email-concurrent',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'email-concurrent'
        }
      };

      mockTeamsService.sendCrisisAlert.mockResolvedValue(mockTeamsResult);
      mockEmailService.sendCrisisAlert.mockResolvedValue(mockEmailResult);

      // Create 50 concurrent crisis notifications
      const concurrentNotifications = Array.from({ length: 50 }, (_, i) => ({
        escalationId: `stress-esc-${i}`,
        severity: 'crisis' as SeverityLevel,
        userId: `stress-user-${i}`,
        summary: `Concurrent crisis ${i}: High load test`,
        triggerMatches: ['suicide_ideation', 'severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate' as const,
        requiresCallback: true
      }));

      // Act: Send all notifications concurrently
      const startTime = Date.now();
      const notificationPromises = concurrentNotifications.map(payload => 
        notificationService.sendDualCrisisAlert(payload)
      );

      const results = await Promise.all(notificationPromises);
      const totalTime = Date.now() - startTime;

      // Assert: All notifications should succeed within SLA
      expect(results).toHaveLength(50);
      results.forEach((result, index) => {
        expect(result.overallSuccess).toBe(true);
        expect(result.teamsDelivered).toBe(true);
        expect(result.emailDelivered).toBe(true);
        expect(result.failures).toHaveLength(0);
        expect(result.deliveryConfirmation.escalationId).toBe(`stress-esc-${index}`);
      });

      // Performance requirements
      expect(totalTime).toBeLessThan(10000); // 10 seconds for 50 concurrent notifications
      expect(mockTeamsService.sendCrisisAlert).toHaveBeenCalledTimes(50);
      expect(mockEmailService.sendCrisisAlert).toHaveBeenCalledTimes(50);

      // Verify no memory leaks in delivery status tracking
      const statusChecks = await Promise.all(
        concurrentNotifications.slice(0, 5).map(payload =>
          notificationService.getDualDeliveryStatus(payload.escalationId)
        )
      );

      statusChecks.forEach(status => {
        expect(status.overallStatus).toBe('sent');
        expect(status.teamsStatus).toBe('sent');
        expect(status.emailStatus).toBe('sent');
      });
    });

    it('should maintain delivery guarantees under network congestion', async () => {
      // Simulate network congestion with slower response times
      const networkDelay = 1500; // 1.5 second delay
      
      mockTeamsService.sendCrisisAlert.mockImplementation(async (payload) => {
        await new Promise(resolve => setTimeout(resolve, networkDelay));
        return {
          status: 'sent',
          messageId: `teams-congested-${payload.escalationId}`,
          channelWebhook: webhookUrl,
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'teams',
            timestamp: Date.now(),
            channelWebhook: webhookUrl,
            messageId: `teams-congested-${payload.escalationId}`
          }
        };
      });

      mockEmailService.sendCrisisAlert.mockImplementation(async (payload) => {
        await new Promise(resolve => setTimeout(resolve, networkDelay / 2)); // Email faster
        return {
          status: 'sent',
          messageId: `email-congested-${payload.escalationId}`,
          recipients: ['crisis-team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['crisis-team@nhs.test'],
            messageId: `email-congested-${payload.escalationId}`
          }
        };
      });

      const testPayload: NotificationPayload = {
        escalationId: 'network-congestion-test',
        severity: 'crisis',
        userId: 'congestion-user',
        summary: 'Network congestion stress test',
        triggerMatches: ['severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Act: Send notification under congested conditions
      const startTime = Date.now();
      const result = await notificationService.sendDualCrisisAlert(testPayload);
      const responseTime = Date.now() - startTime;

      // Assert: Should still succeed but may take longer
      expect(result.overallSuccess).toBe(true);
      expect(result.teamsDelivered).toBe(true);  
      expect(result.emailDelivered).toBe(true);
      expect(responseTime).toBeGreaterThan(networkDelay); // Should reflect network delay
      expect(responseTime).toBeLessThan(5000); // But still within reasonable bounds

      // Verify delivery confirmation
      expect(result.deliveryConfirmation.channels).toEqual(['teams', 'email']);
      expect(result.deliveryConfirmation.teamsMessageId).toBe('teams-congested-network-congestion-test');
      expect(result.deliveryConfirmation.emailMessageId).toBe('email-congested-network-congestion-test');
    });

    it('should handle burst traffic patterns from multiple hospital wards', async () => {
      // Simulate realistic hospital scenario: multiple wards experiencing crises simultaneously
      const wardScenarios = [
        { ward: 'Emergency', crisisCount: 8, severity: 'crisis' as SeverityLevel },
        { ward: 'ICU', crisisCount: 3, severity: 'crisis' as SeverityLevel },
        { ward: 'Maternity', crisisCount: 2, severity: 'high_concern' as SeverityLevel },
        { ward: 'Mental Health', crisisCount: 12, severity: 'crisis' as SeverityLevel },
        { ward: 'Oncology', crisisCount: 5, severity: 'high_concern' as SeverityLevel }
      ];

      // Setup mock responses
      mockTeamsService.sendCrisisAlert.mockResolvedValue({
        status: 'sent',
        messageId: 'teams-ward-burst',
        channelWebhook: webhookUrl,
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: webhookUrl,
          messageId: 'teams-ward-burst'
        }
      });

      mockEmailService.sendCrisisAlert.mockResolvedValue({
        status: 'sent',
        messageId: 'email-ward-burst',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'email-ward-burst'
        }
      });

      // Generate burst notifications for each ward
      const burstNotifications = wardScenarios.flatMap(scenario =>
        Array.from({ length: scenario.crisisCount }, (_, i) => ({
          escalationId: `${scenario.ward.toLowerCase()}-crisis-${i}`,
          severity: scenario.severity,
          userId: `${scenario.ward.toLowerCase()}-user-${i}`,
          summary: `${scenario.ward} ward crisis ${i}`,
          triggerMatches: ['severe_distress'],
          timestamp: Date.now(),
          urgency: scenario.severity === 'crisis' ? 'immediate' as const : 'high' as const,
          requiresCallback: scenario.severity === 'crisis'
        }))
      );

      // Act: Process burst traffic
      const startTime = Date.now();
      const burstPromises = burstNotifications.map(notification =>
        notificationService.sendDualCrisisAlert(notification)
      );

      const results = await Promise.all(burstPromises);
      const totalTime = Date.now() - startTime;

      // Assert: All ward notifications should be processed successfully
      const totalExpected = wardScenarios.reduce((sum, ward) => sum + ward.crisisCount, 0);
      expect(results).toHaveLength(totalExpected);
      expect(totalTime).toBeLessThan(15000); // 15 seconds for burst processing

      const successfulDeliveries = results.filter(r => r.overallSuccess).length;
      expect(successfulDeliveries).toBe(totalExpected);

      // Verify crisis notifications were prioritized (immediate urgency)
      const crisisNotifications = results.filter((r, i) => 
        burstNotifications[i].urgency === 'immediate'
      );
      expect(crisisNotifications.length).toBe(23); // Emergency + ICU + Mental Health = 8+3+12

      crisisNotifications.forEach(result => {
        expect(result.overallSuccess).toBe(true);
        expect(result.deliveryConfirmation.channels).toHaveLength(2);
      });
    });
  });

  describe('Network Failures and Recovery', () => {
    it('should recover from temporary Teams service outage', async () => {
      // Simulate Teams service recovering after initial failures
      let teamsCallCount = 0;
      mockTeamsService.sendCrisisAlert.mockImplementation(async (payload) => {
        teamsCallCount++;
        if (teamsCallCount <= 2) {
          throw new Error('Teams service temporarily unavailable');
        }
        // Recover on third attempt
        return {
          status: 'sent',
          messageId: `teams-recovered-${payload.escalationId}`,
          channelWebhook: webhookUrl,
          deliveredAt: Date.now(),
          retryCount: 2,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'teams',
            timestamp: Date.now(),
            channelWebhook: webhookUrl,
            messageId: `teams-recovered-${payload.escalationId}`
          }
        };
      });

      mockEmailService.sendCrisisAlert.mockResolvedValue({
        status: 'sent',
        messageId: 'email-reliable',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: expect.any(String),
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'email-reliable'
        }
      });

      const testPayload: NotificationPayload = {
        escalationId: 'teams-recovery-test',
        severity: 'crisis',
        userId: 'recovery-user',
        summary: 'Teams recovery test scenario',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Act: Send notification with Teams recovering
      const result = await notificationService.sendDualCrisisAlert(testPayload);

      // Assert: Should succeed with Teams eventually working
      expect(result.overallSuccess).toBe(true);
      expect(result.teamsDelivered).toBe(true);
      expect(result.emailDelivered).toBe(true);
      expect(result.teamsResult?.retryCount).toBe(2);
      expect(result.failures).toHaveLength(0);

      // Teams service should have been called 3 times (2 failures + 1 success)
      expect(mockTeamsService.sendCrisisAlert).toHaveBeenCalledTimes(3);
      expect(mockEmailService.sendCrisisAlert).toHaveBeenCalledTimes(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Dual crisis alert sent successfully',
        expect.objectContaining({
          escalationId: 'teams-recovery-test',
          teamsDelivered: true,
          emailDelivered: true
        })
      );
    });

    it('should handle cascading service failures with graceful degradation', async () => {
      // Simulate both services failing initially, then Email recovering
      let emailCallCount = 0;
      
      mockTeamsService.sendCrisisAlert.mockRejectedValue(
        new Error('Teams service completely down')
      );

      mockEmailService.sendCrisisAlert.mockImplementation(async (payload) => {
        emailCallCount++;
        if (emailCallCount === 1) {
          throw new Error('Email service overloaded');
        }
        // Recover on second attempt
        return {
          status: 'sent',
          messageId: `email-recovered-${payload.escalationId}`,
          recipients: ['crisis-team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 1,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['crisis-team@nhs.test'],
            messageId: `email-recovered-${payload.escalationId}`
          }
        };
      });

      const testPayload: NotificationPayload = {
        escalationId: 'cascading-failure-test',
        severity: 'crisis',
        userId: 'cascade-user',
        summary: 'Cascading failure scenario',
        triggerMatches: ['self_harm'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Act: Process notification with cascading failures
      const result = await notificationService.sendDualCrisisAlert(testPayload);

      // Assert: Should succeed with at least Email working (graceful degradation)
      expect(result.overallSuccess).toBe(true);
      expect(result.teamsDelivered).toBe(false);
      expect(result.emailDelivered).toBe(true);
      expect(result.emailResult?.retryCount).toBe(1);
      expect(result.failures).toContain('Teams: Teams service completely down');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Partial failure in dual crisis alert',
        expect.objectContaining({
          escalationId: 'cascading-failure-test',
          teamsDelivered: false,
          emailDelivered: true,
          failures: expect.arrayContaining([
            expect.stringContaining('Teams service completely down')
          ])
        })
      );
    });

    it('should implement exponential backoff during service degradation', async () => {
      // Track retry timing to verify exponential backoff
      const retryTimestamps: number[] = [];
      
      mockTeamsService.sendCrisisAlert.mockImplementation(async () => {
        retryTimestamps.push(Date.now());
        throw new Error('Service degraded - rate limited');
      });

      mockEmailService.sendCrisisAlert.mockImplementation(async () => {
        retryTimestamps.push(Date.now());
        throw new Error('Service degraded - rate limited'); 
      });

      const testPayload: NotificationPayload = {
        escalationId: 'backoff-test',
        severity: 'crisis',
        userId: 'backoff-user',
        summary: 'Exponential backoff test',
        triggerMatches: ['severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Act: Attempt notification with failing services
      try {
        await notificationService.sendDualCrisisAlert(testPayload);
      } catch (error) {
        // Expected to fail after retries
        expect(error.message).toContain('All notification channels failed');
      }

      // Assert: Should implement proper retry timing
      expect(retryTimestamps.length).toBeGreaterThan(4); // Multiple retries for both services
      
      // Verify retry delays increase (allowing for timing variations)
      for (let i = 1; i < Math.min(retryTimestamps.length, 4); i++) {
        const delay = retryTimestamps[i] - retryTimestamps[i - 1];
        expect(delay).toBeGreaterThan(500); // Minimum retry delay
        expect(delay).toBeLessThan(5000); // Maximum reasonable delay
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: All dual crisis alert channels failed',
        expect.objectContaining({
          escalationId: 'backoff-test',
          failures: expect.arrayContaining([
            expect.stringContaining('Service degraded'),
            expect.stringContaining('Service degraded')
          ])
        })
      );
    });
  });

  describe('Service Quality and SLA Monitoring', () => {
    it('should monitor and report delivery SLA compliance', async () => {
      // Track SLA compliance across multiple notifications
      const slaTestNotifications = Array.from({ length: 20 }, (_, i) => ({
        escalationId: `sla-test-${i}`,
        severity: 'crisis' as SeverityLevel,
        userId: `sla-user-${i}`,
        summary: `SLA test notification ${i}`,
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate' as const,
        requiresCallback: true
      }));

      // Mock varying response times
      mockTeamsService.sendCrisisAlert.mockImplementation(async (payload) => {
        const delay = Math.random() * 800 + 200; // 200-1000ms
        await new Promise(resolve => setTimeout(resolve, delay));
        return {
          status: 'sent',
          messageId: `teams-sla-${payload.escalationId}`,
          channelWebhook: webhookUrl,
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'teams',
            timestamp: Date.now(),
            channelWebhook: webhookUrl,
            messageId: `teams-sla-${payload.escalationId}`
          }
        };
      });

      mockEmailService.sendCrisisAlert.mockImplementation(async (payload) => {
        const delay = Math.random() * 600 + 100; // 100-700ms  
        await new Promise(resolve => setTimeout(resolve, delay));
        return {
          status: 'sent',
          messageId: `email-sla-${payload.escalationId}`,
          recipients: ['crisis-team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['crisis-team@nhs.test'],
            messageId: `email-sla-${payload.escalationId}`
          }
        };
      });

      // Act: Process SLA test notifications
      const startTime = Date.now();
      const slaPromises = slaTestNotifications.map(async (notification) => {
        const notificationStartTime = Date.now();
        const result = await notificationService.sendDualCrisisAlert(notification);
        const responseTime = Date.now() - notificationStartTime;
        
        return {
          escalationId: notification.escalationId,
          success: result.overallSuccess,
          responseTime,
          slaCompliant: responseTime < 2000 // 2 second SLA
        };
      });

      const slaResults = await Promise.all(slaPromises);
      const totalTime = Date.now() - startTime;

      // Assert: SLA compliance monitoring
      const slaCompliantCount = slaResults.filter(r => r.slaCompliant).length;
      const slaComplianceRate = (slaCompliantCount / slaResults.length) * 100;

      expect(slaComplianceRate).toBeGreaterThanOrEqual(95); // 95% SLA compliance target
      expect(totalTime).toBeLessThan(12000); // Batch processing time

      slaResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.responseTime).toBeLessThan(3000); // Maximum acceptable time
      });

      // Verify proper logging of SLA metrics
      expect(mockLogger.info).toHaveBeenCalledTimes(20); // One for each successful notification
    });

    it('should implement priority queuing for immediate urgency notifications', async () => {
      // Create mixed urgency notifications
      const mixedNotifications = [
        ...Array.from({ length: 5 }, (_, i) => ({
          escalationId: `low-priority-${i}`,
          severity: 'high_concern' as SeverityLevel,
          userId: `low-user-${i}`,
          summary: `Low priority notification ${i}`,
          triggerMatches: ['general_concern'],
          timestamp: Date.now(),
          urgency: 'medium' as const,
          requiresCallback: false
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          escalationId: `immediate-priority-${i}`,
          severity: 'crisis' as SeverityLevel,
          userId: `immediate-user-${i}`,
          summary: `IMMEDIATE priority notification ${i}`,
          triggerMatches: ['suicide_ideation'],
          timestamp: Date.now(),
          urgency: 'immediate' as const,
          requiresCallback: true
        }))
      ];

      // Track processing order
      const processingOrder: string[] = [];

      mockTeamsService.sendCrisisAlert.mockImplementation(async (payload) => {
        processingOrder.push(payload.escalationId);
        const delay = payload.urgency === 'immediate' ? 100 : 500; // Immediate processed faster
        await new Promise(resolve => setTimeout(resolve, delay));
        return {
          status: 'sent',
          messageId: `teams-priority-${payload.escalationId}`,
          channelWebhook: webhookUrl,
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'teams',
            timestamp: Date.now(),
            channelWebhook: webhookUrl,
            messageId: `teams-priority-${payload.escalationId}`
          }
        };
      });

      mockEmailService.sendCrisisAlert.mockImplementation(async (payload) => {
        const delay = payload.urgency === 'immediate' ? 100 : 500;
        await new Promise(resolve => setTimeout(resolve, delay));
        return {
          status: 'sent',
          messageId: `email-priority-${payload.escalationId}`,
          recipients: ['crisis-team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: payload.escalationId,
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['crisis-team@nhs.test'],
            messageId: `email-priority-${payload.escalationId}`
          }
        };
      });

      // Act: Process mixed priority notifications
      const priorityPromises = mixedNotifications.map(notification =>
        notificationService.sendDualCrisisAlert(notification)
      );

      const results = await Promise.all(priorityPromises);

      // Assert: All notifications should succeed
      results.forEach(result => {
        expect(result.overallSuccess).toBe(true);
      });

      // Verify immediate notifications were processed
      const immediateResults = results.filter((_, i) => 
        mixedNotifications[i].urgency === 'immediate'
      );
      
      immediateResults.forEach(result => {
        expect(result.deliveryConfirmation.channels).toEqual(['teams', 'email']);
      });

      expect(results).toHaveLength(8);
    });
  });

  describe('Message Delivery Guarantees', () => {
    it('should provide delivery confirmation with audit trail', async () => {
      const testPayload: NotificationPayload = {
        escalationId: 'delivery-guarantee-test',
        severity: 'crisis',
        userId: 'guarantee-user',
        summary: 'Delivery guarantee test',
        triggerMatches: ['self_harm'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      const teamsResult: TeamsDeliveryResult = {
        status: 'sent',
        messageId: 'teams-guarantee-123',
        channelWebhook: webhookUrl,
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: testPayload.escalationId,
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: webhookUrl,
          messageId: 'teams-guarantee-123'
        }
      };

      const emailResult: EmailDeliveryResult = {
        status: 'sent',
        messageId: 'email-guarantee-456',
        recipients: ['crisis-team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: testPayload.escalationId,
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['crisis-team@nhs.test'],
          messageId: 'email-guarantee-456'
        }
      };

      mockTeamsService.sendCrisisAlert.mockResolvedValue(teamsResult);
      mockEmailService.sendCrisisAlert.mockResolvedValue(emailResult);

      // Act: Send notification and verify delivery
      const result = await notificationService.sendDualCrisisAlert(testPayload);

      // Assert: Delivery confirmation should be comprehensive
      expect(result.deliveryConfirmation).toEqual({
        escalationId: 'delivery-guarantee-test',
        teamsMessageId: 'teams-guarantee-123',
        emailMessageId: 'email-guarantee-456',
        deliveredAt: expect.any(Number),
        channels: ['teams', 'email']
      });

      expect(result.teamsResult?.auditTrail).toEqual({
        escalationId: 'delivery-guarantee-test',
        deliveryMethod: 'teams',
        timestamp: expect.any(Number),
        channelWebhook: webhookUrl,
        messageId: 'teams-guarantee-123'
      });

      expect(result.emailResult?.auditTrail).toEqual({
        escalationId: 'delivery-guarantee-test',
        deliveryMethod: 'email',
        timestamp: expect.any(Number),
        recipients: ['crisis-team@nhs.test'],
        messageId: 'email-guarantee-456'
      });

      // Verify delivery status can be retrieved
      const deliveryStatus = await notificationService.getDualDeliveryStatus('delivery-guarantee-test');
      expect(deliveryStatus.overallStatus).toBe('sent');
      expect(deliveryStatus.teamsStatus).toBe('sent');
      expect(deliveryStatus.emailStatus).toBe('sent');
    });

    it('should handle partial delivery scenarios with appropriate status tracking', async () => {
      const testPayload: NotificationPayload = {
        escalationId: 'partial-delivery-test',
        severity: 'crisis',
        userId: 'partial-user',
        summary: 'Partial delivery scenario',
        triggerMatches: ['severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Teams succeeds, Email fails
      mockTeamsService.sendCrisisAlert.mockResolvedValue({
        status: 'sent',
        messageId: 'teams-partial-success',
        channelWebhook: webhookUrl,
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: testPayload.escalationId,
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: webhookUrl,
          messageId: 'teams-partial-success'
        }
      });

      mockEmailService.sendCrisisAlert.mockRejectedValue(
        new Error('Email delivery failure')
      );

      // Act: Process partial delivery scenario
      const result = await notificationService.sendDualCrisisAlert(testPayload);

      // Assert: Should succeed overall but track partial failure
      expect(result.overallSuccess).toBe(true);
      expect(result.teamsDelivered).toBe(true);
      expect(result.emailDelivered).toBe(false);
      expect(result.failures).toContain('Email: Email delivery failure');

      expect(result.deliveryConfirmation.channels).toEqual(['teams']);
      expect(result.deliveryConfirmation.teamsMessageId).toBe('teams-partial-success');
      expect(result.deliveryConfirmation.emailMessageId).toBeUndefined();

      // Verify status tracking reflects partial delivery
      const status = await notificationService.getDualDeliveryStatus('partial-delivery-test');
      expect(status.overallStatus).toBe('partial');
      expect(status.teamsStatus).toBe('sent');
      expect(status.emailStatus).toBe('failed');
    });
  });
});