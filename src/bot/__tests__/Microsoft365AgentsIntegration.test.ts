import { AgentsSDKBot } from '../AgentsSDKBot';
import { SafetyServiceAdapter } from '../../services/SafetyServiceAdapter';
import { SupabaseContentService } from '../../services/SupabaseContentService';
import { EscalationService } from '../../services/EscalationService';
import { NotificationService } from '../../services/NotificationService';
import { Logger } from '../../utils/logger';
import { TeamsAdapter } from '../../adapters/TeamsAdapter';

// Mock external dependencies
jest.mock('../../utils/logger');
jest.mock('../../services/NotificationService');
jest.mock('fs/promises');

describe('Microsoft 365 Agents SDK Integration', () => {
  let bot: AgentsSDKBot;
  let escalationService: EscalationService;
  let safetyService: SafetyServiceAdapter;
  let contentService: SupabaseContentService;
  let teamsAdapter: TeamsAdapter;
  let mockLogger: jest.Mocked<Logger>;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeAll(async () => {
    // Setup real services for integration testing
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      critical: jest.fn(),
      shutdown: jest.fn()
    } as any;

    mockNotificationService = {
      sendCrisisAlert: jest.fn(),
      sendFollowUpNotification: jest.fn()
    } as any;

    // Mock PiF data for content service
    const mockPiFData = [
      {
        id: 'ovarian-symptoms-chunk',
        content: 'Common symptoms of ovarian cancer include persistent bloating, feeling full quickly when eating, pelvic or abdominal pain, and needing to urinate urgently or more often. These symptoms become more frequent and/or worsen over time.',
        source: 'The Eve Appeal - Ovarian Cancer Information', 
        title: 'Ovarian Cancer Symptoms'
      },
      {
        id: 'cervical-screening-chunk',
        content: 'Cervical screening (smear test) checks the health of your cervix. It is not a test for cancer, it is a test to help prevent cancer by finding abnormal cells.',
        source: 'The Eve Appeal - Cervical Screening',
        title: 'Cervical Screening Information'
      },
      {
        id: 'crisis-support-chunk',
        content: 'If you are experiencing thoughts of self-harm or suicide, please reach out for immediate support. Contact Samaritans on 116 123 (free, 24/7) or emergency services on 999.',
        source: 'The Eve Appeal - Crisis Support',
        title: 'Crisis Support Resources'
      }
    ];

    require('fs/promises').__setMockFiles({
      'data/pif-chunks.json': JSON.stringify(mockPiFData),
      'data/crisis-triggers.json': JSON.stringify({
        suicide_ideation: ['kill myself', 'want to die', 'suicide', 'end my life'],
        self_harm: ['cut myself', 'hurt myself', 'self harm']
      }),
      'data/high-concern-triggers.json': JSON.stringify({
        life_threatening: ['chest pain', 'can\'t breathe', 'severe bleeding']
      }),
      'data/emotional-support-triggers.json': JSON.stringify({
        distress: ['depressed', 'anxious', 'worried']
      }),
      'config/safety-config.json': JSON.stringify({
        response_times: {
          crisis_detection_ms: 2000
        },
        crisis_responses: {
          mental_health: {
            message: 'I\'m concerned about what you\'ve shared.',
            immediate_resources: ['Samaritans: 116 123', 'Emergency: 999']
          },
          medical_emergency: {
            message: 'This sounds like it may need urgent medical attention.',
            immediate_resources: ['Emergency Services: 999', 'NHS 111: 111']
          },
          domestic_violence: {
            message: 'If you\'re in immediate danger, please contact emergency services.',
            immediate_resources: ['Emergency Services: 999', 'National Domestic Violence Helpline: 0808 2000 247']
          }
        },
        mhra_compliance: {
          required_disclaimers: {
            general: 'This is general health information only.',
            medical: 'Always consult your healthcare provider for medical concerns.',
            emergency: 'If this is an emergency, call 999 immediately.'
          }
        }
      })
    });

    // Initialize services
    escalationService = new EscalationService(mockLogger, mockNotificationService);
    await escalationService.initialize();

    safetyService = new SafetyServiceAdapter(escalationService, mockLogger);
    contentService = new SupabaseContentService(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      mockLogger
    );
    await contentService.initialize();

    // Initialize bot with services
    bot = new AgentsSDKBot({
      botId: 'ask-eve-assist-integration',
      botName: 'Ask Eve Assist Integration Test',
      safetyService,
      contentService
    });

    // Initialize Teams adapter
    teamsAdapter = new TeamsAdapter(bot);
    teamsAdapter.configure();
  });

  describe('End-to-End Safety Integration', () => {
    it('should handle crisis messages with sub-2-second response time', async () => {
      const crisisMessage = 'I want to kill myself I can\'t take it anymore';
      const mockContext = createMockTurnContext(crisisMessage);
      
      const startTime = Date.now();
      await bot.handleMessage(mockContext);
      const responseTime = Date.now() - startTime;
      
      // Verify response time requirement
      expect(responseTime).toBeLessThan(2000);
      
      // Verify crisis response content
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/Samaritans.*116 123.*Emergency.*999/s)
        })
      );
    });

    it('should escalate medical emergencies appropriately', async () => {
      const emergencyMessage = 'severe chest pain can\'t breathe';
      const mockContext = createMockTurnContext(emergencyMessage);
      
      await bot.handleMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/Call 999.*emergency services/s)
        })
      );
    });

    it('should never bypass safety analysis for any message', async () => {
      const messages = [
        'hello',
        'ovarian cancer symptoms',
        'I want to die',
        'chest pain emergency',
        'normal health question'
      ];

      const safetyAnalyzeSpy = jest.spyOn(safetyService, 'analyzeMessage');

      for (const message of messages) {
        const mockContext = createMockTurnContext(message);
        await bot.handleMessage(mockContext);
      }

      expect(safetyAnalyzeSpy).toHaveBeenCalledTimes(messages.length);
    });
  });

  describe('Content Integration with MHRA Compliance', () => {
    it('should only provide content with valid Eve Appeal source URLs', async () => {
      const healthQuery = 'ovarian cancer symptoms';
      const mockContext = createMockTurnContext(healthQuery);
      
      await bot.handleMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                buttons: expect.arrayContaining([
                  expect.objectContaining({
                    value: expect.stringMatching(/^https:\/\/eveappeal\.org\.uk/)
                  })
                ])
              })
            })
          ])
        })
      );
    });

    it('should provide comprehensive health information from PiF content', async () => {
      const query = 'cervical screening information';
      const mockContext = createMockTurnContext(query);
      
      await bot.handleMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/cervical.*screening.*smear.*test/s)
        })
      );
    });

    it('should refuse to generate content without proper source attribution', async () => {
      // This should be handled by the SupabaseContentService validation
      const mockContext = createMockTurnContext('random medical question without source');
      
      await bot.handleMessage(mockContext);
      
      // Should provide fallback response directing to professionals
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/don't have specific information.*GP.*Eve Appeal/s)
        })
      );
    });
  });

  describe('Teams Integration', () => {
    it('should handle Teams-specific context properly', async () => {
      const teamsContext = createMockTeamsContext('hello');
      
      await teamsAdapter.processMessage(teamsContext);
      
      // Should process normally without errors
      expect(teamsContext.sendActivity).toHaveBeenCalled();
    });

    it('should create Teams-specific welcome cards', async () => {
      const teamsContext = createMockTeamsContext('', true); // Member added
      
      // Mock the members added event
      teamsContext.activity.membersAdded = [
        { id: 'new-user-id', name: 'New User' }
      ];
      teamsContext.activity.recipient = { id: 'bot-id' };
      
      await teamsAdapter['handleMembersAdded'](teamsContext);
      
      expect(teamsContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                title: expect.stringContaining('Welcome to Ask Eve Assist')
              })
            })
          ])
        })
      );
    });

    it('should provide Teams-appropriate suggested actions', async () => {
      const mockContext = createMockTeamsContext('ovarian cancer symptoms');
      
      await teamsAdapter.processMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedActions: expect.objectContaining({
            actions: expect.arrayContaining([
              expect.objectContaining({
                type: 'messageBack'
              })
            ])
          })
        })
      );
    });
  });

  describe('RAG (Retrieval-Augmented Generation) Integration', () => {
    it('should clean queries before processing', async () => {
      const messyQuery = 'um... can you tell me about... you know... ovarian cancer symptoms please?';
      const mockContext = createMockTurnContext(messyQuery);
      
      const cleanQuerySpy = jest.spyOn(bot as any, 'cleanQuery');
      
      await bot.handleMessage(mockContext);
      
      expect(cleanQuerySpy).toHaveBeenCalledWith(messyQuery);
      
      // Should still find relevant content despite messy input
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/ovarian.*cancer.*symptoms/s)
        })
      );
    });

    it('should build proper RAG context with sources', async () => {
      const query = 'what are the signs of ovarian cancer?';
      const mockContext = createMockTurnContext(query);
      
      const buildContextSpy = jest.spyOn(bot as any, 'buildRAGContext');
      
      await bot.handleMessage(mockContext);
      
      expect(buildContextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          found: true,
          content: expect.any(String),
          sourceUrl: expect.stringMatching(/https:\/\/eveappeal\.org\.uk/)
        }),
        expect.any(String) // cleaned query
      );
    });

    it('should generate AI responses with mandatory source attribution', async () => {
      const query = 'ovarian cancer symptoms';
      const mockContext = createMockTurnContext(query);
      
      await bot.handleMessage(mockContext);
      
      // Should have both AI-generated response and source attribution
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.any(String),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                title: 'Information Source',
                buttons: expect.arrayContaining([
                  expect.objectContaining({
                    title: '📖 Read Full Information',
                    value: expect.stringMatching(/^https:\/\/eveappeal\.org\.uk/)
                  })
                ])
              })
            })
          ])
        })
      );
    });
  });

  describe('Bot Disclosure and Conversation Flow', () => {
    it('should provide proper bot disclosure on greeting', async () => {
      const greetingContext = createMockTurnContext('hello');
      
      await bot.handleMessage(greetingContext);
      
      expect(greetingContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/Ask Eve Assist.*digital assistant.*not a medical professional.*Eve Appeal/s),
          suggestedActions: expect.objectContaining({
            actions: expect.arrayContaining([
              expect.objectContaining({
                title: expect.stringMatching(/ovarian.*cancer.*symptoms/i)
              })
            ])
          })
        })
      );
    });

    it('should maintain conversation history across messages', async () => {
      const firstMessage = 'hello';
      const secondMessage = 'ovarian cancer symptoms';
      
      const firstContext = createMockTurnContext(firstMessage);
      const secondContext = createMockTurnContext(secondMessage);
      
      // Set same conversation ID
      firstContext.activity.conversation = { id: 'test-conversation' };
      secondContext.activity.conversation = { id: 'test-conversation' };
      
      await bot.handleMessage(firstContext);
      await bot.handleMessage(secondContext);
      
      // Second message should have access to conversation history
      const conversationHistory = bot['conversationHistory'].get('test-conversation');
      expect(conversationHistory).toBeDefined();
      expect(conversationHistory?.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle service failures gracefully', async () => {
      // Mock a service failure
      const failingContentService = {
        searchContent: jest.fn().mockRejectedValue(new Error('Service failure'))
      };
      
      const failingBot = new AgentsSDKBot({
        botId: 'test-failing-bot',
        botName: 'Test Failing Bot',
        safetyService,
        contentService: failingContentService as any
      });
      
      const mockContext = createMockTurnContext('health question');
      
      await failingBot.handleMessage(mockContext);
      
      // Should provide graceful error response
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/technical difficulties.*GP.*NHS 111/s)
        })
      );
    });

    it('should default to escalation on safety system failure', async () => {
      const failingSafetyService = {
        analyzeMessage: jest.fn().mockRejectedValue(new Error('Safety system failure'))
      };
      
      const failingBot = new AgentsSDKBot({
        botId: 'test-failing-bot',
        botName: 'Test Failing Bot', 
        safetyService: failingSafetyService as any,
        contentService
      });
      
      const mockContext = createMockTurnContext('any message');
      
      await failingBot.handleMessage(mockContext);
      
      // Should escalate when safety analysis fails
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/concerned.*Samaritans.*116 123/s)
        })
      );
    });
  });
});

// Helper functions
function createMockTurnContext(text: string, isTeams: boolean = false) {
  return {
    activity: {
      text,
      id: `msg-${Date.now()}`,
      from: { id: 'test-user' },
      conversation: { id: 'test-conversation' },
      channelData: isTeams ? {
        channel: { id: 'test-channel' },
        team: { id: 'test-team' },
        tenant: { id: 'test-tenant' }
      } : undefined
    },
    sendActivity: jest.fn().mockResolvedValue({ id: 'response-id' }),
    sendActivities: jest.fn().mockResolvedValue([{ id: 'response-id' }])
  } as any;
}

function createMockTeamsContext(text: string, membersAdded: boolean = false) {
  const context = createMockTurnContext(text, true);
  
  if (membersAdded) {
    context.activity.type = 'conversationUpdate';
    context.activity.membersAdded = [
      { id: 'new-user-id', name: 'New User' }
    ];
    context.activity.recipient = { id: 'bot-id' };
  }
  
  return context;
}

// Mock fs module
const mockFs = {
  __setMockFiles: (files: Record<string, string>) => {
    mockFs.__mockFiles = files;
  },
  __mockFiles: {} as Record<string, string>,
  readFile: jest.fn().mockImplementation((path: string) => {
    const normalizedPath = path.replace(process.cwd() + '/', '');
    if (mockFs.__mockFiles[normalizedPath]) {
      return Promise.resolve(mockFs.__mockFiles[normalizedPath]);
    }
    return Promise.reject(new Error(`File not found: ${path}`));
  })
};

require('fs/promises').__setMockFiles = mockFs.__setMockFiles;
require('fs/promises').readFile = mockFs.readFile;