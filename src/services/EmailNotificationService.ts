import { Logger } from '../utils/logger';
import { NotificationPayload, SeverityLevel } from '../types/safety';

export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  recipients: {
    crisis: string[];
    high_concern: string[];
    general: string[];
  };
  templates: {
    crisis: string;
    high_concern: string;
    general: string;
  };
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
  priority: 'high' | 'normal' | 'low';
}

export interface EmailDeliveryResult {
  status: 'sent' | 'failed' | 'retry';
  messageId: string;
  recipients: string[];
  deliveredAt: number;
  retryCount: number;
  error?: string;
  auditTrail: {
    escalationId: string;
    deliveryMethod: 'email';
    timestamp: number;
    recipients: string[];
    messageId: string;
  };
}

export interface EmailDeliveryStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'bounced' | 'failed' | 'pending';
  sentAt: number;
  deliveredAt?: number;
  bounceReason?: string;
  recipients: string[];
}

export class EmailNotificationService {
  private emailConfig: EmailConfig;
  private logger: Logger;
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second for tests
  private deliveryStatuses: Map<string, EmailDeliveryStatus> = new Map();

  constructor(emailConfig: EmailConfig, logger: Logger, skipValidation = false) {
    this.emailConfig = emailConfig;
    this.logger = logger;
    if (!skipValidation) {
      this.validateConfiguration();
    }
  }

  async sendCrisisAlert(payload: NotificationPayload): Promise<EmailDeliveryResult> {
    const startTime = Date.now();
    
    try {
      // Validate payload
      this.validatePayload(payload);

      // Get recipients based on severity
      const recipients = this.getRecipients(payload.severity);
      
      // Validate all recipient email addresses
      this.validateRecipients(recipients);

      // Generate email template
      const template = this.generateEmailTemplate(payload);
      
      // Generate unique message ID
      const messageId = this.generateMessageId(payload.escalationId);

      let lastError: Error | null = null;
      let retryCount = 0;

      // Retry logic
      while (retryCount < this.maxRetries) {
        try {
          await this.sendEmail(recipients, template, messageId);
          
          const deliveredAt = Date.now();
          
          // Track delivery status
          this.trackDeliveryStatus({
            messageId,
            status: 'sent',
            sentAt: deliveredAt,
            recipients
          });

          const result: EmailDeliveryResult = {
            status: 'sent',
            messageId,
            recipients,
            deliveredAt,
            retryCount,
            auditTrail: {
              escalationId: payload.escalationId,
              deliveryMethod: 'email',
              timestamp: deliveredAt,
              recipients,
              messageId
            }
          };

          this.logger.info('Crisis alert email sent successfully', {
            escalationId: payload.escalationId,
            recipients: recipients.length,
            messageId,
            responseTime: deliveredAt - startTime,
            retries: retryCount
          });

          return result;

        } catch (error) {
          lastError = error as Error;
          retryCount++;
          
          this.logger.warn('Email sending attempt failed, retrying...', {
            escalationId: payload.escalationId,
            attempt: retryCount,
            error: lastError instanceof Error ? lastError : new Error(String(lastError)),
            remainingRetries: this.maxRetries - retryCount
          });

          if (retryCount < this.maxRetries) {
            await this.delay(this.retryDelay * retryCount); // Exponential backoff
          }
        }
      }

      // All retries failed
      this.logger.error('Crisis alert email failed after all retries', {
        escalationId: payload.escalationId,
        attempts: this.maxRetries,
        lastError: lastError?.message,
        totalTime: Date.now() - startTime
      });

      throw new Error(`Failed to send crisis alert email after ${this.maxRetries} attempts: ${lastError?.message}`);

    } catch (error) {
      this.logger.error('Crisis alert email failed', {
        escalationId: payload.escalationId,
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }

  generateEmailTemplate(payload: NotificationPayload): EmailTemplate {
    const timestamp = new Date(payload.timestamp).toISOString();
    const urgencyEmojis = {
      immediate: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️'
    };

    const emoji = urgencyEmojis[payload.urgency];
    let subject: string;
    let priority: 'high' | 'normal' | 'low';
    let alertType: string;
    let alertColor: string;

    // Determine email styling based on severity
    switch (payload.severity) {
      case 'crisis':
        subject = `🚨 CRISIS ALERT - Ask Eve Assist - ${payload.escalationId}`;
        priority = 'high';
        alertType = 'CRISIS ALERT';
        alertColor = '#FF0000';
        break;
      case 'high_concern':
        subject = `⚠️ HIGH CONCERN - Ask Eve Assist - ${payload.escalationId}`;
        priority = 'high';
        alertType = 'HIGH CONCERN ALERT';
        alertColor = '#FF6600';
        break;
      default:
        subject = `ℹ️ SUPPORT REQUEST - Ask Eve Assist - ${payload.escalationId}`;
        priority = 'normal';
        alertType = 'SUPPORT REQUEST';
        alertColor = '#0066CC';
    }

    const callbackSection = payload.requiresCallback ? 
      `<div style="background-color: #FFE6E6; padding: 15px; border-left: 4px solid #FF0000; margin: 20px 0;">
        <h3 style="color: #FF0000; margin: 0 0 10px 0;">⚠️ Immediate Callback Required</h3>
        <p style="margin: 0; font-weight: bold;">This escalation requires immediate callback to the user.</p>
      </div>` : '';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${alertType}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: ${alertColor}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">${emoji} ${alertType}</h1>
        <h2 style="margin: 10px 0 0 0; font-size: 18px;">Ask Eve Assist Healthcare Bot</h2>
    </div>
    
    <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
        <div style="background-color: #F8F9FA; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: ${alertColor};">Escalation Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 5px 0; font-weight: bold; width: 150px;">Escalation ID:</td>
                    <td style="padding: 5px 0;">${payload.escalationId}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; font-weight: bold;">Severity:</td>
                    <td style="padding: 5px 0; text-transform: uppercase; color: ${alertColor}; font-weight: bold;">${payload.severity}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; font-weight: bold;">Urgency:</td>
                    <td style="padding: 5px 0; text-transform: uppercase;">${payload.urgency}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; font-weight: bold;">User ID:</td>
                    <td style="padding: 5px 0;">${this.sanitizeUserId(payload.userId)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; font-weight: bold;">Timestamp:</td>
                    <td style="padding: 5px 0;">${timestamp}</td>
                </tr>
            </table>
        </div>

        ${callbackSection}

        <div style="margin: 20px 0;">
            <h3 style="color: ${alertColor};">Summary</h3>
            <p style="background-color: #F8F9FA; padding: 15px; border-radius: 5px; margin: 0;">${payload.summary}</p>
        </div>

        <div style="margin: 20px 0;">
            <h3 style="color: ${alertColor};">Trigger Matches</h3>
            <div style="background-color: #F8F9FA; padding: 15px; border-radius: 5px;">
                ${payload.triggerMatches.map(trigger => 
                    `<span style="display: inline-block; background-color: ${alertColor}; color: white; padding: 4px 8px; margin: 2px; border-radius: 3px; font-size: 12px;">${trigger}</span>`
                ).join('')}
            </div>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="https://dashboard.askeve.ai/safety/escalations/${payload.escalationId}" 
               style="background-color: ${alertColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                📊 View in Safety Dashboard
            </a>
        </div>

        <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #666;">
            <h4 style="margin: 0 0 10px 0; color: #333;">Important Information</h4>
            <ul style="margin: 0; padding-left: 20px;">
                <li>This message contains confidential patient information protected under the Data Protection Act 2018</li>
                <li>If you are not the intended recipient, please delete this email immediately</li>
                <li>Do not forward this email without proper authorization</li>
                <li>All escalations are logged for audit and compliance purposes</li>
            </ul>
            
            <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
                <p style="margin: 5px 0; color: #888;">
                    <strong>Ask Eve Assist</strong> | Healthcare Information Service<br>
                    Powered by The Eve Appeal | NHS Partnership<br>
                    <em>Supporting women's health through AI-powered assistance</em>
                </p>
            </div>
        </div>
    </div>
</body>
</html>`;

    const text = `
${alertType} - Ask Eve Assist

Escalation ID: ${payload.escalationId}
Severity: ${payload.severity.toUpperCase()}
Urgency: ${payload.urgency.toUpperCase()}
User ID: ${this.sanitizeUserId(payload.userId)}
Timestamp: ${timestamp}

${payload.requiresCallback ? '⚠️ IMMEDIATE CALLBACK REQUIRED\n' : ''}

Summary: ${payload.summary}

Trigger Matches: ${payload.triggerMatches.join(', ')}

View in Safety Dashboard: https://dashboard.askeve.ai/safety/escalations/${payload.escalationId}

This message contains confidential patient information. If you are not the intended recipient, please delete immediately.
`;

    return {
      subject,
      html,
      text,
      priority
    };
  }

  async getDeliveryStatus(messageId: string): Promise<EmailDeliveryStatus> {
    const status = this.deliveryStatuses.get(messageId);
    if (!status) {
      throw new Error(`No delivery status found for message ID: ${messageId}`);
    }
    return { ...status };
  }

  private validateConfiguration(): void {
    // Validate SMTP configuration
    if (!this.emailConfig.smtp.host || !this.emailConfig.smtp.auth.user || !this.emailConfig.smtp.auth.pass) {
      throw new Error('Invalid SMTP configuration: missing required fields');
    }

    // Validate recipients
    const allRecipients = [
      ...this.emailConfig.recipients.crisis,
      ...this.emailConfig.recipients.high_concern,
      ...this.emailConfig.recipients.general
    ];

    for (const email of allRecipients) {
      if (!this.isValidEmail(email)) {
        throw new Error(`Invalid email address in configuration: ${email}`);
      }
    }

    this.logger.info('Email notification service configured successfully', {
      smtpHost: this.emailConfig.smtp.host,
      smtpPort: this.emailConfig.smtp.port,
      totalRecipients: allRecipients.length
    });
  }

  private validatePayload(payload: NotificationPayload): void {
    if (!payload.escalationId || !payload.severity || !payload.userId) {
      throw new Error('Invalid notification payload: missing required fields');
    }
  }

  private validateRecipients(recipients: string[]): void {
    for (const email of recipients) {
      if (!this.isValidEmail(email)) {
        this.logger.error('Invalid email address in recipients list', {
          invalidEmail: email
        });
        throw new Error(`Invalid email address found: ${email}`);
      }
    }
  }

  private getRecipients(severity: SeverityLevel): string[] {
    switch (severity) {
      case 'crisis':
        return [...this.emailConfig.recipients.crisis];
      case 'high_concern':
        return [...this.emailConfig.recipients.high_concern];
      default:
        return [...this.emailConfig.recipients.general];
    }
  }

  private async sendEmail(recipients: string[], template: EmailTemplate, messageId: string): Promise<void> {
    // Simulate SMTP sending using fetch to a mail service API
    // In production, this would use nodemailer or similar SMTP library
    const emailData = {
      from: this.emailConfig.from,
      to: recipients,
      subject: template.subject,
      html: template.html,
      text: template.text,
      priority: template.priority,
      messageId,
      headers: {
        'X-Message-ID': messageId,
        'X-Priority': template.priority === 'high' ? '1' : '3'
      }
    };

    // This would be replaced with actual SMTP sending in production
    const response = await fetch('https://api.emailservice.com/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.emailConfig.smtp.auth.pass}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Email sending failed: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    this.logger.debug('Email API response', { response: responseText, messageId });
  }

  private generateMessageId(escalationId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${escalationId}_${timestamp}_${random}@askeve.ai`;
  }

  private sanitizeUserId(userId: string): string {
    // Hash or truncate user ID for privacy while maintaining uniqueness
    return userId.substring(0, 8) + '***';
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private trackDeliveryStatus(status: EmailDeliveryStatus): void {
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
      const testTemplate: EmailTemplate = {
        subject: 'Ask Eve Assist - Email Service Test',
        html: '<h1>Test Email</h1><p>This is a test email from Ask Eve Assist email notification service.</p>',
        text: 'Test Email - This is a test email from Ask Eve Assist email notification service.',
        priority: 'normal'
      };

      const testMessageId = this.generateMessageId('test');
      
      // Test with first crisis recipient
      const testRecipients = this.emailConfig.recipients.crisis.slice(0, 1);
      
      await this.sendEmail(testRecipients, testTemplate, testMessageId);
      
      this.logger.info('Email service connection test successful', {
        testRecipient: testRecipients[0],
        messageId: testMessageId
      });
      
      return true;
    } catch (error) {
      this.logger.error('Email service connection test failed', { error });
      return false;
    }
  }
}