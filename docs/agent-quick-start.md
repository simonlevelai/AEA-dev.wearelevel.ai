# Sub-Agent Quick Start Guide - Ask Eve Assist

## 🚀 Getting Started with Sub-Agents

This guide helps you effectively use Claude Code sub-agents to build Ask Eve Assist in parallel.

## 📋 Initial Setup (Do This First!)

```bash
# 1. Create agent instruction files
mkdir -p agents
cp [agent-files-from-artifacts] agents/

# 2. Create your project structure
mkdir -p ask-eve-assist/{src,tests,deploy,scripts,content,monitoring}
cd ask-eve-assist

# 3. Initialize git
git init
git add .
git commit -m "Initial project structure with agent instructions"
```

## 🎭 Starting Your Sub-Agent Sessions

### Session 1: Infrastructure Agent (Start First!)
```
Open Claude Code Session 1
Prompt: "You are the Infrastructure Agent for Ask Eve Assist. Please read your instructions in agents/infrastructure.md and set up the Azure infrastructure for a health chatbot that must stay under £50/month."
```

### Session 2: Safety Guardian Agent
```
Open Claude Code Session 2
Prompt: "You are the Safety Guardian Agent for Ask Eve Assist. Please read your instructions in agents/safety-guardian.md and implement the escalation service for our health chatbot. This is safety-critical - people in crisis will use this bot."
```

### Session 3: Content Pipeline Agent
```
Open Claude Code Session 3
Prompt: "You are the Content Pipeline Agent for Ask Eve Assist. Please read your instructions in agents/content-pipeline.md and build the document ingestion pipeline. We have 10 documents and a website to index."
```

### Session 4: Bot Core Agent
```
Open Claude Code Session 4
Prompt: "You are the Bot Core Agent for Ask Eve Assist. Please read your instructions in agents/bot-core.md and implement the main bot class. Remember: RAG-only responses, no medical advice generation."
```

## 🔄 Daily Workflow

### Morning Coordination (5 minutes)
1. Update `agents/coordination.md` with yesterday's progress
2. Check for blocking issues
3. Plan today's integration points

### Working Sessions
- Keep each agent focused on their domain
- Use coordination.md for handoffs
- Don't duplicate work across agents

### End of Day (5 minutes)
1. Commit all changes
2. Update coordination.md status
3. Note any blockers for tomorrow

## 💡 Effective Sub-Agent Patterns

### Pattern 1: Parallel Foundation
```
Hour 1-2: All agents build their foundations
Hour 3: Quick sync on interfaces
Hour 4+: Continue building with clear contracts
```

### Pattern 2: Test-First Integration
```
Safety: Writes escalation tests
Bot Core: Implements to pass tests
Content: Provides test content
Infra: Monitors test resources
```

### Pattern 3: Deadline-Driven
```
Day 1-2: MVP components (all agents)
Day 3-4: Integration (paired work)
Day 5: Testing and fixes
```

## 🤝 Cross-Agent Commands

### When Safety Guardian needs Bot Core to implement something:
```
[In Safety session]: "I've defined the escalation interface in src/interfaces/ISafetyEngine.ts - please implement this in Bot Core"

[In Bot Core session]: "The Safety Guardian has defined an interface I need to implement - can you show me src/interfaces/ISafetyEngine.ts?"
```

### When Bot Core needs content:
```
[In Bot Core]: "I need test content for symptoms - please check with Content Pipeline"

[In Content]: "Bot Core needs test content - let me create fixtures/symptom-content.json"
```

## 🚨 Common Issues & Solutions

### Issue: Agents creating conflicting implementations
**Solution**: Use interfaces/contracts defined in shared folders
```
src/interfaces/  # Shared contracts
src/types/      # Shared types
```

### Issue: Not sure which agent owns what
**Solution**: Check the file ownership in each agent's instructions
```
grep -r "Primary Ownership" agents/
```

### Issue: Integration failing
**Solution**: Do mini-integration sessions
```
"Let's do a 30-minute integration session. Safety Guardian and Bot Core, let's make escalation work end-to-end."
```

## 📊 Progress Tracking

### Quick Status Check
```bash
# See what each agent has built
find src -name "*.ts" -exec grep -l "export class" {} \;

# Check test coverage by agent
npm test -- --coverage --collectCoverageFrom="src/**/*.ts"

# See recent changes by agent
git log --oneline --grep="\[Safety\]\|\[Content\]\|\[Bot\]\|\[Infra\]"
```

### Daily Standup Template
```
Agent: [Name]
Yesterday: [What I completed]
Today: [What I'm building]
Blockers: [What I need from others]
```

## 🎯 Week 1 Milestones by Agent

### Day 1-2
- **Infra**: Azure resources deployed
- **Safety**: Trigger lists defined
- **Content**: Document parser working
- **Bot**: Basic message handler

### Day 3-4
- **Infra**: CI/CD pipeline ready
- **Safety**: Escalation service complete
- **Content**: Search index configured
- **Bot**: RAG responses working

### Day 5-7
- **All**: Integration testing
- **All**: Fix issues together
- **All**: Prepare for week 2

## 💬 Sample Integration Conversations

### Defining a Contract
```
Safety → Bot: "I've created the escalation interface. Every message must call checkSafety() before responding."

Bot → Safety: "Understood. I'll add safety middleware that calls your service. What should I do if it times out?"

Safety → Bot: "Timeout = escalate. Better safe than sorry. I'll add that to the interface docs."
```

### Resolving a Conflict
```
Content → Infra: "Search index needs 100MB for better results"

Infra → Content: "That exceeds free tier. Can we optimize?"

Content → Infra: "Let me try 512-char chunks instead of 1000. That should fit in 50MB."
```

## 🚀 Quick Commands

### Start all agents fresh
```bash
# Terminal 1
code agents/infrastructure.md

# Terminal 2  
code agents/safety-guardian.md

# Terminal 3
code agents/content-pipeline.md

# Terminal 4
code agents/bot-core.md
```

### Quick sync between agents
```bash
# Update coordination file
code agents/coordination.md

# See all agent work
git status
git diff --stat
```

### Test integration points
```bash
# Run integration tests
npm run test:integration

# Run specific agent tests
npm test -- --testNamePattern="Safety"
npm test -- --testNamePattern="Content"
```

## ✅ Success Checklist

By end of Week 1:
- [ ] All agents have committed working code
- [ ] Integration tests passing
- [ ] No blocking issues in coordination.md
- [ ] Cost projection under £50

By end of Week 2:
- [ ] Full system working end-to-end
- [ ] Safety tests comprehensive
- [ ] Production deployment ready
- [ ] Nurse team can test

## 🎉 You're Ready!

Remember:
1. Each agent is an expert in their domain
2. Clear communication prevents problems
3. Safety Guardian has veto power
4. Stay under £50/month

Start your agents and build something amazing! The Eve Appeal and the people they serve are counting on you. 🚀

---

**Pro tip**: If an agent seems stuck, give them a specific file to implement: "Please implement src/services/EscalationService.ts based on your instructions"