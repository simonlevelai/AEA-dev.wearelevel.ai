# Cost-Optimized Monitoring Strategy for Ask Eve Assist

**Cost Reduction: £8-11/month savings (£10-15 → £2-4/month)**

## 🎯 Executive Summary

This document outlines the cost-optimized monitoring strategy for Ask Eve Assist healthcare chatbot achieving **70% reduction in Application Insights costs** while maintaining essential healthcare monitoring capabilities and compliance requirements.

## 💰 Cost Optimization Overview

### Before Optimization
- **Full Application Insights**: £10-15/month
- **100% sampling**: All telemetry data collected
- **90-day retention**: Extended data storage
- **Custom dashboards**: Multiple detailed views
- **Real-time alerts**: High-frequency monitoring

### After Optimization  
- **Reduced Application Insights**: £2-4/month
- **5% sampling**: Focused on critical healthcare events
- **30-day retention**: GDPR-compliant short-term storage
- **Essential dashboards**: Healthcare-focused monitoring
- **Smart alerts**: Crisis and system health only

### 🎉 **Savings**: £8-11/month (70% cost reduction)

## 📊 Cost-Optimized Telemetry Strategy

### 1. Intelligent Sampling (5% Standard + 100% Critical)

```typescript
// Cost-optimized Application Insights configuration
export const COST_OPTIMIZED_APP_INSIGHTS = {
  // Standard telemetry: 5% sampling
  samplingPercentage: 5,
  
  // Critical events: 100% collection (always capture)
  criticalEvents: [
    'CrisisDetected',           // Safety-critical events
    'EmergencyContactTriggered', // Emergency response
    'NurseEscalationInitiated', // Healthcare handoffs
    'SystemFailure',            // Service availability
    'SecurityAlert',            // Security incidents
    'GDPRDataDeletion',         // Compliance events
    'ContentAttributionFailure' // MHRA compliance issues
  ],
  
  // Healthcare compliance: Always log
  healthcareCompliance: {
    auditTrail: true,           // 100% audit events
    safetyEvents: true,         // 100% crisis detection
    escalationEvents: true,     // 100% nurse handoffs
    contentCompliance: true     // 100% MHRA validation
  },
  
  // Cost optimization settings
  costOptimization: {
    retentionDays: 30,          // vs 90 days standard
    customMetrics: 'essential', // Only critical metrics
    dependencies: 'filtered',   // Key service calls only
    pageViews: 'disabled',      // Not needed for bot
    userTracking: 'minimal'     // GDPR-compliant only
  }
};
```

### 2. Smart Event Filtering

```typescript
export class CostOptimizedTelemetryFilter {
  
  // Always capture: Safety-critical events (100% sampling)
  private criticalEventTypes = [
    'crisis_detected',
    'emergency_response',
    'nurse_escalation',
    'system_failure',
    'security_incident',
    'gdpr_deletion',
    'mhra_compliance_failure'
  ];
  
  // Sample at 5%: Regular operational events  
  private standardEventTypes = [
    'user_message',
    'bot_response',
    'content_search',
    'token_usage',
    'cache_hit',
    'api_call'
  ];
  
  shouldCollectTelemetry(eventType: string, eventData: any): boolean {
    // Healthcare safety: Always collect critical events
    if (this.criticalEventTypes.includes(eventType)) {
      return true;
    }
    
    // Crisis keywords: Always collect for safety
    if (eventData.message && this.containsCrisisKeywords(eventData.message)) {
      return true;
    }
    
    // MHRA compliance: Always collect content attribution failures
    if (eventData.missingSourceUrl || eventData.medicalAdviceGenerated) {
      return true;
    }
    
    // Standard events: 5% sampling for cost optimization
    if (this.standardEventTypes.includes(eventType)) {
      return Math.random() < 0.05; // 5% sampling
    }
    
    // Unknown events: Don't collect (cost optimization)
    return false;
  }
  
  private containsCrisisKeywords(message: string): boolean {
    const crisisKeywords = [
      'suicide', 'kill myself', 'end my life', 'hopeless', 
      'self-harm', 'want to die', 'nothing matters'
    ];
    
    return crisisKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
  }
}
```

### 3. Essential Healthcare Metrics Only

```typescript
export class CostOptimizedHealthcareMetrics {
  
  // Critical metrics: Always tracked (healthcare compliance)
  trackCriticalMetric(name: string, value: number, properties?: any) {
    this.appInsights.trackMetric({
      name,
      value,
      properties: {
        ...properties,
        criticality: 'high',
        healthcare_related: true,
        always_collect: true
      }
    });
  }
  
  // Essential healthcare metrics (100% collection)
  trackCrisisResponseTime(responseTimeMs: number) {
    this.trackCriticalMetric('crisis_response_time_ms', responseTimeMs, {
      target: '<500ms',
      compliance: 'healthcare_safety'
    });
  }
  
  trackNurseEscalationSuccess(successful: boolean) {
    this.trackCriticalMetric('nurse_escalation_success', successful ? 1 : 0, {
      healthcare_workflow: 'critical'
    });
  }
  
  trackMHRAComplianceViolation(violationType: string) {
    this.trackCriticalMetric('mhra_compliance_violation', 1, {
      violation_type: violationType,
      requires_immediate_attention: true
    });
  }
  
  // Standard metrics: 5% sampling for cost optimization
  trackStandardMetric(name: string, value: number) {
    if (Math.random() < 0.05) { // 5% sampling
      this.appInsights.trackMetric({
        name,
        value,
        properties: {
          sampled: true,
          cost_optimized: true
        }
      });
    }
  }
  
  trackTokenUsage(tokens: number) {
    this.trackStandardMetric('openai_tokens_used', tokens);
  }
  
  trackCacheHitRate(hitRate: number) {
    this.trackStandardMetric('cache_hit_rate', hitRate);
  }
}
```

## 📈 Cost-Optimized Monitoring Dashboards

### 1. Healthcare Safety Dashboard (Critical - 100% Data)

```json
{
  "name": "Ask Eve Healthcare Safety Dashboard",
  "widgets": [
    {
      "title": "Crisis Response Times",
      "query": "customMetrics | where name == 'crisis_response_time_ms' | summarize avg(value) by bin(timestamp, 1h)",
      "target": "<500ms",
      "alertThreshold": 500,
      "criticality": "high"
    },
    {
      "title": "Emergency Escalations",
      "query": "customEvents | where name == 'EmergencyContactTriggered' | summarize count() by bin(timestamp, 1h)",
      "healthcareCompliance": true
    },
    {
      "title": "Nurse Handoff Success Rate",
      "query": "customMetrics | where name == 'nurse_escalation_success' | summarize avg(value) * 100",
      "target": ">95%",
      "criticalForHealthcare": true
    },
    {
      "title": "MHRA Compliance Violations",
      "query": "customMetrics | where name == 'mhra_compliance_violation' | summarize count() by violation_type",
      "alertOnAny": true
    }
  ],
  "refreshInterval": "1m",
  "dataRetention": "30d",
  "costOptimized": false
}
```

### 2. System Performance Dashboard (5% Sampling)

```json
{
  "name": "Ask Eve System Performance Dashboard",
  "samplingRate": "5%",
  "widgets": [
    {
      "title": "Response Times (Sampled)",
      "query": "requests | where customDimensions.sampled == 'true' | summarize avg(duration)",
      "costOptimized": true
    },
    {
      "title": "Error Rate Trends",
      "query": "exceptions | sample 5 | summarize count() by bin(timestamp, 1h)",
      "sampling": "5%"
    },
    {
      "title": "OpenAI Token Usage",
      "query": "customMetrics | where name == 'openai_tokens_used' and customDimensions.sampled == 'true'",
      "costMonitoring": true
    },
    {
      "title": "Azure Services Health",
      "query": "dependencies | where success == false | sample 5",
      "essentialOnly": true
    }
  ],
  "refreshInterval": "5m",
  "dataRetention": "30d",
  "costOptimized": true
}
```

### 3. Cost Monitoring Dashboard

```json
{
  "name": "Ask Eve Cost Monitoring Dashboard",
  "purpose": "Track cost optimization effectiveness",
  "widgets": [
    {
      "title": "Monthly Cost Projection",
      "query": "customMetrics | where name startswith 'cost_' | summarize sum(value) by bin(timestamp, 1d)",
      "target": "£16-23/month"
    },
    {
      "title": "Application Insights Usage",
      "query": "union * | summarize ingestion_gb = sum(estimate_data_size()) / 1000000000",
      "target": "<500MB/month",
      "costOptimization": "70% reduction achieved"
    },
    {
      "title": "Telemetry Sampling Effectiveness",
      "query": "customEvents | summarize sampled_events = countif(customDimensions.sampled == 'true'), total_events = count()",
      "targetSamplingRate": "5%"
    },
    {
      "title": "Critical Events Collection Rate",
      "query": "customEvents | where customDimensions.criticality == 'high' | summarize count()",
      "mustBe": "100%"
    }
  ]
}
```

## 🚨 Smart Alerting Strategy

### 1. Healthcare-Critical Alerts (Immediate)

```typescript
export const HEALTHCARE_CRITICAL_ALERTS = {
  crisisResponseTime: {
    metric: 'crisis_response_time_ms',
    threshold: 500,
    severity: 'critical',
    action: 'immediate_escalation',
    notification: ['emergency-team@wearelevel.ai', 'healthcare-lead@wearelevel.ai'],
    description: 'Crisis response time exceeded 500ms safety requirement'
  },
  
  nurseEscalationFailure: {
    metric: 'nurse_escalation_success',
    threshold: 0.95,
    operator: 'less_than',
    severity: 'high',
    action: 'investigate_immediately',
    healthcareImpact: 'critical'
  },
  
  mhraComplianceViolation: {
    event: 'mhra_compliance_violation',
    threshold: 1,
    operator: 'greater_than_or_equal',
    severity: 'critical',
    action: 'immediate_review',
    complianceRequirement: true
  },
  
  systemUnavailable: {
    metric: 'availability_percentage',
    threshold: 99.9,
    operator: 'less_than',
    severity: 'critical',
    healthcareService: 'must_be_available'
  }
};
```

### 2. Cost Optimization Alerts

```typescript
export const COST_OPTIMIZATION_ALERTS = {
  monthlyBudgetExceeded: {
    metric: 'monthly_cost_projection',
    threshold: 23, // £23 upper limit
    severity: 'warning',
    action: 'review_usage_patterns',
    costOptimization: true
  },
  
  telemetrySamplingFailure: {
    metric: 'sampling_rate_actual',
    threshold: 0.07, // 7% (allow 2% variance from 5% target)
    operator: 'greater_than',
    severity: 'warning',
    action: 'adjust_sampling_configuration'
  },
  
  appInsightsOveruse: {
    metric: 'app_insights_data_ingestion_gb',
    threshold: 0.5, // 500MB monthly limit
    severity: 'warning',
    costImpact: 'potential_budget_overrun'
  }
};
```

## 🛠️ Implementation Guide

### 1. Application Insights Configuration

```typescript
// Cost-optimized Application Insights setup
import { ApplicationInsights } from '@azure/monitor-opentelemetry-exporter';

export class CostOptimizedMonitoring {
  private appInsights: ApplicationInsights;
  private telemetryFilter: CostOptimizedTelemetryFilter;
  
  constructor() {
    this.appInsights = new ApplicationInsights({
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
      
      // Cost optimization settings
      samplingPercentage: 5, // 5% standard sampling
      maxBatchSize: 100,     // Reduce batch sizes
      maxBatchIntervalMs: 10000, // 10s batching
      
      // Data retention optimization
      retentionInDays: 30,   // vs 90 days default
      
      // Disable expensive features
      enableAutoCollectExceptions: true,      // Keep for healthcare safety
      enableAutoCollectPerformance: false,   // Disable expensive perf counters
      enableAutoCollectDependencies: true,   // Keep for service monitoring
      enableAutoCollectConsole: false,       // Disable console logging
      
      // Healthcare-specific configuration
      enableCriticalEventsBypass: true,
      healthcareComplianceMode: true
    });
    
    this.telemetryFilter = new CostOptimizedTelemetryFilter();
    this.setupHealthcareMonitoring();
  }
  
  private setupHealthcareMonitoring() {
    // Override sampling for healthcare-critical events
    this.appInsights.addTelemetryProcessor((envelope) => {
      const eventType = envelope.data?.baseType;
      const eventData = envelope.data?.baseData;
      
      // Always collect healthcare-critical events
      if (this.telemetryFilter.shouldCollectTelemetry(eventType, eventData)) {
        envelope.sampleRate = 100; // 100% collection
        envelope.tags['ai.operation.parentId'] = 'healthcare-critical';
        return true;
      }
      
      // Apply 5% sampling to standard events
      return Math.random() < 0.05;
    });
  }
}
```

### 2. Dashboard Deployment

```bash
#!/bin/bash
# Deploy cost-optimized monitoring dashboards

echo "🚀 Deploying cost-optimized monitoring dashboards..."

# Create resource group for monitoring (if not exists)
az group create --name rg-askeve-monitoring --location uksouth

# Deploy cost-optimized Application Insights
az deployment group create \
  --resource-group rg-askeve-monitoring \
  --template-file deploy/cost-optimized-monitoring-template.json \
  --parameters \
    appInsightsName="askeve-insights-cost-optimized" \
    samplingPercentage=5 \
    retentionInDays=30 \
    workspaceResourceId="/subscriptions/.../workspaces/askeve-logs"

# Import healthcare safety dashboard
az portal dashboard import \
  --input-path monitoring/healthcare-safety-dashboard.json \
  --resource-group rg-askeve-monitoring \
  --name "Ask Eve Healthcare Safety Dashboard"

# Import cost monitoring dashboard  
az portal dashboard import \
  --input-path monitoring/cost-monitoring-dashboard.json \
  --resource-group rg-askeve-monitoring \
  --name "Ask Eve Cost Monitoring Dashboard"

# Setup healthcare-critical alerts
az monitor metrics alert create \
  --name "Crisis Response Time Alert" \
  --resource-group rg-askeve-monitoring \
  --target-resource-id "/subscriptions/.../components/askeve-insights-cost-optimized" \
  --condition "avg customMetrics/crisis_response_time_ms > 500" \
  --severity 0 \
  --action-group-ids "/subscriptions/.../actionGroups/healthcare-critical-alerts"

echo "✅ Cost-optimized monitoring deployed successfully"
echo "💰 Expected cost: £2-4/month (70% reduction achieved)"
```

### 3. Cost Monitoring Script

```typescript
// scripts/monitor-application-insights-costs.ts
export class ApplicationInsightsCostMonitor {
  
  async analyzeMonthlyCosts(): Promise<CostAnalysis> {
    const usage = await this.getApplicationInsightsUsage();
    const projection = this.calculateMonthlyCostProjection(usage);
    
    return {
      currentSpend: projection.currentMonthly,
      projectedSpend: projection.endOfMonth,
      targetBudget: 4, // £4 monthly target
      costOptimizationStatus: projection.currentMonthly <= 4 ? 'on-track' : 'over-budget',
      
      breakdown: {
        dataIngestion: projection.dataIngestionCost,
        dataRetention: projection.dataRetentionCost,
        alerts: projection.alertsCost,
        dashboards: projection.dashboardsCost
      },
      
      recommendations: this.generateCostOptimizationRecommendations(projection)
    };
  }
  
  private generateCostOptimizationRecommendations(projection: any): string[] {
    const recommendations: string[] = [];
    
    if (projection.samplingRate > 0.07) {
      recommendations.push('Reduce sampling rate to 5% or lower');
    }
    
    if (projection.dataIngestionGB > 0.5) {
      recommendations.push('Increase telemetry filtering for non-critical events');
    }
    
    if (projection.retentionDays > 30) {
      recommendations.push('Reduce data retention to 30 days for GDPR compliance');
    }
    
    return recommendations;
  }
}

// Usage monitoring
const costMonitor = new ApplicationInsightsCostMonitor();
const analysis = await costMonitor.analyzeMonthlyCosts();

if (analysis.costOptimizationStatus === 'over-budget') {
  console.warn('⚠️ Application Insights costs exceeding £4/month target');
  console.log('Recommendations:', analysis.recommendations);
} else {
  console.log('✅ Application Insights costs on track: £' + analysis.currentSpend + '/month');
}
```

## 📊 Expected Results

### Cost Savings
- **Application Insights**: £10-15 → £2-4/month (70% reduction)
- **Data ingestion**: Reduced by 90% through 5% sampling
- **Data retention**: Reduced by 67% (90 days → 30 days)
- **Custom dashboards**: Focused on 3 essential dashboards vs 10+ detailed views

### Healthcare Compliance Maintained
- ✅ **100% crisis detection monitoring**: All safety events captured
- ✅ **MHRA compliance tracking**: All violation events logged
- ✅ **Nurse escalation monitoring**: 100% handoff tracking
- ✅ **Audit trail**: Complete compliance event logging
- ✅ **Real-time alerts**: Healthcare-critical events trigger immediately

### Monitoring Quality
- **Essential metrics preserved**: All healthcare-critical monitoring maintained
- **Smart sampling**: 5% standard + 100% critical events
- **Targeted dashboards**: Healthcare safety, system performance, cost monitoring
- **Intelligent alerting**: Critical healthcare events + cost optimization alerts

## 🎯 Implementation Checklist

- [ ] Deploy cost-optimized Application Insights configuration
- [ ] Implement intelligent telemetry filtering (5% sampling + 100% critical)
- [ ] Create healthcare safety dashboard with real-time crisis monitoring
- [ ] Setup cost monitoring dashboard with budget tracking
- [ ] Configure healthcare-critical alerts (<500ms crisis response, MHRA violations)
- [ ] Deploy smart alerting for cost optimization (budget overrun, sampling failures)
- [ ] Test crisis event collection (verify 100% capture rate)
- [ ] Validate cost reduction (target £2-4/month achieved)
- [ ] Setup monthly cost monitoring and reporting

## 🏥 Healthcare Impact

This cost-optimized monitoring strategy ensures **Ask Eve Assist maintains healthcare safety while achieving 70% cost reduction**:

- **Crisis response times** monitored at 100% collection rate
- **MHRA compliance violations** immediately detected and alerted
- **Nurse escalation workflows** fully tracked for healthcare continuity
- **System availability** monitored for 99.9% uptime requirement
- **Cost optimization** achieved without compromising patient safety

**💰 Result: £8-11/month savings while maintaining healthcare-grade monitoring standards**