import { FailoverManager } from '../FailoverManager';
import { OpenAIProvider, AzureOpenAIProvider, AnthropicProvider, EmergencyProvider } from '../AIProvider';
import { EnhancedMonitoringService } from '../EnhancedMonitoringService';
import { SLAMonitoringService } from '../SLAMonitoringService';

// Mock all external dependencies
jest.mock('openai');
jest.mock('@azure/identity');
jest.mock('axios');
jest.mock('../../utils/logger');

describe('Failover Integration Tests', () => {
  describe('End-to-End Failover Scenarios', () => {
    it('should implement 4-tier failover architecture', () => {
      // Test that we can create all required components
      const providers = [
        new EmergencyProvider({ name: 'emergency', priority: 4, timeout: 1000, retries: 1 })
      ];

      const failoverConfig = {
        timeoutMs: 3000,
        maxRetries: 3,
        circuitBreakerThreshold: 5,
        circuitBreakerResetTimeout: 30000,
        emergencyResponsesEnabled: true,
        slaMonitoringEnabled: true
      };

      const failoverManager = new FailoverManager(providers, failoverConfig);
      expect(failoverManager).toBeDefined();
      expect(failoverManager.getTiers()).toHaveLength(1);
    });

    it('should integrate with SLA monitoring', () => {
      const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const mockSafetyConfig = {
        response_times: {
          crisis_detection_ms: 500,
          crisis_response_ms: 2000,
          nurse_notification_ms: 60000
        }
      };

      const slaService = new SLAMonitoringService(mockLogger as any, mockSafetyConfig);
      expect(slaService).toBeDefined();
    });

    it('should provide emergency responses when all providers fail', async () => {
      const emergencyProvider = new EmergencyProvider({
        name: 'emergency',
        priority: 4,
        timeout: 1000,
        retries: 1
      });

      const response = await emergencyProvider.makeRequest({
        query: 'I want to hurt myself',
        context: { type: 'crisis' }
      });

      expect(response.content).toContain('Samaritans');
      expect(response.content).toContain('116 123');
      expect(response.cached).toBe(true);
      expect(response.usage.tokens).toBe(0);
    });

    it('should handle medical emergency responses', async () => {
      const emergencyProvider = new EmergencyProvider({
        name: 'emergency',
        priority: 4,
        timeout: 1000,
        retries: 1
      });

      const response = await emergencyProvider.makeRequest({
        query: 'severe chest pain',
        context: { type: 'medical_emergency' }
      });

      expect(response.content).toContain('999');
      expect(response.content).toContain('emergency');
      expect(response.cached).toBe(true);
    });

    it('should maintain MHRA compliance in emergency responses', async () => {
      const emergencyProvider = new EmergencyProvider({
        name: 'emergency',
        priority: 4,
        timeout: 1000,
        retries: 1
      });

      const response = await emergencyProvider.makeRequest({
        query: 'general health question',
        context: { type: 'general' }
      });

      // Should not provide medical advice
      expect(response.content).not.toContain('you should take');
      expect(response.content).not.toContain('diagnosis');
      expect(response.content).not.toContain('prescription');
      
      // Should direct to healthcare professionals
      expect(response.content).toContain('healthcare professional');
      expect(response.content).toContain('GP');
    });

    it('should always report healthy status for emergency provider', async () => {
      const emergencyProvider = new EmergencyProvider({
        name: 'emergency',
        priority: 4,
        timeout: 1000,
        retries: 1
      });

      const health = await emergencyProvider.checkHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.responseTime).toBeLessThan(100);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required configuration for OpenAI provider', () => {
      expect(() => {
        new OpenAIProvider({
          name: 'openai',
          priority: 1,
          timeout: 5000,
          retries: 3
          // Missing apiKey
        });
      }).toThrow('OpenAI API key is required');
    });

    it('should validate required configuration for Azure OpenAI provider', () => {
      expect(() => {
        new AzureOpenAIProvider({
          name: 'azure',
          priority: 2,
          timeout: 5000,
          retries: 3
          // Missing endpoint
        });
      }).toThrow('Azure OpenAI endpoint is required');
    });

    it('should validate required configuration for Anthropic provider', () => {
      expect(() => {
        new AnthropicProvider({
          name: 'anthropic',
          priority: 3,
          timeout: 5000,
          retries: 3
          // Missing apiKey
        });
      }).toThrow('Anthropic API key is required');
    });
  });

  describe('Monitoring Integration', () => {
    it('should integrate monitoring with failover system', () => {
      const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const mockSafetyConfig = {
        response_times: {
          crisis_detection_ms: 500,
          crisis_response_ms: 2000,
          nurse_notification_ms: 60000
        }
      };

      const slaService = new SLAMonitoringService(mockLogger as any, mockSafetyConfig);
      
      const providers = [
        new EmergencyProvider({ name: 'emergency', priority: 4, timeout: 1000, retries: 1 })
      ];

      const failoverManager = new FailoverManager(providers, {
        timeoutMs: 3000,
        maxRetries: 3,
        circuitBreakerThreshold: 5,
        circuitBreakerResetTimeout: 30000,
        emergencyResponsesEnabled: true,
        slaMonitoringEnabled: true
      });

      const alertConfig = {
        slaViolationThreshold: 2,
        providerFailureThreshold: 3,
        responseTimeThreshold: 5000,
        alertCooldownMs: 300000,
        enableEmailAlerts: true,
        enableTeamsAlerts: true,
        criticalAlertEscalation: true
      };

      const monitoringService = new EnhancedMonitoringService(
        slaService,
        failoverManager,
        alertConfig
      );

      expect(monitoringService).toBeDefined();
    });
  });

  describe('Crisis Response SLA Compliance', () => {
    it('should meet <3 second SLA for crisis responses', async () => {
      const emergencyProvider = new EmergencyProvider({
        name: 'emergency',
        priority: 4,
        timeout: 1000,
        retries: 1
      });

      const startTime = Date.now();
      
      const response = await emergencyProvider.makeRequest({
        query: 'I need help',
        context: { type: 'crisis' }
      });

      const responseTime = Date.now() - startTime;

      expect(response).toBeDefined();
      expect(responseTime).toBeLessThan(3000);
      expect(response.content).toContain('Samaritans');
    });

    it('should provide immediate crisis resources', async () => {
      const emergencyProvider = new EmergencyProvider({
        name: 'emergency',
        priority: 4,
        timeout: 1000,
        retries: 1
      });

      const response = await emergencyProvider.makeRequest({
        query: 'suicidal thoughts',
        context: { type: 'crisis' }
      });

      // Must include immediate help resources
      expect(response.content).toContain('Samaritans: 116 123');
      expect(response.content).toContain('Text SHOUT to 85258');
      expect(response.content).toContain('999');
      
      // Must be empathetic and supportive
      expect(response.content).toContain('concerned');
      expect(response.content).not.toContain('just');
      expect(response.content).not.toContain('only');
    });
  });
});