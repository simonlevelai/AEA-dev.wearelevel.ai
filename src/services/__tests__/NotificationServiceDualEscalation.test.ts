import { NotificationService } from '../NotificationService';
import { EmailNotificationService } from '../EmailNotificationService';
import { TeamsNotificationService } from '../TeamsNotificationService';
import { Logger } from '../../utils/logger';
import { NotificationPayload, SeverityLevel } from '../../types/safety';

describe('NotificationService Dual Escalation (Teams + Email)', () => {
  let notificationService: NotificationService;
  let mockEmailService: jest.Mocked<EmailNotificationService>;
  let mockTeamsService: jest.Mocked<TeamsNotificationService>;
  let mockLogger: jest.Mocked<Logger>;

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

    notificationService = new NotificationService(
      webhookUrl,
      mockLogger,
      3, // maxRetries
      1000, // retryDelay
      mockEmailService,
      mockTeamsService
    );
  });

  describe('Dual Crisis Alert Sending', () => {
    const mockPayload: NotificationPayload = {
      escalationId: 'esc123',
      severity: 'crisis' as SeverityLevel,
      userId: 'user123',
      summary: 'Crisis escalation detected - suicide ideation',
      triggerMatches: ['suicide_ideation', 'severe_distress'],
      timestamp: Date.now(),
      urgency: 'immediate',
      requiresCallback: true
    };

    it('should send crisis alert to both Teams and Email successfully', async () => {
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

    it('should succeed if Teams fails but Email succeeds', async () => {
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

    it('should succeed if Email fails but Teams succeeds', async () => {
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

      // Mock email service failure
      mockEmailService.sendCrisisAlert.mockRejectedValueOnce(new Error('SMTP failure'));

      const result = await notificationService.sendDualCrisisAlert(mockPayload);

      expect(result.teamsDelivered).toBe(true);
      expect(result.emailDelivered).toBe(false);
      expect(result.overallSuccess).toBe(true); // Success if at least one channel works
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('Email');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Partial failure in dual crisis alert',
        expect.objectContaining({
          escalationId: 'esc123',
          teamsDelivered: true,
          emailDelivered: false,
          failures: expect.arrayContaining([expect.stringContaining('Email')])
        })
      );
    });

    it('should fail if both channels fail', async () => {
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

    it('should handle missing services gracefully', async () => {
      // Create service without Teams service
      const serviceWithoutTeams = new NotificationService(
        webhookUrl,
        mockLogger,
        3,
        1000,
        mockEmailService,
        undefined // No Teams service
      );

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

      const result = await serviceWithoutTeams.sendDualCrisisAlert(mockPayload);

      expect(result.teamsDelivered).toBe(false);
      expect(result.emailDelivered).toBe(true);
      expect(result.overallSuccess).toBe(true);
      expect(result.failures).toContain('Teams service not configured');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Teams service not available for dual escalation',
        expect.objectContaining({
          escalationId: 'esc123'
        })
      );
    });
  });

  describe('Delivery Status Tracking', () => {
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

      // Mock successful services
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

      expect(result.deliveryConfirmation).toBeDefined();
      expect(result.deliveryConfirmation.escalationId).toBe('esc123');
      expect(result.deliveryConfirmation.teamsMessageId).toBe('teams-123');
      expect(result.deliveryConfirmation.emailMessageId).toBe('email-123');
      expect(result.deliveryConfirmation.deliveredAt).toBeDefined();
      expect(result.deliveryConfirmation.channels).toEqual(['teams', 'email']);

      // Should be able to get delivery status
      const status = await notificationService.getDualDeliveryStatus('esc123');
      expect(status).toBeDefined();
      expect(status.escalationId).toBe('esc123');
      expect(status.teamsStatus).toBe('sent');
      expect(status.emailStatus).toBe('sent');
      expect(status.overallStatus).toBe('sent');
    });
  });

  describe('Service Connection Testing', () => {
    it('should test both services connections', async () => {
      mockTeamsService.testConnection.mockResolvedValueOnce(true);
      mockEmailService.testConnection.mockResolvedValueOnce(true);

      const result = await notificationService.testConnection();

      expect(result).toBe(true);
      expect(mockTeamsService.testConnection).toHaveBeenCalled();
      expect(mockEmailService.testConnection).toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'All notification services connection test successful',
        expect.objectContaining({
          teamsWorking: true,
          emailWorking: true
        })
      );
    });

    it('should handle partial service failures in connection test', async () => {
      mockTeamsService.testConnection.mockResolvedValueOnce(false);
      mockEmailService.testConnection.mockResolvedValueOnce(true);

      const result = await notificationService.testConnection();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Some notification services connection test failed',
        expect.objectContaining({
          teamsWorking: false,
          emailWorking: true
        })
      );
    });
  });

  describe('Performance Requirements', () => {
    it('should send notifications within 2 seconds for immediate urgency', async () => {
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

      // Mock both services to succeed quickly
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

      const startTime = Date.now();
      const result = await notificationService.sendDualCrisisAlert(mockPayload);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(2000);
      expect(result.overallSuccess).toBe(true);
    });
  });
});