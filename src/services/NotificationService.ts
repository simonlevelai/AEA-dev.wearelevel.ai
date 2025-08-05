import { NotificationPayload, NotificationPayloadSchema } from '../types/safety';
import { Logger } from '../utils/logger';
import { EmailNotificationService, EmailDeliveryResult } from './EmailNotificationService';
import { TeamsNotificationService, TeamsDeliveryResult } from './TeamsNotificationService';

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

export interface DualEscalationResult {
  teamsDelivered: boolean;
  emailDelivered: boolean;
  overallSuccess: boolean;
  emailResult?: EmailDeliveryResult;
  teamsResult?: TeamsDeliveryResult;
  failures: string[];
  retryCount: number;
  deliveryConfirmation: {
    escalationId: string;
    teamsMessageId?: string;
    emailMessageId?: string;
    deliveredAt: number;
    channels: Array<'teams' | 'email'>;
  };
}

export interface DualDeliveryStatus {
  escalationId: string;
  teamsStatus: 'sent' | 'failed' | 'unknown';
  emailStatus: 'sent' | 'delivered' | 'bounced' | 'failed' | 'unknown';
  overallStatus: 'sent' | 'partial' | 'failed';
  deliveredAt?: number;
  lastChecked: number;
}

export class NotificationService {
  private webhookUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private logger: Logger;
  private emailService?: EmailNotificationService;
  private teamsService?: TeamsNotificationService;
  private deliveryStatuses: Map<string, DualDeliveryStatus> = new Map();

  constructor(
    webhookUrl: string,
    logger: Logger,
    maxRetries: number = 3,
    retryDelay: number = 30000,
    emailService?: EmailNotificationService,
    teamsService?: TeamsNotificationService
  ) {
    this.webhookUrl = webhookUrl;
    this.logger = logger;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.emailService = emailService;
    this.teamsService = teamsService;
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

  async sendDualCrisisAlert(payload: NotificationPayload): Promise<DualEscalationResult> {
    const startTime = Date.now();
    
    try {
      const validatedPayload = NotificationPayloadSchema.parse(payload);
      
      let teamsDelivered = false;
      let emailDelivered = false;
      let emailResult: EmailDeliveryResult | undefined;
      let teamsResult: TeamsDeliveryResult | undefined;
      const failures: string[] = [];
      let retryCount = 0;

      // Send to Teams and Email concurrently with retry logic
      const teamsPromise = this.teamsService 
        ? this.teamsService.sendCrisisAlert(validatedPayload)
            .then((result) => {
              teamsDelivered = true;
              teamsResult = result;
              retryCount = Math.max(retryCount, result.retryCount);
            })
            .catch((error) => {
              failures.push(`Teams: ${error.message}`);
            })
        : Promise.resolve().then(() => {
            this.logger.warn('Teams service not available for dual escalation', {
              escalationId: validatedPayload.escalationId
            });
            failures.push('Teams service not configured');
          });

      const emailPromise = this.emailService 
        ? this.emailService.sendCrisisAlert(validatedPayload)
            .then((result) => {
              emailDelivered = true;
              emailResult = result;
              retryCount = Math.max(retryCount, result.retryCount);
            })
            .catch((error) => {
              failures.push(`Email: ${error.message}`);
            })
        : Promise.resolve().then(() => {
            this.logger.warn('Email service not available for dual escalation', {
              escalationId: validatedPayload.escalationId
            });
            failures.push('Email service not configured');
          });

      // Wait for both to complete
      await Promise.all([teamsPromise, emailPromise]);

      const overallSuccess = teamsDelivered || emailDelivered;
      const deliveredAt = Date.now();
      
      // Track delivery status
      this.trackDualDeliveryStatus({
        escalationId: validatedPayload.escalationId,
        teamsStatus: teamsDelivered ? 'sent' : 'failed',
        emailStatus: emailDelivered ? 'sent' : 'failed',
        overallStatus: overallSuccess ? (teamsDelivered && emailDelivered ? 'sent' : 'partial') : 'failed',
        deliveredAt: overallSuccess ? deliveredAt : undefined,
        lastChecked: Date.now()
      });

      const result: DualEscalationResult = {
        teamsDelivered,
        emailDelivered,
        overallSuccess,
        emailResult,
        teamsResult,
        failures,
        retryCount,
        deliveryConfirmation: {
          escalationId: validatedPayload.escalationId,
          teamsMessageId: teamsResult?.messageId,
          emailMessageId: emailResult?.messageId,
          deliveredAt,
          channels: [
            ...(teamsDelivered ? ['teams' as const] : []),
            ...(emailDelivered ? ['email' as const] : [])
          ]
        }
      };

      if (overallSuccess) {
        if (failures.length > 0) {
          this.logger.warn('Partial failure in dual crisis alert', {
            escalationId: validatedPayload.escalationId,
            teamsDelivered,
            emailDelivered,
            failures,
            responseTime: deliveredAt - startTime
          });
        } else {
          this.logger.info('Dual crisis alert sent successfully', {
            escalationId: validatedPayload.escalationId,
            teamsDelivered,
            emailDelivered,
            responseTime: deliveredAt - startTime
          });
        }
        
        return result;
      } else {
        this.logger.error('CRITICAL: All dual crisis alert channels failed', {
          escalationId: validatedPayload.escalationId,
          failures,
          responseTime: deliveredAt - startTime
        });
        
        throw new Error(`All notification channels failed: ${failures.join(', ')}`);
      }

    } catch (error) {
      this.logger.error('Dual crisis alert failed', { 
        escalationId: payload.escalationId, 
        error 
      });
      throw error;
    }
  }

  async getDualDeliveryStatus(escalationId: string): Promise<DualDeliveryStatus> {
    const status = this.deliveryStatuses.get(escalationId);
    if (!status) {
      throw new Error(`No delivery status found for escalation ID: ${escalationId}`);
    }

    // Update email status if email service is available
    if (this.emailService && status.emailStatus === 'sent') {
      try {
        const deliveryConfirmation = this.deliveryStatuses.get(escalationId);
        if (deliveryConfirmation?.emailStatus === 'sent') {
          // In a real implementation, we would check email delivery status
          // For now, we'll keep the existing status
        }
      } catch (error) {
        this.logger.debug('Could not update email delivery status', { 
          escalationId, 
          error 
        });
      }
    }

    status.lastChecked = Date.now();
    return { ...status };
  }


  private trackDualDeliveryStatus(status: DualDeliveryStatus): void {
    this.deliveryStatuses.set(status.escalationId, status);
    
    // Clean up old delivery statuses (keep for 24 hours)
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    for (const [escalationId, deliveryStatus] of this.deliveryStatuses.entries()) {
      if (deliveryStatus.lastChecked < cutoff) {
        this.deliveryStatuses.delete(escalationId);
      }
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      let teamsConnectionWorking = true;
      let emailConnectionWorking = true;

      // Test Teams connection if service is available
      if (this.teamsService) {
        try {
          teamsConnectionWorking = await this.teamsService.testConnection();
        } catch (error) {
          this.logger.error('Teams service connection test failed', { error });
          teamsConnectionWorking = false;
        }
      } else {
        this.logger.warn('Teams service not configured for connection test');
      }

      // Test Email connection if service is available
      if (this.emailService) {
        try {
          emailConnectionWorking = await this.emailService.testConnection();
        } catch (error) {
          this.logger.error('Email service connection test failed', { error });
          emailConnectionWorking = false;
        }
      } else {
        this.logger.warn('Email service not configured for connection test');
      }

      const overallSuccess = teamsConnectionWorking && emailConnectionWorking;
      
      if (overallSuccess) {
        this.logger.info('All notification services connection test successful', {
          teamsWorking: teamsConnectionWorking,
          emailWorking: emailConnectionWorking
        });
      } else {
        this.logger.warn('Some notification services connection test failed', {
          teamsWorking: teamsConnectionWorking,
          emailWorking: emailConnectionWorking
        });
      }
      
      return overallSuccess;
    } catch (error) {
      this.logger.error('Notification services connection test failed', { error });
      return false;
    }
  }
}