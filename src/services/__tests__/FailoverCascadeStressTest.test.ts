/**
 * Comprehensive failover cascade stress tests for Ask Eve Assist
 * 
 * Tests the 4-tier AI provider failover system under various load and failure conditions:
 * 
 * Tier 1: OpenAI GPT-4o-mini (Primary)
 * Tier 2: Azure OpenAI UK West (Secondary)  
 * Tier 3: Anthropic Claude (Tertiary)
 * Tier 4: Emergency Response System (Always Available)
 * 
 * Test scenarios:
 * 1. Normal operation with all tiers healthy
 * 2. Single provider failures and recovery
 * 3. Cascading failures across multiple tiers
 * 4. High load stress testing with failover
 * 5. Circuit breaker integration
 * 6. SLA compliance during failover events
 * 7. Emergency response capability validation
 * 
 * Follows TDD with real healthcare crisis scenarios
 */

import { FailoverService, CrisisResponse, FailoverServiceConfig } from '../FailoverService';
import { FailoverManager, FailoverResult, ProviderHealth } from '../FailoverManager';
import { 
  OpenAIProvider, 
  AzureOpenAIProvider, 
  AnthropicProvider, 
  EmergencyProvider,
  AIProvider,
  ProviderConfig,
  AIResponse
} from '../AIProvider';
import { SLAMonitoringService } from '../SLAMonitoringService';
import { CircuitBreaker } from '../CircuitBreaker';
import { Logger } from '../../utils/logger';

// Mock external AI service dependencies
jest.mock('openai');
jest.mock('@azure/identity');
jest.mock('axios');
jest.mock('../../utils/logger');

describe('Failover Cascade Stress Tests', () => {
  let failoverService: FailoverService;
  let failoverManager: FailoverManager;
  let slaService: SLAMonitoringService;
  let mockLogger: jest.Mocked<Logger>;
  let providers: AIProvider[];

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    // Initialize SLA service
    slaService = new SLAMonitoringService(mockLogger, {
      response_times: {
        crisis_detection_ms: 500,
        crisis_response_ms: 2000,
        nurse_notification_ms: 60000,
        audit_logging_ms: 100
      }
    });

    // Mock file system operations for configuration loading
    jest.spyOn(require('fs'), 'readFileSync').mockImplementation((path: string) => {
      if (path.includes('failover-config.json')) {
        return JSON.stringify({
          failover: {
            slaLimitMs: 2000,
            maxRetries: 3,
            circuitBreakerThreshold: 5,
            circuitBreakerResetTimeout: 30000,
            emergencyResponsesEnabled: true,
            slaMonitoringEnabled: true
          },
          providers: {
            primary: {
              name: 'OpenAI',
              priority: 1,
              model: 'gpt-4o-mini',
              timeout: 5000,
              retries: 2
            },
            secondary: {
              name: 'Azure',
              priority: 2,
              endpoint: 'https://test.openai.azure.com',
              model: 'gpt-4',
              deployment: 'gpt-4-turbo',
              timeout: 6000,
              retries: 2
            },
            tertiary: {
              name: 'Anthropic',
              priority: 3,
              model: 'claude-3-haiku',
              timeout: 7000,
              retries: 2
            },
            emergency: {
              name: 'Emergency',
              priority: 4,
              timeout: 1000,
              retries: 1
            }
          },
          monitoring: {
            alertThresholds: {
              slaViolationThreshold: 2,
              providerFailureThreshold: 3,
              responseTimeThreshold: 5000,
              alertCooldownMs: 300000
            },
            escalation: {
              enableEmailAlerts: true,
              enableTeamsAlerts: true,
              criticalAlertEscalation: true
            }
          }
        });
      }
      if (path.includes('safety-config.json')) {
        return JSON.stringify({
          response_times: {
            crisis_detection_ms: 500,
            crisis_response_ms: 2000,
            nurse_notification_ms: 60000
          }
        });
      }
      return '{}';
    });

    // Initialize failover service in test mode
    const config: FailoverServiceConfig = {
      testMode: true,
      enableMonitoring: true,
      enableAlerts: false
    };

    failoverService = new FailoverService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Multi-Tier Failover Under Load', () => {
    it('should cascade through all tiers when primary providers fail under high load', async () => {
      // Simulate 20 concurrent crisis requests with providers failing
      const concurrentQueries = Array.from({ length: 20 }, (_, i) => ({
        query: `Crisis query ${i}: I am having suicidal thoughts and need help`,
        userId: `load-test-user-${i}`,
        conversationId: `load-conversation-${i}`
      }));

      // Mock provider failures to force cascading
      const mockOpenAIFailure = jest.fn().mockRejectedValue(new Error('OpenAI service overloaded'));
      const mockAzureFailure = jest.fn().mockRejectedValue(new Error('Azure OpenAI timeout'));
      const mockClaudeFailure = jest.fn().mockRejectedValue(new Error('Anthropic rate limited'));

      // Emergency provider should always succeed
      const mockEmergencyResponse: AIResponse = {
        content: `I'm very concerned about what you've shared. Please know that you're not alone and help is available.

**Immediate Support:**
- **Samaritans**: 116 123 (free, 24/7)
- **Crisis Text Line**: Text SHOUT to 85258
- **Emergency Services**: 999 (if in immediate danger)

**Online Support:**
- Chat with Samaritans: samaritans.org
- Mind: mind.org.uk
- Campaign Against Living Miserably (CALM): thecalmzone.net

Please reach out to one of these services right now. You deserve support and care.

*This is general health information only and should not replace professional medical advice. If this is an emergency, call 999 immediately.*`,
        usage: { tokens: 0, cost: 0 },
        cached: true,
        model: 'emergency',
        finishReason: 'completed'
      };

      // Setup provider mocks
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest').mockImplementation(mockOpenAIFailure);
      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest').mockImplementation(mockAzureFailure);
      jest.spyOn(AnthropicProvider.prototype, 'makeRequest').mockImplementation(mockClaudeFailure);
      jest.spyOn(EmergencyProvider.prototype, 'makeRequest').mockResolvedValue(mockEmergencyResponse);

      // Act: Execute concurrent crisis requests
      const startTime = Date.now();
      const responsePromises = concurrentQueries.map(({ query, userId, conversationId }) =>
        failoverService.handleCrisisRequest(query, userId, conversationId)
      );

      const results = await Promise.all(responsePromises);
      const totalTime = Date.now() - startTime;

      // Assert: All requests should succeed via emergency tier
      expect(results).toHaveLength(20);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.provider).toBe('Emergency');
        expect(result.tier).toBe(4);
        expect(result.content).toContain('Samaritans');
        expect(result.content).toContain('116 123');
        expect(result.responseTime).toBeLessThan(2000); // SLA compliance
        expect(result.slaCompliant).toBe(true);
        expect(result.emergencyResponse).toBe(true);
      });

      // Performance requirements
      expect(totalTime).toBeLessThan(10000); // Total time for 20 concurrent requests
      
      // Verify providers were attempted in order
      expect(mockOpenAIFailure).toHaveBeenCalledTimes(20);
      expect(mockAzureFailure).toHaveBeenCalledTimes(20);
      expect(mockClaudeFailure).toHaveBeenCalledTimes(20);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis request handled',
        expect.objectContaining({
          success: true,
          provider: 'Emergency',
          tier: 4,
          slaCompliant: true,
          failoverUsed: true
        })
      );
    });

    it('should handle partial provider recovery during high load', async () => {
      // Simulate scenario where Azure recovers mid-test
      let azureCallCount = 0;
      const mockAzureProvider = jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest')
        .mockImplementation(async (request) => {
          azureCallCount++;
          if (azureCallCount <= 10) {
            throw new Error('Azure OpenAI temporarily overloaded');
          }
          // Recover after 10 failures
          return {
            content: `I understand you're going through a very difficult time right now. What you're feeling is valid, and reaching out shows incredible strength.

**Immediate professional support is available:**
- **Samaritans**: 116 123 (free, confidential, 24/7)
- **NHS**: 111 for urgent medical concerns
- **Crisis Text Line**: Text SHOUT to 85258

Please don't hesitate to contact these services. You deserve care and support.

*Please remember: I'm an AI assistant providing general information only. If you're in immediate danger, please call 999 or go to your nearest A&E department.*`,
            usage: { tokens: 125, cost: 0.02 },
            cached: false,
            model: 'gpt-4-turbo',
            finishReason: 'completed'
          };
        });

      // OpenAI continues to fail
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('OpenAI service unavailable'));

      // Claude and Emergency as fallbacks
      jest.spyOn(AnthropicProvider.prototype, 'makeRequest')
        .mockResolvedValue({
          content: 'I hear that you\'re struggling. Please contact Samaritans at 116 123 for immediate support.',
          usage: { tokens: 80, cost: 0.01 },
          cached: false,
          model: 'claude-3-haiku',
          finishReason: 'completed'
        });

      jest.spyOn(EmergencyProvider.prototype, 'makeRequest')
        .mockResolvedValue({
          content: 'Emergency response: Please call Samaritans 116 123 or emergency services 999.',
          usage: { tokens: 0, cost: 0 },
          cached: true,
          model: 'emergency',
          finishReason: 'completed'
        });

      const testQueries = Array.from({ length: 15 }, (_, i) => ({
        query: `Recovery test ${i}: I need help with my mental health`,
        userId: `recovery-user-${i}`,
        conversationId: `recovery-conv-${i}`
      }));

      // Act: Execute queries during provider recovery
      const results = await Promise.all(
        testQueries.map(({ query, userId, conversationId }) =>
          failoverService.handleCrisisRequest(query, userId, conversationId)
        )
      );

      // Assert: Should see mix of providers as Azure recovers
      expect(results).toHaveLength(15);
      
      const azureSuccesses = results.filter(r => r.provider === 'Azure').length;
      const claudeSuccesses = results.filter(r => r.provider === 'Anthropic').length;
      const emergencySuccesses = results.filter(r => r.provider === 'Emergency').length;

      // Should see Azure starting to succeed after recovery
      expect(azureSuccesses).toBeGreaterThan(0);
      expect(azureSuccesses + claudeSuccesses + emergencySuccesses).toBe(15);

      // All should meet SLA
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.slaCompliant).toBe(true);
        expect(result.responseTime).toBeLessThan(2000);
      });
    });

    it('should maintain circuit breaker state across failover tiers', async () => {
      // Initialize circuit breakers for each provider
      const openAICircuit = new CircuitBreaker('openai-circuit', {
        failureThreshold: 3,
        resetTimeout: 30000,
        monitoringPeriod: 60000
      });

      const azureCircuit = new CircuitBreaker('azure-circuit', {
        failureThreshold: 3,
        resetTimeout: 30000,
        monitoringPeriod: 60000
      });

      // Mock provider failures to trip circuit breakers
      const mockOpenAIFailure = jest.fn().mockRejectedValue(new Error('OpenAI API error'));
      const mockAzureFailure = jest.fn().mockRejectedValue(new Error('Azure timeout'));

      jest.spyOn(OpenAIProvider.prototype, 'makeRequest').mockImplementation(mockOpenAIFailure);
      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest').mockImplementation(mockAzureFailure);

      // Anthropic succeeds  
      jest.spyOn(AnthropicProvider.prototype, 'makeRequest').mockResolvedValue({
        content: 'Claude response: I understand you need support. Please contact Samaritans at 116 123.',
        usage: { tokens: 90, cost: 0.015 },  
        cached: false,
        model: 'claude-3-haiku',
        finishReason: 'completed'
      });

      // Execute enough requests to trip circuit breakers
      const circuitTestQueries = Array.from({ length: 8 }, (_, i) => ({
        query: `Circuit breaker test ${i}: I feel hopeless`,
        userId: `circuit-user-${i}`,
        conversationId: `circuit-conv-${i}`
      }));

      // Act: Execute queries that will trip circuit breakers
      const results = await Promise.all(
        circuitTestQueries.map(({ query, userId, conversationId }) =>
          failoverService.handleCrisisRequest(query, userId, conversationId)
        )
      );

      // Assert: Should eventually use Anthropic when circuits open
      expect(results).toHaveLength(8);
      
      results.forEach(result => {
        expect(result.success).toBe(true);
        // Should use either Anthropic (tier 3) or Emergency (tier 4)
        expect(['Anthropic', 'Emergency']).toContain(result.provider);
        expect(result.tier).toBeGreaterThanOrEqual(3);
      });

      // Circuit breakers should eventually trip
      expect(mockOpenAIFailure).toHaveBeenCalled();
      expect(mockAzureFailure).toHaveBeenCalled();
    });
  });

  describe('Provider Health Monitoring Under Stress', () => {
    it('should accurately report provider health during cascade failures', async () => {
      // Setup provider health states
      jest.spyOn(OpenAIProvider.prototype, 'checkHealth').mockResolvedValue({
        healthy: false,
        responseTime: 0,
        error: 'Service unavailable',
        lastChecked: Date.now()
      });

      jest.spyOn(AzureOpenAIProvider.prototype, 'checkHealth').mockResolvedValue({
        healthy: true,
        responseTime: 850,
        lastChecked: Date.now()
      });

      jest.spyOn(AnthropicProvider.prototype, 'checkHealth').mockResolvedValue({
        healthy: true,
        responseTime: 1200,
        lastChecked: Date.now()
      });

      jest.spyOn(EmergencyProvider.prototype, 'checkHealth').mockResolvedValue({
        healthy: true,
        responseTime: 50,
        lastChecked: Date.now()
      });

      // Act: Get system health during stress
      const healthStatus = await failoverService.getSystemHealth();

      // Assert: Should accurately reflect provider states
      expect(healthStatus.overall).toBe('DEGRADED'); // Primary down, others working
      expect(healthStatus.providers).toHaveLength(4);

      const openAIHealth = healthStatus.providers.find(p => p.provider === 'OpenAI');
      const azureHealth = healthStatus.providers.find(p => p.provider === 'Azure');
      const anthropicHealth = healthStatus.providers.find(p => p.provider === 'Anthropic');
      const emergencyHealth = healthStatus.providers.find(p => p.provider === 'Emergency');

      expect(openAIHealth?.healthy).toBe(false);
      expect(azureHealth?.healthy).toBe(true);
      expect(anthropicHealth?.healthy).toBe(true);
      expect(emergencyHealth?.healthy).toBe(true);

      expect(healthStatus.slaCompliance).toBeGreaterThanOrEqual(95.0);
    });

    it('should provide detailed failover metrics during stress testing', async () => {
      // Setup mixed provider results for metrics collection
      let requestCount = 0;
      
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest').mockImplementation(async () => {
        requestCount++;
        if (requestCount <= 3) {
          throw new Error('OpenAI overloaded');
        }
        return {
          content: 'OpenAI recovered response with mental health support resources.',
          usage: { tokens: 100, cost: 0.02 },
          cached: false,
          model: 'gpt-4o-mini',
          finishReason: 'completed'
        };
      });

      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest').mockResolvedValue({
        content: 'Azure OpenAI response with crisis support information.',
        usage: { tokens: 110, cost: 0.025 },
        cached: false,
        model: 'gpt-4-turbo',
        finishReason: 'completed'
      });

      // Execute requests for metrics collection
      const metricsQueries = Array.from({ length: 10 }, (_, i) => ({
        query: `Metrics test ${i}: I need mental health support`,
        userId: `metrics-user-${i}`,
        conversationId: `metrics-conv-${i}`
      }));

      await Promise.all(
        metricsQueries.map(({ query, userId, conversationId }) =>
          failoverService.handleCrisisRequest(query, userId, conversationId)
        )
      );

      // Act: Get performance metrics
      const metrics = failoverService.getPerformanceMetrics();

      // Assert: Should provide comprehensive metrics
      expect(metrics.failover).toBeDefined();
      expect(metrics.sla).toBeDefined();
      expect(metrics.timestamp).toBeDefined();

      expect(metrics.failover.totalRequests).toBe(10);
      expect(metrics.failover.successfulRequests).toBe(10);
      expect(metrics.failover.averageResponseTime).toBeLessThan(2000);
      
      // Should show some failover activity
      expect(metrics.failover.tierUtilization).toBeDefined();
      expect(Object.keys(metrics.failover.tierUtilization)).toContain('1'); // Tier 1 (OpenAI)
      expect(Object.keys(metrics.failover.tierUtilization)).toContain('2'); // Tier 2 (Azure)
    });
  });

  describe('Emergency Response Validation', () => {
    it('should provide appropriate crisis responses when all AI providers fail', async () => {
      // Mock all AI providers to fail
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('OpenAI service down'));
      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Azure OpenAI unavailable'));
      jest.spyOn(AnthropicProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Anthropic rate limited'));

      // Emergency provider always works
      jest.spyOn(EmergencyProvider.prototype, 'makeRequest').mockResolvedValue({
        content: `I'm very concerned about what you've shared. Please know that you're not alone and immediate help is available.

**URGENT - Please contact immediately:**
- **Emergency Services**: 999 (if you're in immediate danger)
- **Samaritans**: 116 123 (free, 24/7, confidential)
- **Crisis Text Line**: Text SHOUT to 85258
- **NHS 111**: For urgent medical concerns

**Additional Support:**
- Samaritans online chat: samaritans.org
- Mind: mind.org.uk (0300 123 3393)
- CALM (Campaign Against Living Miserably): thecalmzone.net

You deserve support and care. Please reach out to one of these services right now.

*Important: This is general health information only and should not replace professional medical advice. If this is an emergency, call 999 immediately.*`,
        usage: { tokens: 0, cost: 0 },
        cached: true,
        model: 'emergency',
        finishReason: 'completed'
      });

      const crisisScenarios = [
        {
          query: 'I want to kill myself tonight',
          userId: 'emergency-suicide-user',
          conversationId: 'emergency-suicide-conv',
          expectedResources: ['999', 'Samaritans', '116 123']
        },
        {
          query: 'I am cutting myself and cannot stop',
          userId: 'emergency-selfharm-user', 
          conversationId: 'emergency-selfharm-conv',
          expectedResources: ['999', 'Samaritans', 'SHOUT']
        },
        {
          query: 'Having severe chest pain, think I am dying',
          userId: 'emergency-medical-user',
          conversationId: 'emergency-medical-conv',
          expectedResources: ['999', 'NHS 111']
        }
      ];

      // Act: Test emergency responses for different crisis types
      const emergencyResults = await Promise.all(
        crisisScenarios.map(({ query, userId, conversationId }) =>
          failoverService.handleCrisisRequest(query, userId, conversationId)
        )
      );

      // Assert: All should succeed with appropriate emergency responses
      emergencyResults.forEach((result, index) => {
        const scenario = crisisScenarios[index];
        
        expect(result.success).toBe(true);
        expect(result.provider).toBe('Emergency');
        expect(result.tier).toBe(4);
        expect(result.emergencyResponse).toBe(true);
        expect(result.humanEscalationRequired).toBe(true);
        expect(result.responseTime).toBeLessThan(1000); // Emergency responses are fast
        expect(result.slaCompliant).toBe(true);

        // Verify appropriate resources are included
        scenario.expectedResources.forEach(resource => {
          expect(result.content).toContain(resource);
        });

        // Verify empathetic and supportive language
        expect(result.content).toContain('concerned');
        expect(result.content).toContain('support');
        expect(result.content).not.toContain('just');
        expect(result.content).not.toContain('only');
      });
    });

    it('should maintain MHRA compliance in emergency responses', async () => {
      // Mock all providers to fail except emergency
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Service unavailable'));
      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Service unavailable'));
      jest.spyOn(AnthropicProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Service unavailable'));

      jest.spyOn(EmergencyProvider.prototype, 'makeRequest').mockResolvedValue({
        content: `I understand you're looking for health information. While I can provide general guidance, it's important that you speak with a qualified healthcare professional for personalized advice.

**For medical concerns:**
- **Your GP**: Contact your local surgery
- **NHS 111**: For urgent but non-emergency medical advice
- **NHS website**: nhs.uk for reliable health information
- **The Eve Appeal**: eveappeal.org.uk for gynecological health information

**If this is urgent:**
- **Emergency Services**: 999 for life-threatening emergencies
- **NHS 111**: Call or visit 111.nhs.uk

Please don't hesitate to seek professional medical advice for any health concerns.

*Important disclaimer: This is general health information only and should not replace professional medical advice, diagnosis, or treatment. Always seek the advice of qualified health providers with questions about your medical conditions.*`,
        usage: { tokens: 0, cost: 0 },
        cached: true,
        model: 'emergency',
        finishReason: 'completed'
      });

      const mhraTestQueries = [
        'What medication should I take for my symptoms?',
        'Can you diagnose what is wrong with me?',
        'Should I stop taking my prescribed medication?'
      ];

      // Act: Test MHRA compliance in emergency responses
      const mhraResults = await Promise.all(
        mhraTestQueries.map((query, i) =>
          failoverService.handleGeneralQuery(
            query,
            `mhra-test-user-${i}`,
            `mhra-test-conv-${i}`
          )
        )
      );

      // Assert: Should not provide medical advice
      mhraResults.forEach(result => {
        expect(result.success).toBe(true);
        
        // Should not contain prohibited medical advice
        expect(result.content).not.toContain('you should take');
        expect(result.content).not.toContain('I diagnose');
        expect(result.content).not.toContain('stop taking');
        expect(result.content).not.toContain('prescription');
        
        // Should direct to healthcare professionals
        expect(result.content).toContain('healthcare professional');
        expect(result.content).toContain('GP');
        expect(result.content).toContain('NHS');
        
        // Should include appropriate disclaimers
        expect(result.content).toContain('general health information only');
        expect(result.content).toContain('should not replace professional medical advice');
      });
    });
  });

  describe('SLA Compliance During Failover Events', () => {
    it('should maintain <2 second response times during tier cascading', async () => {
      // Setup realistic response times for each tier
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Timeout scenario
        throw new Error('OpenAI timeout');
      });

      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1200)); // Within SLA
        return {
          content: 'Azure OpenAI crisis response with mental health resources.',
          usage: { tokens: 120, cost: 0.03 },
          cached: false,
          model: 'gpt-4-turbo',
          finishReason: 'completed'
        };
      });

      const slaTestQueries = Array.from({ length: 10 }, (_, i) => ({
        query: `SLA test ${i}: I need crisis support`,
        userId: `sla-user-${i}`,
        conversationId: `sla-conv-${i}`
      }));

      // Act: Test SLA compliance during failover
      const slaResults = await Promise.all(
        slaTestQueries.map(({ query, userId, conversationId }) => {
          const startTime = Date.now();
          return failoverService.handleCrisisRequest(query, userId, conversationId)
            .then(result => ({
              ...result,
              actualResponseTime: Date.now() - startTime
            }));
        })
      );

      // Assert: All should meet SLA despite failover
      slaResults.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.actualResponseTime).toBeLessThan(2000); // SLA requirement
        expect(result.slaCompliant).toBe(true);
        expect(result.provider).toBe('Azure'); // Should fail over to tier 2
        expect(result.tier).toBe(2);
      });

      const averageResponseTime = slaResults.reduce((sum, r) => sum + r.actualResponseTime, 0) / slaResults.length;
      expect(averageResponseTime).toBeLessThan(1500); // Well within SLA
    });

    it('should handle timeout scenarios with appropriate failover', async () => {
      // Setup timeout scenarios for multiple tiers
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 6000)); // Long timeout
        throw new Error('Request timeout');
      });

      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 4000)); // Medium timeout
        throw new Error('Request timeout');
      });

      jest.spyOn(AnthropicProvider.prototype, 'makeRequest').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Fast response
        return {
          content: 'Claude crisis response after other providers timed out.',
          usage: { tokens: 95, cost: 0.012 },
          cached: false,
          model: 'claude-3-haiku',
          finishReason: 'completed'
        };
      });

      const timeoutTest = {
        query: 'I am in crisis and need immediate help',
        userId: 'timeout-test-user',
        conversationId: 'timeout-test-conv'
      };

      // Act: Test timeout handling
      const startTime = Date.now();
      const result = await failoverService.handleCrisisRequest(
        timeoutTest.query,
        timeoutTest.userId,
        timeoutTest.conversationId
      );
      const totalTime = Date.now() - startTime;

      // Assert: Should successfully fail over to working provider
      expect(result.success).toBe(true);
      expect(result.provider).toBe('Anthropic'); // Should reach tier 3
      expect(result.tier).toBe(3);
      expect(totalTime).toBeLessThan(8000); // Total time including timeouts
      expect(result.responseTime).toBeLessThan(2000); // Final response within SLA
      expect(result.slaCompliant).toBe(true);
    });
  });

  describe('Real-World Healthcare Failover Scenarios', () => {
    it('should handle GP surgery system outage during patient crisis', async () => {
      // Simulate GP surgery hours system outage - only emergency tier available
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Primary care system offline'));
      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('NHS Azure services maintenance'));
      jest.spyOn(AnthropicProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('Third-party AI unavailable'));

      jest.spyOn(EmergencyProvider.prototype, 'makeRequest').mockResolvedValue({
        content: `I understand you're reaching out during what seems like a difficult time. While our AI systems are currently experiencing issues, immediate support is still available to you.

**Immediate Support Available:**
- **Emergency Services**: 999 (for life-threatening emergencies)
- **Samaritans**: 116 123 (free, confidential, 24/7)
- **NHS 111**: For urgent medical advice
- **Crisis Text Line**: Text SHOUT to 85258

**Local Services:**
- Contact your GP surgery directly (they may have emergency contact information)
- NHS Walk-in Centres: Use NHS website to find nearest location
- Local mental health crisis teams: Contact via NHS 111

**Online Resources:**
- NHS website: nhs.uk
- Samaritans: samaritans.org
- Mind: mind.org.uk

Please don't hesitate to reach out for support. Technical difficulties don't mean help isn't available.

*This is general health information. For emergencies, call 999. For urgent medical advice, call NHS 111.*`,
        usage: { tokens: 0, cost: 0 },
        cached: true,
        model: 'emergency',
        finishReason: 'completed'
      });

      const surgeryOutageScenarios = [
        'I cannot reach my GP and I am having panic attacks',
        'Surgery system is down but I need mental health help urgently',
        'Cannot book appointment anywhere, feeling suicidal'
      ];

      // Act: Handle surgery outage scenarios
      const outageResults = await Promise.all(
        surgeryOutageScenarios.map((query, i) =>
          failoverService.handleCrisisRequest(
            query,
            `surgery-outage-user-${i}`,
            `surgery-outage-conv-${i}`
          )
        )
      );

      // Assert: Should provide comprehensive support despite system outage
      outageResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.provider).toBe('Emergency');
        expect(result.emergencyResponse).toBe(true);
        expect(result.content).toContain('999');
        expect(result.content).toContain('Samaritans');
        expect(result.content).toContain('NHS 111');
        expect(result.content).toContain('GP surgery');
        expect(result.responseTime).toBeLessThan(1000);
      });
    });

    it('should prioritize urgent medical emergencies over general queries during provider stress', async () => {
      // Setup different response times based on query urgency
      jest.spyOn(OpenAIProvider.prototype, 'makeRequest')
        .mockRejectedValue(new Error('OpenAI overwhelmed'));

      jest.spyOn(AzureOpenAIProvider.prototype, 'makeRequest').mockImplementation(async (request) => {
        // Prioritize crisis queries
        const isCrisis = request.query.toLowerCase().includes('emergency') || 
                         request.query.toLowerCase().includes('crisis') ||
                         request.query.toLowerCase().includes('urgent');
        
        const delay = isCrisis ? 800 : 2000; // Crisis queries processed faster
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
          content: isCrisis 
            ? 'URGENT: Crisis response with immediate support resources.'
            : 'General health information and guidance provided.',
          usage: { tokens: isCrisis ? 150 : 100, cost: isCrisis ? 0.035 : 0.025 },
          cached: false,
          model: 'gpt-4-turbo',
          finishReason: 'completed'
        };
      });

      const mixedQueries = [
        { query: 'URGENT: Having severe chest pain and difficulty breathing', priority: 'crisis' },
        { query: 'General question about healthy eating habits', priority: 'general' },
        { query: 'EMERGENCY: I think I am having a heart attack', priority: 'crisis' },
        { query: 'What vitamins should I take?', priority: 'general' },
        { query: 'Crisis: Feeling suicidal and need help now', priority: 'crisis' }
      ];

      // Act: Process mixed priority queries concurrently
      const startTime = Date.now();
      const priorityResults = await Promise.all(
        mixedQueries.map(({ query, priority }, i) => {
          const queryStartTime = Date.now();
          const method = priority === 'crisis' 
            ? failoverService.handleCrisisRequest(query, `priority-user-${i}`, `priority-conv-${i}`)
            : failoverService.handleGeneralQuery(query, `priority-user-${i}`, `priority-conv-${i}`);
          
          return method.then(result => ({
            ...result,
            priority,
            queryTime: Date.now() - queryStartTime
          }));
        })
      );

      // Assert: Crisis queries should be processed faster
      const crisisResults = priorityResults.filter(r => r.priority === 'crisis');
      const generalResults = priorityResults.filter(r => r.priority === 'general');

      crisisResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.queryTime).toBeLessThan(1500); // Crisis queries processed quickly
        if ('slaCompliant' in result) {
          expect(result.slaCompliant).toBe(true);
        }
      });

      generalResults.forEach(result => {
        expect(result.success).toBe(true);
        // General queries may take longer but should still succeed
        expect(result.queryTime).toBeLessThan(3000);
      });

      const averageCrisisTime = crisisResults.reduce((sum, r) => sum + r.queryTime, 0) / crisisResults.length;
      const averageGeneralTime = generalResults.reduce((sum, r) => sum + r.queryTime, 0) / generalResults.length;

      expect(averageCrisisTime).toBeLessThan(averageGeneralTime); // Crisis prioritized
    });
  });
});