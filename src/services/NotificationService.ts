import { NotificationPayload, NotificationPayloadSchema } from '../types/safety';
import { Logger } from '../utils/logger';

export interface TeamsWebhookPayload {
  '@type': string;
  '@context': string;
  themeColor: string;
  summary: string;
  sections: Array<{
    activityTitle: string;
    activitySubtitle: string;
    facts: Array<{
      name: string;
      value: string;
    }>;
    markdown: boolean;
  }>;
  potentialAction?: Array<{
    '@type': string;
    name: string;
    targets: Array<{
      os: string;
      uri: string;
    }>;
  }>;
}

export class NotificationService {
  private webhookUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private logger: Logger;

  constructor(
    webhookUrl: string,
    logger: Logger,
    maxRetries: number = 3,
    retryDelay: number = 30000
  ) {
    this.webhookUrl = webhookUrl;
    this.logger = logger;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async sendCrisisAlert(payload: NotificationPayload): Promise<void> {
    try {
      const validatedPayload = NotificationPayloadSchema.parse(payload);
      
      const teamsPayload = this.formatTeamsMessage(validatedPayload);
      
      let attempt = 0;
      let lastError: Error | null = null;

      while (attempt < this.maxRetries) {
        try {
          await this.sendToTeams(teamsPayload);
          
          this.logger.info('Crisis alert sent successfully', {
            escalationId: validatedPayload.escalationId,
            severity: validatedPayload.severity,
            attempt: attempt + 1
          });
          
          return;
        } catch (error) {
          lastError = error as Error;
          attempt++;
          
          this.logger.warn('Crisis alert attempt failed', {
            escalationId: validatedPayload.escalationId,
            attempt,
            error: lastError.message
          });

          if (attempt < this.maxRetries) {
            await this.delay(this.retryDelay);
          }
        }
      }

      // All retries failed
      this.logger.error('Crisis alert failed after all retries', {
        escalationId: validatedPayload.escalationId,
        attempts: this.maxRetries,
        lastError: lastError?.message
      });

      throw new Error(`Failed to send crisis alert after ${this.maxRetries} attempts: ${lastError?.message}`);
    } catch (error) {
      this.logger.error('Crisis alert failed', { error, payload });
      throw error;
    }
  }

  private formatTeamsMessage(payload: NotificationPayload): TeamsWebhookPayload {
    const urgencyColors = {
      immediate: 'FF0000', // Red
      high: 'FF6600',      // Orange
      medium: 'FFCC00',    // Yellow
      low: '00CC00'        // Green
    };

    const urgencyEmojis = {
      immediate: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️'
    };

    const emoji = urgencyEmojis[payload.urgency];
    const color = urgencyColors[payload.urgency];

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: color,
      summary: `${emoji} ${payload.severity.toUpperCase()} Alert - Ask Eve Assist`,
      sections: [
        {
          activityTitle: `${emoji} Crisis Alert - Ask Eve Assist`,
          activitySubtitle: `${payload.severity.toUpperCase()} level escalation detected`,
          facts: [
            {
              name: 'Escalation ID',
              value: payload.escalationId
            },
            {
              name: 'Severity',
              value: payload.severity.toUpperCase()
            },
            {
              name: 'Urgency',
              value: payload.urgency.toUpperCase()
            },
            {
              name: 'User ID',
              value: this.sanitizeUserId(payload.userId)
            },
            {
              name: 'Summary',
              value: payload.summary
            },
            {
              name: 'Trigger Matches',
              value: payload.triggerMatches.slice(0, 5).join(', ') + 
                     (payload.triggerMatches.length > 5 ? ` (+${payload.triggerMatches.length - 5} more)` : '')
            },
            {
              name: 'Timestamp',
              value: new Date(payload.timestamp).toISOString()
            },
            {
              name: 'Requires Callback',
              value: payload.requiresCallback ? 'YES ☎️' : 'No'
            }
          ],
          markdown: true
        }
      ],
      potentialAction: [
        {
          '@type': 'OpenUri',
          name: 'View Safety Dashboard',
          targets: [
            {
              os: 'default',
              uri: `https://dashboard.askeve.ai/safety/escalations/${payload.escalationId}`
            }
          ]
        }
      ]
    };
  }

  private async sendToTeams(payload: TeamsWebhookPayload): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Teams webhook failed: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    if (responseText !== '1') {
      throw new Error(`Teams webhook unexpected response: ${responseText}`);
    }
  }

  private sanitizeUserId(userId: string): string {
    // Hash or truncate user ID for privacy while maintaining uniqueness
    return userId.substring(0, 8) + '***';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendFollowUpNotification(
    escalationId: string,
    status: 'resolved' | 'escalated' | 'timeout',
    details: string
  ): Promise<void> {
    try {
      const followUpPayload: TeamsWebhookPayload = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: status === 'resolved' ? '00CC00' : status === 'escalated' ? 'FF0000' : 'FFCC00',
        summary: `Follow-up: Escalation ${escalationId}`,
        sections: [
          {
            activityTitle: `📋 Follow-up Update`,
            activitySubtitle: `Escalation ${escalationId}`,
            facts: [
              {
                name: 'Status',
                value: status.toUpperCase()
              },
              {
                name: 'Details',
                value: details
              },
              {
                name: 'Updated',
                value: new Date().toISOString()
              }
            ],
            markdown: true
          }
        ]
      };

      await this.sendToTeams(followUpPayload);
      
      this.logger.info('Follow-up notification sent', {
        escalationId,
        status,
        details
      });
    } catch (error) {
      this.logger.error('Failed to send follow-up notification', {
        escalationId,
        status,
        error
      });
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const testPayload: TeamsWebhookPayload = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: '00CC00',
        summary: 'Ask Eve Assist - Connection Test',
        sections: [
          {
            activityTitle: '✅ Connection Test',
            activitySubtitle: 'Ask Eve Assist Safety System',
            facts: [
              {
                name: 'Status',
                value: 'Testing webhook connection'
              },
              {
                name: 'Timestamp',
                value: new Date().toISOString()
              }
            ],
            markdown: true
          }
        ]
      };

      await this.sendToTeams(testPayload);
      this.logger.info('Webhook connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Webhook connection test failed', { error });
      return false;
    }
  }
}