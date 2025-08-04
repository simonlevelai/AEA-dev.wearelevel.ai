import { TurnContext, MessageFactory, CardFactory } from 'botbuilder';
import { AskEveBot } from '../bot/AskEveBot';
import { MessageContext, AgentResponse } from '../types';

export abstract class BaseAdapter {
  protected bot: AskEveBot;

  constructor(bot: AskEveBot) {
    this.bot = bot;
  }

  protected createMessageContext(turnContext: TurnContext): MessageContext {
    const activity = turnContext.activity;
    
    return {
      message: {
        text: activity.text || '',
        id: activity.id || ''
      },
      conversationId: activity.conversation?.id || '',
      userId: activity.from?.id || '',
      conversationHistory: [], // TODO: Implement conversation history retrieval
      turnContext,
      send: async (response: AgentResponse) => {
        await this.sendResponse(turnContext, response);
      },
      sendTyping: async () => {
        await this.sendTypingIndicator(turnContext);
      }
    };
  }

  protected async sendResponse(turnContext: TurnContext, response: AgentResponse): Promise<void> {
    const activity = MessageFactory.text(response.text);

    // Add attachments if present
    if (response.attachments && response.attachments.length > 0) {
      activity.attachments = response.attachments.map(attachment => ({
        contentType: attachment.contentType,
        content: attachment.content
      }));
    }

    // Add suggested actions if present
    if (response.suggestedActions && response.suggestedActions.length > 0) {
      activity.suggestedActions = {
        to: [],
        actions: response.suggestedActions.map(action => ({
          type: 'imBack',
          title: action,
          value: action
        }))
      };
    }

    await turnContext.sendActivity(activity);
  }

  protected async sendTypingIndicator(turnContext: TurnContext): Promise<void> {
    const typingActivity = MessageFactory.text('');
    typingActivity.type = 'typing';
    await turnContext.sendActivity(typingActivity);
  }

  protected createHeroCard(title: string, subtitle: string, buttons: Array<{ title: string; value: string; type: string }>): any {
    return CardFactory.heroCard(
      title,
      subtitle,
      [],
      buttons.map(button => ({
        type: button.type,
        title: button.title,
        value: button.value
      }))
    );
  }

  public async processMessage(turnContext: TurnContext): Promise<void> {
    try {
      const context = this.createMessageContext(turnContext);
      await this.bot.handleUserMessage(context);
    } catch (error) {
      console.error('Adapter error processing message:', error);
      await turnContext.sendActivity('I apologize, but I encountered an error processing your message. Please try again.');
    }
  }

  abstract configure(): void;
}