# Ask Eve Assist - Production Monitoring Guide 📊

**Last Updated**: August 8, 2025  
**Environment**: Production (Azure Container Apps)  
**Production URL**: https://askeve-container-app.calmdesert-7b431664.uksouth.azurecontainerapps.io

---

## 🔍 Monitoring Overview

Ask Eve Assist production environment includes comprehensive monitoring across performance, costs, security, and healthcare compliance. This guide provides access information and operational procedures for production monitoring.

---

## 📈 Application Insights Dashboard

### **Primary Monitoring Service**
- **Service Name**: `askeve-prod-insights`
- **Resource Group**: `rg-askeve-prod`
- **Instrumentation Key**: `7ccced80-cd9a-4d21-a0c0-287a94d553cd`
- **Region**: UK South

### **Accessing the Dashboard**
1. **Azure Portal**: https://portal.azure.com
2. Navigate to: **Resource Groups** > **rg-askeve-prod** > **askeve-prod-insights**
3. Click **"Overview"** for main dashboard

### **Key Metrics to Monitor**
- **Request Volume**: Total API calls per hour/day
- **Response Time**: Average response times (target: <100ms for non-crisis, <5ms for crisis)
- **Failure Rate**: HTTP 4xx/5xx errors (target: <1%)
- **Crisis Detection Triggers**: Count of crisis responses per day
- **Nurse Escalation Requests**: GDPR workflow completions

---

## 🚨 Alert Configurations

### **Action Group: AskEve-Alerts**
- **Resource ID**: `/subscriptions/77A928D4-42C3-41F2-A481-2AD7602E108A/resourceGroups/rg-askeve-prod/providers/microsoft.insights/actionGroups/AskEve-Alerts`
- **Notification Email**: simon@wearelevel.ai
- **Alert Types**: Metrics, budget, security

### **Active Alerts**
1. **High Request Volume Alert**
   - **Metric**: Requests > 10 per 5-minute window
   - **Severity**: Warning (Level 2)
   - **Purpose**: Detect unusual traffic patterns

2. **Budget Alerts** (via Azure Cost Management)
   - **65% of £25**: £15 threshold warning
   - **85% of £25**: £20 threshold critical
   - **100% of £25**: £25 threshold emergency

### **Adding New Alerts**
```bash
az monitor metrics alert create \
  --name "Alert-Name" \
  --resource-group rg-askeve-prod \
  --scopes /subscriptions/77a928d4-42c3-41f2-a481-2ad7602e108a/resourceGroups/rg-askeve-prod/providers/Microsoft.App/containerapps/askeve-container-app \
  --condition "avg [METRIC] > [THRESHOLD]" \
  --evaluation-frequency 1m \
  --window-size 5m \
  --severity [1-4] \
  --action /subscriptions/77A928D4-42C3-41F2-A481-2AD7602E108A/resourceGroups/rg-askeve-prod/providers/microsoft.insights/actionGroups/AskEve-Alerts
```

---

## 💰 Cost Monitoring

### **Budget Configuration**
- **Budget Name**: AskEve-MonthlyCost
- **Amount**: £25/month
- **Scope**: Resource Group `rg-askeve-prod`
- **Alert Thresholds**: 65%, 85%, 100%

### **Cost Breakdown Monitoring**
| Service | Target Cost | Monitoring Method |
|---------|-------------|-------------------|
| Container Apps | £3-6/month | Azure Cost Analysis |
| AI Search Basic | £19.44/month | Fixed monthly cost |
| Table Storage | £2-5/month | Usage-based tracking |
| Application Insights | £2-4/month | Sampling optimization |
| Blob Storage | £1/month | Minimal usage |

### **Cost Analysis Dashboard**
1. **Azure Portal** > **Cost Management + Billing**
2. **Scope**: Resource Group `rg-askeve-prod`
3. **View**: Monthly costs by service
4. **Alerts**: Budget alert notifications

### **Scale-to-Zero Validation**
Monitor Container Apps scaling:
```bash
az containerapp show \
  --name askeve-container-app \
  --resource-group rg-askeve-prod \
  --query "properties.template.scale"
```

Expected response:
```json
{
  "maxReplicas": 5,
  "minReplicas": 1,
  "rules": null
}
```

---

## 🏥 Healthcare-Specific Monitoring

### **Crisis Detection Metrics**
- **Response Time**: <5ms target for crisis scenarios
- **Detection Accuracy**: Monitor false positives/negatives
- **Emergency Contact Delivery**: 100% success rate expected
- **Teams Webhook Success**: Healthcare team notification rate

### **GDPR Compliance Monitoring**
- **Data Retention**: 30-day TTL validation on Azure Table Storage
- **Consent Workflow**: 7-step escalation completion rates
- **Data Deletion**: Automated cleanup verification

### **MHRA Compliance Checks**
- **Response Content Audit**: No medical advice generation
- **Professional Referrals**: GP consultation recommendation rate
- **Evidence Attribution**: The Eve Appeal source citations

### **Healthcare KPIs Dashboard**
Create custom queries in Application Insights:
```kusto
requests
| where name contains "chat"
| extend isCrisis = tostring(customDimensions.isCrisis)
| summarize 
    TotalRequests = count(),
    CrisisRequests = countif(isCrisis == "true"),
    AvgDuration = avg(duration)
    by bin(timestamp, 1h)
```

---

## 🔒 Security Monitoring

### **Security Metrics**
- **Authentication Failures**: Failed API access attempts
- **Rate Limiting**: Blocked requests per IP
- **Input Validation**: Malicious input attempts blocked
- **HTTPS Enforcement**: 100% encrypted traffic

### **Container Apps Security**
Monitor security events:
```bash
az containerapp logs show \
  --name askeve-container-app \
  --resource-group rg-askeve-prod \
  --filter "level=='Error' or level=='Warning'"
```

### **Network Security**
- **IP Restrictions**: Monitor allowed/blocked IPs
- **CORS Policy**: Cross-origin request validation
- **TLS Configuration**: Certificate status and expiration

---

## 📊 Performance Monitoring

### **Key Performance Indicators**
| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Crisis Detection | <5ms | >100ms |
| Regular Queries | <100ms | >500ms |
| Health Check | <50ms | >200ms |
| Memory Usage | <80% | >95% |
| CPU Usage | <70% | >90% |

### **Performance Queries**
Monitor response times by endpoint:
```kusto
requests
| where url contains "api/chat"
| summarize 
    avg(duration),
    percentile(duration, 95),
    percentile(duration, 99)
    by bin(timestamp, 5m)
```

### **Scaling Metrics**
Monitor Container Apps scaling events:
```kusto
ContainerAppSystemLogs_CL
| where Log_s contains "scaling"
| project TimeGenerated, Log_s
```

---

## 🚨 Incident Response Procedures

### **Alert Response Workflow**
1. **Immediate Response** (0-5 minutes)
   - Acknowledge alert in Azure Portal
   - Check production health endpoint: `/health`
   - Verify crisis detection functionality

2. **Assessment** (5-15 minutes)
   - Review Application Insights dashboard
   - Check Container Apps logs for errors
   - Validate scaling and resource availability

3. **Escalation** (if required)
   - Contact technical team
   - Implement emergency fallback if needed
   - Document incident for post-mortem

### **Common Issues & Solutions**

#### **High Response Times**
```bash
# Check current scaling
az containerapp show --name askeve-container-app --resource-group rg-askeve-prod --query "properties.runningStatus"

# Force restart if needed
az containerapp revision restart --revision [REVISION-NAME] --resource-group rg-askeve-prod
```

#### **Crisis Detection Failure**
1. Test crisis endpoint directly:
```bash
curl -X POST https://askeve-container-app.calmdesert-7b431664.uksouth.azurecontainerapps.io/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I want to kill myself", "userId": "test", "conversationId": "test"}'
```

2. Expected response should include `"isCrisis": true` and emergency contacts

#### **Budget Exceeded**
1. Check cost breakdown in Azure Cost Analysis
2. Verify scale-to-zero configuration
3. Review Application Insights sampling rate
4. Consider optimizing Azure AI Search queries

---

## 📋 Daily Operations Checklist

### **Daily Health Checks** (5 minutes)
- [ ] Verify production URL responds: https://askeve-container-app.calmdesert-7b431664.uksouth.azurecontainerapps.io/health
- [ ] Check Application Insights for errors in last 24 hours
- [ ] Verify crisis detection working with test query
- [ ] Review cost trends in Azure portal

### **Weekly Reviews** (15 minutes)
- [ ] Analyze response time trends
- [ ] Review crisis detection statistics
- [ ] Check budget vs actual costs
- [ ] Validate GDPR data cleanup (30-day TTL)
- [ ] Review security logs for anomalies

### **Monthly Tasks** (30 minutes)
- [ ] Full cost analysis and optimization
- [ ] Performance trend analysis
- [ ] Security audit and review
- [ ] Update documentation as needed
- [ ] Review and update alert thresholds

---

## 📞 Emergency Contacts

### **Technical Issues**
- **Primary**: simon@wearelevel.ai
- **Azure Support**: Azure Portal > Help + Support
- **Microsoft 365 SDK**: GitHub Issues or Microsoft documentation

### **Healthcare/Content Issues**
- **The Eve Appeal**: Contact through official channels
- **MHRA Compliance**: Review compliance documentation
- **Crisis Response**: Validate emergency contact delivery (999, NHS 111, Samaritans)

---

## 📚 Additional Resources

- **Azure Container Apps Documentation**: https://docs.microsoft.com/en-us/azure/container-apps/
- **Application Insights Documentation**: https://docs.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview
- **Microsoft 365 Agents SDK**: https://docs.microsoft.com/en-us/microsoftteams/platform/
- **Production Deployment Summary**: [PRODUCTION_DEPLOYMENT_SUMMARY.md](./PRODUCTION_DEPLOYMENT_SUMMARY.md)
- **Healthcare Compliance**: [MHRA Guidelines](https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency)

---

**This monitoring guide ensures Ask Eve Assist maintains optimal performance, cost efficiency, and healthcare compliance in production.** 📊✅