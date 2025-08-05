import { TeamsNotificationService, TeamsConfig, TeamsDeliveryResult, TeamsAdaptiveCard } from '../TeamsNotificationService';
import { Logger } from '../../utils/logger';
import { NotificationPayload, SeverityLevel } from '../../types/safety';

// Mock fetch globally
global.fetch = jest.fn();

describe('TeamsNotificationService', () => {
  let teamsService: TeamsNotificationService;
  let mockLogger: jest.Mocked<Logger>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const mockTeamsConfig: TeamsConfig = {
    webhookUrl: 'https://webhook.office.com/test-channel',
    channels: {
      crisis: 'https://webhook.office.com/crisis-channel',
      high_concern: 'https://webhook.office.com/high-concern-channel',
      general: 'https://webhook.office.com/general-channel'
    },
    enableAdaptiveCards: true,
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2
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

    teamsService = new TeamsNotificationService(mockTeamsConfig, mockLogger);
  });

  describe('Crisis Alert Teams Notifications', () => {
    it('should send crisis alert to Teams channel with adaptive card', async () => {
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      const result = await teamsService.sendCrisisAlert(mockPayload);

      expect(result.status).toBe('sent');
      expect(result.messageId).toBeDefined();
      expect(result.channelWebhook).toBe(mockTeamsConfig.channels.crisis);
      expect(result.deliveredAt).toBeDefined();
      expect(result.retryCount).toBe(0);
      
      expect(mockFetch).toHaveBeenCalledWith(
        mockTeamsConfig.channels.crisis,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Message-ID': expect.any(String)
          },
          body: expect.stringContaining('application/vnd.microsoft.card.adaptive')
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis alert Teams message sent successfully',
        expect.objectContaining({
          escalationId: 'esc123',
          messageId: expect.any(String),
          responseTime: expect.any(Number)
        })
      );
    });

    it('should generate proper adaptive card for crisis alert', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc123',
        severity: 'crisis' as SeverityLevel,
        userId: 'user123',
        summary: 'Suicide ideation detected in conversation',
        triggerMatches: ['suicide_ideation', 'want to die', 'end my life'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      };

      const adaptiveCard = teamsService.generateAdaptiveCard(mockPayload);

      expect(adaptiveCard.type).toBe('AdaptiveCard');
      expect(adaptiveCard.version).toBe('1.4');
      
      // Check for crisis alert styling
      const headerContainer = adaptiveCard.body.find(
        (element: any) => element.type === 'Container' && element.style === 'attention'
      );
      expect(headerContainer).toBeDefined();
      
      // Check for escalation details - look in nested container items
      const detailsContainer = adaptiveCard.body.find(
        (element: any) => element.type === 'Container' && 
        element.items?.some((item: any) => item.type === 'FactSet')
      );
      expect(detailsContainer).toBeDefined();
      
      const escalationFactSet = detailsContainer.items.find(
        (item: any) => item.type === 'FactSet'
      );
      expect(escalationFactSet).toBeDefined();
      expect(escalationFactSet.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Escalation ID', value: 'esc123' }),
          expect.objectContaining({ title: 'Severity', value: 'CRISIS' }),
          expect.objectContaining({ title: 'Requires Callback', value: 'YES ☎️' })
        ])
      );

      // Check for action buttons
      expect(adaptiveCard.actions).toBeDefined();
      expect(adaptiveCard.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'Action.OpenUrl',
            title: '📊 View Safety Dashboard',
            url: `https://dashboard.askeve.ai/safety/escalations/esc123`
          })
        ])
      );
    });

    it('should handle Teams webhook failures with exponential backoff retry', async () => {
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

      // Mock first two attempts fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Teams service temporarily unavailable'))
        .mockRejectedValueOnce(new Error('Teams service temporarily unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '1'
        } as Response);

      const result = await teamsService.sendCrisisAlert(mockPayload);

      expect(result.status).toBe('sent');
      expect(result.retryCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Teams notification attempt failed, retrying...',
        expect.objectContaining({
          escalationId: 'esc123',
          attempt: 1,
          error: 'Teams service temporarily unavailable',
          remainingRetries: 2
        })
      );
    }, 10000);

    it('should fail after maximum retry attempts and log critical error', async () => {
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
        .mockRejectedValueOnce(new Error('Teams service down'))
        .mockRejectedValueOnce(new Error('Teams service down'))
        .mockRejectedValueOnce(new Error('Teams service down'));

      await expect(teamsService.sendCrisisAlert(mockPayload)).rejects.toThrow(
        'Failed to send crisis alert to Teams after 3 attempts'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: Crisis alert Teams notification failed after all retries',
        expect.objectContaining({
          escalationId: 'esc123',
          attempts: 3,
          lastError: 'Teams service down'
        })
      );
    }, 10000);

    it('should handle unexpected Teams webhook response format', async () => {
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

      // Mock all retries to return unexpected response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'unexpected response'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'unexpected response'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'unexpected response'
        } as Response);

      await expect(teamsService.sendCrisisAlert(mockPayload)).rejects.toThrow(
        'Teams webhook unexpected response: unexpected response'
      );
    });
  });

  describe('Adaptive Cards Generation', () => {
    it('should generate appropriate card for high concern alerts', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc456',
        severity: 'high_concern' as SeverityLevel,
        userId: 'user456',
        summary: 'High concern medical issue detected',
        triggerMatches: ['severe_pain', 'bleeding'],
        timestamp: Date.now(),
        urgency: 'high',
        requiresCallback: false
      };

      const adaptiveCard = teamsService.generateAdaptiveCard(mockPayload);

      // Check for warning styling (not critical attention)
      const headerContainer = adaptiveCard.body.find(
        (element: any) => element.type === 'Container' && element.style === 'warning'
      );
      expect(headerContainer).toBeDefined();

      const detailsContainer = adaptiveCard.body.find(
        (element: any) => element.type === 'Container' && 
        element.items?.some((item: any) => item.type === 'FactSet')
      );
      expect(detailsContainer).toBeDefined();
      
      const escalationFactSet = detailsContainer.items.find(
        (item: any) => item.type === 'FactSet'
      );
      expect(escalationFactSet.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Severity', value: 'HIGH_CONCERN' }),
          expect.objectContaining({ title: 'Requires Callback', value: 'No' })
        ])
      );
    });

    it('should generate appropriate card for general alerts', async () => {
      const mockPayload: NotificationPayload = {
        escalationId: 'esc789',
        severity: 'emotional_support' as SeverityLevel,
        userId: 'user789',
        summary: 'Emotional support request',
        triggerMatches: ['feeling_sad'],
        timestamp: Date.now(),
        urgency: 'medium',
        requiresCallback: false
      };

      const adaptiveCard = teamsService.generateAdaptiveCard(mockPayload);

      // Check for default styling
      const headerContainer = adaptiveCard.body.find(
        (element: any) => element.type === 'Container' && element.style === 'default'
      );
      expect(headerContainer).toBeDefined();
    });

    it('should include NHS compliance information in adaptive cards', async () => {
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

      const adaptiveCard = teamsService.generateAdaptiveCard(mockPayload);

      // Check for compliance footer - look in nested container items  
      const complianceContainer = adaptiveCard.body.find(
        (element: any) => element.type === 'Container' && element.separator === true
      );
      expect(complianceContainer).toBeDefined();
      
      const complianceTextBlock = complianceContainer.items.find(
        (item: any) => item.type === 'TextBlock' && 
        item.text?.includes('confidential patient information')
      );
      expect(complianceTextBlock).toBeDefined();
      expect(complianceTextBlock.text).toContain('Data Protection Act 2018');
      expect(complianceTextBlock.text).toContain('NHS Partnership');
    });
  });

  describe('Delivery Confirmation and Tracking', () => {
    it('should track Teams message delivery status', async () => {
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
        text: async () => '1',
        headers: new Headers({
          'x-ms-teams-message-id': 'teams-msg-123456'
        })
      } as Response);

      const result = await teamsService.sendCrisisAlert(mockPayload);

      expect(result.messageId).toBeDefined();
      expect(result.deliveredAt).toBeDefined();
      expect(result.status).toBe('sent');

      // Should track delivery status
      const deliveryStatus = await teamsService.getDeliveryStatus(result.messageId);
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
        text: async () => '1'
      } as Response);

      const result = await teamsService.sendCrisisAlert(mockPayload);

      expect(result.auditTrail).toBeDefined();
      expect(result.auditTrail.escalationId).toBe('esc123');
      expect(result.auditTrail.channelWebhook).toBe(mockTeamsConfig.channels.crisis);
      expect(result.auditTrail.timestamp).toBeDefined();
      expect(result.auditTrail.deliveryMethod).toBe('teams');
    });
  });

  describe('Channel Routing', () => {
    it('should route to appropriate Teams channel based on severity', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      // Test crisis routing
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

      const crisisResult = await teamsService.sendCrisisAlert(crisisPayload);
      expect(crisisResult.channelWebhook).toBe(mockTeamsConfig.channels.crisis);

      // Test high concern routing
      const highConcernPayload: NotificationPayload = {
        ...crisisPayload,
        severity: 'high_concern' as SeverityLevel,
        urgency: 'high'
      };

      const highConcernResult = await teamsService.sendCrisisAlert(highConcernPayload);
      expect(highConcernResult.channelWebhook).toBe(mockTeamsConfig.channels.high_concern);
    });

    it('should validate webhook URLs during configuration', async () => {
      const invalidConfig: TeamsConfig = {
        ...mockTeamsConfig,
        channels: {
          crisis: 'invalid-url',
          high_concern: 'https://webhook.office.com/valid',
          general: 'https://webhook.office.com/valid'
        }
      };

      expect(() => {
        new TeamsNotificationService(invalidConfig, mockLogger);
      }).toThrow('Invalid webhook URL');
    });
  });

  describe('Performance and Response Time', () => {
    it('should send notification within 2 seconds for immediate urgency', async () => {
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

      const startTime = Date.now();
      const result = await teamsService.sendCrisisAlert(mockPayload);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(2000);
      expect(result.status).toBe('sent');
    });

    it('should handle concurrent crisis alerts efficiently', async () => {
      const mockPayloads: NotificationPayload[] = Array.from({ length: 5 }, (_, i) => ({
        escalationId: `esc${i}`,
        severity: 'crisis' as SeverityLevel,
        userId: `user${i}`,
        summary: `Crisis escalation ${i}`,
        triggerMatches: ['suicide_ideation'],
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      const startTime = Date.now();
      const results = await Promise.all(
        mockPayloads.map(payload => teamsService.sendCrisisAlert(payload))
      );
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(results.every(result => result.status === 'sent')).toBe(true);
      expect(totalTime).toBeLessThan(3000); // Should handle 5 concurrent within 3 seconds
    });
  });

  describe('Integration with Existing Systems', () => {
    it('should provide delivery result compatible with NotificationService', async () => {
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
        text: async () => '1'
      } as Response);

      const result = await teamsService.sendCrisisAlert(mockPayload);

      // Should provide all necessary information for notification service integration
      expect(result).toMatchObject({
        status: 'sent',
        messageId: expect.any(String),
        channelWebhook: expect.any(String),
        deliveredAt: expect.any(Number),
        retryCount: expect.any(Number),
        auditTrail: expect.objectContaining({
          escalationId: 'esc123',
          deliveryMethod: 'teams',
          timestamp: expect.any(Number)
        })
      });
    });
  });

  describe('Connection Testing', () => {
    it('should test Teams webhook connection successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '1'
      } as Response);

      const isConnected = await teamsService.testConnection();

      expect(isConnected).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        mockTeamsConfig.webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Message-ID': expect.any(String)
          }
        })
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Teams webhook connection test successful',
        expect.objectContaining({
          webhookUrl: expect.any(String),
          messageId: expect.any(String)
        })
      );
    });

    it('should handle connection test failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const isConnected = await teamsService.testConnection();

      expect(isConnected).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Teams webhook connection test failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});