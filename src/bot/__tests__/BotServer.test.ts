import request from 'supertest';
import { BotServer } from '../BotServer';
import { EscalationService } from '../../services/EscalationService';
import { NotificationService } from '../../services/NotificationService';
import { SupabaseContentService } from '../../services/SupabaseContentService';

// Mock all services
jest.mock('../../services/EscalationService');
jest.mock('../../services/NotificationService');
jest.mock('../../services/SupabaseContentService');
jest.mock('../../utils/logger');

describe('BotServer', () => {
  let botServer: BotServer;
  let mockEscalationService: jest.Mocked<EscalationService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockContentService: jest.Mocked<SupabaseContentService>;

  beforeEach(async () => {
    // Setup mocks
    mockEscalationService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      analyzeMessage: jest.fn()
    } as any;

    mockNotificationService = {} as any;

    mockContentService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      searchContent: jest.fn()
    } as any;

    (EscalationService as jest.MockedClass<typeof EscalationService>).mockImplementation(() => mockEscalationService);
    (NotificationService as jest.MockedClass<typeof NotificationService>).mockImplementation(() => mockNotificationService);
    (SupabaseContentService as jest.MockedClass<typeof SupabaseContentService>).mockImplementation(() => mockContentService);

    botServer = new BotServer();
    await botServer.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /widget', () => {
    it('should serve the web chat widget HTML', async () => {
      const response = await request(botServer.getApp())
        .get('/widget')
        .expect(200);

      expect(response.text).toContain('Ask Eve Assist');
      expect(response.text).toContain('Emergency: 999');
      expect(response.text).toContain('Samaritans: 116 123');
      expect(response.text).toContain('NHS: 111');
      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('should include proper bot disclosure in widget', async () => {
      const response = await request(botServer.getApp())
        .get('/widget')
        .expect(200);

      expect(response.text).toContain("I'm not a medical professional or nurse");
      expect(response.text).toContain('trusted information from The Eve Appeal');
    });

    it('should include emergency contacts prominently', async () => {
      const response = await request(botServer.getApp())
        .get('/widget')
        .expect(200);

      expect(response.text).toContain('Emergency Contacts');
      expect(response.text).toContain('999');
      expect(response.text).toContain('116 123');
      expect(response.text).toContain('111');
    });
  });

  describe('POST /api/chat', () => {
    beforeEach(() => {
      // Setup default mock responses
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'general',
        requiresEscalation: false,
        matches: [],
        confidence: 0.1,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 50,
        recommendedActions: []
      });

      mockContentService.searchContent.mockResolvedValue({
        found: true,
        content: 'Ovarian cancer symptoms include persistent bloating.',
        source: 'The Eve Appeal - Ovarian Cancer',
        sourceUrl: 'https://eveappeal.org.uk/gynae-health/ovarian-cancer',
        relevanceScore: 0.8
      });
    });

    it('should process normal health queries successfully', async () => {
      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'What are ovarian cancer symptoms?',
          conversationId: 'test-conversation',
          userId: 'test-user'
        })
        .expect(200);

      expect(response.body.responses).toHaveLength(1);
      expect(response.body.responses[0].text).toContain('persistent bloating');
      expect(response.body.responses[0].attachments).toBeDefined();
      expect(response.body.responses[0].attachments[0].content.buttons[0].value)
        .toBe('https://eveappeal.org.uk/gynae-health/ovarian-cancer');
    });

    it('should handle crisis messages with immediate escalation', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'suicide_ideation' }],
        confidence: 0.9,
        riskFactors: ['high_confidence_triggers'],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: ['immediate_nurse_notification']
      } as any);

      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'I want to kill myself',
          conversationId: 'test-conversation',
          userId: 'test-user'  
        })
        .expect(200);

      expect(response.body.responses).toHaveLength(1);
      expect(response.body.responses[0].text).toContain('Samaritans: 116 123');
      expect(response.body.responses[0].text).toContain('999');
      expect(response.body.responses[0].suggestedActions).toContain('Call Samaritans');
    });

    it('should handle medical emergency escalation', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'life_threatening' }],
        confidence: 0.9,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 80,
        recommendedActions: ['emergency_services_guidance']
      } as any);

      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'severe chest pain can\'t breathe',
          conversationId: 'test-conversation',
          userId: 'test-user'
        })
        .expect(200);

      expect(response.body.responses[0].text).toContain('Call 999 for emergency services');
      expect(response.body.responses[0].text).toContain('medical emergencies');
      expect(response.body.responses[0].suggestedActions).toContain('Call 999');
    });

    it('should handle when no content is found', async () => {
      mockContentService.searchContent.mockResolvedValue({
        found: false
      });

      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'random unrelated question',
          conversationId: 'test-conversation',
          userId: 'test-user'
        })
        .expect(200);

      expect(response.body.responses[0].text).toContain("I don't have specific information");
      expect(response.body.responses[0].text).toContain('Speaking to your GP');
      expect(response.body.responses[0].suggestedActions).toContain('Contact a nurse');
    });

    it('should require message in request body', async () => {
      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          conversationId: 'test-conversation',
          userId: 'test-user'
          // Missing message
        })
        .expect(400);

      expect(response.body.error).toBe('Message is required');
    });

    it('should handle service errors gracefully', async () => {
      mockEscalationService.analyzeMessage.mockRejectedValue(new Error('Service error'));

      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'test message',
          conversationId: 'test-conversation',
          userId: 'test-user'
        })
        .expect(500);

      expect(response.body.error).toContain('technical difficulties');
      expect(response.body.emergencyContacts).toBeDefined();
      expect(response.body.emergencyContacts.emergency).toBe('999');
      expect(response.body.emergencyContacts.samaritans).toBe('116 123');
    });

    it('should maintain response time under 5 seconds for normal queries', async () => {
      const startTime = Date.now();
      
      await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'ovarian cancer symptoms',
          conversationId: 'test-conversation', 
          userId: 'test-user'
        })
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000);
    });

    it('should maintain response time under 2 seconds for crisis messages', async () => {
      mockEscalationService.analyzeMessage.mockResolvedValue({
        severity: 'crisis',
        requiresEscalation: true,
        matches: [{ category: 'suicide_ideation' }],
        confidence: 0.9,
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 100,
        recommendedActions: []
      } as any);

      const startTime = Date.now();

      await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'I want to die',
          conversationId: 'test-conversation',
          userId: 'test-user'
        })
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(2000);
    });

    it('should provide default conversation and user IDs if not provided', async () => {
      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'test message'
          // No conversationId or userId
        })
        .expect(200);

      expect(response.body.conversationId).toBe('web-chat');
      expect(response.body.userId).toBe('anonymous');
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(botServer.getApp())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('ask-eve-bot-server');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('CORS and security', () => {
    it('should handle CORS preflight requests', async () => {
      await request(botServer.getApp())
        .options('/api/chat')
        .expect(200);
    });

    it('should set appropriate CORS headers', async () => {
      const response = await request(botServer.getApp())
        .get('/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('MHRA compliance', () => {
    it('should never generate medical advice without proper source attribution', async () => {
      mockContentService.searchContent.mockResolvedValue({
        found: true,
        content: 'Some health information',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/health-info'
      });

      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'health question',
          conversationId: 'test',
          userId: 'test'
        })
        .expect(200);

      // Should always include source attribution
      expect(response.body.responses[0].attachments).toBeDefined();
      expect(response.body.responses[0].attachments[0].content.buttons[0].value)
        .toMatch(/^https:\/\/eveappeal\.org\.uk/);
    });

    it('should refuse to provide content without valid source URLs', async () => {
      mockContentService.searchContent.mockResolvedValue({
        found: true,
        content: 'Some health information',
        source: 'Unknown Source'
        // No sourceUrl - should be rejected
      });

      const response = await request(botServer.getApp())
        .post('/api/chat')
        .send({
          message: 'health question',
          conversationId: 'test',
          userId: 'test'
        })
        .expect(200);

      // Should fall back to "no content found" response
      expect(response.body.responses[0].text).toContain("I don't have specific information");
    });
  });
});