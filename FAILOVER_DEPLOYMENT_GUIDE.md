# Multi-Tier Failover & Monitoring Deployment Guide

## Overview

This guide covers the deployment of the 4-tier failover architecture and enhanced monitoring systems for the Ask Eve Assist healthcare chatbot.

## Architecture Summary

### Failover Tiers
1. **Primary**: OpenAI GPT-4o-mini (US East)
2. **Secondary**: Azure OpenAI GPT-4o-mini (UK West)  
3. **Tertiary**: Anthropic Claude 3.5 Sonnet (API)
4. **Emergency**: Pre-cached crisis responses + human escalation

### SLA Requirements
- **Crisis Response**: <2 seconds (99.9% compliance)
- **Failover Time**: <3 seconds between tiers
- **System Uptime**: 99.9% availability
- **Emergency Escalation**: Immediate human notification

## Prerequisites

### Required Environment Variables
```bash
# OpenAI (Primary)
OPENAI_API_KEY=sk-...

# Azure OpenAI (Secondary)
AZURE_OPENAI_ENDPOINT=https://askeve-failover-ukwest.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini-deployment

# Anthropic (Tertiary)
ANTHROPIC_API_KEY=sk-ant-...

# Monitoring & Alerts
TEAMS_WEBHOOK_URL=https://teams.microsoft.com/...
SMTP_HOST=smtp.gmail.com
SMTP_USER=alerts@wearelevel.ai
SMTP_PASS=...

# Azure CLI (for deployment)
AZURE_SUBSCRIPTION_ID=...
AZURE_TENANT_ID=...
```

### Required Software
- Node.js 18+
- Azure CLI 2.50+
- Docker (optional)
- Git

## Deployment Steps

### 1. Deploy Secondary Azure Infrastructure

```bash
# Login to Azure
az login

# Deploy failover infrastructure
./scripts/deploy-failover.sh

# Verify deployment
az deployment group show \
  --resource-group "ask-eve-failover-rg" \
  --name "askeve-failover-latest" \
  --output table
```

### 2. Configure Environment Variables

```bash
# Copy environment template
cp .env.example .env.production

# Add Azure OpenAI details from deployment output
echo "AZURE_OPENAI_ENDPOINT=https://askeve-failover-ukwest.openai.azure.com" >> .env.production
echo "AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini-deployment" >> .env.production

# Add other provider keys
echo "OPENAI_API_KEY=sk-..." >> .env.production
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.production
```

### 3. Install Dependencies

```bash
# Install packages
npm install

# Build TypeScript
npm run build

# Run tests
npm test -- --testPathPattern="Failover"
```

### 4. Initialize Failover Service

```typescript
import { FailoverService } from './src/services/FailoverService';

const failoverService = new FailoverService({
  configPath: 'config/failover-config.json',
  enableMonitoring: true,
  enableAlerts: true,
  testMode: false
});

// Test system health
const health = await failoverService.getSystemHealth();
console.log('System Health:', health);

// Test crisis response
const response = await failoverService.handleCrisisRequest(
  'I need help',
  'user123',
  'conv456'
);
console.log('Crisis Response:', response);
```

### 5. Configure Monitoring Dashboards

#### Azure Monitor Setup
```bash
# Create custom dashboard
az portal dashboard create \
  --resource-group "ask-eve-failover-rg" \
  --name "Ask Eve Failover Dashboard" \
  --input-path "deploy/dashboard-template.json"

# Configure log queries
az monitor log-analytics query \
  --workspace "askeve-failover-logs" \
  --analytics-query "
    CognitiveServicesAuditLogs
    | where TimeGenerated > ago(1h)
    | summarize count() by ResultType, bin(TimeGenerated, 5m)
    | render timechart
  "
```

#### Application Insights Queries
```kusto
// SLA Compliance Query
requests
| where timestamp > ago(1h)
| where name contains "crisis"
| extend SLACompliant = duration < 2000
| summarize 
    TotalRequests = count(),
    CompliantRequests = countif(SLACompliant),
    ComplianceRate = round(100.0 * countif(SLACompliant) / count(), 2)
by bin(timestamp, 5m)
| render timechart

// Provider Health Query
dependencies
| where timestamp > ago(1h)
| where type == "Http"
| extend Provider = case(
    target contains "openai.com", "OpenAI",
    target contains "azure.com", "Azure OpenAI", 
    target contains "anthropic.com", "Anthropic",
    "Emergency"
)
| summarize 
    Requests = count(),
    Failures = countif(success == false),
    AvgDuration = avg(duration)
by Provider, bin(timestamp, 5m)
| render timechart
```

## Configuration Files

### Failover Configuration (`config/failover-config.json`)
```json
{
  "failover": {
    "slaLimitMs": 3000,
    "circuitBreakerThreshold": 5,
    "emergencyResponsesEnabled": true
  },
  "providers": {
    "primary": {
      "name": "openai-gpt4o-mini",
      "model": "gpt-4o-mini",
      "timeout": 5000
    },
    "secondary": {
      "name": "azure-openai-uk-west",
      "endpoint": "${AZURE_OPENAI_ENDPOINT}",
      "deployment": "gpt-4o-mini-deployment"
    }
  }
}
```

### Safety Configuration (`config/safety-config.json`)
```json
{
  "response_times": {
    "crisis_detection_ms": 500,
    "crisis_response_ms": 2000,
    "nurse_notification_ms": 60000
  },
  "escalation_levels": {
    "crisis": {
      "immediate_response": true,
      "nurse_notification": true
    }
  }
}
```

## Testing & Validation

### Health Check Tests
```bash
# Test all provider tiers
npm run test:failover

# Test emergency responses
npm run test:emergency

# Load testing
npm run test:load -- --requests=1000 --concurrent=50
```

### Manual Failover Testing
```typescript
// Test each tier manually
const tests = [
  { query: "test primary", expected: "openai-gpt4o-mini" },
  { query: "test secondary", expected: "azure-openai-uk-west" },
  { query: "test tertiary", expected: "anthropic-claude-3.5-sonnet" },
  { query: "I want to hurt myself", expected: "emergency-cached-responses" }
];

for (const test of tests) {
  const result = await failoverService.handleCrisisRequest(
    test.query, 
    'test-user', 
    'test-conv'
  );
  console.log(`Provider: ${result.provider}, Expected: ${test.expected}`);
}
```

### SLA Monitoring Tests
```bash
# Generate test load
for i in {1..100}; do
  curl -X POST localhost:3000/chat \
    -d '{"message":"test crisis","userId":"load-test-'$i'"}' \
    -H "Content-Type: application/json" &
done

# Check SLA compliance
npm run check:sla
```

## Monitoring & Alerts

### Alert Configuration
```json
{
  "alertThresholds": {
    "slaViolationThreshold": 2,
    "providerFailureThreshold": 3,
    "responseTimeThreshold": 5000
  },
  "escalation": {
    "enableTeamsAlerts": true,
    "enableEmailAlerts": true,
    "teamsWebhookUrl": "${TEAMS_WEBHOOK_URL}"
  }
}
```

### Teams Alert Format
```json
{
  "@type": "MessageCard",
  "summary": "Ask Eve Assist - Critical System Alert",
  "themeColor": "FF0000",
  "sections": [{
    "activityTitle": "🚨 CRITICAL: Multiple SLA Violations",
    "facts": [
      {"name": "Violation Count", "value": "3"},
      {"name": "Time Window", "value": "10 minutes"},
      {"name": "System Status", "value": "DEGRADED"}
    ]
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Dashboard",
    "targets": [{"os": "default", "uri": "https://dashboard.askeve.ai"}]
  }]
}
```

## Security & Compliance

### MHRA Compliance
- ✅ No medical diagnosis or prescriptions
- ✅ Appropriate disclaimers in all responses  
- ✅ Emergency escalation for crisis situations
- ✅ Audit trail for all interactions

### Data Security
```bash
# Enable encryption at rest
az keyvault update \
  --name "askeve-failover-kv" \
  --enable-purge-protection \
  --enable-soft-delete

# Configure network security
az cognitiveservices account network-rule add \
  --resource-group "ask-eve-failover-rg" \
  --name "askeve-failover-ukwest" \
  --ip-address "YOUR-APP-IP"
```

### Secret Rotation
```bash
# Automated secret rotation (90-day cycle)
az keyvault key create \
  --vault-name "askeve-failover-kv" \
  --name "api-key-rotation" \
  --expires "2024-04-01"

# Set up rotation automation
az automation runbook create \
  --resource-group "ask-eve-failover-rg" \
  --automation-account-name "askeve-automation" \
  --name "rotate-api-keys" \
  --type "PowerShell"
```

## Production Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] Azure infrastructure deployed and tested
- [ ] Provider API keys validated
- [ ] Load testing completed (>1000 requests/min)
- [ ] Failover scenarios tested manually
- [ ] SLA monitoring configured and alerting
- [ ] Teams/email notifications working
- [ ] Security scanning passed
- [ ] MHRA compliance validated

### Post-Deployment
- [ ] Health checks passing for all tiers
- [ ] SLA metrics collecting correctly
- [ ] Alert thresholds configured appropriately
- [ ] Monitoring dashboards accessible
- [ ] Crisis escalation workflows tested
- [ ] Documentation updated
- [ ] Team training completed

### Ongoing Operations
- [ ] Daily health check review
- [ ] Weekly SLA compliance reports
- [ ] Monthly failover testing
- [ ] Quarterly disaster recovery drills
- [ ] 90-day secret rotation
- [ ] Annual security audit

## Troubleshooting

### Common Issues

#### Provider Authentication Errors
```bash
# Check API key validity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Validate Azure credentials
az cognitiveservices account keys list \
  --resource-group "ask-eve-failover-rg" \
  --name "askeve-failover-ukwest"
```

#### Circuit Breaker Issues
```typescript
// Reset circuit breaker manually
const circuitBreaker = new CircuitBreaker(config);
circuitBreaker.reset();

// Check circuit breaker state
console.log('State:', circuitBreaker.getState());
console.log('Metrics:', circuitBreaker.getMetrics());
```

#### SLA Violations
```bash
# Check recent violations
npm run check:sla -- --period=1h --details

# Review provider performance
npm run analyze:providers -- --timeframe=24h
```

### Emergency Procedures

#### Complete System Failure
1. Activate emergency response mode
2. Switch to cached responses only
3. Notify development team immediately
4. Escalate all crisis requests to human operators
5. Post status update on monitoring dashboard

#### Provider Outage
1. Verify circuit breaker activation
2. Confirm failover to next tier
3. Monitor response times
4. Update incident tracking
5. Communicate with affected stakeholders

## Support Contacts

- **Level AI DevOps**: devops@wearelevel.ai
- **Eve Appeal Technical**: support@eveappeal.org.uk  
- **Emergency Escalation**: +44 xxx xxx xxxx

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Classification**: Internal Use Only