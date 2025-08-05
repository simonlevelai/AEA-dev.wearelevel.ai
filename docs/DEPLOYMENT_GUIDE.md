# Ask Eve Assist - Deployment & Migration Guide

## 🚀 Overview

This guide covers deploying Ask Eve Assist to Azure, setting up the content pipeline, and ensuring easy migration between Azure instances. Built for portability and cost-efficiency.

## 📋 Pre-Deployment Checklist

- [ ] Core bot tested locally with emulator
- [ ] Safety systems verified with test suite  
- [ ] Azure subscription ready (UK region)
- [ ] Documents collected and reviewed
- [ ] Nurse team webhook URL obtained
- [ ] Domain/DNS details if using custom domain

## 🏗️ Step 1: Infrastructure Deployment

### 1.1 Quick Deploy Script

Create `deploy/deploy.sh`:

```bash
#!/bin/bash
set -e

# Configuration
RESOURCE_GROUP="rg-askeve-assist-prod"
LOCATION="uksouth"
APP_NAME="askeve-assist"
ENVIRONMENT="production"

echo "🚀 Deploying Ask Eve Assist to Azure..."

# Login check
echo "Checking Azure login..."
az account show > /dev/null 2>&1 || az login

# Create resource group
echo "Creating resource group..."
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# Deploy ARM template
echo "Deploying infrastructure..."
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file ./arm-template.json \
  --parameters appName=$APP_NAME environment=$ENVIRONMENT

# Get outputs
echo "Retrieving deployment outputs..."
APP_URL=$(az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name arm-template \
  --query properties.outputs.appUrl.value -o tsv)

echo "✅ Deployment complete!"
echo "🌐 Bot URL: $APP_URL"
```

### 1.2 Complete ARM Template

Create `deploy/arm-template.json`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "appName": {
      "type": "string",
      "metadata": {
        "description": "Name for the bot application"
      }
    },
    "environment": {
      "type": "string",
      "defaultValue": "production",
      "allowedValues": ["development", "staging", "production"]
    }
  },
  "variables": {
    "appServicePlanName": "[concat(parameters('appName'), '-plan')]",
    "appInsightsName": "[concat(parameters('appName'), '-insights')]",
    "searchServiceName": "[concat(parameters('appName'), '-search')]",
    "storageAccountName": "[replace(concat(parameters('appName'), 'storage'), '-', '')]",
    "cosmosAccountName": "[concat(parameters('appName'), '-cosmos')]",
    "keyVaultName": "[concat(parameters('appName'), '-kv')]"
  },
  "resources": [
    {
      "type": "Microsoft.Web/serverfarms",
      "apiVersion": "2022-03-01",
      "name": "[variables('appServicePlanName')]",
      "location": "[resourceGroup().location]",
      "sku": {
        "name": "B1",
        "tier": "Basic"
      },
      "properties": {
        "reserved": true
      }
    },
    {
      "type": "Microsoft.Web/sites",
      "apiVersion": "2022-03-01",
      "name": "[parameters('appName')]",
      "location": "[resourceGroup().location]",
      "identity": {
        "type": "SystemAssigned"
      },
      "dependsOn": [
        "[resourceId('Microsoft.Web/serverfarms', variables('appServicePlanName'))]"
      ],
      "properties": {
        "serverFarmId": "[resourceId('Microsoft.Web/serverfarms', variables('appServicePlanName'))]",
        "siteConfig": {
          "linuxFxVersion": "NODE|20-lts",
          "alwaysOn": true,
          "healthCheckPath": "/health",
          "appSettings": [
            {
              "name": "APPLICATIONINSIGHTS_CONNECTION_STRING",
              "value": "[reference(resourceId('Microsoft.Insights/components', variables('appInsightsName'))).ConnectionString]"
            },
            {
              "name": "NODE_ENV",
              "value": "[parameters('environment')]"
            }
          ]
        }
      }
    },
    {
      "type": "Microsoft.Search/searchServices",
      "apiVersion": "2022-09-01",
      "name": "[variables('searchServiceName')]",
      "location": "[resourceGroup().location]",
      "sku": {
        "name": "free"
      },
      "properties": {
        "replicaCount": 1,
        "partitionCount": 1
      }
    },
    {
      "type": "Microsoft.Storage/storageAccounts",
      "apiVersion": "2022-09-01",
      "name": "[variables('storageAccountName')]",
      "location": "[resourceGroup().location]",
      "sku": {
        "name": "Standard_LRS"
      },
      "kind": "StorageV2",
      "properties": {
        "supportsHttpsTrafficOnly": true,
        "minimumTlsVersion": "TLS1_2"
      }
    },
    {
      "type": "Microsoft.DocumentDB/databaseAccounts",
      "apiVersion": "2022-08-15",
      "name": "[variables('cosmosAccountName')]",
      "location": "[resourceGroup().location]",
      "properties": {
        "databaseAccountOfferType": "Standard",
        "capabilities": [
          {
            "name": "EnableServerless"
          }
        ],
        "locations": [
          {
            "locationName": "[resourceGroup().location]",
            "failoverPriority": 0
          }
        ]
      }
    },
    {
      "type": "Microsoft.Insights/components",
      "apiVersion": "2020-02-02",
      "name": "[variables('appInsightsName')]",
      "location": "[resourceGroup().location]",
      "kind": "web",
      "properties": {
        "Application_Type": "web",
        "SamplingPercentage": 10
      }
    },
    {
      "type": "Microsoft.KeyVault/vaults",
      "apiVersion": "2022-07-01",
      "name": "[variables('keyVaultName')]",
      "location": "[resourceGroup().location]",
      "properties": {
        "sku": {
          "family": "A",
          "name": "standard"
        },
        "tenantId": "[subscription().tenantId]",
        "accessPolicies": []
      }
    }
  ],
  "outputs": {
    "appUrl": {
      "type": "string",
      "value": "[concat('https://', reference(resourceId('Microsoft.Web/sites', parameters('appName'))).defaultHostName)]"
    },
    "searchEndpoint": {
      "type": "string",
      "value": "[concat('https://', variables('searchServiceName'), '.search.windows.net')]"
    }
  }
}
```

## 📚 Step 2: Content Pipeline Setup

### 2.1 Document Ingestion Service

Create `scripts/ingest-content.ts`:

```typescript
import { SearchClient, SearchIndexClient, AzureKeyCredential } from '@azure/search-documents';
import { BlobServiceClient } from '@azure/storage-blob';
import * as mammoth from 'mammoth';
import * as pdf from 'pdf-parse';
import * as cheerio from 'cheerio';

interface ContentDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  sourceUrl?: string;
  lastUpdated: Date;
  contentVector?: number[];
}

export class ContentIngestionService {
  private searchClient: SearchClient<ContentDocument>;
  private indexClient: SearchIndexClient;
  private blobClient: BlobServiceClient;

  constructor() {
    const searchEndpoint = process.env.SEARCH_ENDPOINT!;
    const searchKey = process.env.SEARCH_API_KEY!;
    
    this.indexClient = new SearchIndexClient(
      searchEndpoint,
      new AzureKeyCredential(searchKey)
    );
    
    this.searchClient = new SearchClient(
      searchEndpoint,
      'askeve-content',
      new AzureKeyCredential(searchKey)
    );
    
    this.blobClient = BlobServiceClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING!
    );
  }

  async initializeIndex(): Promise<void> {
    const indexDefinition = {
      name: 'askeve-content',
      fields: [
        { name: 'id', type: 'Edm.String', key: true },
        { name: 'title', type: 'Edm.String', searchable: true },
        { name: 'content', type: 'Edm.String', searchable: true },
        { name: 'source', type: 'Edm.String', filterable: true },
        { name: 'sourceUrl', type: 'Edm.String' },
        { name: 'lastUpdated', type: 'Edm.DateTimeOffset', filterable: true },
        { 
          name: 'contentVector', 
          type: 'Collection(Edm.Single)', 
          searchable: true,
          vectorSearchDimensions: 1536,
          vectorSearchConfiguration: 'default'
        }
      ],
      semanticConfiguration: {
        name: 'default',
        prioritizedFields: {
          titleField: { fieldName: 'title' },
          prioritizedContentFields: [{ fieldName: 'content' }]
        }
      }
    };
    
    await this.indexClient.createOrUpdateIndex(indexDefinition);
    console.log('✅ Search index initialized');
  }

  async ingestDocuments(folderPath: string): Promise<void> {
    console.log('📁 Ingesting documents from SharePoint...');
    
    const containerClient = this.blobClient.getContainerClient('documents');
    
    for await (const blob of containerClient.listBlobsFlat()) {
      if (blob.name.endsWith('.docx') || blob.name.endsWith('.pdf')) {
        await this.processDocument(blob.name);
      }
    }
    
    console.log('✅ Document ingestion complete');
  }

  private async processDocument(blobName: string): Promise<void> {
    try {
      const containerClient = this.blobClient.getContainerClient('documents');
      const blobClient = containerClient.getBlobClient(blobName);
      const buffer = await blobClient.downloadToBuffer();
      
      let content = '';
      let title = blobName.replace(/\.[^/.]+$/, '');
      
      if (blobName.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } else if (blobName.endsWith('.pdf')) {
        const result = await pdf(buffer);
        content = result.text;
      }
      
      // Chunk the content
      const chunks = this.chunkContent(content, title);
      
      // Upload to search index
      await this.searchClient.uploadDocuments(chunks);
      
      console.log(`✅ Processed: ${blobName} (${chunks.length} chunks)`);
      
    } catch (error) {
      console.error(`❌ Error processing ${blobName}:`, error);
    }
  }

  private chunkContent(content: string, source: string): ContentDocument[] {
    const CHUNK_SIZE = 1000; // characters
    const OVERLAP = 200;
    const chunks: ContentDocument[] = [];
    
    // Split into paragraphs first
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > CHUNK_SIZE) {
        // Save current chunk
        chunks.push({
          id: `${source}-chunk-${chunkIndex}`,
          title: source,
          content: currentChunk.trim(),
          source: source,
          lastUpdated: new Date()
        });
        
        // Start new chunk with overlap
        currentChunk = currentChunk.slice(-OVERLAP) + '\n\n' + paragraph;
        chunkIndex++;
      } else {
        currentChunk += '\n\n' + paragraph;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `${source}-chunk-${chunkIndex}`,
        title: source,
        content: currentChunk.trim(),
        source: source,
        lastUpdated: new Date()
      });
    }
    
    return chunks;
  }

  async crawlWebsite(): Promise<void> {
    console.log('🌐 Crawling Eve Appeal website...');
    
    const baseUrl = 'https://eveappeal.org.uk';
    const visitedUrls = new Set<string>();
    const urlsToVisit = [baseUrl];
    
    while (urlsToVisit.length > 0) {
      const url = urlsToVisit.pop()!;
      
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);
      
      try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Extract content
        const title = $('h1').first().text() || $('title').text();
        const content = $('main, article, .content')
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        
        if (content.length > 100) {
          const chunks = this.chunkContent(content, title);
          await this.searchClient.uploadDocuments(
            chunks.map(chunk => ({
              ...chunk,
              sourceUrl: url
            }))
          );
          
          console.log(`✅ Indexed: ${url}`);
        }
        
        // Find more URLs (limit to same domain)
        $('a[href]').each((_, elem) => {
          const href = $(elem).attr('href');
          if (href?.startsWith('/')) {
            const fullUrl = baseUrl + href;
            if (!visitedUrls.has(fullUrl)) {
              urlsToVisit.push(fullUrl);
            }
          }
        });
        
      } catch (error) {
        console.error(`❌ Error crawling ${url}:`, error);
      }
      
      // Be polite - don't hammer the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ Website crawl complete. Indexed ${visitedUrls.size} pages`);
  }
}

// Run ingestion
async function main() {
  const service = new ContentIngestionService();
  
  // Initialize index
  await service.initializeIndex();
  
  // Ingest documents
  await service.ingestDocuments('/documents');
  
  // Crawl website
  await service.crawlWebsite();
}

if (require.main === module) {
  main().catch(console.error);
}
```

### 2.2 Content Refresh Automation

Create `scripts/refresh-content.ts`:

```typescript
import { ContentIngestionService } from './ingest-content';
import { TeamsConnector } from '../src/services/TeamsService';

export class ContentRefreshService {
  private ingestionService: ContentIngestionService;
  private teamsConnector: TeamsConnector;
  
  constructor() {
    this.ingestionService = new ContentIngestionService();
    this.teamsConnector = new TeamsConnector();
  }

  async performDailyRefresh(): Promise<void> {
    console.log('🔄 Starting daily content refresh...');
    const startTime = Date.now();
    const results = {
      websitePages: 0,
      documentsUpdated: 0,
      errors: []
    };
    
    try {
      // Crawl website for changes
      await this.ingestionService.crawlWebsite();
      
      // Check for document updates
      // (In production, this would check SharePoint for modified dates)
      
      const duration = Date.now() - startTime;
      
      // Notify team
      await this.notifyRefreshComplete(results, duration);
      
    } catch (error) {
      console.error('❌ Refresh failed:', error);
      await this.notifyRefreshError(error);
    }
  }

  private async notifyRefreshComplete(results: any, duration: number): Promise<void> {
    const message = {
      text: '✅ Daily Content Refresh Complete',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.3',
          body: [
            {
              type: 'TextBlock',
              text: 'Content Refresh Summary',
              weight: 'bolder',
              size: 'medium'
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Duration:', value: `${Math.round(duration/1000)}s` },
                { title: 'Pages Updated:', value: results.websitePages.toString() },
                { title: 'Documents:', value: results.documentsUpdated.toString() },
                { title: 'Status:', value: '✅ Success' }
              ]
            }
          ]
        }
      }]
    };
    
    await this.teamsConnector.sendToChannel(message);
  }
}
```

## 🚢 Step 3: Deployment Process

### 3.1 GitHub Actions CI/CD

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AZURE_WEBAPP_NAME: askeve-assist
  NODE_VERSION: '20.x'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
      
    - name: Build application
      run: npm run build
    
    - name: Run security scan
      run: npm audit --production
    
    - name: Login to Azure
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    
    - name: Deploy to Azure Web App
      uses: azure/webapps-deploy@v2
      with:
        app-name: ${{ env.AZURE_WEBAPP_NAME }}
        package: .
        
    - name: Run smoke tests
      run: |
        npm run test:smoke
        
    - name: Notify Teams
      if: always()
      uses: teams-notification-action@v1
      with:
        webhook_url: ${{ secrets.TEAMS_WEBHOOK }}
        status: ${{ job.status }}
```

### 3.2 Environment Configuration

Create `scripts/configure-environment.ts`:

```typescript
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

async function configureEnvironment(environment: string) {
  const keyVaultName = `askeve-assist-kv-${environment}`;
  const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;
  
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(keyVaultUrl, credential);
  
  // Required secrets
  const secrets = [
    'BOT-ID',
    'BOT-PASSWORD',
    'OPENAI-API-KEY',
    'SEARCH-API-KEY',
    'TEAMS-WEBHOOK',
    'STORAGE-CONNECTION-STRING'
  ];
  
  // Set as environment variables
  for (const secretName of secrets) {
    const secret = await client.getSecret(secretName);
    process.env[secretName.replace('-', '_')] = secret.value;
  }
  
  console.log(`✅ Environment configured for ${environment}`);
}
```

## 🔄 Step 4: Migration Process

### 4.1 Export Configuration

Create `scripts/export-config.sh`:

```bash
#!/bin/bash

RESOURCE_GROUP=$1
OUTPUT_FILE="askeve-export-$(date +%Y%m%d-%H%M%S).json"

echo "📦 Exporting Ask Eve configuration..."

# Export ARM template
az group export \
  --resource-group $RESOURCE_GROUP \
  --include-parameter-default-value \
  --include-comments \
  > arm-export.json

# Export App Service settings
az webapp config appsettings list \
  --resource-group $RESOURCE_GROUP \
  --name askeve-assist \
  > appsettings.json

# Export Search index schema
echo "Exporting search schema..."
# (Would use Search API to export schema)

# Package everything
tar -czf $OUTPUT_FILE \
  arm-export.json \
  appsettings.json \
  search-schema.json \
  content/

echo "✅ Export complete: $OUTPUT_FILE"
```

### 4.2 Import to New Environment

Create `scripts/import-config.sh`:

```bash
#!/bin/bash

EXPORT_FILE=$1
NEW_RESOURCE_GROUP=$2
NEW_LOCATION=${3:-uksouth}

echo "📥 Importing Ask Eve to new environment..."

# Extract package
tar -xzf $EXPORT_FILE

# Create new resource group
az group create \
  --name $NEW_RESOURCE_GROUP \
  --location $NEW_LOCATION

# Deploy ARM template
az deployment group create \
  --resource-group $NEW_RESOURCE_GROUP \
  --template-file arm-export.json \
  --parameters location=$NEW_LOCATION

# Restore app settings
az webapp config appsettings set \
  --resource-group $NEW_RESOURCE_GROUP \
  --name askeve-assist \
  --settings @appsettings.json

# Re-index content
npm run content:reindex

echo "✅ Import complete!"
```

## 📊 Step 5: Monitoring Setup

### 5.1 Application Insights Queries

Create `monitoring/queries.kusto`:

```kusto
// Daily Active Users
requests
| where timestamp > ago(1d)
| summarize dcount(user_Id) by bin(timestamp, 1h)
| render timechart

// Source URL Compliance (CRITICAL)
customEvents
| where name == "ContentResponse"
| where timestamp > ago(1d)
| extend hasSourceUrl = tostring(customDimensions.hasSourceUrl)
| summarize 
    total = count(),
    withUrl = countif(hasSourceUrl == "true"),
    withoutUrl = countif(hasSourceUrl == "false")
| project ComplianceRate = todouble(withUrl) / todouble(total) * 100

// Escalation Rate
customEvents
| where name == "Escalation"
| summarize count() by bin(timestamp, 1h), tostring(customDimensions.severity)
| render columnchart

// MHRA Compliance Violations
customEvents
| where name == "MHRA_VIOLATION"
| where timestamp > ago(7d)
| summarize 
    violations = count(),
    by violationType = tostring(customDimensions.violation)
| order by violations desc

// Response Time Percentiles
requests
| where timestamp > ago(1d)
| summarize percentiles(duration, 50, 90, 99) by bin(timestamp, 5m)
| render timechart

// Top Error Messages
exceptions
| where timestamp > ago(1d)
| summarize count() by outerMessage
| top 10 by count_
```

### 5.2 Alerting Rules

```typescript
const alertRules = [
  {
    name: 'High Error Rate',
    condition: 'exceptions | count() > 100 in 5m',
    severity: 2,
    actions: ['email', 'teams']
  },
  {
    name: 'Slow Response Time',
    condition: 'requests | percentile(duration, 95) > 3000',
    severity: 3,
    actions: ['email']
  },
  {
    name: 'Crisis Escalation',
    condition: 'customEvents | where name == "Escalation" and severity == "crisis"',
    severity: 1,
    actions: ['email', 'teams', 'sms']
  }
];
```

## 🧪 Step 6: Production Testing

### 6.1 Smoke Tests

Create `tests/smoke.test.ts`:

```typescript
describe('Production Smoke Tests', () => {
  const BOT_URL = process.env.BOT_URL || 'https://askeve-assist.azurewebsites.net';
  
  test('Health check endpoint', async () => {
    const response = await fetch(`${BOT_URL}/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.services.search).toBe('connected');
    expect(data.services.storage).toBe('connected');
  });
  
  test('Bot responds to messages', async () => {
    const response = await fetch(`${BOT_URL}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOT_TOKEN}`
      },
      body: JSON.stringify({
        type: 'message',
        text: 'hello',
        from: { id: 'test-user' },
        conversation: { id: 'test-conversation' }
      })
    });
    
    expect(response.status).toBe(200);
  });
});
```

## 📈 Step 7: Performance Optimization

### 7.1 Caching Strategy

```typescript
// Redis configuration for production
const cacheConfig = {
  // Response cache
  responseCache: {
    ttl: 3600, // 1 hour
    maxSize: 1000
  },
  
  // Search results cache  
  searchCache: {
    ttl: 7200, // 2 hours
    maxSize: 500
  },
  
  // Website content cache
  websiteCache: {
    ttl: 86400, // 24 hours
    maxSize: 100
  }
};
```

### 7.2 Auto-scaling Rules

```json
{
  "autoscale": {
    "enabled": true,
    "rules": [
      {
        "metric": "CpuPercentage",
        "threshold": 70,
        "action": "ScaleOut",
        "instances": 1
      },
      {
        "metric": "HttpQueueLength",
        "threshold": 100,
        "action": "ScaleOut",
        "instances": 2
      }
    ],
    "limits": {
      "minimum": 1,
      "maximum": 3
    }
  }
}
```

## 🔒 Step 8: Security Hardening

### 8.1 Security Headers

```typescript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});
```

### 8.2 Rate Limiting

```typescript
const rateLimiter = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // requests per window
  message: 'Too many requests, please try again later'
};
```

## 📝 Operational Runbook

### Daily Tasks
- [ ] Check Application Insights dashboard
- [ ] Review escalation logs
- [ ] Verify content refresh completed

### Weekly Tasks
- [ ] Review error logs
- [ ] Check response time trends
- [ ] Update nurse team on usage patterns

### Monthly Tasks
- [ ] Full safety review
- [ ] Cost analysis
- [ ] Performance optimization review
- [ ] Security patch updates

### Incident Response
1. **P1 - Bot Down**
   - Check App Service health
   - Review Application Insights
   - Check Azure status page
   - Notify nurse team

2. **P2 - Slow Response**
   - Check current load
   - Review cache hit rates
   - Scale up if needed
   - Investigate root cause

3. **P3 - Content Issues**
   - Verify search index
   - Check content freshness
   - Re-run content pipeline
   - Update affected content

## 🎉 Launch Checklist

- [ ] All tests passing
- [ ] Security scan clean
- [ ] Nurse team trained
- [ ] Monitoring configured
- [ ] Backup plan ready
- [ ] DNS configured
- [ ] SSL certificate active
- [ ] Content indexed
- [ ] Escalation tested
- [ ] Go-live communication sent

---

**Remember**: You're not just deploying code - you're launching a service that could be someone's first point of contact during a health scare. Take the time to get it right.