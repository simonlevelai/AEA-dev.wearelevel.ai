import { EmailNotificationService, EmailTemplate, EmailDeliveryStatus } from '../EmailNotificationService';
import { Logger } from '../../utils/logger';
import { NotificationPayload, SeverityLevel } from '../../types/safety';

// Mock fetch globally
global.fetch = jest.fn();

describe('EmailNotificationService', () => {
  let emailService: EmailNotificationService;
  let mockLogger: jest.Mocked<Logger>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const mockEmailConfig = {
    smtp: {
      host: 'smtp.outlook.com',
      port: 587,
      secure: false,
      auth: {
        user: 'askeve@nhs.test',
        pass: 'test-password'
      }
    },
    from: 'askeve@nhs.test',
    recipients: {
      crisis: ['nurse.team@nhs.test', 'crisis.manager@nhs.test'],
      high_concern: ['nurse.team@nhs.test'],
      general: ['support@nhs.test']
    },
    templates: {
      crisis: 'crisis-alert-template',
      high_concern: 'high-concern-template',
      general: 'general-alert-template'
    }
  };

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    emailService = new EmailNotificationService(mockEmailConfig, mockLogger);
  });

  describe('Crisis Alert Email Notifications', () => {
    it('should send crisis alert email to all crisis recipients', async () => {
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'Email sent successfully'
      } as Response);

      const result = await emailService.sendCrisisAlert(mockPayload);

      expect(result.status).toBe('sent');
      expect(result.recipients).toEqual(['nurse.team@nhs.test', 'crisis.manager@nhs.test']);
      expect(result.messageId).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis alert email sent successfully',
        expect.objectContaining({
          escalationId: 'esc123',
          recipients: 2,
          messageId: expect.any(String)
        })
      );
    });

    it('should generate proper HTML template for crisis alert', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Suicide ideation detected',
        triggerMatches: ['suicide_ideation', 'want to die'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      const template = emailService.generateEmailTemplate(mockPayload);

      expect(template.subject).toContain('🚨 CRISIS ALERT');
      expect(template.subject).toContain('esc123');
      expect(template.html).toContain('CRISIS ALERT');
      expect(template.html).toContain('suicide_ideation');
      expect(template.html).toContain('Immediate Callback Required');
      expect(template.html).toContain('user123');
      expect(template.priority).toBe('high');
    });

    it('should handle email sending failures with retry logic', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock first attempt failure, second attempt success
      mockFetch
        .mockRejectedValueOnce(new Error('SMTP timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'Email sent successfully'
        } as Response);

      const result = await emailService.sendCrisisAlert(mockPayload);

      expect(result.status).toBe('sent');
      expect(result.retryCount).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Email sending attempt failed, retrying...',
        expect.objectContaining({
          escalationId: 'esc123',
          attempt: 1,
          error: 'SMTP timeout'
        })
      );
    }, 10000);

    it('should fail after maximum retry attempts', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis escalation detected',
        triggerMatches: ['severe_distress'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      // Mock all attempts to fail
      mockFetch
        .mockRejectedValueOnce(new Error('SMTP server down'))
        .mockRejectedValueOnce(new Error('SMTP server down'))
        .mockRejectedValueOnce(new Error('SMTP server down'));

      await expect(emailService.sendCrisisAlert(mockPayload)).rejects.toThrow(
        'Failed to send crisis alert email after 3 attempts'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Crisis alert email failed after all retries',
        expect.objectContaining({
          escalationId: 'esc123',
          attempts: 3
        })
      );
    }, 10000);
  });

  describe('Email Template Generation', () => {
    it('should generate appropriate template for high concern alerts', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc456',
        severity: 'high_concern' as SeverityLevel,
        userId: 'user456',
        summary: 'High concern escalation',
        triggerMatches: ['severe_pain', 'medical_concerns'],
        timestamp: Date.now(),
        urgency: 'high',
        requiresCallback: false
      };

      const template = emailService.generateEmailTemplate(mockPayload);

      expect(template.subject).toContain('⚠️ HIGH CONCERN');
      expect(template.html).toContain('HIGH CONCERN');
      expect(template.html).toContain('severe_pain');
      expect(template.html).not.toContain('Immediate callback required');
      expect(template.priority).toBe('high');
    });

    it('should generate appropriate template for general alerts', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc789',
        severity: 'emotional_support' as SeverityLevel,
        userId: 'user789',
        summary: 'Emotional support needed',
        triggerMatches: ['feeling_sad'],
        timestamp: Date.now(),
        urgency: 'medium',
        requiresCallback: false
      };

      const template = emailService.generateEmailTemplate(mockPayload);

      expect(template.subject).toContain('ℹ️ SUPPORT REQUEST');
      expect(template.html).toContain('SUPPORT REQUEST');
      expect(template.priority).toBe('normal');
    });

    it('should include proper NHS branding and compliance disclaimers', async () => {
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

      const template = emailService.generateEmailTemplate(mockPayload);

      expect(template.html).toContain('Ask Eve Assist');
      expect(template.html).toContain('The Eve Appeal');
      expect(template.html).toContain('NHS');
      expect(template.html).toContain('This message contains confidential patient information');
      expect(template.html).toContain('Data Protection Act');
      expect(template.html).toContain('dashboard.askeve.ai/safety');
    });
  });

  describe('Delivery Confirmation and Tracking', () => {
    it('should track email delivery status', async () => {
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
        text: async () => 'Email sent successfully',
        headers: new Headers({
          'x-message-id': 'msg-123456'
        })
      } as Response);

      const result = await emailService.sendCrisisAlert(mockPayload);

      expect(result.messageId).toBeDefined();
      expect(result.deliveredAt).toBeDefined();
      expect(result.status).toBe('sent');

      // Should track delivery status
      const deliveryStatus = await emailService.getDeliveryStatus(result.messageId);
      expect(deliveryStatus.status).toBe('sent');
      expect(deliveryStatus.sentAt).toBeDefined();
    });

    it('should provide delivery confirmation for audit trail', async () => {
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
        text: async () => 'Email sent successfully'
      } as Response);

      const result = await emailService.sendCrisisAlert(mockPayload);

      expect(result.auditTrail).toBeDefined();
      expect(result.auditTrail.escalationId).toBe('esc123');
      expect(result.auditTrail.recipients).toEqual(['nurse.team@nhs.test', 'crisis.manager@nhs.test']);
      expect(result.auditTrail.timestamp).toBeDefined();
      expect(result.auditTrail.deliveryMethod).toBe('email');
    });
  });

  describe('Recipient Management', () => {
    it('should send to appropriate recipients based on severity', async () => {
      const crisisPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'Email sent successfully'
      } as Response);

      const crisisResult = await emailService.sendCrisisAlert(crisisPayload);
      expect(crisisResult.recipients).toEqual(['nurse.team@nhs.test', 'crisis.manager@nhs.test']);

      const highConcernPayload: NotificationPayload = {
        ...crisisPayload,
        severity: 'high_concern' as SeverityLevel,
        urgency: 'high'
      };

      const highConcernResult = await emailService.sendCrisisAlert(highConcernPayload);
      expect(highConcernResult.recipients).toEqual(['nurse.team@nhs.test']);
    });

    it('should validate recipient email addresses', async () => {
      const invalidEmailConfig = {
        ...mockEmailConfig,
        recipients: {
          crisis: ['invalid-email', 'nurse.team@nhs.test'],
          high_concern: ['nurse.team@nhs.test'],
          general: ['support@nhs.test']
        }
      };

      const emailServiceWithInvalidConfig = new EmailNotificationService(invalidEmailConfig, mockLogger, true);

      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      await expect(emailServiceWithInvalidConfig.sendCrisisAlert(mockPayload)).rejects.toThrow(
        'Invalid email address found'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid email address in recipients list',
        expect.objectContaining({
          invalidEmail: 'invalid-email'
        })
      );
    });
  });

  describe('Integration with Existing Systems', () => {
    it('should provide delivery confirmation that can be tracked by notification service', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Crisis detected',
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'Email sent successfully'
      } as Response);

      const result = await emailService.sendCrisisAlert(mockPayload);

      // Should provide all necessary information for notification service integration
      expect(result).toMatchObject({
        status: 'sent',
        messageId: expect.any(String),
        recipients: expect.any(Array),
        deliveredAt: expect.any(Number),
        retryCount: expect.any(Number),
        auditTrail: expect.objectContaining({
          escalationId: 'esc123',
          deliveryMethod: 'email',
          timestamp: expect.any(Number)
        })
      });
    });
  });
});