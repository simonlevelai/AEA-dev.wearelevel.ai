# Claude Code Instructions - Ask Eve Assist Bot

## 🎯 Project Overview

You're helping build **Ask Eve Assist** - a health information chatbot for The Eve Appeal (gynaecological cancer charity). This is a safety-critical application that must NEVER provide medical advice, only retrieve information from approved content.

**Critical Context:**
- Moving from Microsoft Copilot Studio to custom build due to content moderation issues
- Must be RAG-only (no open generation)
- Budget: Under £50/month
- Timeline: 2-week MVP
- Platform: Azure AI Foundry + Microsoft Agents SDK

## 🏗️ Architecture Summary

```
Web/Teams → Bot Framework → RAG Pipeline → Azure AI Search
                         ↓
                  Safety Engine → Nurse Escalation
```

**Tech Stack:**
- Node.js 20 + TypeScript
- Microsoft Bot Framework SDK 4.x
- Azure AI Search (free tier)
- Azure OpenAI (GPT-4)
- Cosmos DB Serverless
- App Service B1

## 📁 Project Structure

```
ask-eve-assist/
├── src/
│   ├── bot/
│   │   ├── AskEveBot.ts         # Main bot class - ALWAYS CHECK SAFETY
│   │   ├── middleware/          # Request processing
│   │   └── dialogs/             # Conversation flows
│   ├── services/
│   │   ├── ContentService.ts    # RAG implementation - NEVER FREESTYLE
│   │   ├── EscalationService.ts # Safety triggers - CRITICAL
│   │   ├── SearchService.ts     # Azure AI Search wrapper
│   │   └── TeamsService.ts      # Nurse notifications
│   ├── models/                  # TypeScript interfaces
│   ├── utils/                   # Helpers and logging
│   └── index.ts                # Entry point
├── content/
│   └── pif-documents/          # Eve Appeal PiF approved documents
├── config/                     # Application configuration files
├── data/                       # Processed content and trigger definitions
├── deploy/                     # ARM templates and deployment configs
├── docs/                       # Project documentation
├── scripts/                    # Deployment and content tools
└── tests/                      # MUST HAVE safety tests
```

## ⚠️ Critical Safety Rules

**NEVER:**
1. Generate medical advice beyond retrieved content
2. Diagnose or suggest diagnoses
3. Minimize symptoms ("probably nothing")
4. Store personal health information
5. Skip escalation triggers

**ALWAYS:**
1. Start conversations with bot disclosure
2. Check escalation triggers BEFORE responding
3. Cite information sources WITH DIRECT LINKS
4. Every response MUST include source URL
5. Offer nurse support for concerns
6. Log safety events (anonymized)

## 🔥 Common Tasks

### Starting Development
```bash
# First time setup
npm install
cp .env.example .env.development
# Fill in Azure credentials in .env.development

# Run locally
npm run dev

# Test with Bot Framework Emulator
npm run emulator
```

### Adding New Content
```bash
# Add document to content pipeline
cp new-document.pdf content/documents/
npm run content:ingest

# Update search index
npm run search:reindex
```

### Testing Safety Features
```bash
# Run safety test suite - MANDATORY before commits
npm run test:safety

# Test specific escalation scenarios
npm run test:escalation -- --trigger="suicide"
```

### Deployment
```bash
# Deploy to Azure (requires Azure CLI login)
npm run deploy:production

# Run smoke tests after deployment
npm run test:smoke
```

## 🧪 Testing Requirements

**Every PR must include:**
1. Safety trigger tests
2. RAG-only verification
3. Escalation flow tests
4. No PII storage verification

**Test high-risk scenarios:**
```typescript
// These MUST trigger escalation
"I want to kill myself"
"Is this cancer?"
"I can't stop bleeding"
"The pain is unbearable"
```

## 💡 Implementation Guidelines

### 1. RAG Responses Only
```typescript
// ❌ NEVER DO THIS
const response = await openai.complete(userQuery);

// ✅ ALWAYS DO THIS
const searchResults = await searchService.search(userQuery);
const response = await generateFromContent(searchResults);
```

### 2. Escalation Checking
```typescript
// ALWAYS check triggers first
const escalation = await escalationService.check(message);
if (escalation.shouldEscalate) {
  return handleEscalation(escalation);
}
// Only then process normally
```

### 3. Source Attribution
```typescript
// Every response needs source
return {
  content: ragResponse,
  source: "Eve Appeal - Ovarian Cancer Symptoms",
  lastReviewed: "October 2024"
};
```

## 🚨 Emergency Procedures

**If bot is providing medical advice:**
1. STOP all deployments
2. Set maintenance mode
3. Review logs for pattern
4. Fix and add tests
5. Get approval before redeploying

**If escalation fails:**
1. Bot returns fallback number: 0808 802 0019
2. Log critical error
3. Alert on-call immediately

## 📊 Key Metrics to Monitor

- Escalation rate (target: 5-10%)
- Response time (<2 seconds)
- Source attribution (100%)
- Safety trigger accuracy
- Nurse handoff success rate

## 🔄 Daily Workflow

1. **Morning**: Check overnight escalations
2. **Midday**: Review content freshness
3. **Evening**: Verify tomorrow's content updates
4. **Always**: Monitor safety alerts

## 📝 Commit Message Format

```
type(scope): description

safety: Added new escalation trigger for...
content: Updated ovarian cancer symptoms
fix: Corrected response timeout issue
test: Added safety scenario for...
```

## 🤝 Working with the Charity

- **Nurse team**: 1 FT + 1 PT nurse using Teams
- **Content updates**: ~yearly for docs, daily for website
- **Escalations**: Notify within 1 minute
- **Hours**: Monday-Friday, 9am-5pm

## 🎯 Success Criteria

1. **Zero medical advice generation**
2. **100% escalation trigger capture**
3. **<2 second response time**
4. **60% call reduction**
5. **Under £50/month costs**

## ⚡ Quick Commands

```bash
# Development
npm run dev                 # Start local bot
npm run test:watch         # Run tests continuously
npm run lint:fix          # Fix code style

# Content
npm run content:validate   # Check content integrity
npm run content:refresh   # Update from SharePoint

# Production
npm run deploy:prod       # Full deployment
npm run monitor          # Open monitoring dashboard
npm run costs           # Check Azure costs
```

## 🆘 Getting Help

1. **Safety concerns**: Escalate immediately to team lead
2. **Technical issues**: Check logs first, then Azure status
3. **Content questions**: Verify with nurse team
4. **Architecture decisions**: Refer to main documentation

---

**Remember**: This bot could be someone's first contact during a health scare. Every line of code matters. When in doubt, be safe and escalate.