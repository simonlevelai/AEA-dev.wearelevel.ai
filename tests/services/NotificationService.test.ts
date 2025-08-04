import { NotificationService } from '../../src/services/NotificationService';
import { Logger } from '../../src/utils/logger';
import { NotificationPayload } from '../../src/types/safety';

// Mock dependencies
jest.mock('../../src/utils/logger');

const MockLogger = Logger as jest.MockedClass<typeof Logger>;

// Mock fetch globally
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockLogger: jest.Mocked<Logger>;
  const webhookUrl = 'https://teams.microsoft.com/api/webhook/test';

  const mockNotificationPayload: NotificationPayload = {
    escalationId: 'test-escalation-123',
    severity: 'crisis',
    userId: 'test-user-456',
    summary: 'Crisis escalation: suicide ideation detected',
    triggerMatches: ['want to die', 'kill myself'],
    timestamp: Date.now(),
    urgency: 'immediate',
    requiresCallback: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock logger
    mockLogger = new MockLogger() as jest.Mocked<Logger>;
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();

    // Create service instance
    notificationService = new NotificationService(
      webhookUrl,
      mockLogger,
      3, // maxRetries
      1000 // retryDelay - reduced for testing
    );

    // Setup default successful fetch mock
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('1')
    } as any);
  });

  describe('sendCrisisAlert', () => {
    it('should send crisis alert successfully', async () => {
      await notificationService.sendCrisisAlert(mockNotificationPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Crisis Alert')
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis alert sent successfully',
        expect.objectContaining({
          escalationId: mockNotificationPayload.escalationId,
          severity: mockNotificationPayload.severity,
          attempt: 1
        })
      );
    });

    it('should format Teams message correctly for crisis', async () => {
      await notificationService.sendCrisisAlert(mockNotificationPayload);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs?.[1]?.body as string);

      expect(requestBody).toMatchObject({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: 'FF0000', // Red for immediate urgency
        summary: '🚨 CRISIS Alert - Ask Eve Assist',
        sections: expect.arrayContaining([
          expect.objectContaining({
            activityTitle: '🚨 Crisis Alert - Ask Eve Assist',
            activitySubtitle: 'CRISIS level escalation detected',
            facts: expect.arrayContaining([
              { name: 'Escalation ID', value: mockNotificationPayload.escalationId },
              { name: 'Severity', value: 'CRISIS' },
              { name: 'Urgency', value: 'IMMEDIATE' },
              { name: 'User ID', value: 'test-use***' }, // Sanitized
              { name: 'Summary', value: mockNotificationPayload.summary },
              { name: 'Trigger Matches', value: 'want to die, kill myself' },
              { name: 'Requires Callback', value: 'YES ☎️' }
            ])
          })
        ]),
        potentialAction: expect.arrayContaining([
          expect.objectContaining({
            '@type': 'OpenUri',
            name: 'View Safety Dashboard',
            targets: [
              {
                os: 'default',
                uri: `https://dashboard.askeve.ai/safety/escalations/${mockNotificationPayload.escalationId}`
              }
            ]
          })
        ])
      });
    });

    it('should format message correctly for different urgency levels', async () => {
      const testCases = [
        { urgency: 'immediate' as const, expectedColor: 'FF0000', expectedEmoji: '🚨' },
        { urgency: 'high' as const, expectedColor: 'FF6600', expectedEmoji: '⚠️' },
        { urgency: 'medium' as const, expectedColor: 'FFCC00', expectedEmoji: '⚡' },
        { urgency: 'low' as const, expectedColor: '00CC00', expectedEmoji: 'ℹ️' }
      ];

      for (const testCase of testCases) {
        mockFetch.mockClear();
        
        const payload = { ...mockNotificationPayload, urgency: testCase.urgency };
        await notificationService.sendCrisisAlert(payload);

        const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
        
        expect(requestBody.themeColor).toBe(testCase.expectedColor);
        expect(requestBody.summary).toContain(testCase.expectedEmoji);
      }
    });

    it('should truncate long trigger lists', async () => {
      const longTriggerList = Array.from({ length: 10 }, (_, i) => `trigger${i + 1}`);
      const payloadWithManyTriggers = {
        ...mockNotificationPayload,
        triggerMatches: longTriggerList
      };

      await notificationService.sendCrisisAlert(payloadWithManyTriggers);

      const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const triggerMatchesFact = requestBody.sections[0].facts.find(
        (fact: any) => fact.name === 'Trigger Matches'
      );

      expect(triggerMatchesFact.value).toContain('(+5 more)');
      expect(triggerMatchesFact.value).toContain('trigger1, trigger2, trigger3, trigger4, trigger5');
    });

    it('should retry on failure and eventually succeed', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('1')
        } as any);

      await notificationService.sendCrisisAlert(mockNotificationPayload);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis alert sent successfully',
        expect.objectContaining({ attempt: 3 })
      );
    });

    it('should fail after max retries', async () => {
      const error = new Error('Persistent failure');
      mockFetch.mockRejectedValue(error);

      await expect(notificationService.sendCrisisAlert(mockNotificationPayload))
        .rejects.toThrow('Failed to send crisis alert after 3 attempts');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Crisis alert failed after all retries',
        expect.objectContaining({
          escalationId: mockNotificationPayload.escalationId,
          attempts: 3
        })
      );
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request')
      } as any);

      await expect(notificationService.sendCrisisAlert(mockNotificationPayload))
        .rejects.toThrow('Failed to send crisis alert after 3 attempts');
    });

    it('should handle unexpected webhook responses', async () => {
      // Teams webhook should return "1" for success
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('unexpected response')
      } as any);

      await expect(notificationService.sendCrisisAlert(mockNotificationPayload))
        .rejects.toThrow('Failed to send crisis alert after 3 attempts');
    });

    it('should validate notification payload', async () => {
      const invalidPayload = {
        ...mockNotificationPayload,
        severity: 'invalid-severity' // Invalid severity
      } as any;

      await expect(notificationService.sendCrisisAlert(invalidPayload))
        .rejects.toThrow();
    });
  });

  describe('sendFollowUpNotification', () => {
    it('should send follow-up notification for resolved escalation', async () => {
      await notificationService.sendFollowUpNotification(
        'escalation-123',
        'resolved',
        'User connected with counselor'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Follow-up Update')
        })
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      expect(requestBody.themeColor).toBe('00CC00'); // Green for resolved
      expect(requestBody.sections[0].facts).toContainEqual({
        name: 'Status',
        value: 'RESOLVED'
      });
    });

    it('should use appropriate colors for different statuses', async () => {
      const testCases = [
        { status: 'resolved' as const, expectedColor: '00CC00' },
        { status: 'escalated' as const, expectedColor: 'FF0000' },
        { status: 'timeout' as const, expectedColor: 'FFCC00' }
      ];

      for (const testCase of testCases) {
        mockFetch.mockClear();
        
        await notificationService.sendFollowUpNotification(
          'test-escalation',
          testCase.status,
          'Test details'
        );

        const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
        expect(requestBody.themeColor).toBe(testCase.expectedColor);
      }
    });

    it('should handle follow-up notification failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should not throw - follow-ups are non-critical
      await expect(notificationService.sendFollowUpNotification(
        'escalation-123',
        'resolved',
        'Test details'
      )).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send follow-up notification',
        expect.objectContaining({
          escalationId: 'escalation-123',
          status: 'resolved'
        })
      );
    });
  });

  describe('testConnection', () => {
    it('should test webhook connection successfully', async () => {
      const result = await notificationService.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Connection Test')
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Webhook connection test successful');
    });

    it('should handle connection test failures', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const result = await notificationService.testConnection();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Webhook connection test failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('user ID sanitization', () => {
    it('should sanitize user IDs for privacy', async () => {
      const longUserId = 'very-long-user-id-with-sensitive-info-123456789';
      const payload = { ...mockNotificationPayload, userId: longUserId };

      await notificationService.sendCrisisAlert(payload);

      const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const userIdFact = requestBody.sections[0].facts.find(
        (fact: any) => fact.name === 'User ID'
      );

      expect(userIdFact.value).toBe('very-lon***');
      expect(userIdFact.value).not.toContain('sensitive-info');
    });
  });

  describe('error handling', () => {
    it('should handle JSON parsing errors in response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      } as any);

      await expect(notificationService.sendCrisisAlert(mockNotificationPayload))
        .rejects.toThrow('Failed to send crisis alert after 3 attempts');
    });

    it('should handle network timeouts', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      await expect(notificationService.sendCrisisAlert(mockNotificationPayload))
        .rejects.toThrow('Failed to send crisis alert after 3 attempts');
    });
  });

  describe('performance', () => {
    it('should complete notification quickly', async () => {
      const startTime = Date.now();
      
      await notificationService.sendCrisisAlert(mockNotificationPayload);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should respect retry delays', async () => {
      const quickNotificationService = new NotificationService(
        webhookUrl,
        mockLogger,
        2, // maxRetries
        50  // very short retry delay for testing
      );

      mockFetch
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('1')
        } as any);

      const startTime = Date.now();
      await quickNotificationService.sendCrisisAlert(mockNotificationPayload);
      const duration = Date.now() - startTime;

      // Should take at least the retry delay
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });
});