import { FailoverManager, FailoverTier, FailoverConfig, FailoverResult, ProviderHealth } from '../FailoverManager';
import { AIProvider } from '../AIProvider';
import { CircuitBreaker } from '../CircuitBreaker';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../AIProvider');
jest.mock('../CircuitBreaker');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('FailoverManager', () => {
  let failoverManager: FailoverManager;
  let mockPrimaryProvider: jest.Mocked<AIProvider>;
  let mockSecondaryProvider: jest.Mocked<AIProvider>;
  let mockTertiaryProvider: jest.Mocked<AIProvider>;
  let mockEmergencyProvider: jest.Mocked<AIProvider>;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;

  const defaultConfig: FailoverConfig = {
    timeoutMs: 3000,
    maxRetries: 3,
    circuitBreakerThreshold: 5,
    circuitBreakerResetTimeout: 30000,
    emergencyResponsesEnabled: true,
    slaMonitoringEnabled: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the CircuitBreaker constructor to return the mock instance
    mockCircuitBreaker = {
      call: jest.fn(),
      isOpen: jest.fn().mockReturnValue(false),
      getMetrics: jest.fn().mockReturnValue({
        requests: 0,
        failures: 0,
        state: 'CLOSED',
        failureRate: 0
      }),
      getState: jest.fn().mockReturnValue('CLOSED')
    } as jest.Mocked<CircuitBreaker>;
    
    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(() => mockCircuitBreaker);
    
    // Create mock providers
    mockPrimaryProvider = {
      name: 'openai-gpt4o-mini',
      priority: 1,
      makeRequest: jest.fn(),
      checkHealth: jest.fn(),
      getMetrics: jest.fn()
    } as jest.Mocked<AIProvider>;

    mockSecondaryProvider = {
      name: 'azure-openai-uk-west',
      priority: 2,
      makeRequest: jest.fn(),
      checkHealth: jest.fn(),
      getMetrics: jest.fn()
    } as jest.Mocked<AIProvider>;

    mockTertiaryProvider = {
      name: 'anthropic-claude-3.5-sonnet',
      priority: 3,
      makeRequest: jest.fn(),
      checkHealth: jest.fn(),
      getMetrics: jest.fn()
    } as jest.Mocked<AIProvider>;

    mockEmergencyProvider = {
      name: 'emergency-cached-responses',
      priority: 4,
      makeRequest: jest.fn(),
      checkHealth: jest.fn(),
      getMetrics: jest.fn()
    } as jest.Mocked<AIProvider>;

    const providers = [
      mockPrimaryProvider,
      mockSecondaryProvider,
      mockTertiaryProvider,
      mockEmergencyProvider
    ];

    failoverManager = new FailoverManager(providers, defaultConfig);
  });

  describe('constructor', () => {
    it('should initialize with 4-tier failover architecture', () => {
      expect(failoverManager).toBeDefined();
      expect(failoverManager.getTiers()).toHaveLength(4);
    });

    it('should sort providers by priority', () => {
      const tiers = failoverManager.getTiers();
      expect(tiers[0].provider.name).toBe('openai-gpt4o-mini');
      expect(tiers[1].provider.name).toBe('azure-openai-uk-west');
      expect(tiers[2].provider.name).toBe('anthropic-claude-3.5-sonnet');
      expect(tiers[3].provider.name).toBe('emergency-cached-responses');
    });
  });

  describe('makeRequest', () => {
    it('should succeed with primary provider when healthy', async () => {
      const mockResponse = { content: 'Test response', usage: { tokens: 100 } };
      
      // Mock the primary provider to return the response
      mockPrimaryProvider.makeRequest.mockResolvedValue(mockResponse);
      
      // Mock the circuit breaker to call the underlying provider
      mockCircuitBreaker.call.mockImplementation((fn) => fn());

      const result = await failoverManager.makeRequest('Test query', { type: 'crisis' });

      expect(result.success).toBe(true);
      expect(result.response).toEqual(mockResponse);
      expect(result.provider).toBe('openai-gpt4o-mini');
      expect(result.tier).toBe(1);
      expect(result.responseTime).toBeLessThan(3000);
    });

    it('should failover to secondary provider when primary fails', async () => {
      const primaryError = new Error('Primary provider timeout');
      const secondaryResponse = { content: 'Secondary response', usage: { tokens: 100 } };
      
      // Mock primary provider to fail
      mockPrimaryProvider.makeRequest.mockRejectedValue(primaryError);
      // Mock secondary provider to succeed
      mockSecondaryProvider.makeRequest.mockResolvedValue(secondaryResponse);
      
      // Mock circuit breaker to call underlying providers
      mockCircuitBreaker.call
        .mockImplementationOnce((fn) => fn()) // First call (primary) will throw
        .mockImplementationOnce((fn) => fn()); // Second call (secondary) will succeed

      const result = await failoverManager.makeRequest('Test query', { type: 'crisis' });

      expect(result.success).toBe(true);
      expect(result.response).toEqual(secondaryResponse);
      expect(result.provider).toBe('azure-openai-uk-west');
      expect(result.tier).toBe(2);
      expect(result.failoverTime).toBeLessThan(3000);
    });

    it('should failover through all tiers when providers fail sequentially', async () => {
      const emergencyResponse = { content: 'Emergency response', usage: { tokens: 0 } };
      
      // Mock all providers to fail except emergency
      mockPrimaryProvider.makeRequest.mockRejectedValue(new Error('Primary failed'));
      mockSecondaryProvider.makeRequest.mockRejectedValue(new Error('Secondary failed'));
      mockTertiaryProvider.makeRequest.mockRejectedValue(new Error('Tertiary failed'));
      mockEmergencyProvider.makeRequest.mockResolvedValue(emergencyResponse);
      
      // Mock circuit breaker to call underlying providers
      mockCircuitBreaker.call.mockImplementation((fn) => fn());

      const result = await failoverManager.makeRequest('Test query', { type: 'crisis' });

      expect(result.success).toBe(true);
      expect(result.response).toEqual(emergencyResponse);
      expect(result.provider).toBe('emergency-cached-responses');
      expect(result.tier).toBe(4);
      expect(result.failoverTime).toBeLessThan(3000);
    });

    it('should complete failover within 3 seconds for crisis requests', async () => {
      const startTime = Date.now();
      const tertiaryResponse = { content: 'Tertiary response', usage: { tokens: 100 } };
      
      // Mock providers
      mockPrimaryProvider.makeRequest.mockRejectedValue(new Error('Primary timeout'));
      mockSecondaryProvider.makeRequest.mockRejectedValue(new Error('Secondary timeout'));
      mockTertiaryProvider.makeRequest.mockResolvedValue(tertiaryResponse);
      
      // Mock circuit breaker to call underlying providers
      mockCircuitBreaker.call.mockImplementation((fn) => fn());

      const result = await failoverManager.makeRequest('Crisis query', { type: 'crisis' });
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(3000);
      expect(result.failoverTime).toBeLessThan(3000);
    });

    it('should track SLA violations when failover exceeds 3 seconds', async () => {
      // Mock slow providers to cause SLA violation
      // First 3 providers fail slowly, 4th succeeds but after SLA limit
      mockPrimaryProvider.makeRequest.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Slow timeout')), 1200))
      );
      mockSecondaryProvider.makeRequest.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Slow timeout')), 1200))
      );
      mockTertiaryProvider.makeRequest.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({ content: 'Late response', usage: { tokens: 50 } }), 1200))
      );
      
      // Mock circuit breaker to call underlying providers
      mockCircuitBreaker.call.mockImplementation((fn) => fn());

      const result = await failoverManager.makeRequest('Test query', { type: 'crisis' });

      expect(result.slaViolation).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('SLA violation'),
        expect.objectContaining({
          failoverTime: expect.any(Number),
          slaLimit: 3000
        })
      );
    }, 10000);
  });

  describe('getHealthStatus', () => {
    it('should return health status for all providers', async () => {
      mockPrimaryProvider.checkHealth.mockResolvedValue({ healthy: true, responseTime: 100 });
      mockSecondaryProvider.checkHealth.mockResolvedValue({ healthy: true, responseTime: 150 });
      mockTertiaryProvider.checkHealth.mockResolvedValue({ healthy: false, responseTime: 5000 });
      mockEmergencyProvider.checkHealth.mockResolvedValue({ healthy: true, responseTime: 50 });

      const healthStatus = await failoverManager.getHealthStatus();

      expect(healthStatus).toHaveLength(4);
      expect(healthStatus[0]).toMatchObject({
        provider: 'openai-gpt4o-mini',
        tier: 1,
        healthy: true,
        responseTime: 100
      });
      expect(healthStatus[2].healthy).toBe(false);
    });
  });

  describe('getFailoverMetrics', () => {
    it('should return comprehensive failover metrics', () => {
      const metrics = failoverManager.getFailoverMetrics();

      expect(metrics).toMatchObject({
        totalRequests: expect.any(Number),
        successfulRequests: expect.any(Number),
        failoverCount: expect.any(Number),
        slaViolations: expect.any(Number),
        averageFailoverTime: expect.any(Number),
        providerMetrics: expect.arrayContaining([
          expect.objectContaining({
            provider: expect.any(String),
            requests: expect.any(Number),
            failures: expect.any(Number),
            averageResponseTime: expect.any(Number)
          })
        ])
      });
    });

    it('should track circuit breaker state in metrics', () => {
      mockCircuitBreaker.getMetrics.mockReturnValue({
        requests: 100,
        failures: 5,
        state: 'CLOSED',
        failureRate: 5
      });

      const metrics = failoverManager.getFailoverMetrics();

      expect(metrics.circuitBreakerMetrics).toBeDefined();
      expect(metrics.circuitBreakerMetrics.state).toBe('CLOSED');
    });
  });

  describe('emergency response handling', () => {
    it('should return pre-cached crisis responses when all providers fail', async () => {
      const emergencyResponse = {
        content: 'If you are experiencing a mental health crisis, please contact: Samaritans 116 123',
        usage: { tokens: 0 }
      };
      
      // Mock first 3 providers to fail, emergency to succeed
      mockPrimaryProvider.makeRequest.mockRejectedValue(new Error('Primary failed'));
      mockSecondaryProvider.makeRequest.mockRejectedValue(new Error('Secondary failed'));
      mockTertiaryProvider.makeRequest.mockRejectedValue(new Error('Tertiary failed'));
      mockEmergencyProvider.makeRequest.mockResolvedValue(emergencyResponse);
      
      // Mock circuit breaker to call underlying providers
      mockCircuitBreaker.call.mockImplementation((fn) => fn());

      const result = await failoverManager.makeRequest('I want to hurt myself', { type: 'crisis' });

      expect(result.success).toBe(true);
      expect(result.response.content).toContain('Samaritans');
      expect(result.provider).toBe('emergency-cached-responses');
      expect(result.emergencyResponse).toBe(true);
    });

    it('should escalate to human immediately when emergency provider fails', async () => {
      // Mock all providers including emergency to fail
      mockPrimaryProvider.makeRequest.mockRejectedValue(new Error('Primary failed'));
      mockSecondaryProvider.makeRequest.mockRejectedValue(new Error('Secondary failed'));
      mockTertiaryProvider.makeRequest.mockRejectedValue(new Error('Tertiary failed'));
      mockEmergencyProvider.makeRequest.mockRejectedValue(new Error('Emergency provider failed'));
      
      // Mock circuit breaker to call underlying providers
      mockCircuitBreaker.call.mockImplementation((fn) => fn());

      const result = await failoverManager.makeRequest('Crisis query', { type: 'crisis' });

      expect(result.success).toBe(false);
      expect(result.humanEscalation).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: All failover tiers failed'),
        expect.any(Object)
      );
    });
  });

  describe('circuit breaker integration', () => {
    it('should use circuit breaker for each provider call', async () => {
      const mockResponse = { content: 'Response', usage: { tokens: 100 } };
      mockCircuitBreaker.call.mockResolvedValue(mockResponse);

      await failoverManager.makeRequest('Test query', { type: 'general' });

      expect(mockCircuitBreaker.call).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ bypassCircuitBreaker: false })
      );
    });

    it('should skip providers with open circuit breakers', async () => {
      mockCircuitBreaker.isOpen.mockReturnValueOnce(true).mockReturnValueOnce(false);
      const secondaryResponse = { content: 'Secondary response', usage: { tokens: 100 } };
      mockCircuitBreaker.call.mockResolvedValue(secondaryResponse);

      const result = await failoverManager.makeRequest('Test query', { type: 'general' });

      expect(result.provider).toBe('azure-openai-uk-west');
      expect(result.tier).toBe(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping provider with open circuit breaker'),
        expect.objectContaining({ provider: 'openai-gpt4o-mini' })
      );
    });
  });
});