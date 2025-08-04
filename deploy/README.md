# Ask Eve Assist - Deployment Guide

## 🏗️ Infrastructure Agent Deployment

I am the Infrastructure Agent for Ask Eve Assist. This deployment guide provides everything needed to deploy the Azure infrastructure under £50/month with comprehensive cost monitoring and alerts.

## 🎯 Quick Start

### Prerequisites
- Azure CLI installed and authenticated
- Azure subscription with appropriate permissions
- UK region access (uksouth/ukwest)
- Email address for monitoring alerts

### 1. Deploy Production Environment

```bash
# Clone repository
git clone <repository-url>
cd AEA-dev.wearelevel.ai

# Make scripts executable
chmod +x deploy/scripts/*.sh

# Deploy production infrastructure
./deploy/scripts/deploy.sh \
  --environment prod \
  --resource-group "rg-askeve-prod" \
  --subscription "your-subscription-id" \
  --email "your-alerts@email.com"
```

### 2. Verify Cost Monitoring

```bash
# Check budget alerts are configured
az consumption budget list --resource-group "rg-askeve-prod"

# Verify alerts at £40, £45, £48 thresholds
az monitor action-group list --resource-group "rg-askeve-prod"
```

## 📊 Cost Architecture (Under £50/Month)

| Component | Tier | Est. Cost | Justification |
|-----------|------|-----------|---------------|
| App Service | B1 Basic | £10 | Always-on for reliability |
| AI Search | Free | £0 | 50MB/10K docs sufficient |
| Storage | Standard_LRS | £2 | Local redundancy adequate |
| Cosmos DB | Serverless | £5 | Pay-per-request model |
| App Insights | 10% sampling | £5 | Cost-controlled monitoring |
| Azure OpenAI | gpt-4o-mini | £25 | Primary cost component |
| Key Vault | Standard | £1 | Essential security |
| Log Analytics | 30d retention | £1 | Centralized logging |
| **TOTAL** | | **£49** | Under £50 target ✅ |

## 🚨 Cost Alerts Configuration

- **£40 Alert (80%)**: Warning - Reduce sampling, review usage
- **£45 Alert (90%)**: Critical - Rate limit OpenAI, alert on-call  
- **£48 Alert (96%)**: Emergency - Disable non-essential features

## 📁 File Structure

```
deploy/
├── arm-template.json              # Main infrastructure template
├── parameters/
│   ├── dev.parameters.json        # Development config (£25 budget)
│   ├── staging.parameters.json    # Staging config (£35 budget)
│   └── prod.parameters.json       # Production config (£50 budget)
└── scripts/
    ├── deploy.sh                  # Main deployment script
    ├── migrate.sh                 # Migration toolkit
    └── backup.sh                  # Backup automation

monitoring/
├── cost-alerts.json               # Budget monitoring template
├── alerts.json                    # Performance/safety alerts
├── dashboards.json                # Azure dashboard template
└── queries.kusto                  # Log Analytics queries

infrastructure/
├── cost-optimization.json         # Cost control strategies
├── scaling-rules.json             # Auto-scaling configuration
├── backup-policy.json             # Disaster recovery policy
└── security-config.json           # Security configuration

.github/workflows/
├── ci.yml                         # Continuous integration
├── cd-staging.yml                 # Staging deployment
└── cd-production.yml              # Production deployment
```

## 🔧 Deployment Commands

### Environment-Specific Deployments

```bash
# Development (£25 budget)
./deploy/scripts/deploy.sh -e dev -g "rg-askeve-dev" -s "subscription-id" -m "dev-alerts@email.com"

# Staging (£35 budget)  
./deploy/scripts/deploy.sh -e staging -g "rg-askeve-staging" -s "subscription-id" -m "staging-alerts@email.com"

# Production (£50 budget)
./deploy/scripts/deploy.sh -e prod -g "rg-askeve-prod" -s "subscription-id" -m "prod-alerts@email.com"
```

### Manual ARM Template Deployment

```bash
# Create resource group
az group create --name "rg-askeve-prod" --location "uksouth"

# Deploy infrastructure
az deployment group create \
  --resource-group "rg-askeve-prod" \
  --template-file deploy/arm-template.json \
  --parameters @deploy/parameters/prod.parameters.json \
  --parameters alertEmail="your-email@domain.com"

# Deploy cost monitoring
az deployment group create \
  --resource-group "rg-askeve-prod" \
  --template-file monitoring/cost-alerts.json \
  --parameters resourceGroupName="rg-askeve-prod" \
  --parameters alertEmail="your-email@domain.com" \
  --parameters environment="prod"
```

## 🔐 Security Configuration

### Key Vault Secrets Setup

```bash
# Get Key Vault name from deployment output
KEY_VAULT_NAME=$(az deployment group show \
  --resource-group "rg-askeve-prod" \
  --name "your-deployment-name" \
  --query "properties.outputs.keyVaultName.value" -o tsv)

# Configure secrets
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "openai-api-key" --value "your-openai-key"
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "teams-webhook-url" --value "your-teams-webhook"
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "eve-appeal-api-key" --value "your-eve-appeal-key"
```

### UK Data Residency Compliance

All resources are deployed to UK regions only:
- Primary: UK South (`uksouth`)
- Secondary: UK West (`ukwest`)
- No cross-border data transfers
- Compliance validated in CI/CD pipeline

## 📈 Monitoring & Alerting

### Health Monitoring Queries

```kusto
// Application Health Status
requests
| where timestamp > ago(1h)
| summarize 
    TotalRequests = count(),
    SuccessRate = countif(success == true) * 100.0 / count(),
    AvgResponseTime = avg(duration)

// Safety System Monitoring (CRITICAL)
exceptions
| where outerMessage contains "Safety" or outerMessage contains "Escalation"
| project timestamp, message, outerMessage
| order by timestamp desc

// Cost Control - OpenAI Usage
dependencies
| where name contains "openai"
| summarize 
    RequestCount = count(),
    TotalTokens = sum(toint(customDimensions.tokens_used))
    by bin(timestamp, 1h)
```

### Dashboard Access

After deployment, access the monitoring dashboard:
```
https://portal.azure.com/#@your-tenant-id/dashboard/arm/subscriptions/your-subscription-id/resourceGroups/rg-askeve-prod/providers/Microsoft.Portal/dashboards/your-dashboard-id
```

## 🔄 Migration & Backup

### Export Current Environment

```bash
# Export infrastructure configuration
./deploy/scripts/migrate.sh export \
  --source-rg "rg-askeve-old" \
  --source-sub "old-subscription-id" \
  --environment "prod" \
  --backup-location "./migration-backup"
```

### Backup Operations

```bash
# Create comprehensive backup
./deploy/scripts/backup.sh backup \
  --resource-group "rg-askeve-prod" \
  --subscription "subscription-id" \
  --environment "prod" \
  --backup-location "./backups"

# List available backups
./deploy/scripts/backup.sh list --backup-location "./backups"

# Cleanup old backups (30 day retention)
./deploy/scripts/backup.sh cleanup --backup-location "./backups" --retention 30
```

## 🚀 CI/CD Pipeline

### GitHub Actions Setup

1. **Configure Secrets:**
   ```
   AZURE_CREDENTIALS_PRODUCTION     # Service principal for prod
   AZURE_CREDENTIALS_STAGING        # Service principal for staging  
   AZURE_CREDENTIALS_VALIDATION     # Service principal for validation
   OPENAI_API_KEY_PRODUCTION        # Production OpenAI key
   TEAMS_WEBHOOK_PRODUCTION         # Production Teams webhook
   ALERT_EMAIL_PRODUCTION           # Production alert email
   ```

2. **Workflow Triggers:**
   - `ci.yml`: All pushes and PRs (validation, testing, cost checks)
   - `cd-staging.yml`: Push to `develop` branch
   - `cd-production.yml`: Push to `main` branch or manual trigger

3. **Deployment Validation:**
   - Template validation
   - Cost estimation 
   - Security compliance checks
   - UK data residency validation

## ⚠️ Emergency Procedures

### Cost Emergency (Approaching £48)
1. Immediate SMS/email alerts to all team members
2. Reduce OpenAI rate limits to minimum
3. Disable non-essential Application Insights sampling
4. Consider temporary service degradation mode
5. Manual approval required for high-cost operations

### Service Outage
1. Check health endpoint: `https://your-app.azurewebsites.net/health`
2. Review Application Insights for errors
3. Check Azure service health status
4. Implement emergency contact procedures
5. Notify The Eve Appeal within 1 hour for service impacts

### Security Incident
1. Isolate affected systems immediately
2. Preserve forensic evidence
3. Notify security team and stakeholders
4. Contact The Eve Appeal within 1 hour
5. Begin containment and remediation
6. Document incident timeline

## 📞 Support Contacts

- **Infrastructure Team**: infrastructure@wearelevel.ai
- **On-call Engineer**: Available via Azure monitoring alerts
- **The Eve Appeal**: emergency@eveappeal.org.uk
- **Azure Support**: Priority/Severity A for production issues

## 🔍 Troubleshooting

### Common Issues

1. **Deployment Fails - Budget Not Found**
   ```bash
   # Budget resource requires subscription-level permissions
   az role assignment create \
     --assignee "service-principal-id" \
     --role "Contributor" \
     --scope "/subscriptions/subscription-id"
   ```

2. **Key Vault Access Denied**
   ```bash
   # Ensure managed identity has correct permissions
   az keyvault set-policy \
     --name "key-vault-name" \
     --object-id "managed-identity-object-id" \
     --secret-permissions get list
   ```

3. **Cost Alerts Not Working**
   ```bash
   # Verify action group configuration
   az monitor action-group show \
     --resource-group "rg-askeve-prod" \
     --name "askeve-prod-alerts"
   ```

### Validation Commands

```bash
# Check all resources deployed
az resource list --resource-group "rg-askeve-prod" --output table

# Verify budget configuration  
az consumption budget show \
  --resource-group-name "rg-askeve-prod" \
  --budget-name "askeve-prod-budget"

# Test application health
curl -f https://your-app.azurewebsites.net/health

# Check cost monitoring
az monitor metrics list \
  --resource "/subscriptions/sub-id/resourceGroups/rg-askeve-prod" \
  --metric "Cost"
```

## ✅ Post-Deployment Checklist

- [ ] All resources deployed successfully
- [ ] Health endpoint returns 200 OK
- [ ] Budget alerts configured at £40, £45, £48
- [ ] Key Vault secrets populated
- [ ] UK data residency compliance verified
- [ ] Application Insights receiving telemetry
- [ ] Cost monitoring dashboard accessible
- [ ] Emergency contact procedures tested
- [ ] Backup strategy implemented
- [ ] Team notified of deployment completion

---

**🏥 Remember: This is a life-critical health service. Every deployment must maintain the highest standards of reliability, security, and compliance. Monitor closely for the first 24 hours after any production deployment.**

Generated by Ask Eve Assist Infrastructure Agent  
Deployment Date: $(date)  
Cost Target: Under £50/month ✅  
UK Compliance: Enforced ✅  
Safety Systems: Validated ✅