import { AgentsSDKBot } from '../AgentsSDKBot';
import { SafetyService, ContentService } from '../../types';

// Mock OpenAI client
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Based on the provided information from The Eve Appeal, common symptoms of ovarian cancer include persistent bloating, feeling full quickly when eating, pelvic or abdominal pain, and needing to urinate urgently or more often. If you experience these symptoms persistently, it\'s important to see your GP.\n\nSource: https://eveappeal.org.uk/ovarian-cancer'
              }
            }]
          })
        }
      }
    }))
  };
});

// Mock services that implement the required interfaces
class MockSafetyService implements SafetyService {
  async analyzeMessage(text: string, _conversationHistory: any[]): Promise<any> {
    const dangerWords = ['suicide', 'kill myself', 'want to die', 'self harm'];
    const hasDanger = dangerWords.some(word => text.toLowerCase().includes(word));
    
    return {
      shouldEscalate: hasDanger,
      severity: hasDanger ? 'critical' : 'low',
      escalationType: hasDanger ? 'self_harm' : undefined
    };
  }
}

class MockContentService implements ContentService {
  async searchContent(query: string): Promise<any> {
    if (query.toLowerCase().includes('ovarian cancer')) {
      return {
        found: true,
        content: 'Common symptoms of ovarian cancer include persistent bloating, feeling full quickly when eating, pelvic or abdominal pain, and needing to urinate urgently or more often.',
        source: 'The Eve Appeal - Ovarian Cancer Information',
        sourceUrl: 'https://eveappeal.org.uk/ovarian-cancer'
      };
    }
    return { found: false };
  }
}

describe('AgentsSDKBot', () => {
  let bot: AgentsSDKBot;
  let mockSafetyService: MockSafetyService;
  let mockContentService: MockContentService;

  beforeEach(() => {
    mockSafetyService = new MockSafetyService();
    mockContentService = new MockContentService();
    
    bot = new AgentsSDKBot({
      botId: 'test-ask-eve',
      botName: 'Test Ask Eve Assist',
      safetyService: mockSafetyService,
      contentService: mockContentService
    });
  });

  describe('initialization', () => {
    it('should create bot instance with required services', () => {
      expect(bot).toBeDefined();
      expect(bot).toBeInstanceOf(AgentsSDKBot);
    });

    it('should have low temperature setting for health accuracy', () => {
      expect(bot.getTemperature()).toBe(0.1);
    });
  });

  describe('safety systems', () => {
    it('should escalate crisis messages immediately', async () => {
      const crisisMessage = 'I want to kill myself';
      const mockContext = createMockContext(crisisMessage);
      
      await bot.handleMessage(mockContext);
      
      // Should have sent crisis response within 2 seconds
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Samaritans: 116 123')
        })
      );
    });

    it('should not bypass safety analysis for any message', async () => {
      const normalMessage = 'Tell me about ovarian cancer symptoms';
      const mockContext = createMockContext(normalMessage);
      const safetyAnalyzeSpy = jest.spyOn(mockSafetyService, 'analyzeMessage');
      
      await bot.handleMessage(mockContext);
      
      expect(safetyAnalyzeSpy).toHaveBeenCalledWith(normalMessage, []);
    });
  });

  describe('content responses', () => {
    it('should only provide content with valid source URLs', async () => {
      const query = 'ovarian cancer symptoms';
      const mockContext = createMockContext(query);
      
      await bot.handleMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ovarian cancer'),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                buttons: expect.arrayContaining([
                  expect.objectContaining({
                    value: 'https://eveappeal.org.uk/ovarian-cancer'
                  })
                ])
              })
            })
          ])
        })
      );
    });

    it('should refuse to generate content without sources', async () => {
      const unknownQuery = 'random medical question';
      const mockContext = createMockContext(unknownQuery);
      
      await bot.handleMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("I don't have specific information")
        })
      );
    });
  });

  describe('conversation memory', () => {
    it('should maintain conversation state between messages', async () => {
      const firstMessage = 'Hello';
      const secondMessage = 'Tell me about cervical screening';
      
      const firstContext = createMockContext(firstMessage);
      const secondContext = createMockContext(secondMessage);
      
      // Spy on the safety service method
      const safetyAnalyzeSpy = jest.spyOn(mockSafetyService, 'analyzeMessage');
      
      await bot.handleMessage(firstContext);
      await bot.handleMessage(secondContext);
      
      // Should have conversation history in second call
      expect(safetyAnalyzeSpy).toHaveBeenLastCalledWith(
        secondMessage,
        expect.arrayContaining([
          expect.objectContaining({ text: firstMessage, isUser: true })
        ])
      );
    });
  });

  describe('RAG (Retrieval-Augmented Generation) integration', () => {
    it('should clean and prepare user queries for search', async () => {
      const messyQuery = 'um... can you tell me about... you know... ovarian cancer symptoms please?';
      const mockContext = createMockContext(messyQuery);
      
      // Spy on the new cleanQuery method that doesn't exist yet
      const cleanQuerySpy = jest.spyOn(bot as any, 'cleanQuery');
      
      await bot.handleMessage(mockContext);
      
      // Should call cleanQuery method
      expect(cleanQuerySpy).toHaveBeenCalledWith(messyQuery);
    });

    it('should retrieve relevant content from Azure AI Search', async () => {
      const query = 'ovarian cancer symptoms';
      const mockContext = createMockContext(query);
      const contentServiceSpy = jest.spyOn(mockContentService, 'searchContent');
      
      await bot.handleMessage(mockContext);
      
      expect(contentServiceSpy).toHaveBeenCalledWith(query);
    });

    it('should validate all retrieved content has valid source URLs', async () => {
      // Mock content service to return content without source URL
      const mockContentServiceWithoutUrl = {
        async searchContent(_query: string) {
          return {
            found: true,
            content: 'Some content',
            source: 'Eve Appeal',
            sourceUrl: '' // Missing URL
          };
        }
      };
      
      const botWithoutUrl = new AgentsSDKBot({
        botId: 'test-ask-eve',
        botName: 'Test Ask Eve Assist',
        safetyService: mockSafetyService,
        contentService: mockContentServiceWithoutUrl
      });
      
      const mockContext = createMockContext('ovarian cancer');
      await botWithoutUrl.handleMessage(mockContext);
      
      // Should reject content without source URL
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('unable to provide it without a proper source reference')
        })
      );
    });

    it('should build context with retrieved content and sources for OpenAI', async () => {
      const query = 'ovarian cancer symptoms';
      const mockContext = createMockContext(query);
      
      // Spy on the buildRAGContext method that doesn't exist yet
      const buildContextSpy = jest.spyOn(bot as any, 'buildRAGContext');
      
      await bot.handleMessage(mockContext);
      
      // Should call buildRAGContext with search results
      expect(buildContextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          found: true,
          content: expect.any(String),
          sourceUrl: expect.stringMatching(/https:\/\/eveappeal\.org\.uk/)
        }),
        query
      );
    });

    it('should generate response using OpenAI with mandatory source attribution', async () => {
      const query = 'what are signs of ovarian cancer?';
      const mockContext = createMockContext(query);
      
      // Spy on the generateOpenAIResponse method that doesn't exist yet
      const generateResponseSpy = jest.spyOn(bot as any, 'generateOpenAIResponse');
      
      await bot.handleMessage(mockContext);
      
      // Should call generateOpenAIResponse with context and query
      expect(generateResponseSpy).toHaveBeenCalledWith(
        expect.any(String), // RAG context
        'what are signs of ovarian cancer' // cleaned query
      );
    });

    it('should ensure safety checks happen before RAG processing', async () => {
      const crisisQuery = 'I want to die, tell me about ovarian cancer';
      const mockContext = createMockContext(crisisQuery);
      const safetyAnalyzeSpy = jest.spyOn(mockSafetyService, 'analyzeMessage');
      const contentServiceSpy = jest.spyOn(mockContentService, 'searchContent');
      
      await bot.handleMessage(mockContext);
      
      // Safety should be checked
      expect(safetyAnalyzeSpy).toHaveBeenCalledWith(crisisQuery, []);
      
      // Should escalate without calling content service
      expect(contentServiceSpy).not.toHaveBeenCalled();
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Samaritans: 116 123')
        })
      );
    });

    it('should maintain crisis response time under 2 seconds', async () => {
      const crisisMessage = 'I want to kill myself';
      const mockContext = createMockContext(crisisMessage);
      
      const startTime = Date.now();
      await bot.handleMessage(mockContext);
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(2000);
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Samaritans: 116 123')
        })
      );
    });

    it('should format responses with clickable source links', async () => {
      const query = 'cervical screening information';
      const mockContext = createMockContext(query);
      
      // Mock content service for cervical screening
      const mockContentServiceWithCervical = {
        async searchContent(_query: string) {
          return {
            found: true,
            content: 'Cervical screening checks the health of your cervix.',
            source: 'The Eve Appeal - Cervical Screening',
            sourceUrl: 'https://eveappeal.org.uk/cervical-screening'
          };
        }
      };
      
      const botWithCervical = new AgentsSDKBot({
        botId: 'test-ask-eve',
        botName: 'Test Ask Eve Assist',
        safetyService: mockSafetyService,
        contentService: mockContentServiceWithCervical
      });
      
      await botWithCervical.handleMessage(mockContext);
      
      expect(mockContext.sendActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                buttons: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'openUrl',
                    title: '📖 Read Full Information',
                    value: 'https://eveappeal.org.uk/cervical-screening'
                  })
                ])
              })
            })
          ])
        })
      );
    });
  });

  describe('Microsoft 365 Agents SDK integration', () => {
    it('should use OpenAI gpt-4o-mini model', () => {
      expect(bot.getModelName()).toBe('gpt-4o-mini');
    });

    it('should integrate with AgentApplication pattern', () => {
      expect(bot.getAgentApplication()).toBeDefined();
    });
  });
});

// Helper function to create mock context
function createMockContext(text: string, history: any[] = []) {
  return {
    activity: {
      text,
      from: { id: 'test-user' },
      conversation: { id: 'test-conversation' }
    },
    sendActivity: jest.fn(),
    sendTyping: jest.fn(),
    conversationHistory: history,
    turnState: new Map()
  };
}