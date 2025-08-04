import { 
  TeamsActivityHandler, 
  TurnContext, 
  CardFactory, 
  MessageFactory,
  TeamsInfo,
  Activity
} from 'botbuilder';
import { AskEveBot } from '../bot/AskEveBot';
import { BaseAdapter } from './BaseAdapter';

export class TeamsAdapter extends BaseAdapter {
  private teamsHandler: TeamsActivityHandler;

  constructor(bot: AskEveBot) {
    super(bot);
    this.teamsHandler = new TeamsActivityHandler();
    this.setupTeamsHandlers();
  }

  public configure(): void {
    console.log('TeamsAdapter configured successfully');
  }

  private setupTeamsHandlers(): void {
    // Handle new team members being added
    this.teamsHandler.onMembersAdded(async (context: TurnContext, next) => {
      await this.handleMembersAdded(context);
      await next();
    });

    // Handle regular messages
    this.teamsHandler.onMessage(async (context: TurnContext, next) => {
      await this.processMessage(context);
      await next();
    });

    // Handle Teams channel creation
    this.teamsHandler.onTeamsChannelCreated(async (context: TurnContext, next) => {
      await this.sendTeamsWelcomeCard(context);
      await next();
    });
  }

  private async handleMembersAdded(context: TurnContext): Promise<void> {
    const membersAdded = context.activity.membersAdded;
    
    if (membersAdded && membersAdded.length > 0) {
      for (const member of membersAdded) {
        // Don't greet the bot itself
        if (member.id !== context.activity.recipient.id) {
          await this.sendTeamsWelcomeCard(context);
        }
      }
    }
  }

  private async sendTeamsWelcomeCard(context: TurnContext): Promise<void> {
    const welcomeCard = this.createTeamsWelcomeCard();
    const message = MessageFactory.attachment(welcomeCard);
    await context.sendActivity(message);
  }

  private createTeamsWelcomeCard(): any {
    return CardFactory.heroCard(
      'Welcome to Ask Eve Assist! 🌸',
      "I'm here to help you find trusted information about gynaecological health from The Eve Appeal.",
      ['https://eveappeal.org.uk/wp-content/uploads/2021/03/eve-appeal-logo-purple.png'], // Eve Appeal logo
      [
        {
          type: 'messageBack',
          title: '🔍 Ovarian Cancer Symptoms',
          text: 'ovarian cancer symptoms',
          value: 'ovarian_symptoms'
        },
        {
          type: 'messageBack', 
          title: '🏥 Cervical Screening',
          text: 'cervical screening information',
          value: 'cervical_screening'
        },
        {
          type: 'messageBack',
          title: '💬 Support Services', 
          text: 'support services',
          value: 'support_services'
        },
        {
          type: 'openUrl',
          title: '🌐 Visit The Eve Appeal',
          value: 'https://eveappeal.org.uk'
        }
      ]
    );
  }

  // Override to provide Teams-specific functionality
  protected async sendResponse(turnContext: TurnContext, response: any): Promise<void> {
    const activity = MessageFactory.text(response.text);

    // Handle Teams-specific attachments
    if (response.attachments && response.attachments.length > 0) {
      activity.attachments = response.attachments.map((attachment: any) => {
        if (attachment.contentType === 'application/vnd.microsoft.card.hero') {
          // Convert to Teams hero card
          return this.createHeroCard(
            attachment.content.title,
            attachment.content.subtitle,
            attachment.content.buttons || []
          );
        }
        return attachment;
      });
    }

    // Add suggested actions for Teams
    if (response.suggestedActions && response.suggestedActions.length > 0) {
      activity.suggestedActions = {
        actions: response.suggestedActions.map((action: string) => ({
          type: 'messageBack',
          title: action,
          text: action,
          value: action.toLowerCase().replace(/\s+/g, '_')
        }))
      };
    }

    await turnContext.sendActivity(activity);
  }

  // Teams-specific message context creation
  protected createMessageContext(turnContext: TurnContext): any {
    const context = super.createMessageContext(turnContext);
    
    // Add Teams-specific context
    return {
      ...context,
      channel: 'msteams',
      teamsChannelId: turnContext.activity.channelData?.channel?.id,
      teamId: turnContext.activity.channelData?.team?.id,
      tenantId: turnContext.activity.channelData?.tenant?.id
    };
  }

  public getHandler(): TeamsActivityHandler {
    return this.teamsHandler;
  }

  // Method to get team member info (useful for personalization)
  public async getTeamMember(context: TurnContext, userId: string): Promise<any> {
    try {
      return await TeamsInfo.getMember(context, userId);
    } catch (error) {
      console.warn('Could not get team member info:', error);
      return null;
    }
  }

  // Method to get team details
  public async getTeamDetails(context: TurnContext): Promise<any> {
    try {
      return await TeamsInfo.getTeamDetails(context);
    } catch (error) {
      console.warn('Could not get team details:', error);
      return null;
    }
  }
}