import { NotificationService } from '../NotificationService';
import { EmailNotificationService } from '../EmailNotificationService';
import { TeamsNotificationService } from '../TeamsNotificationService';
import { Logger } from '../../utils/logger';
import { NotificationPayload, SeverityLevel } from '../../types/safety';

// Mock fetch globally
global.fetch = jest.fn();

describe('Enhanced NotificationService (Dual Escalation)', () => {
  let notificationService: NotificationService;
  let mockEmailService: jest.Mocked<EmailNotificationService>;
  let mockTeamsService: jest.Mocked<TeamsNotificationService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const webhookUrl = 'https://teams.microsoft.com/api/webhook/crisis-alerts';

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    mockEmailService = {
      sendCrisisAlert: jest.fn(),
      generateEmailTemplate: jest.fn(),
      getDeliveryStatus: jest.fn(),
      testConnection: jest.fn()
    } as any;

    mockTeamsService = {
      sendCrisisAlert: jest.fn(),
      generateAdaptiveCard: jest.fn(),
      getDeliveryStatus: jest.fn(),
      testConnection: jest.fn()
    } as any;

    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    notificationService = new NotificationService(
      webhookUrl,
      mockLogger,
      3, // maxRetries
      1000, // retryDelay
      mockEmailService,
      mockTeamsService
    );
  });

  describe('Dual Escalation (Teams + Email)', () => {
    it('should send crisis alert to both Teams and Email successfully', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation', 'severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock successful Teams service
      mockTeamsService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'teams-123',
        channelWebhook: 'https://webhook.office.com/crisis-channel',
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: 'esc123',
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: 'https://webhook.office.com/crisis-channel',
          messageId: 'teams-123'
        }
      });

      // Mock successful email sending
      mockEmailService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'email-123',
        recipients: ['nurse.team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: 'esc123',
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['nurse.team@nhs.test'],
          messageId: 'email-123'
        }
      });

      const result = await notificationService.sendDualCrisisAlert(mockPayload);

      expect(result.teamsDelivered).toBe(true);
      expect(result.emailDelivered).toBe(true);
      expect(result.overallSuccess).toBe(true);
      expect(result.emailResult).toBeDefined();
      expect(result.teamsResult).toBeDefined();
      expect(result.failures).toHaveLength(0);

      expect(mockEmailService.sendCrisisAlert).toHaveBeenCalledWith(mockPayload);
      expect(mockTeamsService.sendCrisisAlert).toHaveBeenCalledWith(mockPayload);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Dual crisis alert sent successfully',
        expect.objectContaining({
          escalationId: 'esc123',
          teamsDelivered: true,
          emailDelivered: true
        })
      );
    });

    it('should succeed if one channel fails but other succeeds', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock Teams service failure
      mockTeamsService.sendCrisisAlert.mockRejectedValueOnce(new Error('Teams service timeout'));

      // Mock successful email sending
      mockEmailService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'email-123',
        recipients: ['nurse.team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: 'esc123',
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['nurse.team@nhs.test'],
          messageId: 'email-123'
        }
      });

      const result = await notificationService.sendDualCrisisAlert(mockPayload);

      expect(result.teamsDelivered).toBe(false);
      expect(result.emailDelivered).toBe(true);
      expect(result.overallSuccess).toBe(true); // Success if at least one channel works
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('Teams');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Partial failure in dual crisis alert',
        expect.objectContaining({
          escalationId: 'esc123',
          teamsDelivered: false,
          emailDelivered: true,
          failures: expect.arrayContaining([expect.stringContaining('Teams')])
        })
      );
    });

    it('should fail if both channels fail', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock Teams service failure
      mockTeamsService.sendCrisisAlert.mockRejectedValueOnce(new Error('Teams service timeout'));

      // Mock email service failure
      mockEmailService.sendCrisisAlert.mockRejectedValueOnce(new Error('SMTP failure'));

      await expect(notificationService.sendDualCrisisAlert(mockPayload)).rejects.toThrow(
        'All notification channels failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: All dual crisis alert channels failed',
        expect.objectContaining({
          escalationId: 'esc123',
          failures: expect.arrayContaining([
            expect.stringContaining('Teams'),
            expect.stringContaining('Email')
          ])
        })
      );
    });

    it('should retry failed channels independently', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock Teams webhook - fail first, succeed second
      mockFetch
        .mockRejectedValueOnce(new Error('Teams timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '1'
        } as Response);

      // Mock email - fail first, succeed second
      mockEmailService.sendCrisisAlert
        .mockRejectedValueOnce(new Error('Email timeout'))
        .mockResolvedValueOnce({
          status: 'sent',
          messageId: 'email-123',
          recipients: ['nurse.team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 1,
          auditTrail: {
            escalationId: 'esc123',
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['nurse.team@nhs.test'],
            messageId: 'email-123'
          }
        });

      const result = await notificationService.sendDualCrisisAlert(mockPayload);

      expect(result.teamsDelivered).toBe(true);
      expect(result.emailDelivered).toBe(true);
      expect(result.overallSuccess).toBe(true);
      expect(result.retryCount).toBeGreaterThan(0);

      // Should have retried both channels
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockEmailService.sendCrisisAlert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Delivery Confirmation Tracking', () => {
    it('should track delivery confirmation for both channels', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      const emailResult = {
        status: 'sent' as const,
        messageId: 'email-123',
        recipients: ['nurse.team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: 'esc123',
          deliveryMethod: 'email' as const,
          timestamp: Date.now(),
          recipients: ['nurse.team@nhs.test'],
          messageId: 'email-123'
        }
      };

      mockEmailService.sendCrisisAlert.mockResolvedValueOnce(emailResult);

      const result = await notificationService.sendDualCrisisAlert(mockPayload);

      expect(result.deliveryConfirmation).toBeDefined();
      expect(result.deliveryConfirmation.escalationId).toBe('esc123');
      expect(result.deliveryConfirmation.teamsMessageId).toBeDefined();
      expect(result.deliveryConfirmation.emailMessageId).toBe('email-123');
      expect(result.deliveryConfirmation.deliveredAt).toBeDefined();
      expect(result.deliveryConfirmation.channels).toEqual(['teams', 'email']);
    });

    it('should provide delivery status for both channels', async () => {
      const escalationId = 'esc123';
      
      // First send a dual alert
      const mockPayload: NotificationPayload = {
        escalationId,
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      mockEmailService.sendCrisisAlert.mockResolvedValueOnce({
        status: 'sent',
        messageId: 'email-123',
        recipients: ['nurse.team@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: 'esc123',
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['nurse.team@nhs.test'],
          messageId: 'email-123'
        }
      });

      await notificationService.sendDualCrisisAlert(mockPayload);

      // Mock email service delivery status
      mockEmailService.getDeliveryStatus.mockResolvedValueOnce({
        messageId: 'email-123',
        status: 'sent',
        sentAt: Date.now(),
        recipients: ['nurse.team@nhs.test']
      });

      // Get delivery status
      const status = await notificationService.getDualDeliveryStatus(escalationId);

      expect(status).toBeDefined();
      expect(status.escalationId).toBe(escalationId);
      expect(status.teamsStatus).toBe('sent');
      expect(status.emailStatus).toBe('sent');
      expect(status.overallStatus).toBe('sent');
    });
  });

  describe('Backwards Compatibility', () => {
    it('should maintain backwards compatibility with existing sendCrisisAlert method', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      // Test existing method still works (Teams only)
      await expect(notificationService.sendCrisisAlert(mockPayload)).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendCrisisAlert).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis alert sent successfully',
        expect.objectContaining({
          escalationId: 'esc123'
        })
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle email service being unavailable gracefully', async () => {
      // Create notification service without email service
      const notificationServiceNoEmail = new NotificationService(
        webhookUrl,
        mockLogger,
        3,
        1000
        // No email service provided
      );

      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      const result = await notificationServiceNoEmail.sendDualCrisisAlert(mockPayload);

      expect(result.teamsDelivered).toBe(true);
      expect(result.emailDelivered).toBe(false);
      expect(result.overallSuccess).toBe(true); // Teams succeeded
      expect(result.failures).toContain('Email service not configured');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Email service not available for dual escalation',
        { escalationId: 'esc123' }
      );
    });

    it('should handle concurrent dual alerts without interference', async () => {
      const mockPayload1: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'First crisis',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      const mockPayload2: NotificationPayload = {
        escalationId: 'esc456',
        severity: 'crisis' as SeverityLevel,
        userId: 'user456',
        summary: 'Second crisis',
        triggerMatches: ['severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock responses for both alerts
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '1'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '1'
        } as Response);

      mockEmailService.sendCrisisAlert
        .mockResolvedValueOnce({
          status: 'sent',
          messageId: 'email-123',
          recipients: ['nurse.team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: 'esc123',
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['nurse.team@nhs.test'],
            messageId: 'email-123'
          }
        })
        .mockResolvedValueOnce({
          status: 'sent',
          messageId: 'email-456',
          recipients: ['nurse.team@nhs.test'],
          deliveredAt: Date.now(),
          retryCount: 0,
          auditTrail: {
            escalationId: 'esc456',
            deliveryMethod: 'email',
            timestamp: Date.now(),
            recipients: ['nurse.team@nhs.test'],
            messageId: 'email-456'
          }
        });

      // Send both alerts concurrently
      const [result1, result2] = await Promise.all([
        notificationService.sendDualCrisisAlert(mockPayload1),
        notificationService.sendDualCrisisAlert(mockPayload2)
      ]);

      expect(result1.overallSuccess).toBe(true);
      expect(result2.overallSuccess).toBe(true);
      expect(result1.deliveryConfirmation.escalationId).toBe('esc123');
      expect(result2.deliveryConfirmation.escalationId).toBe('esc456');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockEmailService.sendCrisisAlert).toHaveBeenCalledTimes(2);
    });
  });
});