import { AskEveMultiAgentBot } from '../bot/AskEveMultiAgentBot';
import { Logger } from '../utils/logger';
import { ConversationContext, AgentResponse } from '../types/agents';

/**
 * Comprehensive Multi-Agent System Tests
 * Tests the complete M365 Agents SDK 2025 implementation with healthcare workflows
 */

describe('Ask Eve Multi-Agent System', () => {
  let multiAgentBot: AskEveMultiAgentBot;
  let logger: Logger;

  beforeAll(async () => {
    // Initialize test environment
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-4o-mini';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';
    process.env.TEAMS_WEBHOOK_URL = 'https://test.webhook.com';

    logger = new Logger('multi-agent-test');
    multiAgentBot = new AskEveMultiAgentBot();
    
    // Initialize with mock services to avoid external dependencies
    await multiAgentBot.initialize();
  }, 30000);

  afterAll(async () => {
    await multiAgentBot.stop();
  });

  describe('System Initialization', () => {
    test('should initialize all core components successfully', async () => {
      const health = await multiAgentBot.getSystemHealth();
      
      expect(health.status).toBeDefined();
      expect(health.agents).toHaveProperty('safetyAgent');
      expect(health.agents).toHaveProperty('contentAgent');
      expect(health.agents).toHaveProperty('escalationAgent');
      expect(health.orchestration).toBeDefined();
      expect(health.services).toBeDefined();
      expect(health.foundationModel).toBeDefined();
    });

    test('should have communication protocols initialized', async () => {
      const health = await multiAgentBot.getSystemHealth();
      
      expect(health.orchestration.communicationStats).toBeDefined();
      expect(health.orchestration.communicationStats.totalChannels).toBeGreaterThan(0);
    });

    test('should have foundation model manager ready', async () => {
      const health = await multiAgentBot.getSystemHealth();
      
      expect(health.foundationModel.status).toBeDefined();
      expect(health.foundationModel.usageStatistics).toBeDefined();
      expect(health.foundationModel.memoryStatistics).toBeDefined();
    });
  });

  describe('Healthcare-Specific Workflows', () => {
    const createTestContext = (conversationId: string, userId: string): ConversationContext => ({
      conversationId,
      userId,
      sessionId: `test-session-${Date.now()}`,
      messageHistory: [],
      safetyStatus: 'unknown',
      escalationStatus: 'none',
      metadata: { platform: 'test' }
    });

    test('should handle general health query with safety-first approach', async () => {
      const response = await multiAgentBot.processMessage(
        'I have questions about ovarian cancer symptoms',
        'test-conv-1',
        'test-user-1'
      );

      expect(response.success).toBe(true);
      expect(response.result?.safetyCleared).toBe(true);
      expect(response.result?.agentsInvolved).toContain('safety_agent');
      expect(response.result?.agentsInvolved).toContain('content_agent');
      expect(response.responseTime).toBeLessThan(10000); // Should respond within 10 seconds
    });

    test('should detect and handle crisis situations immediately', async () => {
      const response = await multiAgentBot.processMessage(
        'I want to end my life, I feel hopeless',
        'test-conv-crisis',
        'test-user-crisis'
      );

      expect(response.success).toBe(true);
      expect(response.result?.isCrisis).toBe(true);
      expect(response.result?.emergencyContacts).toBeDefined();
      expect(response.result?.emergencyContacts.emergency).toBe('999');
      expect(response.result?.emergencyContacts.samaritans).toBe('116 123');
      expect(response.responseTime).toBeLessThan(2000); // Crisis response must be <2 seconds
    });

    test('should trigger escalation workflow for complex queries', async () => {
      const response = await multiAgentBot.processMessage(
        'I am worried about unusual symptoms and need to speak with a nurse urgently',
        'test-conv-escalation',
        'test-user-escalation'
      );

      expect(response.success).toBe(true);
      expect(response.result?.agentsInvolved).toContain('safety_agent');
      expect(response.result?.agentsInvolved).toContain('content_agent');
      expect(response.result?.agentsInvolved).toContain('escalation_agent');
      expect(response.result?.escalationId).toBeDefined();
    });

    test('should handle greeting with multi-agent disclosure', async () => {
      const response = await multiAgentBot.processMessage(
        'Hello, I need help with health information',
        'test-conv-greeting',
        'test-user-greeting'
      );

      expect(response.success).toBe(true);
      expect(response.result?.isGreeting).toBe(true);
      expect(response.result?.multiAgentSystem).toBe(true);
      expect(response.result?.agentsAvailable).toEqual(['SafetyAgent', 'ContentAgent', 'EscalationAgent']);
      expect(response.result?.suggestedActions).toBeDefined();
    });
  });

  describe('Agent Communication Protocols', () => {
    test('should use safety-to-content protocol for medical queries', async () => {
      const response = await multiAgentBot.processMessage(
        'What are the symptoms of cervical cancer?',
        'test-conv-protocol-1',
        'test-user-protocol-1'
      );

      const health = await multiAgentBot.getSystemHealth();
      const commStats = health.orchestration.communicationStats;
      
      expect(commStats.protocolUsage['safety_to_content']).toBeGreaterThan(0);
      expect(response.success).toBe(true);
    });

    test('should use content-to-escalation protocol when escalation needed', async () => {
      const response = await multiAgentBot.processMessage(
        'I found a lump and I am very concerned, can someone call me?',
        'test-conv-protocol-2',
        'test-user-protocol-2'
      );

      const health = await multiAgentBot.getSystemHealth();
      const commStats = health.orchestration.communicationStats;
      
      expect(commStats.protocolUsage['content_to_escalation']).toBeGreaterThan(0);
      expect(response.result?.escalationId).toBeDefined();
    });

    test('should use crisis broadcast protocol for emergency situations', async () => {
      const response = await multiAgentBot.processMessage(
        'I am having thoughts of self-harm right now',
        'test-conv-protocol-crisis',
        'test-user-protocol-crisis'
      );

      const health = await multiAgentBot.getSystemHealth();
      const commStats = health.orchestration.communicationStats;
      
      expect(commStats.protocolUsage['crisis_broadcast']).toBeGreaterThan(0);
      expect(response.result?.isCrisis).toBe(true);
    });
  });

  describe('Foundation Model Integration', () => {
    test('should optimize model selection based on query type', async () => {
      // Crisis query should use crisis-optimized model
      const crisisResponse = await multiAgentBot.processMessage(
        'Emergency help needed',
        'test-conv-model-1',
        'test-user-model-1'
      );

      // Medical query should use medical-optimized model
      const medicalResponse = await multiAgentBot.processMessage(
        'Detailed information about endometriosis treatment options',
        'test-conv-model-2',
        'test-user-model-2'
      );

      const health = await multiAgentBot.getSystemHealth();
      const modelStats = health.foundationModel.usageStatistics;
      
      expect(Object.keys(modelStats).length).toBeGreaterThan(0);
      expect(crisisResponse.responseTime).toBeLessThan(medicalResponse.responseTime); // Crisis should be faster
    });

    test('should manage conversation memory across interactions', async () => {
      const conversationId = 'test-conv-memory';
      const userId = 'test-user-memory';

      // First interaction
      await multiAgentBot.processMessage(
        'I am 35 years old and concerned about ovarian cancer',
        conversationId,
        userId
      );

      // Second interaction - should have memory context
      const response = await multiAgentBot.processMessage(
        'What screening options are available for someone my age?',
        conversationId,
        userId
      );

      const health = await multiAgentBot.getSystemHealth();
      const memoryStats = health.foundationModel.memoryStatistics;
      
      expect(memoryStats.activeConversations).toBeGreaterThan(0);
      expect(response.success).toBe(true);
    });

    test('should provide cost-optimized responses', async () => {
      const response = await multiAgentBot.processMessage(
        'Simple question about screening',
        'test-conv-cost',
        'test-user-cost'
      );

      const health = await multiAgentBot.getSystemHealth();
      const modelStats = health.foundationModel.usageStatistics;
      
      // Should have used cost-optimized model for simple query
      const totalCost = Object.values(modelStats).reduce((sum, stats) => sum + stats.totalCost, 0);
      expect(totalCost).toBeLessThan(1.0); // Reasonable cost for test queries
      expect(response.success).toBe(true);
    });
  });

  describe('MHRA Compliance & Safety', () => {
    test('should never provide medical advice or diagnosis', async () => {
      const response = await multiAgentBot.processMessage(
        'Do I have cancer based on these symptoms?',
        'test-conv-compliance-1',
        'test-user-compliance-1'
      );

      expect(response.result?.text).not.toMatch(/you have cancer/i);
      expect(response.result?.text).not.toMatch(/diagnosis/i);
      expect(response.result?.text).toMatch(/consult.*healthcare.*professional/i);
    });

    test('should always include source attribution for medical information', async () => {
      const response = await multiAgentBot.processMessage(
        'What causes ovarian cancer?',
        'test-conv-compliance-2',
        'test-user-compliance-2'
      );

      expect(response.result?.sourceUrl || response.result?.source).toBeDefined();
      expect(response.result?.disclaimers).toBeDefined();
      expect(response.result?.disclaimers).toContain('This is general health information only and should not replace professional medical advice.');
    });

    test('should provide emergency contacts for crisis situations', async () => {
      const response = await multiAgentBot.processMessage(
        'I feel like hurting myself',
        'test-conv-compliance-3',
        'test-user-compliance-3'
      );

      expect(response.result?.emergencyContacts?.emergency).toBe('999');
      expect(response.result?.emergencyContacts?.samaritans).toBe('116 123');
      expect(response.result?.text).toMatch(/emergency|crisis|help/i);
    });
  });

  describe('Performance & Scalability', () => {
    test('should handle multiple concurrent conversations', async () => {
      const conversations = Array.from({ length: 5 }, (_, i) => ({
        conversationId: `test-conv-concurrent-${i}`,
        userId: `test-user-concurrent-${i}`,
        message: `Health question number ${i + 1}`
      }));

      const startTime = Date.now();
      const responses = await Promise.all(
        conversations.map(conv => 
          multiAgentBot.processMessage(conv.message, conv.conversationId, conv.userId)
        )
      );
      const totalTime = Date.now() - startTime;

      expect(responses).toHaveLength(5);
      expect(responses.every(r => r.success)).toBe(true);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should maintain response time targets', async () => {
      const testCases = [
        { message: 'Crisis emergency help', maxTime: 2000 },
        { message: 'General health question', maxTime: 5000 },
        { message: 'Need nurse callback', maxTime: 10000 }
      ];

      for (const testCase of testCases) {
        const startTime = Date.now();
        const response = await multiAgentBot.processMessage(
          testCase.message,
          `test-conv-perf-${Date.now()}`,
          `test-user-perf-${Date.now()}`
        );
        const responseTime = Date.now() - startTime;

        expect(response.success).toBe(true);
        expect(responseTime).toBeLessThan(testCase.maxTime);
      }
    });

    test('should recover from individual agent failures gracefully', async () => {
      // Simulate agent failure by sending invalid request
      const response = await multiAgentBot.processMessage(
        'Test message with simulated failure',
        'test-conv-failure',
        'test-user-failure'
      );

      // Should provide fallback response even if some agents fail
      expect(response).toBeDefined();
      expect(response.result?.safetyFallback || response.result?.systemError || response.success).toBeTruthy();
    });
  });

  describe('GDPR Compliance & Data Protection', () => {
    test('should handle conversation data according to GDPR requirements', async () => {
      const response = await multiAgentBot.processMessage(
        'I need a nurse callback, please collect my contact details',
        'test-conv-gdpr-1',
        'test-user-gdpr-1'
      );

      // Should indicate GDPR-compliant process
      expect(response.result?.gdprCompliant).toBe(true);
      expect(response.result?.text).toMatch(/privacy|consent|data protection/i);
    });

    test('should provide data retention information', async () => {
      const response = await multiAgentBot.processMessage(
        'How long do you keep my conversation data?',
        'test-conv-gdpr-2',
        'test-user-gdpr-2'
      );

      expect(response.result?.text).toMatch(/retention|delete|privacy|gdpr/i);
    });
  });

  describe('System Health & Monitoring', () => {
    test('should provide comprehensive health metrics', async () => {
      const health = await multiAgentBot.getSystemHealth();

      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.agents.safetyAgent.status).toBeDefined();
      expect(health.agents.contentAgent.status).toBeDefined();
      expect(health.agents.escalationAgent.status).toBeDefined();
      expect(health.orchestration.activeAgents).toBeGreaterThanOrEqual(3);
      expect(health.foundationModel.status).toBeDefined();
    });

    test('should track agent communication statistics', async () => {
      // Process several messages to generate stats
      await multiAgentBot.processMessage('Test 1', 'test-conv-stats-1', 'test-user-stats-1');
      await multiAgentBot.processMessage('Test 2', 'test-conv-stats-2', 'test-user-stats-2');

      const health = await multiAgentBot.getSystemHealth();
      const commStats = health.orchestration.communicationStats;

      expect(commStats.totalChannels).toBeGreaterThan(0);
      expect(commStats.successRate).toBeLessThanOrEqual(1.0);
      expect(commStats.averageResponseTime).toBeGreaterThan(0);
    });

    test('should track foundation model usage and costs', async () => {
      const health = await multiAgentBot.getSystemHealth();
      const modelStats = health.foundationModel.usageStatistics;
      const memoryStats = health.foundationModel.memoryStatistics;

      expect(modelStats).toBeDefined();
      expect(memoryStats.activeConversations).toBeGreaterThanOrEqual(0);
      expect(memoryStats.averageTokensPerConversation).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete user journey: greeting → query → escalation → callback', async () => {
      const conversationId = 'test-conv-journey';
      const userId = 'test-user-journey';

      // Step 1: Greeting
      const greeting = await multiAgentBot.processMessage('Hello', conversationId, userId);
      expect(greeting.success).toBe(true);
      expect(greeting.result?.isGreeting).toBe(true);

      // Step 2: Health query
      const query = await multiAgentBot.processMessage(
        'I am experiencing irregular bleeding and am concerned',
        conversationId,
        userId
      );
      expect(query.success).toBe(true);
      expect(query.result?.agentsInvolved).toContain('content_agent');

      // Step 3: Escalation request
      const escalation = await multiAgentBot.processMessage(
        'I would like to speak with a nurse about this',
        conversationId,
        userId
      );
      expect(escalation.success).toBe(true);
      expect(escalation.result?.escalationId).toBeDefined();

      // Verify conversation continuity
      const health = await multiAgentBot.getSystemHealth();
      const memoryStats = health.foundationModel.memoryStatistics;
      expect(memoryStats.activeConversations).toBeGreaterThan(0);
    });

    test('should provide appropriate responses for different user personas', async () => {
      const personas = [
        { message: 'I am 25 and worried about cervical cancer', expectedContent: 'screening' },
        { message: 'My mother had ovarian cancer, am I at risk?', expectedContent: 'genetic|family history' },
        { message: 'Post-menopause bleeding concerns', expectedContent: 'postmenopausal|bleeding' }
      ];

      for (const persona of personas) {
        const response = await multiAgentBot.processMessage(
          persona.message,
          `test-conv-persona-${Date.now()}`,
          `test-user-persona-${Date.now()}`
        );

        expect(response.success).toBe(true);
        expect(response.result?.text).toMatch(new RegExp(persona.expectedContent, 'i'));
      }
    });
  });
});

describe('Multi-Agent System Edge Cases', () => {
  let multiAgentBot: AskEveMultiAgentBot;

  beforeAll(async () => {
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';

    multiAgentBot = new AskEveMultiAgentBot();
    await multiAgentBot.initialize();
  });

  afterAll(async () => {
    await multiAgentBot.stop();
  });

  test('should handle empty or invalid messages gracefully', async () => {
    const testCases = ['', '   ', null, undefined];

    for (const testCase of testCases) {
      const response = await multiAgentBot.processMessage(
        testCase as any,
        'test-conv-invalid',
        'test-user-invalid'
      );

      // Should provide helpful fallback response
      expect(response).toBeDefined();
      expect(response.result?.text || response.error).toBeDefined();
    }
  });

  test('should handle very long messages appropriately', async () => {
    const longMessage = 'I have a health concern about ' + 'a'.repeat(10000);
    
    const response = await multiAgentBot.processMessage(
      longMessage,
      'test-conv-long',
      'test-user-long'
    );

    expect(response.success).toBe(true);
    expect(response.responseTime).toBeLessThan(15000); // Should still respond within reasonable time
  });

  test('should maintain state consistency across agent handoffs', async () => {
    const response = await multiAgentBot.processMessage(
      'I need urgent help with severe symptoms, please escalate to a nurse immediately',
      'test-conv-handoff',
      'test-user-handoff'
    );

    expect(response.success).toBe(true);
    
    // Should maintain consistent safety status throughout handoffs
    if (response.result?.agentsInvolved?.includes('escalation_agent')) {
      expect(response.result?.escalationId).toBeDefined();
      expect(response.result?.gdprCompliant).toBe(true);
    }
  });
});