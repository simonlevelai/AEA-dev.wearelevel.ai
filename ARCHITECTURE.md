# Ask Eve Assist - Architecture & System Design

## 🎯 Executive Summary

Ask Eve Assist is a safety-first health information chatbot built on Azure AI Foundry and the Microsoft Agents SDK. It provides 24/7 access to clinically-approved gynaecological health information whilst maintaining strict boundaries about its non-clinical nature.

**Key principles:**
- RAG-only (no freestyle generation)
- Under £50/month running costs
- 2-week MVP timeline
- Easy migration between Azure instances
- Multi-language and multi-channel ready

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Channels                          │
├─────────────────┬────────────────┬──────────────┬───────────┤
│   Web Widget    │     Teams      │   WhatsApp   │   Voice   │
│   (Phase 1)     │   (Phase 1)    │  (Phase 2)   │ (Phase 3) │
└────────┬────────┴───────┬────────┴──────┬───────┴─────┬─────┘
         │                │               │             │
         └────────────────┴───────────────┴─────────────┘
                                │
                    ┌───────────┴────────────┐
                    │   Channel Adapters     │
                    │  (Protocol handlers)   │
                    └───────────┬────────────┘
                                │
                    ┌───────────┴────────────┐
                    │    Core Bot Engine     │
                    │  (Agents SDK + RAG)    │
                    └───────────┬────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────┴────────┐   ┌─────────┴──────────┐  ┌────────┴────────┐
│ Azure AI Search │   │  Safety Engine     │  │ Analytics       │
│ (Content RAG)   │   │ (Escalation logic) │  │ (No PII)        │
└───────┬────────┘   └─────────┬──────────┘  └────────┬────────┘
        │                       │                       │
┌───────┴────────────────────────────────────────────────────┐
│                    Azure Infrastructure                      │
├────────────────┬──────────────────┬────────────────────────┤
│ App Service B1 │ Cosmos Serverless│ Storage Account        │
│ AI Search Free │ App Insights     │ Key Vault             │
└────────────────┴──────────────────┴────────────────────────┘
```

### Component Breakdown

#### 1. **Channel Adapters**
- Lightweight protocol converters
- Stateless design
- Common message format
- Channel-specific features (e.g., Teams cards, WhatsApp buttons)

#### 2. **Core Bot Engine**
- Microsoft Agents SDK base
- RAG-only responses via Azure AI Search
- Session management (no PII storage)
- Intent recognition for escalation
- Response generation from approved content only

#### 3. **Content Pipeline**
```
SharePoint Docs ─┐
                 ├→ Document Parser → Chunking → Azure AI Search
Eve Website ─────┘                              (Semantic + Vector)
```

#### 4. **Safety Engine**
- Keyword-based escalation triggers
- Emotional distress detection
- Nurse handoff orchestration
- Crisis response protocols

#### 5. **Analytics Engine**
- Anonymised conversation metrics
- Topic frequency analysis
- Escalation patterns
- Performance monitoring

## 💰 Cost Architecture

### Monthly Breakdown (MVP)

| Service | Tier | Est. Cost | Notes |
|---------|------|-----------|-------|
| App Service | B1 Basic | £10 | Auto-scale ready |
| AI Search | Free | £0 | 50MB, perfect for 10 docs |
| Storage | Hot tier | £2 | Docs + logs |
| App Insights | Basic | £5 | 10% sampling |
| Cosmos DB | Serverless | £5 | Metadata only |
| Azure OpenAI | Pay-per-use | £20 | ~15k messages/month |
| **Total** | | **£42** | Well under £100 target |

### Cost Optimisation Strategies

1. **Caching Layer**
   - Common questions cached in memory
   - 24-hour Redis cache for website content
   - Reduces AI Search calls by ~40%

2. **Smart Sampling**
   - Full logging for escalations
   - 10% sample for routine queries
   - Adjustable based on budget

3. **Efficient Chunking**
   - 512 token chunks (optimal for retrieval)
   - Overlap of 64 tokens
   - Semantic sectioning where possible

## 🔒 Security & Compliance

### Data Handling

```
User Input → Sanitisation → Processing → Response
     ↓                                        ↓
   No PII                                  No PII
   Stored                                  Logged
```

### Key Principles

1. **Zero Trust Architecture**
   - Managed identities everywhere
   - No embedded credentials
   - Key Vault for all secrets

2. **UK Data Residency**
   - All resources in UK South
   - Backup in UK West
   - No data leaves UK

3. **Audit Trail**
   - Who accessed what, when
   - Configuration changes logged
   - Quarterly review ready

## 🏃 MVP Implementation Plan

### Week 1: Core Functionality
```
Day 1-2: Infrastructure setup
- Azure resources via ARM template
- Local dev environment
- CI/CD pipeline

Day 3-4: Basic bot flow
- Channel adapters (web + Teams)
- RAG pipeline with AI Search
- Basic response generation

Day 5-7: Content & safety
- Document ingestion pipeline
- Website crawler
- Escalation detection
```

### Week 2: Production Ready
```
Day 8-9: Nurse integration
- Teams handoff flow
- Queue management
- Notification system

Day 10-11: Testing & refinement
- Safety scenarios
- Load testing
- Accessibility checks

Day 12-14: Deployment & documentation
- Production deployment
- Nurse training materials
- Handover documentation
```

## 🔄 Migration Strategy

### Portable Design
```
Everything as Code:
├── ARM templates (infrastructure)
├── Docker containers (application)
├── Environment configs (per instance)
└── Content packages (SharePoint backup)
```

### Migration Checklist
1. Export ARM template
2. Backup content + configs
3. Deploy to new subscription
4. Update DNS/endpoints
5. Verify with test suite
6. Switch traffic

**Time to migrate: ~2 hours**

## 🌍 Multi-Language Architecture

### Extensible Design
```
User Message
     ↓
Language Detection
     ↓
Query Translation (if needed)
     ↓
RAG Search (language-specific index)
     ↓
Response Generation
     ↓
Response Translation (if needed)
```

### Implementation Notes
- Abstract all UI strings to resource files
- Content indexed by language code
- Graceful fallback to English
- Easy to add Welsh, Urdu, Polish, etc.

## 📱 Future Channel Support

### WhatsApp Integration (Phase 2)
```
WhatsApp Business API
         ↓
    Twilio/Vonage
         ↓
    Webhook Handler
         ↓
    Channel Adapter
         ↓
    Core Bot Engine
```

### Voice Integration (Phase 3)
```
Phone/Teams Voice
         ↓
    Speech-to-Text
         ↓
    Core Bot Engine
         ↓
    Text-to-Speech
         ↓
    Voice Response
```

## 🚨 Critical Success Factors

1. **Safety First**
   - All escalation triggers tested
   - Clear bot disclosure
   - Nurse handoff working

2. **Content Fidelity**
   - 100% responses from approved content
   - Source attribution on every response
   - Version tracking active

3. **Performance Targets**
   - <2 second response time
   - 99.9% uptime
   - 60% call reduction

## 🛠️ Tech Stack Summary

### Core
- **Runtime**: Node.js 20 LTS
- **Framework**: Microsoft Bot Framework SDK 4.x
- **Language**: TypeScript
- **AI**: Azure OpenAI (GPT-4) + AI Search

### Infrastructure
- **Hosting**: Azure App Service (Linux)
- **Search**: Azure AI Search
- **Storage**: Azure Blob + SharePoint
- **Database**: Cosmos DB (Serverless)
- **Monitoring**: Application Insights

### Development
- **IDE**: VS Code
- **Version Control**: Git
- **CI/CD**: GitHub Actions
- **Testing**: Jest + Bot Framework Emulator

## 📊 Monitoring & KPIs

### Real-time Dashboard
```
┌─────────────────────────────────────┐
│        Ask Eve Dashboard            │
├─────────────┬───────────────────────┤
│ Active Chats│ 12                    │
│ Queue       │ 3                     │
│ Escalations │ 2 today              │
│ Avg Response│ 1.3s                 │
└─────────────┴───────────────────────┘
```

### Key Metrics
- Message volume by topic
- Escalation rate by trigger
- User satisfaction (post-chat)
- Call reduction percentage

## 🎯 Definition of Done

### MVP Must-Haves
- [ ] Bot disclosure on every conversation
- [ ] RAG-only responses working
- [ ] 10 documents indexed and searchable
- [ ] Website content indexed daily
- [ ] Escalation to nurses via Teams
- [ ] Zero PII storage verified
- [ ] Under £50/month confirmed
- [ ] Accessibility WCAG 2.1 AA
- [ ] Load tested for 100 concurrent users

### Nice-to-Haves (Post-MVP)
- [ ] Multi-language support
- [ ] WhatsApp integration
- [ ] Voice capabilities
- [ ] Advanced analytics
- [ ] A/B testing framework

---

## 🚀 Next Steps

1. Review and approve this architecture
2. Set up Azure subscription and resources
3. Begin development with bot framework setup
4. Implement core RAG pipeline
5. Add safety and escalation features
6. Deploy and test

**Remember**: We're building for safety, simplicity, and sustainability. Every decision should support these goals.