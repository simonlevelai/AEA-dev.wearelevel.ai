import { AskEveBot } from '../AskEveBot';
import { MessageContext, SafetyService, ContentService, SafetyResult, SearchResponse } from '../../types';
import { FailoverManager, FailoverResult } from '../../services/FailoverManager';

// Mock services
const mockSafetyService: SafetyService = {
  analyzeMessage: jest.fn()
};

const mockContentService: ContentService = {
  searchContent: jest.fn()
};

const mockFailoverManager: FailoverManager = {
  makeRequest: jest.fn(),
  getHealthStatus: jest.fn(),
  getFailoverMetrics: jest.fn(),
  getTiers: jest.fn()
} as any;

const createMockContext = (text: string, hasHistory = true): MessageContext => ({
  message: {
    text,
    id: 'test-message-id'
  },
  conversationId: 'test-conversation-id',
  userId: 'test-user-id',
  conversationHistory: hasHistory ? [{
    text: 'Previous message',
    isUser: true,
    timestamp: new Date()
  }] : [],
  send: jest.fn(),
  sendTyping: jest.fn()
});

describe('AskEveBot Core', () => {
  let bot: AskEveBot;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = new AskEveBot({
      botId: 'ask-eve-assist',
      botName: 'Ask Eve Assist',
      safetyService: mockSafetyService,
      contentService: mockContentService
    });
  });

  describe('Bot Disclosure', () => {
    test('shows bot disclosure on first message', async () => {
      const context = createMockContext('hello', false); // No history for first message
      
      // Setup: safety check passes
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      await bot.handleUserMessage(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Ask Eve Assist'),
          text: expect.stringContaining('not a medical professional'),
          suggestedActions: expect.arrayContaining([
            'Ovarian cancer symptoms',
            'Cervical screening info',
            'Support services',
            'Speak to a nurse'
          ])
        })
      );
    });

    test('bot disclosure contains mandatory disclaimers', async () => {
      const context = createMockContext('hello', false); // No history for first message
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      await bot.handleUserMessage(context);

      const response = (context.send as jest.Mock).mock.calls[0][0];
      expect(response.text).toContain('digital assistant');
      expect(response.text).toContain('not a medical professional');
      expect(response.text).toContain('The Eve Appeal');
    });
  });

  describe('Safety-First Implementation', () => {
    test('safety check happens before content retrieval', async () => {
      const context = createMockContext('I want to die');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: true,
        severity: 'critical',
        escalationType: 'self_harm'
      } as SafetyResult);

      await bot.handleUserMessage(context);

      expect(mockSafetyService.analyzeMessage).toHaveBeenCalledWith(
        'I want to die',
        context.conversationHistory
      );
      expect(mockContentService.searchContent).not.toHaveBeenCalled();
    });

    test('escalates when safety service detects risk', async () => {
      const context = createMockContext('I want to harm myself');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: true,
        severity: 'critical',
        escalationType: 'self_harm',
        reason: 'Self-harm intent detected'
      } as SafetyResult);

      await bot.handleUserMessage(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('urgent support')
        })
      );
    });

    test('continues normal flow when safety check passes', async () => {
      const context = createMockContext('ovarian cancer symptoms');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: true,
        content: 'Ovarian cancer symptoms include...',
        source: 'The Eve Appeal - Ovarian Cancer',
        sourceUrl: 'https://eveappeal.org.uk/ovarian-cancer-symptoms'
      } as SearchResponse);

      await bot.handleUserMessage(context);

      expect(mockSafetyService.analyzeMessage).toHaveBeenCalled();
      expect(mockContentService.searchContent).toHaveBeenCalledWith('ovarian cancer symptoms');
    });
  });

  describe('RAG-Only Implementation', () => {
    test('never generates medical advice', async () => {
      const medicalQueries = [
        'Should I take painkillers?',
        'Is it safe to wait?',
        'What treatment is best?'
      ];

      for (const query of medicalQueries) {
        const context = createMockContext(query);
        
        (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
          shouldEscalate: false,
          severity: 'low'
        } as SafetyResult);

        (mockContentService.searchContent as jest.Mock).mockResolvedValue({
          found: false
        } as SearchResponse);

        await bot.handleUserMessage(context);

        const response = (context.send as jest.Mock).mock.calls[0][0];
        
        // Should either find content or say not found - never generate advice
        expect(
          response.text.includes('information') ||
          response.text.includes("don't have specific") ||
          response.text.includes('speak to a healthcare professional')
        ).toBe(true);

        jest.clearAllMocks();
      }
    });

    test('shows typing indicator while searching', async () => {
      const context = createMockContext('cervical screening');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: true,
        content: 'Cervical screening information...',
        source: 'NHS - Cervical Screening',
        sourceUrl: 'https://nhs.uk/cervical-screening'
      } as SearchResponse);

      await bot.handleUserMessage(context);

      expect(context.sendTyping).toHaveBeenCalled();
    });

    test('handles no content found gracefully', async () => {
      const context = createMockContext('unknown topic');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: false
      } as SearchResponse);

      await bot.handleUserMessage(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("don't have specific information")
        })
      );
    });

    test('validates source URL exists before responding', async () => {
      const context = createMockContext('test query');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      // Content found but no source URL
      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: true,
        content: 'Some health information...',
        source: 'Test Source'
        // sourceUrl missing
      } as SearchResponse);

      await bot.handleUserMessage(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('unable to provide')
        })
      );
    });
  });

  describe('Source Attribution', () => {
    test('includes source URL in response', async () => {
      const context = createMockContext('ovarian symptoms');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: true,
        content: 'Ovarian cancer symptoms include bloating...',
        source: 'The Eve Appeal - Ovarian Cancer Guide',
        sourceUrl: 'https://eveappeal.org.uk/ovarian-cancer-symptoms'
      } as SearchResponse);

      await bot.handleUserMessage(context);

      const response = (context.send as jest.Mock).mock.calls[0][0];
      
      expect(response.attachments).toEqual([{
        contentType: 'application/vnd.microsoft.card.hero',
        content: {
          title: 'Information Source',
          subtitle: 'The Eve Appeal - Ovarian Cancer Guide',
          buttons: [{
            type: 'openUrl',
            title: '📖 Read Full Information',
            value: 'https://eveappeal.org.uk/ovarian-cancer-symptoms'
          }]
        }
      }]);

      expect(response.markdown).toContain('[The Eve Appeal - Ovarian Cancer Guide](https://eveappeal.org.uk/ovarian-cancer-symptoms)');
    });
  });

  describe('Error Handling', () => {
    test('handles content service errors gracefully', async () => {
      const context = createMockContext('test query');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockRejectedValue(
        new Error('Content service unavailable')
      );

      await bot.handleUserMessage(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('experiencing technical difficulties')
        })
      );
    });
  });

  describe('Failover Integration', () => {
    let botWithFailover: AskEveBot;
    
    beforeEach(() => {
      botWithFailover = new AskEveBot({
        botId: 'ask-eve-assist',
        botName: 'Ask Eve Assist',
        safetyService: mockSafetyService,
        contentService: mockContentService,
        failoverManager: mockFailoverManager
      });
    });

    test('uses failover manager for crisis response generation', async () => {
      const context = createMockContext('I want to harm myself');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: true,
        severity: 'critical',
        escalationType: 'self_harm'
      } as SafetyResult);

      (mockFailoverManager.makeRequest as jest.Mock).mockResolvedValue({
        success: true,
        response: {
          content: 'Crisis response generated with AI assistance',
          provider: 'openai'
        },
        provider: 'openai',
        tier: 1,
        responseTime: 1500,
        slaViolation: false
      } as FailoverResult);

      await botWithFailover.handleUserMessage(context);

      expect(mockFailoverManager.makeRequest).toHaveBeenCalledWith(
        expect.stringContaining('harm myself'),
        { type: 'crisis' }
      );
    });

    test('maintains conversation context during provider failover', async () => {
      const context = createMockContext('tell me about cervical cancer');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: false
      } as SearchResponse);

      // First provider fails, second succeeds
      (mockFailoverManager.makeRequest as jest.Mock).mockResolvedValue({
        success: true,
        response: {
          content: 'I found information about cervical cancer. However, I can only provide information from verified sources. Please contact your GP for personalized advice.',
          provider: 'azure-openai'
        },
        provider: 'azure-openai',
        tier: 2,
        responseTime: 2800,
        slaViolation: false,
        failoverTime: 2800
      } as FailoverResult);

      await botWithFailover.handleUserMessage(context);

      expect(mockFailoverManager.makeRequest).toHaveBeenCalledWith(
        expect.stringContaining('cervical cancer'),
        { type: 'general' }
      );
    });

    test('handles complete failover system failure gracefully', async () => {
      const context = createMockContext('I need help with symptoms');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: false
      } as SearchResponse);

      // All failover tiers fail
      (mockFailoverManager.makeRequest as jest.Mock).mockResolvedValue({
        success: false,
        provider: 'none',
        tier: 0,
        responseTime: 5000,
        slaViolation: true,
        error: 'All failover tiers failed'
      } as FailoverResult);

      await botWithFailover.handleUserMessage(context);

      // Should fall back to default no-content-found response when failover fails
      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("don't have specific information"),
          suggestedActions: expect.arrayContaining([
            'Contact a nurse'
          ])
        })
      );
    });

    test('preserves crisis detection during provider failures', async () => {
      const context = createMockContext('severe bleeding emergency');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: true,
        severity: 'critical',
        escalationType: 'medical_emergency'
      } as SafetyResult);

      // Even if failover fails, crisis response should be provided
      (mockFailoverManager.makeRequest as jest.Mock).mockResolvedValue({
        success: false,
        provider: 'none',
        tier: 0,
        responseTime: 5000,
        slaViolation: true,
        humanEscalation: true,
        error: 'All failover tiers failed'
      } as FailoverResult);

      await botWithFailover.handleUserMessage(context);

      // Should still provide crisis response even with failover failure
      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('emergency services')
        })
      );
    });

    test('does not expose system failure details to users', async () => {
      const context = createMockContext('general health question');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: false
      } as SearchResponse);

      (mockFailoverManager.makeRequest as jest.Mock).mockResolvedValue({
        success: false,
        provider: 'none',
        tier: 0,
        responseTime: 5000,
        slaViolation: true,
        error: 'Circuit breaker open for all providers'
      } as FailoverResult);

      await botWithFailover.handleUserMessage(context);

      const response = (context.send as jest.Mock).mock.calls[0][0];
      
      // Should not contain technical error details
      expect(response.text).not.toContain('circuit breaker');
      expect(response.text).not.toContain('provider');
      expect(response.text).not.toContain('tier');
      expect(response.text).not.toContain('SLA');
    });

    test('handles failover system exceptions gracefully', async () => {
      const context = createMockContext('I need support');
      
      (mockSafetyService.analyzeMessage as jest.Mock).mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      } as SafetyResult);

      (mockContentService.searchContent as jest.Mock).mockResolvedValue({
        found: false
      } as SearchResponse);

      // Failover manager throws an exception
      (mockFailoverManager.makeRequest as jest.Mock).mockRejectedValue(
        new Error('Failover manager connection timeout')
      );

      await botWithFailover.handleUserMessage(context);

      // Should fall back to default response gracefully
      expect(context.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("don't have specific information"),
          suggestedActions: expect.arrayContaining([
            'Contact a nurse'
          ])
        })
      );
    });
  });
});