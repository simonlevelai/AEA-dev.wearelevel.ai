import { Logger } from '../utils/logger';
import { NotificationPayload, SeverityLevel } from '../types/safety';

export interface TeamsConfig {
  webhookUrl: string;
  channels: {
    crisis: string;
    high_concern: string;
    general: string;
  };
  enableAdaptiveCards: boolean;
  retryConfig: {
    maxRetries: number;
    initialDelay: number;
    backoffMultiplier: number;
  };
}

export interface TeamsAdaptiveCard {
  type: 'AdaptiveCard';
  version: '1.4';
  body: Array<{
    type: string;
    [key: string]: any;
  }>;
  actions?: Array<{
    type: string;
    [key: string]: any;
  }>;
}

export interface TeamsDeliveryResult {
  status: 'sent' | 'failed' | 'retry';
  messageId: string;
  channelWebhook: string;
  deliveredAt: number;
  retryCount: number;
  error?: string;
  auditTrail: {
    escalationId: string;
    deliveryMethod: 'teams';
    timestamp: number;
    channelWebhook: string;
    messageId: string;
  };
}

export interface TeamsDeliveryStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  sentAt: number;
  deliveredAt?: number;
  failureReason?: string;
  channelWebhook: string;
}

export class TeamsNotificationService {
  private teamsConfig: TeamsConfig;
  private logger: Logger;
  private deliveryStatuses: Map<string, TeamsDeliveryStatus> = new Map();

  constructor(teamsConfig: TeamsConfig, logger: Logger, skipValidation = false) {
    this.teamsConfig = teamsConfig;
    this.logger = logger;
    if (!skipValidation) {
      this.validateConfiguration();
    }
  }

  async sendCrisisAlert(payload: NotificationPayload): Promise<TeamsDeliveryResult> {
    const startTime = Date.now();
    
    try {
      // Validate payload
      this.validatePayload(payload);

      // Get appropriate channel webhook based on severity
      const channelWebhook = this.getChannelWebhook(payload.severity);
      
      // Generate adaptive card
      const adaptiveCard = this.generateAdaptiveCard(payload);
      
      // Generate unique message ID
      const messageId = this.generateMessageId(payload.escalationId);

      let lastError: Error | null = null;
      let retryCount = 0;
      const maxRetries = this.teamsConfig.retryConfig.maxRetries;

      // Retry logic with exponential backoff
      while (retryCount < maxRetries) {
        try {
          await this.sendToTeamsWebhook(channelWebhook, adaptiveCard, messageId);
          
          const deliveredAt = Date.now();
          
          // Track delivery status
          this.trackDeliveryStatus({
            messageId,
            status: 'sent',
            sentAt: deliveredAt,
            channelWebhook
          });

          const result: TeamsDeliveryResult = {
            status: 'sent',
            messageId,
            channelWebhook,
            deliveredAt,
            retryCount,
            auditTrail: {
              escalationId: payload.escalationId,
              deliveryMethod: 'teams',
              timestamp: deliveredAt,
              channelWebhook,
              messageId
            }
          };

          this.logger.info('Crisis alert Teams message sent successfully', {
            escalationId: payload.escalationId,
            messageId,
            channelWebhook,
            responseTime: deliveredAt - startTime,
            retries: retryCount
          });

          return result;

        } catch (error) {
          lastError = error as Error;
          retryCount++;
          
          this.logger.warn('Teams notification attempt failed, retrying...', {
            escalationId: payload.escalationId,
            attempt: retryCount,
            error: lastError.message,
            remainingRetries: maxRetries - retryCount
          });

          if (retryCount < maxRetries) {
            const delay = this.teamsConfig.retryConfig.initialDelay * 
                         Math.pow(this.teamsConfig.retryConfig.backoffMultiplier, retryCount - 1);
            await this.delay(delay);
          }
        }
      }

      // All retries failed
      this.logger.error('CRITICAL: Crisis alert Teams notification failed after all retries', {
        escalationId: payload.escalationId,
        attempts: maxRetries,
        lastError: lastError?.message,
        totalTime: Date.now() - startTime
      });

      throw new Error(`Failed to send crisis alert to Teams after ${maxRetries} attempts: ${lastError?.message}`);

    } catch (error) {
      this.logger.error('Crisis alert Teams notification failed', {
        escalationId: payload.escalationId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  generateAdaptiveCard(payload: NotificationPayload): TeamsAdaptiveCard {
    const timestamp = new Date(payload.timestamp).toISOString();
    const urgencyEmojis = {
      immediate: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️'
    };

    const emoji = urgencyEmojis[payload.urgency];
    let containerStyle: string;
    let alertType: string;
    let headerColor: string;

    // Determine adaptive card styling based on severity
    switch (payload.severity) {
      case 'crisis':
        containerStyle = 'attention';
        alertType = 'CRISIS ALERT';
        headerColor = 'attention';
        break;
      case 'high_concern':
        containerStyle = 'warning';
        alertType = 'HIGH CONCERN ALERT';
        headerColor = 'warning';
        break;
      default:
        containerStyle = 'default';
        alertType = 'SUPPORT REQUEST';
        headerColor = 'default';
    }

    const callbackSection = payload.requiresCallback ? {
      type: 'Container',
      style: 'attention',
      items: [
        {
          type: 'TextBlock',
          text: `⚠️ **Immediate Callback Required**`,
          weight: 'bolder',
          color: 'attention'
        },
        {
          type: 'TextBlock',
          text: 'This escalation requires immediate callback to the user.',
          weight: 'default'
        }
      ]
    } : null;

    const body = [
      {
        type: 'Container',
        style: containerStyle,
        items: [
          {
            type: 'ColumnSet',
            columns: [
              {
                type: 'Column',
                width: 'auto',
                items: [
                  {
                    type: 'TextBlock',
                    text: emoji,
                    size: 'large',
                    weight: 'bolder'
                  }
                ]
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  {
                    type: 'TextBlock',
                    text: `${alertType}`,
                    size: 'large',
                    weight: 'bolder',
                    color: headerColor
                  },
                  {
                    type: 'TextBlock',
                    text: 'Ask Eve Assist Healthcare Bot',
                    size: 'medium',
                    weight: 'default'
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: 'Container',
        items: [
          {
            type: 'TextBlock',
            text: '**Escalation Details**',
            size: 'medium',
            weight: 'bolder',
            spacing: 'medium'
          },
          {
            type: 'FactSet',
            facts: [
              {
                title: 'Escalation ID',
                value: payload.escalationId
              },
              {
                title: 'Severity',
                value: payload.severity.toUpperCase()
              },
              {
                title: 'Urgency',
                value: payload.urgency.toUpperCase()
              },
              {
                title: 'User ID',
                value: this.sanitizeUserId(payload.userId)
              },
              {
                title: 'Timestamp',
                value: timestamp
              },
              {
                title: 'Requires Callback',
                value: payload.requiresCallback ? 'YES ☎️' : 'No'
              }
            ]
          }
        ]
      }
    ];

    // Add callback section if required
    if (callbackSection) {
      body.push(callbackSection);
    }

    // Add summary section
    body.push({
      type: 'Container',
      items: [
        {
          type: 'TextBlock',
          text: '**Summary**',
          size: 'medium',
          weight: 'bolder',
          spacing: 'medium'
        },
        {
          type: 'TextBlock',
          text: payload.summary,
          wrap: true
        }
      ]
    });

    // Add trigger matches section
    body.push({
      type: 'Container',
      items: [
        {
          type: 'TextBlock',
          text: '**Trigger Matches**',
          size: 'medium',
          weight: 'bolder',
          spacing: 'medium'
        },
        {
          type: 'TextBlock',
          text: payload.triggerMatches.slice(0, 10).join(', ') + 
               (payload.triggerMatches.length > 10 ? ` (+${payload.triggerMatches.length - 10} more)` : ''),
          wrap: true
        }
      ]
    });

    // Add compliance section
    body.push({
      type: 'Container',
      separator: true,
      items: [
        {
          type: 'TextBlock',
          text: '**⚖️ Important Information**',
          size: 'small',
          weight: 'bolder',
          color: 'default'
        },
        {
          type: 'TextBlock',
          text: `• This message contains confidential patient information protected under the Data Protection Act 2018
• If you are not the intended recipient, please delete this message immediately
• Do not forward this information without proper authorization
• All escalations are logged for audit and compliance purposes

**Ask Eve Assist** | Healthcare Information Service
Powered by The Eve Appeal | NHS Partnership
*Supporting women's health through AI-powered assistance*`,
          size: 'small',
          wrap: true,
          color: 'default'
        }
      ]
    });

    const adaptiveCard: TeamsAdaptiveCard = {
      type: 'AdaptiveCard',
      version: '1.4',
      body,
      actions: [
        {
          type: 'Action.OpenUrl',
          title: '📊 View Safety Dashboard',
          url: `https://dashboard.askeve.ai/safety/escalations/${payload.escalationId}`
        }
      ]
    };

    return adaptiveCard;
  }

  async getDeliveryStatus(messageId: string): Promise<TeamsDeliveryStatus> {
    const status = this.deliveryStatuses.get(messageId);
    if (!status) {
      throw new Error(`No delivery status found for message ID: ${messageId}`);
    }
    return { ...status };
  }

  private validateConfiguration(): void {
    // Validate webhook URLs
    const webhookUrls = [
      this.teamsConfig.webhookUrl,
      this.teamsConfig.channels.crisis,
      this.teamsConfig.channels.high_concern,
      this.teamsConfig.channels.general
    ];

    for (const url of webhookUrls) {
      if (!this.isValidWebhookUrl(url)) {
        throw new Error(`Invalid webhook URL: ${url}`);
      }
    }

    // Validate retry configuration
    if (this.teamsConfig.retryConfig.maxRetries < 1 || this.teamsConfig.retryConfig.maxRetries > 10) {
      throw new Error('Invalid retry configuration: maxRetries must be between 1 and 10');
    }

    if (this.teamsConfig.retryConfig.initialDelay < 100) {
      throw new Error('Invalid retry configuration: initialDelay must be at least 100ms');
    }

    this.logger.info('Teams notification service configured successfully', {
      webhookUrl: this.maskWebhookUrl(this.teamsConfig.webhookUrl),
      channels: Object.keys(this.teamsConfig.channels).length,
      adaptiveCardsEnabled: this.teamsConfig.enableAdaptiveCards,
      maxRetries: this.teamsConfig.retryConfig.maxRetries
    });
  }

  private validatePayload(payload: NotificationPayload): void {
    if (!payload.escalationId || !payload.severity || !payload.userId) {
      throw new Error('Invalid notification payload: missing required fields');
    }
  }

  private getChannelWebhook(severity: SeverityLevel): string {
    switch (severity) {
      case 'crisis':
        return this.teamsConfig.channels.crisis;
      case 'high_concern':
        return this.teamsConfig.channels.high_concern;
      default:
        return this.teamsConfig.channels.general;
    }
  }

  private async sendToTeamsWebhook(webhookUrl: string, adaptiveCard: TeamsAdaptiveCard, messageId: string): Promise<void> {
    const payload = this.teamsConfig.enableAdaptiveCards ? {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: adaptiveCard
        }
      ]
    } : {
      // Fallback to simple message card format
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: adaptiveCard.body[0].style === 'attention' ? 'FF0000' : 
                 adaptiveCard.body[0].style === 'warning' ? 'FF6600' : '0066CC',
      summary: `Crisis Alert - Ask Eve Assist`,
      text: `**CRISIS ALERT DETECTED**\n\nPlease check the safety dashboard immediately.`
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Message-ID': messageId
      },
      body: JSON.stringify(payload),
    });

    if (!response?.ok) {
      const errorText = response ? await response.text() : 'No response received';
      throw new Error(`Teams webhook failed: ${response?.status || 'unknown'} - ${errorText}`);
    }

    const responseText = await response.text();
    if (responseText !== '1') {
      throw new Error(`Teams webhook unexpected response: ${responseText}`);
    }

    this.logger.debug('Teams webhook response received', { 
      response: responseText, 
      messageId,
      webhookUrl: this.maskWebhookUrl(webhookUrl)
    });
  }

  private generateMessageId(escalationId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `teams_${escalationId}_${timestamp}_${random}`;
  }

  private sanitizeUserId(userId: string): string {
    // Hash or truncate user ID for privacy while maintaining uniqueness
    return userId.substring(0, 8) + '***';
  }

  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:' && 
             (parsedUrl.hostname.includes('webhook.office.com') || 
              parsedUrl.hostname.includes('outlook.office.com'));
    } catch {
      return false;
    }
  }

  private maskWebhookUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return `${parsedUrl.protocol}//${parsedUrl.hostname}/***masked***`;
    } catch {
      return '***masked***';
    }
  }

  private trackDeliveryStatus(status: TeamsDeliveryStatus): void {
    this.deliveryStatuses.set(status.messageId, status);
    
    // Clean up old delivery statuses (keep for 24 hours)
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    for (const [messageId, deliveryStatus] of this.deliveryStatuses.entries()) {
      if (deliveryStatus.sentAt < cutoff) {
        this.deliveryStatuses.delete(messageId);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Method for testing connection
  async testConnection(): Promise<boolean> {
    try {
      const testCard: TeamsAdaptiveCard = {
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'Container',
            style: 'default',
            items: [
              {
                type: 'TextBlock',
                text: '✅ Connection Test',
                size: 'large',
                weight: 'bolder'
              },
              {
                type: 'TextBlock',
                text: 'Ask Eve Assist Teams Notification Service',
                size: 'medium'
              }
            ]
          },
          {
            type: 'FactSet',
            facts: [
              {
                title: 'Status',
                value: 'Testing webhook connection'
              },
              {
                title: 'Timestamp',
                value: new Date().toISOString()
              }
            ]
          }
        ]
      };

      const testMessageId = this.generateMessageId('test');
      
      await this.sendToTeamsWebhook(this.teamsConfig.webhookUrl, testCard, testMessageId);
      
      this.logger.info('Teams webhook connection test successful', {
        webhookUrl: this.maskWebhookUrl(this.teamsConfig.webhookUrl),
        messageId: testMessageId
      });
      
      return true;
    } catch (error) {
      this.logger.error('Teams webhook connection test failed', { 
        error,
        webhookUrl: this.maskWebhookUrl(this.teamsConfig.webhookUrl)
      });
      return false;
    }
  }
}