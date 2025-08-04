import { 
  MessageContext, 
  AgentResponse, 
  AgentOptions, 
  SafetyResult, 
  SearchResponse, 
  BotDisclosure 
} from '../types';

export class AskEveBot {
  private readonly options: AgentOptions;
  private readonly botDisclosure: BotDisclosure;

  constructor(options: AgentOptions) {
    this.options = options;
    this.botDisclosure = {
      text: "Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal.",
      followUp: "How can I help you today?",
      suggestedActions: [
        "Ovarian cancer symptoms",
        "Cervical screening info", 
        "Support services",
        "Speak to a nurse"
      ]
    };
  }

  async handleUserMessage(context: MessageContext): Promise<void> {
    try {
      // 1. ALWAYS check safety first - NEVER bypass this
      const safetyResult = await this.options.safetyService.analyzeMessage(
        context.message.text,
        context.conversationHistory
      );

      if (safetyResult.shouldEscalate) {
        // Safety Guardian takes over
        await this.handleEscalation(context, safetyResult);
        return;
      }

      // 2. Only proceed if safe
      await this.handleNormalQuery(context);
    } catch (error) {
      await this.handleError(context, error);
    }
  }

  private async handleEscalation(context: MessageContext, safetyResult: SafetyResult): Promise<void> {
    let escalationResponse: AgentResponse;

    switch (safetyResult.escalationType) {
      case 'self_harm':
        escalationResponse = {
          text: "I'm concerned about what you've shared. If you're having thoughts of self-harm, please reach out for urgent support:\n\n• Samaritans: 116 123 (free, 24/7)\n• Text SHOUT to 85258\n• Emergency services: 999\n\nYour safety and wellbeing matter. Please speak to someone who can help.",
          suggestedActions: ["Call Samaritans", "Emergency Services", "Text SHOUT"]
        };
        break;

      case 'medical_emergency':
        escalationResponse = {
          text: "This sounds like it may need urgent medical attention. Please:\n\n• Call 999 for emergency services\n• Contact your GP urgently\n• Visit A&E if symptoms are severe\n\nI can provide general health information, but I cannot assess medical emergencies. Please seek immediate medical help.",
          suggestedActions: ["Call 999", "Contact GP", "Find A&E"]
        };
        break;

      default:
        escalationResponse = {
          text: "I need to direct you to speak with a healthcare professional about this. Please contact:\n\n• Your GP\n• The Eve Appeal Nurse Line\n• NHS 111 for non-emergency health advice\n\nI'm here to provide general information, but this needs professional guidance.",
          suggestedActions: ["Contact GP", "Eve Appeal Nurses", "Call NHS 111"]
        };
    }

    await context.send(escalationResponse);
  }

  private async handleNormalQuery(context: MessageContext): Promise<void> {
    // Check if this is a greeting or first interaction - but only for actual greetings, not all messages
    if (context.conversationHistory.length === 0 && this.isGreeting(context.message.text)) {
      await this.sendBotDisclosure(context);
      return;
    }

    // Show typing indicator
    await context.sendTyping();

    try {
      // ONLY use Content Pipeline Agent's service - NEVER generate content
      const searchResponse = await this.options.contentService.searchContent(
        context.message.text
      );

      if (!searchResponse.found) {
        await this.handleNoContentFound(context);
        return;
      }

      // CRITICAL: Validate source URL exists
      if (!searchResponse.sourceUrl) {
        await this.handleMissingSourceUrl(context, searchResponse);
        return;
      }

      // Build response with mandatory source attribution
      const response = this.buildSourcedResponse(searchResponse);
      await context.send(response);

    } catch (error) {
      throw error; // Re-throw to be handled by main error handler
    }
  }

  private isGreeting(text: string): boolean {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const lowerText = text.toLowerCase().trim();
    return greetings.some(greeting => lowerText.includes(greeting)) && text.length < 50;
  }

  private async sendBotDisclosure(context: MessageContext): Promise<void> {
    const response: AgentResponse = {
      text: `${this.botDisclosure.text}\n\n${this.botDisclosure.followUp}`,
      suggestedActions: this.botDisclosure.suggestedActions
    };
    
    await context.send(response);
  }

  private async handleNoContentFound(context: MessageContext): Promise<void> {
    const response: AgentResponse = {
      text: "I don't have specific information about that topic in my knowledge base. For personalized health advice, I'd recommend:\n\n• Speaking to your GP\n• Contacting The Eve Appeal nurse line\n• Calling NHS 111 for health guidance\n\nIs there something else about gynaecological health I can help you find information about?",
      suggestedActions: [
        "Ovarian cancer symptoms",
        "Cervical screening",
        "Contact a nurse",
        "Common conditions"
      ]
    };

    await context.send(response);
  }

  private async handleMissingSourceUrl(context: MessageContext, _searchResponse: SearchResponse): Promise<void> {
    const response: AgentResponse = {
      text: "I found some information about your question, but I'm unable to provide it without a proper source reference. This is to ensure you only receive information from trusted, verified sources.\n\nPlease try rephrasing your question, or contact The Eve Appeal directly for reliable health information.",
      suggestedActions: [
        "Try different keywords",
        "Contact Eve Appeal",
        "Speak to a nurse"
      ]
    };

    await context.send(response);
  }

  private buildSourcedResponse(searchResponse: SearchResponse): AgentResponse {
    if (!searchResponse.content || !searchResponse.source || !searchResponse.sourceUrl) {
      throw new Error('Invalid search response: missing required fields');
    }

    return {
      text: searchResponse.content,
      attachments: [{
        contentType: 'application/vnd.microsoft.card.hero',
        content: {
          title: 'Information Source',
          subtitle: searchResponse.source,
          buttons: [{
            type: 'openUrl',
            title: '📖 Read Full Information',
            value: searchResponse.sourceUrl
          }]
        }
      }],
      // Inline citation
      markdown: `${searchResponse.content}\n\n*Source: [${searchResponse.source}](${searchResponse.sourceUrl})*`
    };
  }

  private async handleError(context: MessageContext, error: unknown): Promise<void> {
    console.error('Bot error:', error);
    
    const response: AgentResponse = {
      text: "I'm sorry, I'm experiencing technical difficulties at the moment. Please try again in a few moments.\n\nIf you need immediate health information, please:\n• Contact your GP\n• Call NHS 111\n• Visit The Eve Appeal website directly",
      suggestedActions: [
        "Try again",
        "Contact GP", 
        "Visit Eve Appeal"
      ]
    };

    await context.send(response);
  }
}