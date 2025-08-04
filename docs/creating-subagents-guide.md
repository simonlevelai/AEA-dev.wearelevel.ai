# How to Create Sub-Agents in Claude Code - Practical Guide

## 🎯 What Are Sub-Agents?

Sub-agents are specialized Claude Code sessions, each focused on a specific part of your project. Think of them as expert team members who deeply understand their domain and work together to build complex systems.

## 🚀 Step-by-Step Guide

### Step 1: Plan Your Sub-Agents

Before opening Claude Code, decide how to split your project:

```markdown
Project: E-commerce Platform
├── Frontend Agent (React/UI)
├── Backend Agent (API/Database)
├── DevOps Agent (Deployment/CI)
└── Testing Agent (Quality/Security)
```

### Step 2: Create Instruction Files

For each sub-agent, create a detailed instruction file:

```bash
mkdir project-agents
touch project-agents/frontend-agent.md
touch project-agents/backend-agent.md
touch project-agents/devops-agent.md
touch project-agents/testing-agent.md
```

### Step 3: Write Agent Instructions

Each instruction file should include:

```markdown
# Frontend Agent Instructions

## Your Role
You are the Frontend specialist for [Project Name]. You own all UI/UX code.

## Your Responsibilities
1. React component architecture
2. State management
3. API integration
4. Responsive design
5. Accessibility

## Your Files
- src/components/**
- src/pages/**
- src/hooks/**
- src/styles/**

## Key Rules
- Use TypeScript
- Follow accessibility guidelines
- Mobile-first design
- Component tests required

## Integration Points
- Backend Agent: API contracts
- DevOps Agent: Build configuration
- Testing Agent: E2E test selectors
```

### Step 4: Start Your First Sub-Agent

Open a new Claude Code session and introduce the agent:

```
"Hello! You are the Frontend Agent for our e-commerce platform. Please read your instructions in project-agents/frontend-agent.md and then set up the React application structure with TypeScript and Tailwind CSS."
```

### Step 5: Start Additional Sub-Agents

Open separate Claude Code sessions for each agent:

**Session 2 - Backend Agent:**
```
"You are the Backend Agent for our e-commerce platform. Please read project-agents/backend-agent.md and create the API structure with Node.js and PostgreSQL."
```

**Session 3 - DevOps Agent:**
```
"You are the DevOps Agent. Please read project-agents/devops-agent.md and set up Docker containers and GitHub Actions for our platform."
```

## 🔄 Coordination Strategies

### 1. Shared Interfaces

Create shared contracts that all agents follow:

```typescript
// shared/interfaces/api.ts
export interface ProductAPI {
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product>;
  createProduct(data: CreateProductDTO): Promise<Product>;
}
```

### 2. Coordination File

Maintain a central coordination document:

```markdown
# agents/coordination.md

## Current Status
- Frontend: Building product list ✅
- Backend: Creating API endpoints 🔄
- DevOps: Setting up containers 🔄

## Blocking Issues
- Frontend needs product API schema from Backend

## Today's Integration Points
- 10:00: API contract review
- 14:00: Docker setup for local dev
```

### 3. Handoff Protocol

When passing work between agents:

```markdown
## Handoff: Frontend → Backend
Date: 2024-01-15
Component: Product API

What I need:
- GET /api/products endpoint
- Pagination support
- Filter by category

Expected response format:
{
  products: Product[],
  total: number,
  page: number
}
```

## 💡 Best Practices

### 1. Clear Boundaries

Each agent should have exclusive ownership of certain files:

```javascript
// Good: Clear ownership
Frontend Agent: src/components/ProductCard.tsx ✅
Backend Agent: src/api/products.controller.ts ✅

// Bad: Overlapping ownership
Both agents editing: src/utils/validation.ts ❌
```

### 2. Communication Patterns

**Async Updates:**
```markdown
[Frontend Agent committed]: Product list component complete
[Backend Agent note]: Will add sorting to API tomorrow
```

**Sync Points:**
```markdown
[Integration needed]: Frontend and Backend agents please sync on auth flow
```

### 3. Specialized Expertise

Give agents deep context for their domain:

```markdown
## Security Agent Special Knowledge
- OWASP Top 10 awareness
- JWT best practices
- SQL injection prevention
- XSS protection strategies
```

## 🛠️ Common Patterns

### Pattern 1: Feature Development

```
1. Frontend Agent: Create UI mockup
2. Backend Agent: Design data model
3. Both: Agree on API contract
4. Parallel: Build their parts
5. Testing Agent: Integration tests
```

### Pattern 2: Bug Fix

```
1. Testing Agent: Reproduce and isolate
2. Relevant Agent: Fix the issue
3. Testing Agent: Verify fix
4. DevOps Agent: Deploy patch
```

### Pattern 3: Performance Optimization

```
1. DevOps Agent: Identify bottleneck
2. Backend Agent: Optimize queries
3. Frontend Agent: Add caching
4. Testing Agent: Verify improvements
```

## 🚨 Common Pitfalls & Solutions

### Pitfall 1: Agents Contradicting Each Other

**Problem:** Frontend Agent uses REST, Backend Agent builds GraphQL

**Solution:** Define architecture decisions upfront:
```markdown
# Architecture Decisions
- API Style: REST
- Database: PostgreSQL  
- Auth: JWT tokens
```

### Pitfall 2: Lost Context Between Sessions

**Problem:** Agent forgets previous decisions

**Solution:** Start each session with context:
```
"You are the Backend Agent. Yesterday you implemented user authentication with JWT. Today please add role-based authorization."
```

### Pitfall 3: Integration Failures

**Problem:** Components don't work together

**Solution:** Regular integration checkpoints:
```markdown
## Daily Integration Checklist
- [ ] API endpoints match frontend calls
- [ ] Database schema matches models
- [ ] Environment variables consistent
- [ ] Docker containers can communicate
```

## 📊 Measuring Success

Track your sub-agent effectiveness:

```markdown
## Sub-Agent Metrics
- Code conflicts: Should be < 5%
- Integration issues: Should decrease over time
- Development velocity: Should increase after week 1
- Test coverage: Each agent maintains > 80%
```

## 🎮 Advanced Techniques

### 1. Specialized Sub-Agents

Create highly specialized agents for complex tasks:

```markdown
# Performance Optimization Agent
Specializes in:
- Database query optimization
- Caching strategies
- Bundle size reduction
- Load testing
```

### 2. Rotating Responsibilities

Have agents switch focus for knowledge sharing:

```markdown
Week 1: Frontend Agent owns UI
Week 2: Frontend Agent reviews Backend code
Week 3: Frontend Agent documents API
```

### 3. Agent Hierarchies

For large projects, create lead agents:

```markdown
Lead Frontend Agent
├── Component Agent
├── State Management Agent
└── Testing Agent
```

## 🎯 Quick Start Template

```bash
# 1. Create structure
mkdir my-project
cd my-project
mkdir agents

# 2. Create agent files
cat > agents/agent-1.md << 'EOF'
# Agent 1: [Specialty]
## Your Role
[Description]
## Your Files
[List]
## Key Rules
[List]
EOF

# 3. Start first agent
# Open Claude Code: "You are Agent 1 for [project]. Read agents/agent-1.md and [first task]"
```

## ✅ Checklist for Success

Before starting sub-agents:
- [ ] Project divided into clear domains
- [ ] Each agent has written instructions
- [ ] Shared interfaces defined
- [ ] Coordination process documented
- [ ] Integration points identified

During development:
- [ ] Daily coordination updates
- [ ] Regular integration tests
- [ ] Clear handoff notes
- [ ] Conflict resolution process
- [ ] Shared success metrics

## 🚀 Go Build Something Amazing!

Sub-agents let you tackle complex projects by dividing and conquering. Each agent becomes an expert in their domain while working toward the shared goal. Start small, iterate, and watch your AI team deliver incredible results!

Remember: The key to successful sub-agents is clear communication and well-defined boundaries. Happy building! 🎉