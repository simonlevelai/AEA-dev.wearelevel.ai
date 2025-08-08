# Claude Code Instructions - Ask Eve Assist Multi-Agent System

## 🎯 Project Overview

You're working with **Ask Eve Assist** - an advanced multi-agent healthcare assistant powered by **Microsoft 365 Agents SDK 2025**. This is a safety-critical application implementing specialized agent orchestration for gynaecological health information from The Eve Appeal.

**Critical Context:**
- **Microsoft 365 Agents SDK 2025** with multi-agent orchestration
- **Safety-first architecture** with mandatory agent validation
- **Healthcare-specific agent sequencing**: Safety → Content → Escalation
- **MHRA compliant**: Evidence-based information only, no medical advice generation
- **Crisis detection**: <500ms response time requirement

## 🏗️ M365 Agents SDK Architecture

```
User Message → ChatManager → Agent Orchestration → Multi-Agent Response
                    ↓               ↓                      ↓
               SafetyAgent → ContentAgent → EscalationAgent
                    ↓               ↓                      ↓
              Crisis Check     Medical RAG        Nurse Callback
               (<500ms)       (Evidence-based)    (Teams/GDPR)
```

**M365 SDK Stack:**
- Microsoft 365 Agents SDK 2025
- AgentBuilder patterns with foundation models
- Multi-agent orchestration (≤3 agents)
- Healthcare-specific agent communication protocols
- Azure OpenAI with intelligent model selection

## 📁 M365 Agents SDK Project Structure

```
ask-eve-assist/
├── src/
│   ├── index-multiagent.ts     # M365 SDK entry point - MAIN ENTRY
│   ├── bot/
│   │   ├── AskEveMultiAgentBot.ts  # Multi-agent orchestration - CORE SYSTEM
│   │   └── BotServer.ts            # Express hosting for M365 SDK
│   ├── agents/                     # M365 Specialized Agents - CORE AGENTS
│   │   ├── SafetyAgent.ts          # Crisis detection <500ms - CRITICAL
│   │   ├── ContentAgent.ts         # Medical RAG with MHRA compliance
│   │   └── EscalationAgent.ts      # Nurse callbacks + Teams integration
│   ├── services/
│   │   ├── ChatManager.ts          # Multi-agent orchestration - CORE SERVICE
│   │   ├── AgentCommunicationProtocol.ts  # Agent-to-agent messaging
│   │   ├── FoundationModelManager.ts      # Intelligent model selection
│   │   ├── ConversationFlowEngine.ts      # M365 conversation management
│   │   └── ConversationGDPRIntegration.ts # Healthcare compliance
│   ├── types/
│   │   └── agents.ts              # Agent type definitions - CORE TYPES
│   └── workflows/                 # Healthcare-specific workflows
├── content/
│   └── pif-documents/            # Eve Appeal PiF approved documents
├── config/
│   ├── safety-config.json        # Crisis triggers and emergency contacts
│   └── entities/                 # Medical entity definitions
├── deploy/                     # ARM templates and deployment configs
├── docs/                       # Project documentation
├── scripts/                    # Deployment and content tools
└── tests/                      # MUST HAVE safety tests
```

## ⚠️ Critical M365 Agent Safety Rules

**MULTI-AGENT SAFETY PRINCIPLES:**
1. **SafetyAgent ALWAYS processes messages first** - <500ms response time
2. **Agent sequence is MANDATORY**: Safety → Content → Escalation  
3. **Crisis detection bypasses all other agents** - immediate emergency response
4. **No agent can skip safety validation** - safety-first architecture enforced
5. **Agent communication must be logged** - for healthcare audit trail

**HEALTHCARE COMPLIANCE:**
1. **MHRA compliant content only** - no medical advice generation
2. **Mandatory source attribution** - every medical fact must have source URL
3. **Evidence-based responses only** - ContentAgent retrieves, never generates
4. **Crisis detection mandatory** - SafetyAgent cannot be bypassed
5. **GDPR automated data retention** - EscalationAgent manages contact data
6. **Emergency contacts always available** - 999, Samaritans 116 123, NHS 111

## 🔥 M365 Agents SDK Development Tasks

### Starting Multi-Agent Development
```bash
# Setup M365 Agents SDK environment
npm install
cp .env.example .env
# Configure M365 SDK credentials, Azure OpenAI, and Supabase

# Start multi-agent development server
npm run dev              # Uses src/index-multiagent.ts

# Start specific components
npm run dev:multiagent   # Multi-agent system
npm run dev:bot          # Bot server only

# Test multi-agent orchestration
npm run test:integration # M365 SDK integration
npm run test:bot         # Multi-agent bot functionality
npm run test:safety      # Crisis detection <500ms
```

### Multi-Agent System Testing
```bash
# Test individual agents
npm run test -- SafetyAgent      # Crisis detection
npm run test -- ContentAgent     # Medical content RAG
npm run test -- EscalationAgent  # Nurse callbacks

# Test agent orchestration
npm run test -- ChatManager              # Agent coordination
npm run test -- AgentCommunicationProtocol  # Agent messaging
```

### Agent Development Workflow
```bash
# Create new specialized agent
# 1. Implement IAgent interface in src/agents/
# 2. Register with ChatManager in src/services/ChatManager.ts
# 3. Add agent communication protocols
# 4. Test agent coordination with existing agents
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