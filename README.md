# Ask Eve Assist

[![CI/CD](https://github.com/simonlevelai/AEA-dev.wearelevel.ai/actions/workflows/ci.yml/badge.svg)](https://github.com/simonlevelai/AEA-dev.wearelevel.ai/actions/workflows/ci.yml)
[![Safety Systems](https://img.shields.io/badge/Safety%20Systems-Active-green)](https://github.com/simonlevelai/AEA-dev.wearelevel.ai/blob/main/docs/ask-eve-safety-systems.md)
[![Cost Target](https://img.shields.io/badge/Cost%20Target-%C2%A350%2Fmonth-blue)](https://github.com/simonlevelai/AEA-dev.wearelevel.ai/blob/main/infrastructure/cost-optimization.json)
[![UK Compliance](https://img.shields.io/badge/UK%20Data%20Residency-Enforced-green)](https://github.com/simonlevelai/AEA-dev.wearelevel.ai/blob/main/infrastructure/security-config.json)

**AI chatbot for gynaecological health information from The Eve Appeal** - Built with Microsoft 365 Agents SDK and comprehensive safety systems for life-critical health service delivery.

## 🚀 Key Features

### ✅ Microsoft 365 Agents SDK Integration
- **Migrated from Bot Framework** to modern Microsoft 365 Agents SDK
- Preserves all safety-critical systems during migration
- Enhanced web chat widget with safety contact information
- Ready for Teams deployment and nurse escalation

### 🛡️ Safety-Critical Health Systems
- **<2 Second Crisis Response**: Immediate detection and escalation for self-harm indicators
- **Medical Emergency Handling**: Automatic routing to emergency services
- **Source Validation**: 100% attribution to eveappeal.org.uk trusted sources
- **RAG-Only Architecture**: No medical advice generation, only retrieval from approved content

### 🏗️ 4-Agent Architecture
- **Safety Guardian Agent**: Crisis detection & escalation systems
- **Bot Core Agent**: Conversation management & Microsoft 365 Agents SDK integration
- **Content Pipeline Agent**: Source validation & RAG processing
- **Infrastructure Agent**: Azure deployment & cost monitoring

### 💰 Cost-Optimized Infrastructure
- **Under £50/Month**: Production deployment target with comprehensive monitoring
- **Real-time Alerts**: Automated notifications at 80%, 90%, 96% of budget
- **UK Data Residency**: All processing within UK Azure regions for compliance

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x
- Azure CLI (for deployment)
- TypeScript/ESLint for development

### Local Development
```bash
# Install dependencies
npm install

# Run tests (including safety systems)
npm test
npm run test:safety

# Start development server
npm run dev

# Visit web chat widget
open http://localhost:3978/widget
```

### Production Deployment
```bash
# Deploy to Azure (example for dev environment)
./deploy/scripts/deploy.sh \
  --environment dev \
  --resource-group "rg-askeve-dev" \
  --subscription "your-subscription-id" \
  --email "alerts@yourdomain.com"
```

## 🏥 Health Service Compliance

This is a **life-critical health service** with strict requirements:

- ✅ **MHRA Compliance**: No medical advice generation
- ✅ **UK GDPR**: Data minimization and 30-day retention
- ✅ **Safety Systems**: Crisis detection with immediate escalation
- ✅ **Source Attribution**: Mandatory links to trusted health information
- ✅ **Emergency Contacts**: Samaritans, NHS 111, GP referrals

## 📊 Architecture

### Cost Breakdown (£49/month target)
| Component | Tier | Est. Cost | Purpose |
|-----------|------|-----------|---------|
| App Service | B1 Basic | £10 | Always-on reliability |
| AI Search | Free | £0 | Content retrieval |
| Cosmos DB | Serverless | £5 | Conversation storage |
| Azure OpenAI | gpt-4o-mini | £25 | AI responses |
| Key Vault | Standard | £1 | Secret management |
| Storage & Monitoring | Various | £8 | Logs, backups, alerts |

### Safety Architecture
```
User Message → Safety Guardian → Content Pipeline → Response with Sources
     ↓               ↓                    ↓              ↓
Crisis Detection → Escalation → Source Validation → Mandatory Attribution
```

## 🧪 Testing

### Safety System Tests (Critical)
```bash
npm run test:safety  # Crisis detection, escalation procedures
npm test            # Full test suite including safety systems
npm run lint        # Code quality and safety compliance
```

### Test Coverage Requirements
- **90% minimum** across all safety-critical components
- **100% coverage** for crisis detection and escalation
- **Integration tests** for emergency contact systems

## 🔐 Security & Compliance

### UK Data Residency
- Primary: UK South (`uksouth`)
- Secondary: UK West (`ukwest`)
- No cross-border data transfers

### Secret Management
All secrets stored in Azure Key Vault:
- `openai-api-key`: AI service authentication
- `teams-webhook-url`: Nurse escalation endpoint
- `emergency-contact-webhook`: Crisis notification system

## 📚 Documentation

- [Deployment Guide](./DEPLOYMENT.md) - Complete setup instructions
- [Safety Systems](./docs/ask-eve-safety-systems.md) - Crisis detection & escalation
- [Architecture Overview](./docs/ask-eve-architecture.md) - System design & cost analysis
- [Agent Coordination](./docs/agent-coordination.md) - 4-agent development workflow

## 🛠️ Development

### 4-Agent Development Workflow
Each agent has specialized responsibilities:

1. **Safety Guardian**: `agents/safety-guardian.md`
2. **Bot Core**: `agents/bot-core.md`
3. **Content Pipeline**: `agents/content-pipeline.md`
4. **Infrastructure**: `agents/infrastructure.md`

### Contributing
1. All changes must pass safety system tests
2. Maintain <2 second crisis response time requirement
3. Preserve UK data residency compliance
4. Follow test-driven development for safety-critical components

## 📞 Support & Emergency Contacts

### For Users
- **Crisis Support**: Samaritans 116 123 (free, 24/7)
- **Medical Emergency**: 999
- **Health Advice**: NHS 111
- **The Eve Appeal**: [eveappeal.org.uk](https://eveappeal.org.uk)

### For Developers
- **Infrastructure**: infrastructure@wearelevel.ai
- **Security Issues**: security@wearelevel.ai
- **The Eve Appeal**: Technical contact via official channels

## 📄 License

MIT License - Built with care for The Eve Appeal's mission to improve women's health outcomes.

---

**🏥 Life-Critical Health Service**: This system is designed to save lives through early detection of health concerns and immediate crisis intervention. All deployments must maintain the highest standards of reliability, security, and compliance.

**Generated by Ask Eve Assist Development Team**  
Microsoft 365 Agents SDK Integration ✅  
Safety Systems Active ✅  
UK Compliance Enforced ✅