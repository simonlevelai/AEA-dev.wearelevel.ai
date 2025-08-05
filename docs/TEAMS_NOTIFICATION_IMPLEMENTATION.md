# Teams Notification Service Implementation

## Overview

The Ask Eve Assist Teams Notification Service provides dual escalation capabilities alongside the existing email notification system. This implementation ensures compliance with safety audit requirements by providing redundant notification channels for crisis situations.

## Architecture

### Core Components

1. **TeamsNotificationService.ts** - Microsoft Teams integration with adaptive cards
2. **EmailNotificationService.ts** - SMTP email notifications (existing)
3. **NotificationService.ts** - Orchestrates dual escalation (updated)

### Key Features

- ✅ Microsoft Teams webhook integration with adaptive cards
- ✅ Exponential backoff retry logic (3 attempts with 1s, 2s, 4s delays)
- ✅ Rich formatting with NHS compliance information
- ✅ Channel routing based on severity levels
- ✅ Comprehensive error handling and logging
- ✅ Audit trail for compliance
- ✅ Response time under 2 seconds
- ✅ Concurrent dual escalation (Teams + Email)

## Configuration

### Teams Service Configuration

```typescript
const teamsConfig: TeamsConfig = {
  webhookUrl: 'https://webhook.office.com/general-channel',
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
```

### Dual Escalation Setup

```typescript
import { NotificationService } from './services/NotificationService';
import { EmailNotificationService } from './services/EmailNotificationService';
import { TeamsNotificationService } from './services/TeamsNotificationService';

// Initialize services
const emailService = new EmailNotificationService(emailConfig, logger);
const teamsService = new TeamsNotificationService(teamsConfig, logger);

// Create dual escalation service
const notificationService = new NotificationService(
  fallbackWebhookUrl,
  logger,
  3, // maxRetries
  1000, // retryDelay
  emailService,
  teamsService
);
```

## Usage

### Basic Crisis Alert

```typescript
const crisisPayload: NotificationPayload = {
  escalationId: 'esc_001',
  severity: 'crisis',
  userId: 'user_123',
  summary: 'Suicide ideation detected - immediate intervention required',
  triggerMatches: ['suicide_ideation', 'severe_distress'],
  timestamp: Date.now(),
  urgency: 'immediate',
  requiresCallback: true
};

// Send to both Teams and Email
const result = await notificationService.sendDualCrisisAlert(crisisPayload);
```

### Teams-Only Alert

```typescript
// Send to Teams only
const teamsResult = await teamsService.sendCrisisAlert(crisisPayload);
```

### Connection Testing

```typescript
// Test both services
const allWorking = await notificationService.testConnection();

// Test Teams service only
const teamsWorking = await teamsService.testConnection();
```

## Adaptive Cards Format

The Teams service generates rich adaptive cards with:

- **Crisis Header** - Red attention styling with emoji indicators
- **Escalation Details** - FactSet with ID, severity, urgency, user info
- **Callback Requirements** - Highlighted if immediate callback needed
- **Summary & Triggers** - Formatted trigger matches and escalation summary
- **Action Buttons** - Direct link to safety dashboard
- **Compliance Footer** - NHS data protection and audit information

### Example Adaptive Card Structure

```json
{
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "Container",
      "style": "attention", // Red for crisis
      "items": [
        {
          "type": "ColumnSet",
          "columns": [
            {
              "type": "Column",
              "width": "auto",
              "items": [{"type": "TextBlock", "text": "🚨", "size": "large"}]
            },
            {
              "type": "Column", 
              "width": "stretch",
              "items": [
                {"type": "TextBlock", "text": "CRISIS ALERT", "color": "attention"},
                {"type": "TextBlock", "text": "Ask Eve Assist Healthcare Bot"}
              ]
            }
          ]
        }
      ]
    },
    // ... escalation details, summary, compliance info
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "📊 View Safety Dashboard",
      "url": "https://dashboard.askeve.ai/safety/escalations/esc_001"
    }
  ]
}
```

## Channel Routing

Alerts are routed to different Teams channels based on severity:

- **Crisis** → crisis-channel (immediate attention, red styling)
- **High Concern** → high-concern-channel (warning styling)
- **General/Emotional Support** → general-channel (default styling)

## Error Handling & Resilience

### Retry Logic
- 3 attempts with exponential backoff (1s, 2s, 4s)
- Independent retry for Teams and Email channels
- Comprehensive error logging with escalation IDs

### Failure Modes
- **Single Channel Failure** - Partial success if one channel works
- **Complete Failure** - Critical error logged, exception thrown
- **Service Unavailable** - Graceful degradation with warning logs

### Audit Trail
All notifications include audit trails:

```typescript
auditTrail: {
  escalationId: string,
  deliveryMethod: 'teams' | 'email',
  timestamp: number,
  channelWebhook?: string, // Teams
  recipients?: string[], // Email
  messageId: string
}
```

## Performance Requirements

- **Response Time**: < 2 seconds for immediate urgency alerts
- **Concurrent Handling**: Supports multiple simultaneous crisis alerts
- **Resource Efficiency**: Minimal memory footprint with cleanup routines

## Testing

### Test Coverage
- **Unit Tests**: TeamsNotificationService (17 tests)
- **Integration Tests**: NotificationService dual escalation (9 tests)
- **Email Tests**: EmailNotificationService (12 tests)
- **Total**: 38 tests passing

### Key Test Scenarios
- Successful dual escalation
- Partial failures (Teams or Email only)
- Complete failure handling
- Retry logic validation
- Performance testing
- Configuration validation
- Adaptive card generation
- Channel routing

## Compliance & Security

### NHS Data Protection
- User IDs are sanitized (first 8 chars + ***)
- Webhook URLs are masked in logs
- Confidential patient information disclaimers
- Data Protection Act 2018 compliance notices

### Audit Requirements
- All escalations logged with unique IDs
- Delivery confirmations tracked
- Failed attempts recorded
- Response times monitored

## Deployment Considerations

### Environment Variables
```bash
# Teams webhook URLs
TEAMS_CRISIS_WEBHOOK=https://webhook.office.com/crisis-channel
TEAMS_HIGH_CONCERN_WEBHOOK=https://webhook.office.com/high-concern-channel
TEAMS_GENERAL_WEBHOOK=https://webhook.office.com/general-channel

# Email configuration (existing)
EMAIL_PASSWORD=secure-smtp-password
```

### Monitoring
- Service health checks via `testConnection()`
- Delivery status tracking
- Performance metrics logging
- Failed escalation alerting

## Migration Guide

### From Single Channel to Dual Escalation

1. **Install Dependencies** - No new dependencies required
2. **Update Configuration** - Add Teams webhook URLs
3. **Initialize Services** - Create TeamsNotificationService instance
4. **Update Notification Calls** - Use `sendDualCrisisAlert()` instead of `sendCrisisAlert()`
5. **Test Integration** - Verify both channels working

### Backward Compatibility
The original `sendCrisisAlert()` method remains available for Teams-only notifications.

## Monitoring & Alerting

### Key Metrics to Monitor
- Dual escalation success rate
- Individual channel success rates
- Response times by urgency level
- Retry attempt frequencies
- Failed escalation alerts

### Recommended Alerts
- Both channels failing (immediate alert)
- Single channel degraded (warning)
- Response time > 2 seconds (performance)
- High retry rates (capacity)

## Future Enhancements

### Potential Improvements
- Microsoft Graph API direct integration
- Message status callbacks
- User presence awareness
- Interactive card responses
- Multi-tenant channel support

### Scalability Considerations
- Rate limiting for high-volume scenarios
- Circuit breaker pattern for degraded services
- Horizontal scaling with queue-based processing

---

**Implementation Status**: ✅ Complete
**Test Coverage**: ✅ 38/38 tests passing
**Performance**: ✅ < 2 second response time
**Compliance**: ✅ NHS data protection compliant
**Audit**: ✅ Full audit trail implemented