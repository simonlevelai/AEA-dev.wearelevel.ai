# Agent Coordination Protocol - Ask Eve Assist

## 🤝 Overview

This document coordinates the four specialist agents building Ask Eve Assist. Each agent has clear responsibilities, but success requires seamless collaboration and safety-first priorities.

## 👥 Agent Roster & Status

| Agent | Primary Focus | Key Deliverables | Status |
|-------|--------------|------------------|---------|
| **Safety Guardian** 🚨 | Crisis detection & MHRA compliance | EscalationService.ts, safety tests | 🔴 Ready to Start |
| **Content Pipeline** 📚 | Source attribution & search | ContentService.ts, mandatory URLs | 🔴 Ready to Start |
| **Bot Core** 🤖 | Microsoft 365 Agents SDK implementation | AskEveBot.ts, conversation flow | 🔴 Ready to Start |
| **Infrastructure** 🏗️ | Azure deployment & cost control | ARM templates, <£50/month | 🔴 Ready to Start |

## 🔄 Critical Integration Points

### 1. **Safety Guardian ↔️ Bot Core** (HIGHEST PRIORITY)
- **Safety Guardian defines ALL escalation triggers**
- **Bot Core MUST call safety check before ANY response**
- **Safety Guardian has VETO power** on any bot implementation
- **Every message flows through safety analysis FIRST**

### 2. **Content Pipeline ↔️ Bot Core** (SOURCE URLs MANDATORY)
- **Content Pipeline enforces source URL requirement**
- **Bot Core uses ONLY ContentService.ts for responses**
- **EVERY response MUST include verifiable source URL**
- **No content without eveappeal.org.uk attribution**

### 3. **Infrastructure ↔️ Everyone** (COST & PERFORMANCE)
- **Sets £50/month hard limit** that everyone must respect
- **Provides monitoring dashboards** for all services
- **Handles ALL deployments** and environment management
- **Manages secrets and configuration** through Key Vault

### 4. **Safety Guardian ↔️ Content Pipeline** (HEALTH CONTENT PRIORITY)
- **Crisis resources get PRIORITY indexing**
- **Safety content accuracy validation**
- **Emergency contact information always available**
- **Source URL validation for safety resources**

## 🚨 Decision Authority Matrix

| Decision Type | Primary Authority | Consulted | Informed |
|--------------|------------------|-----------|----------|
| **Safety triggers & escalation** | Safety Guardian | Bot Core | All |
| **Content source attribution** | Content Pipeline | Bot Core | All |
| **Microsoft 365 Agents SDK implementation** | Bot Core | All | - |
| **Azure resources & deployment** | Infrastructure | All | - |
| **Cost control & monitoring** | Infrastructure | All | - |
| **EMERGENCY: Safety failure** | Safety Guardian | - | All |

## 📋 Current Sprint Goals

### Week 1: Foundation (Days 1-5)
- **Day 1**: All agents launch and create project structure
- **Day 2**: Safety Guardian implements crisis triggers
- **Day 3**: Infrastructure deploys Azure resources
- **Day 4**: Content Pipeline sets up search with source URLs
- **Day 5**: Bot Core implements basic Agents SDK flow

### Week 2: Integration & Testing (Days 6-10)
- **Day 6-7**: Safety Guardian + Bot Core integration
- **Day 8**: Content Pipeline + Bot Core integration  
- **Day 9**: Full system testing with nurse team
- **Day 10**: Production deployment and go-live

## 🔀 Handoff Protocol

When passing work between agents, use this format:

```markdown
## Handoff: [From Agent] → [To Agent]
**Date**: [Current Date]
**Component**: [What's being handed off]

### Work Completed
- [Specific completed items]
- [Test coverage achieved]
- [Documentation updated]

### Integration Requirements
- [What the receiving agent needs to implement]
- [API contracts or interfaces to follow]
- [Testing requirements]

### Critical Notes
- [Safety considerations]
- [Source URL requirements]
- [Cost implications]
- [Performance requirements]

### Contact Points
- [When to sync with other agents]
- [Potential blocking issues]
```

## 🚨 Current Blocking Issues

| Date | Issue | Blocking | Owned By | Status |
|------|-------|----------|----------|---------|
| - | - | - | - | - |

## 📊 Integration Test Status

| Test Scenario | Agents Involved | Status | Priority |
|--------------|----------------|---------|----------|
| Crisis trigger → Bot response | Safety + Bot Core | 🔴 Not Started | Critical |
| Content search → Sourced response | Content + Bot Core | 🔴 Not Started | Critical |
| Cost monitoring → Alerts | Infrastructure | 🔴 Not Started | High |
| Nurse escalation → Teams notification | Safety + Bot Core | 🔴 Not Started | Critical |
| Source URL validation → All responses | Content + Bot Core | 🔴 Not Started | Critical |

## 🎯 Quality Gates (ALL MUST PASS)

### Before ANY Deployment
- [ ] **All safety tests passing** (Safety Guardian approval)
- [ ] **Every response has source URL** (Content Pipeline validation)
- [ ] **MHRA compliance verified** (Safety Guardian + Bot Core)
- [ ] **Cost projection under £50** (Infrastructure confirmation)
- [ ] **Microsoft 365 Agents SDK working** (Bot Core implementation)

### Before Production Launch
- [ ] **48 hours in staging environment**
- [ ] **Nurse team training completed**
- [ ] **Load testing passed**
- [ ] **Incident response tested**
- [ ] **All four agents sign off**

## 💬 Communication Protocols

### Daily Standup (9:00 AM)
**Format**: Each agent provides 2-minute update
- **Yesterday**: What I completed
- **Today**: What I'm working on
- **Blockers**: What I need from others

### Integration Checkpoints (2:00 PM)
**When needed**: Agents coordinate on integration points
- Safety + Bot Core: Crisis response flows
- Content + Bot Core: Source URL validation
- Infrastructure + All: Cost and performance impact

### End of Day Status (5:00 PM)
**Format**: Update this coordination file
- Progress on deliverables
- Any blocking issues
- Handoffs for tomorrow

## 📈 Success Metrics Dashboard

### Safety (Safety Guardian)
- Crisis detection rate: **Target 100%**
- Response time: **Target <2 seconds**
- Nurse notification success: **Target 100%**

### Content Quality (Content Pipeline)
- Source URL compliance: **Target 100%**
- Search success rate: **Target >95%**
- Content freshness: **Target <30 days avg**

### Bot Performance (Bot Core)  
- Message response time: **Target <2 seconds**
- User satisfaction: **Target >90%**
- Escalation accuracy: **Target 100%**

### Infrastructure (Infrastructure)
- Monthly cost: **Target <£50**
- Uptime: **Target 99.9%**
- Deployment success: **Target 100%**

## 🔄 Daily Agent Updates

### Safety Guardian Update - [Date]
**Status**: 🔴 Starting  
**Today**: Setting up EscalationService.ts with crisis triggers  
**Blockers**: None  
**Tomorrow**: Implementing safety middleware for Bot Core  

### Content Pipeline Update - [Date]
**Status**: 🔴 Starting  
**Today**: Configuring Azure AI Search with source URL schema  
**Blockers**: None  
**Tomorrow**: Building document ingestion with URL validation  

### Bot Core Update - [Date]
**Status**: 🔴 Starting  
**Today**: Setting up Microsoft 365 Agents SDK project  
**Blockers**: None  
**Tomorrow**: Implementing bot disclosure and basic message flow  

### Infrastructure Update - [Date]
**Status**: 🔴 Starting  
**Today**: Deploying ARM template for all Azure resources  
**Blockers**: None  
**Tomorrow**: Setting up cost monitoring and CI/CD pipeline  

## 🚀 Immediate Next Actions

### Priority 1 (Critical - Start Today)
- [ ] **Safety Guardian**: Create EscalationService.ts with crisis triggers
- [ ] **Infrastructure**: Deploy Azure resources under £50 budget
- [ ] **Content Pipeline**: Set up Azure AI Search with source URL schema
- [ ] **Bot Core**: Initialize Microsoft 365 Agents SDK project

### Priority 2 (High - Complete This Week)
- [ ] **Safety Guardian**: Implement comprehensive safety test suite
- [ ] **Content Pipeline**: Build content ingestion pipeline
- [ ] **Bot Core**: Implement RAG-only responses with source validation
- [ ] **Infrastructure**: Set up monitoring and cost alerts

## 🔥 Critical Reminders

1. **SAFETY FIRST** - Every agent must prioritize user safety over feature development
2. **SOURCE URLS MANDATORY** - No content without verifiable eveappeal.org.uk links
3. **UNDER £50/MONTH** - Cost control is non-negotiable for charity budget
4. **MICROSOFT 365 AGENTS SDK** - Use modern SDK, not deprecated Bot Framework
5. **NO MEDICAL ADVICE** - RAG-only responses, MHRA compliance required

---

**Remember**: We're building something that matters. Someone in a health crisis may depend on this bot working perfectly. Clear communication between agents ensures we deliver a safe, effective solution that could genuinely save lives.