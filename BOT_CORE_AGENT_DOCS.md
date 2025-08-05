# Bot Core Agent - Ask Eve Assist

## 🤖 Your Mission

You are the Bot Core specialist for Ask Eve Assist. You implement the main conversation logic, ensuring every interaction is safe, helpful, and sourced exclusively from approved content. You're the conductor orchestrating all the other services.

## 🎯 Core Responsibilities

1. **Conversation Management**
   - Handle all user messages
   - Maintain conversation context
   - Route to appropriate handlers
   - Ensure smooth user experience

2. **RAG-Only Responses**
   - NEVER generate freestyle content
   - Always retrieve from approved sources
   - Maintain source attribution
   - Handle "not found" gracefully

3. **Channel Integration**
   - Web widget implementation
   - Teams bot configuration
   - Future: WhatsApp/Voice ready
   - Consistent experience across channels

4. **Safety Integration**
   - Check EVERY message with Safety Guardian
   - Implement escalation flows
   - Handle handoffs smoothly
   - Never bypass safety checks

## 📁 Your Files

### Primary Ownership
```
src/bot/AskEveBot.ts                 # Main bot class
src/bot/dialogs/                     # Conversation flows
  ├── MainDialog.ts                  # Primary conversation
  ├── EscalationDialog.ts           # Escalation handling
  └── FeedbackDialog.ts             # User feedback
src/bot/middleware/                  # Message processing
  ├── SafetyMiddleware.ts           # Safety checks
  ├── LoggingMiddleware.ts          # Anonymous logging
  └── TypingMiddleware.ts           # UX improvements
src/index.ts                        # Bot startup
src/adapters/                       # Channel adapters
  ├── WebChatAdapter.ts
  └── TeamsAdapter.ts
```

### Configuration
```
config/bot-config.json              # Bot settings
config/responses.json               # Response templates
config/conversation-flow.json       # Dialog flows
```

## 🎬 Core Bot Implementation

### 1. Main Bot Class Structure (with MHRA Compliance)
```typescript
export class AskEveBot extends ActivityHandler {
  private safetyService: SafetyService;
  private contentService: ContentService;
  private complianceWrapper: MHRAComplianceWrapper;
  private conversationState: ConversationState;
  private userState: UserState;
  private dialogSet: DialogSet;
  
  constructor(dependencies: BotDependencies) {
    super();
    
    // Initialize services
    this.safetyService = dependencies.safetyService;
    this.contentService = dependencies.contentService;
    this.complianceWrapper = new MHRAComplianceWrapper();
    
    // Setup state
    this.conversationState = dependencies.conversationState;
    this.userState = dependencies.userState;
    
    // Initialize dialogs
    this.setupDialogs();
    
    // Register handlers
    this.registerHandlers();
  }
  
  private registerHandlers(): void {
    // CRITICAL: Safety check happens FIRST
    this.onMessage(async (context, next) => {
      // 1. Bot disclosure for new conversations
      if (await this.isNewConversation(context)) {
        await this.sendBotDisclosure(context);
      }
      
      // 2. ALWAYS check safety first
      const safetyCheck = await this.safetyService.analyze(
        context.activity.text,
        await this.getConversationContext(context)
      );
      
      if (safetyCheck.shouldEscalate) {
        // Hand to escalation dialog
        await this.dialogSet.add(new EscalationDialog(safetyCheck));
        return;
      }
      
      // 3. Process normal message
      await this.handleUserMessage(context);
      
      await next();
    });
  }
}
```

### 2. Bot Disclosure Implementation
```typescript
private readonly BOT_DISCLOSURE = {
  text: "Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal.",
  
  followUp: "How can I help you today? You can ask me about symptoms, screening, or support services.",
  
  suggestedActions: [
    "Ovarian cancer symptoms",
    "Cervical screening info",
    "Support services",
    "Speak to a nurse"
  ]
};

private async sendBotDisclosure(context: TurnContext): Promise<void> {
  // Send disclosure
  await context.sendActivity(MessageFactory.text(this.BOT_DISCLOSURE.text));
  
  // Brief pause for readability
  await context.sendActivity({ type: 'delay', value: 1000 });
  
  // Send follow-up with suggestions
  const followUpMessage = MessageFactory.suggestedActions(
    this.BOT_DISCLOSURE.suggestedActions,
    this.BOT_DISCLOSURE.followUp
  );
  
  await context.sendActivity(followUpMessage);
  
  // Mark conversation as disclosed
  const conversationData = await this.conversationState.get(context);
  conversationData.disclosureShown = true;
  await this.conversationState.saveChanges(context);
}
```

### 3. RAG-Only Response Handler (WITH MANDATORY SOURCE LINKS)
```typescript
private async handleUserMessage(context: TurnContext): Promise<void> {
  const userMessage = context.activity.text;
  
  // Show typing while processing
  await this.sendTypingIndicator(context);
  
  try {
    // CRITICAL: Only use content service for responses
    const searchResponse = await this.contentService.searchContent(userMessage);
    
    if (!searchResponse.found) {
      await this.handleNoContentFound(context, userMessage);
      return;
    }
    
    // VALIDATE: Source URL is mandatory
    if (!searchResponse.sourceUrl) {
      this.logger.error('Content without source URL', { contentId: searchResponse.id });
      await this.handleMissingSourceUrl(context, searchResponse);
      return;
    }
    
    // Build response with source
    const response = this.buildSourcedResponse(searchResponse);
    await context.sendActivity(response);
    
    // Add follow-up options
    await this.sendFollowUpOptions(context, searchResponse.relatedTopics);
    
  } catch (error) {
    await this.handleError(context, error);
  }
}

private buildSourcedResponse(searchResponse: SearchResponse): Partial<Activity> {
  // Create main response
  const message = MessageFactory.text(searchResponse.content);
  message.textFormat = 'markdown';
  
  // MANDATORY: Add source card with direct link
  const sourceCard = CardFactory.heroCard(
    'Information Source',
    `From: ${searchResponse.source}`,
    [`Last reviewed: ${searchResponse.lastReviewed}`],
    [
      {
        type: ActionTypes.OpenUrl,
        title: '📖 Read Full Information',
        value: searchResponse.sourceUrl // ALWAYS REQUIRED
      }
    ]
  );
  
  // For PDFs, add page reference
  if (searchResponse.sourcePage) {
    sourceCard.content.subtitle = `Page ${searchResponse.sourcePage}`;
  }
  
  message.attachments = [sourceCard];
  
  // Add inline source citation
  message.text += `\n\n*Source: [${searchResponse.source}](${searchResponse.sourceUrl})*`;
  
  return message;
}

private async handleMissingSourceUrl(
  context: TurnContext, 
  searchResponse: SearchResponse
): Promise<void> {
  // This should never happen, but safety first
  await context.sendActivity(
    "I found relevant information, but I'm unable to provide the source link. " +
    "Please visit the Eve Appeal website at https://eveappeal.org.uk for verified information."
  );
  
  // Alert team immediately
  await this.teamsService.notifyNurses({
    type: 'Technical Issue',
    trigger: 'Missing source URL',
    timestamp: new Date(),
    details: `Content ID: ${searchResponse.id}`
  });
}
```

### 4. No Content Found Handling
```typescript
private async handleNoContentFound(
  context: TurnContext, 
  userQuery: string
): Promise<void> {
  // Log for content gap analysis
  await this.logContentGap(userQuery);
  
  // Helpful response without medical advice
  const response = 
    "I don't have specific information about that in my current resources. " +
    "This might be because:\n\n" +
    "• It's a very specific medical question\n" +
    "• It's about a topic outside gynaecological health\n" +
    "• I need more details to find the right information\n\n" +
    "Would you like to:";
  
  await context.sendActivity(response);
  
  // Offer alternatives
  const alternatives = CardFactory.actions([
    {
      type: ActionTypes.ImBack,
      title: "Speak to a nurse",
      value: "I'd like to speak to a nurse"
    },
    {
      type: ActionTypes.ImBack,
      title: "Try a different question",
      value: "help"
    },
    {
      type: ActionTypes.OpenUrl,
      title: "Visit Eve Appeal website",
      value: "https://eveappeal.org.uk"
    }
  ]);
  
  await context.sendActivity({ attachments: [alternatives] });
}
```

## 🔄 Conversation Flow Management

### 1. Dialog Structure
```typescript
export class MainDialog extends ComponentDialog {
  constructor(dependencies: DialogDependencies) {
    super('MainDialog');
    
    // Add child dialogs
    this.addDialog(new TextPrompt('TextPrompt'));
    this.addDialog(new ChoicePrompt('ChoicePrompt'));
    this.addDialog(new SymptomDialog(dependencies));
    this.addDialog(new SupportDialog(dependencies));
    this.addDialog(new EscalationDialog(dependencies));
    
    // Define conversation flow
    this.addDialog(new WaterfallDialog('main', [
      this.routeStep.bind(this),
      this.processStep.bind(this),
      this.followUpStep.bind(this)
    ]));
    
    this.initialDialogId = 'main';
  }
  
  private async routeStep(stepContext: WaterfallStepContext) {
    const utterance = stepContext.context.activity.text.toLowerCase();
    
    // Route to specific dialogs
    if (utterance.includes('symptom')) {
      return await stepContext.beginDialog('SymptomDialog');
    } else if (utterance.includes('support') || utterance.includes('help')) {
      return await stepContext.beginDialog('SupportDialog');
    }
    
    // Default to content search
    return await stepContext.next();
  }
}
```

### 2. State Management
```typescript
interface ConversationData {
  disclosureShown: boolean;
  messageCount: number;
  lastTopics: string[];
  escalationHistory: EscalationEvent[];
  feedbackRequested: boolean;
}

interface UserProfile {
  // NO PII STORED
  sessionId: string; // Anonymous ID
  preferences: {
    language: string;
    fontSize: 'normal' | 'large';
  };
  // Track for quality, not identity
  topicsAccessed: string[];
  sessionStartTime: Date;
}

// State management without PII
export class StateManager {
  async getUserProfile(context: TurnContext): Promise<UserProfile> {
    const userState = await this.userState.get(context, {
      sessionId: this.generateAnonymousId(),
      preferences: { language: 'en', fontSize: 'normal' },
      topicsAccessed: [],
      sessionStartTime: new Date()
    });
    
    return userState;
  }
  
  private generateAnonymousId(): string {
    // Random ID, not linked to user
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## 📱 Channel Adapters

### 1. Web Chat Adapter
```typescript
export class WebChatAdapter {
  configure(app: Express.Application): void {
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date(),
        services: {
          bot: 'running',
          search: this.checkSearchHealth(),
          safety: this.checkSafetyHealth()
        }
      });
    });
    
    // Web chat endpoint
    app.post('/api/messages', async (req, res) => {
      await this.adapter.processActivity(req, res, async (context) => {
        // Add web-specific context
        context.turnState.set('channel', 'webchat');
        await this.bot.run(context);
      });
    });
    
    // Widget configuration endpoint
    app.get('/api/widget-config', (req, res) => {
      res.json({
        botName: 'Ask Eve Assist',
        headerText: 'Chat with Ask Eve',
        placeholder: 'Type your question...',
        theme: {
          primaryColor: '#8B1B3F', // Eve Appeal brand
          fontFamily: 'Arial, sans-serif'
        }
      });
    });
  }
}
```

### 2. Teams Adapter Configuration
```typescript
export class TeamsAdapter {
  configure(): TeamsAdapter {
    const adapter = new BotFrameworkAdapter({
      appId: process.env.TEAMS_APP_ID,
      appPassword: process.env.TEAMS_APP_PASSWORD
    });
    
    // Teams-specific middleware
    adapter.use(new TeamsMiddleware());
    
    // Handle Teams-specific events
    adapter.onTeamsChannelCreated(async (context, next) => {
      await context.sendActivity('Ask Eve Assist has been added to this channel.');
      await this.sendTeamsWelcomeCard(context);
      await next();
    });
    
    return adapter;
  }
  
  private async sendTeamsWelcomeCard(context: TurnContext): Promise<void> {
    const card = CardFactory.adaptiveCard({
      type: 'AdaptiveCard',
      version: '1.3',
      body: [
        {
          type: 'Image',
          url: 'https://eveappeal.org.uk/logo.png',
          size: 'medium'
        },
        {
          type: 'TextBlock',
          text: 'Ask Eve Assist',
          weight: 'bolder',
          size: 'large'
        },
        {
          type: 'TextBlock',
          text: 'I can help with information about:',
          wrap: true
        },
        {
          type: 'FactSet',
          facts: [
            { title: '🔍', value: 'Symptoms and signs' },
            { title: '🏥', value: 'Screening and prevention' },
            { title: '💜', value: 'Support services' },
            { title: '📞', value: 'Speaking to a nurse' }
          ]
        }
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Get Started',
          data: { action: 'start' }
        }
      ]
    });
    
    await context.sendActivity({ attachments: [card] });
  }
}
```

## 🧪 Testing Requirements

### 1. Core Functionality Tests
```typescript
describe('AskEveBot Core', () => {
  let bot: AskEveBot;
  let adapter: TestAdapter;
  
  beforeEach(() => {
    adapter = new TestAdapter();
    bot = createTestBot();
  });
  
  describe('Bot Disclosure', () => {
    test('shows disclosure on first message', async () => {
      await adapter
        .send('hello')
        .assertReply(activity => {
          expect(activity.text).toContain('Ask Eve Assist');
          expect(activity.text).toContain('not a medical professional');
          return true;
        });
    });
    
    test('does not repeat disclosure', async () => {
      await adapter
        .send('hello')
        .assertReply(activity => activity.text.includes('Ask Eve Assist'))
        .send('what are symptoms?')
        .assertReply(activity => {
          expect(activity.text).not.toContain('Ask Eve Assist');
          return true;
        });
    });
  });
  
  describe('RAG-Only Responses', () => {
    test('never generates medical advice', async () => {
      const medicalQueries = [
        'Should I take painkillers?',
        'Is it safe to wait?',
        'What treatment is best?'
      ];
      
      for (const query of medicalQueries) {
        await adapter
          .send(query)
          .assertReply(activity => {
            // Should either find content or say not found
            expect(
              activity.text.includes('information') ||
              activity.text.includes("don't have specific")
            ).toBe(true);
            return true;
          });
      }
    });
  });
});
```

### 2. Integration Tests
```typescript
describe('Service Integration', () => {
  test('safety check happens before content retrieval', async () => {
    const safetyMock = jest.spyOn(safetyService, 'analyze');
    const contentMock = jest.spyOn(contentService, 'search');
    
    await adapter.send('I want to die');
    
    // Safety should be called
    expect(safetyMock).toHaveBeenCalled();
    
    // Content should NOT be called (escalated instead)
    expect(contentMock).not.toHaveBeenCalled();
  });
  
  test('handles search service failures gracefully', async () => {
    // Mock search failure
    contentService.search = jest.fn().mockRejectedValue(new Error('Search down'));
    
    await adapter
      .send('what are symptoms?')
      .assertReply(activity => {
        expect(activity.text).toContain('trouble processing');
        expect(activity.text).toContain('0808 802 0019'); // Fallback number
        return true;
      });
  });
});
```

## 📊 Performance Requirements

```typescript
const PERFORMANCE_TARGETS = {
  messageResponse: {
    p50: 1000,  // 50th percentile < 1s
    p95: 2000,  // 95th percentile < 2s
    p99: 3000   // 99th percentile < 3s
  },
  
  concurrentUsers: 100,
  messagesPerSecond: 10,
  
  errorRate: {
    target: 0.001,    // 0.1%
    critical: 0.01    // 1% triggers alert
  }
};
```

## 🚫 Never Compromise On

1. **Safety First** - Every message through safety check
2. **RAG Only** - Never generate medical content
3. **Bot Disclosure** - Always identify as digital assistant
4. **Source Attribution** - Every fact has a source
5. **Graceful Failures** - Always have fallback options
6. **MHRA Compliance** - Never provide medical advice

## 🏥 MHRA Compliance Implementation

### Compliance Wrapper
```typescript
export class MHRAComplianceWrapper {
  private readonly SAFE_LANGUAGE = {
    replacements: {
      "your symptoms": "these symptoms",
      "you have": "someone has",
      "your condition": "this topic",
      "you should": "people often",
      "diagnosis": "information"
    },
    
    forbidden: [
      "you should take",
      "your diagnosis",
      "stop taking",
      "change your medication",
      "this treatment"
    ]
  };
  
  wrapResponse(content: string, isEvening: boolean = false): string {
    // Apply safety replacements
    let safeContent = this.sanitizeContent(content);
    
    // Add evening reassurance if needed
    if (isEvening) {
      safeContent = this.addEveningReassurance(safeContent);
    }
    
    // Add standard disclaimers
    return this.addDisclaimers(safeContent);
  }
  
  private sanitizeContent(content: string): string {
    let safe = content;
    
    // Apply replacements
    Object.entries(this.SAFE_LANGUAGE.replacements).forEach(([bad, good]) => {
      safe = safe.replace(new RegExp(bad, 'gi'), good);
    });
    
    // Check forbidden phrases
    this.SAFE_LANGUAGE.forbidden.forEach(phrase => {
      if (safe.toLowerCase().includes(phrase)) {
        throw new Error('MHRA_VIOLATION: Content contains medical advice');
      }
    });
    
    return safe;
  }
  
  private addEveningReassurance(content: string): string {
    const hour = new Date().getHours();
    if (hour < 20 && hour >= 6) return content;
    
    const prefix = "🌙 We understand health concerns can feel more worrying at night. ";
    const suffix = "\n\n**Evening Support:**\n" +
      "• NHS 111 is available 24/7\n" +
      "• Samaritans: 116 123 (24/7)\n" +
      "• Your GP may have an out-of-hours service";
    
    return prefix + content + suffix;
  }
  
  private addDisclaimers(content: string): string {
    return "ℹ️ This is general health information only\n\n" + 
           content + 
           "\n\n*Always consult your healthcare provider about your individual situation*";
  }
}
```

### Feedback Collection (MHRA-Safe)
```typescript
private async handleFeedback(context: TurnContext, feedback: any): Promise<void> {
  if (feedback.helpful) {
    await context.sendActivity("Thank you! We're glad the information was clear.");
  } else {
    // MHRA-SAFE follow-up
    const followUpCard = CardFactory.actions([
      {
        type: ActionTypes.MessageBack,
        title: 'Simpler language needed',
        value: { action: 'feedback_detail', reason: 'language' }
      },
      {
        type: ActionTypes.MessageBack,
        title: 'Different topic needed',
        value: { action: 'feedback_detail', reason: 'topic' }
      },
      {
        type: ActionTypes.MessageBack,
        title: 'Speak to a nurse',
        value: { action: 'nurse_request' }
      }
    ]);
    
    await context.sendActivity({
      text: "What would make the information clearer?",
      attachments: [followUpCard]
    });
  }
  
  // Log feedback (no PII)
  this.logger.trackEvent('UserFeedback', {
    helpful: feedback.helpful,
    timestamp: new Date().toISOString(),
    contentId: feedback.messageId
  });
}
```

## 📝 Documentation You Maintain

- `docs/conversation-flows.md` - All dialog flows
- `docs/integration-guide.md` - Channel setup instructions
- `docs/response-templates.md` - Approved responses
- `docs/testing-scenarios.md` - Test coverage

## 🔄 Daily Tasks

### Throughout the Day
1. Monitor real-time conversations
2. Check response times
3. Review failed queries
4. Coordinate with Safety Guardian
5. Validate content responses

### End of Day
1. Review conversation metrics
2. Identify common failure patterns
3. Update response templates
4. Plan tomorrow's improvements

---

**Remember**: You're building the heart of Ask Eve. Every conversation should feel helpful, safe, and human - even though it's powered by AI. Make every interaction count.