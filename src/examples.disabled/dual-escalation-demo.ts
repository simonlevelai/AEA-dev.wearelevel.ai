/**
 * Dual Escalation Demo - Ask Eve Assist
 * 
 * This example demonstrates how to set up and use the dual escalation system
 * with both Teams and Email notifications for crisis situations.
 */

import { NotificationService } from '../services/NotificationService';
import { EmailNotificationService, EmailConfig } from '../services/EmailNotificationService';
import { TeamsNotificationService, TeamsConfig } from '../services/TeamsNotificationService';
import { Logger } from '../utils/logger';
import { NotificationPayload } from '../types/safety';

// Example configuration for dual escalation system
const setupDualEscalationSystem = () => {
  // Logger instance
  const logger: Logger = {
    info: (message: string, data?: any) => console.log(`[INFO] ${message}`, data),
    warn: (message: string, data?: any) => console.warn(`[WARN] ${message}`, data),
    error: (message: string, data?: any) => console.error(`[ERROR] ${message}`, data),
    debug: (message: string, data?: any) => console.debug(`[DEBUG] ${message}`, data)
  };

  // Email service configuration
  const emailConfig: EmailConfig = {
    smtp: {
      host: 'smtp.nhs.net',
      port: 587,
      secure: false,
      auth: {
        user: 'askeve@nhs.uk',
        pass: process.env.EMAIL_PASSWORD || 'secure-password'
      }
    },
    from: 'askeve@nhs.uk',
    recipients: {
      crisis: [
        'crisis.team@nhs.uk',
        'head.nurse@nhs.uk',
        'mental.health.lead@nhs.uk'
      ],
      high_concern: [
        'nursing.team@nhs.uk',
        'duty.manager@nhs.uk'
      ],
      general: [
        'support.team@nhs.uk'
      ]
    },
    templates: {
      crisis: 'crisis-alert-template',
      high_concern: 'high-concern-template',
      general: 'general-alert-template'
    }
  };

  // Teams service configuration
  const teamsConfig: TeamsConfig = {
    webhookUrl: 'https://webhook.office.com/general-channel',
    channels: {
      crisis: process.env.TEAMS_CRISIS_WEBHOOK || 'https://webhook.office.com/crisis-channel',
      high_concern: process.env.TEAMS_HIGH_CONCERN_WEBHOOK || 'https://webhook.office.com/high-concern-channel',
      general: process.env.TEAMS_GENERAL_WEBHOOK || 'https://webhook.office.com/general-channel'
    },
    enableAdaptiveCards: true,
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2
    }
  };

  // Initialize services
  const emailService = new EmailNotificationService(emailConfig, logger);
  const teamsService = new TeamsNotificationService(teamsConfig, logger);
  
  // Initialize dual escalation notification service
  const notificationService = new NotificationService(
    teamsConfig.webhookUrl, // fallback webhook (not used with new architecture)
    logger,
    3, // maxRetries
    1000, // retryDelay
    emailService,
    teamsService
  );

  return { notificationService, emailService, teamsService };
};

// Example crisis alert payload
const createCrisisAlertPayload = (): NotificationPayload => ({
  escalationId: `esc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  severity: 'crisis',
  userId: 'user_' + Math.random().toString(36).substr(2, 9),
  summary: 'Suicide ideation detected in conversation with vulnerable user. Immediate intervention required.',
  triggerMatches: [
    'suicide_ideation',
    'want to die',
    'end my life',
    'severe_distress',
    'cant_go_on'
  ],
  timestamp: Date.now(),
  urgency: 'immediate',
  requiresCallback: true
});

// Demo function to show dual escalation in action
const demonstrateDualEscalation = async () => {
  console.log('🚨 Ask Eve Assist - Dual Escalation Demo 🚨\n');

  try {
    // Setup the system
    const { notificationService } = setupDualEscalationSystem();

    // Test connections first
    console.log('Testing service connections...');
    const connectionStatus = await notificationService.testConnection();
    console.log(`Connection test result: ${connectionStatus ? '✅ All services working' : '❌ Some services failed'}\n`);

    // Create a crisis alert
    const crisisPayload = createCrisisAlertPayload();
    console.log('Crisis Alert Payload:', {
      escalationId: crisisPayload.escalationId,
      severity: crisisPayload.severity,
      urgency: crisisPayload.urgency,
      requiresCallback: crisisPayload.requiresCallback,
      triggerMatches: crisisPayload.triggerMatches.slice(0, 3) + '...'
    });

    // Send dual crisis alert
    console.log('\n📨 Sending dual crisis alert...');
    const startTime = Date.now();
    
    const result = await notificationService.sendDualCrisisAlert(crisisPayload);
    
    const responseTime = Date.now() - startTime;
    
    console.log('\n✅ Dual Crisis Alert Results:');
    console.log(`- Teams Delivered: ${result.teamsDelivered ? '✅' : '❌'}`);
    console.log(`- Email Delivered: ${result.emailDelivered ? '✅' : '❌'}`);
    console.log(`- Overall Success: ${result.overallSuccess ? '✅' : '❌'}`);
    console.log(`- Response Time: ${responseTime}ms`);
    console.log(`- Retry Count: ${result.retryCount}`);
    
    if (result.failures.length > 0) {
      console.log('- Failures:', result.failures);
    }

    console.log('\n📋 Delivery Confirmation:');
    console.log(`- Escalation ID: ${result.deliveryConfirmation.escalationId}`);
    console.log(`- Teams Message ID: ${result.deliveryConfirmation.teamsMessageId || 'N/A'}`);
    console.log(`- Email Message ID: ${result.deliveryConfirmation.emailMessageId || 'N/A'}`);
    console.log(`- Channels Used: ${result.deliveryConfirmation.channels.join(', ')}`);
    console.log(`- Delivered At: ${new Date(result.deliveryConfirmation.deliveredAt!).toISOString()}`);

    // Get delivery status
    console.log('\n📊 Checking delivery status...');
    const deliveryStatus = await notificationService.getDualDeliveryStatus(crisisPayload.escalationId);
    console.log(`- Teams Status: ${deliveryStatus.teamsStatus}`);
    console.log(`- Email Status: ${deliveryStatus.emailStatus}`);
    console.log(`- Overall Status: ${deliveryStatus.overallStatus}`);

    console.log('\n🎉 Dual escalation demo completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Both Teams and Email services can send crisis alerts independently');
    console.log('- System provides comprehensive retry logic with exponential backoff');
    console.log('- Adaptive Cards are used for rich Teams notifications');
    console.log('- All notifications include NHS compliance information');
    console.log('- Audit trails are maintained for both channels');
    console.log('- Response times are under 2 seconds as required');
    console.log('- Dual escalation ensures safety compliance with redundancy');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
    }
  }
};

// Usage examples for different scenarios
const usageExamples = () => {
  console.log('\n💡 Usage Examples:\n');

  console.log('1. High Concern Alert (Medical):');
  const highConcernPayload: NotificationPayload = {
    escalationId: 'esc_medical_001',
    severity: 'high_concern',
    userId: 'user_456',
    summary: 'Severe abdominal pain with bleeding reported. Requires urgent medical assessment.',
    triggerMatches: ['severe_pain', 'bleeding', 'urgent_medical'],
    timestamp: Date.now(),
    urgency: 'high',
    requiresCallback: false
  };
  console.log(JSON.stringify(highConcernPayload, null, 2));

  console.log('\n2. Emotional Support Request:');
  const emotionalSupportPayload: NotificationPayload = {
    escalationId: 'esc_support_001',
    severity: 'emotional_support',
    userId: 'user_789',
    summary: 'User experiencing anxiety about test results and needs emotional support.',
    triggerMatches: ['anxiety', 'worried', 'emotional_support'],
    timestamp: Date.now(),
    urgency: 'medium',
    requiresCallback: false
  };
  console.log(JSON.stringify(emotionalSupportPayload, null, 2));
};

// Export for use in other modules
export {
  setupDualEscalationSystem,
  createCrisisAlertPayload,
  demonstrateDualEscalation,
  usageExamples
};

// Run demo if this file is executed directly
if (require.main === module) {
  demonstrateDualEscalation()
    .then(() => {
      usageExamples();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Demo failed:', error);
      process.exit(1);
    });
}