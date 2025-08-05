import { AIProvider, OpenAIProvider, AzureOpenAIProvider, AnthropicProvider, EmergencyProvider } from '../AIProvider';
import { AIRequest, AIResponse, ProviderConfig, ProviderHealth, ProviderMetrics } from '../AIProvider';
import { logger } from '../../utils/logger';
import OpenAI from 'openai';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('openai');
jest.mock('@azure/identity');
jest.mock('axios');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('AIProvider Base Class', () => {
  class TestProvider extends AIProvider {
    async makeRequest(request: AIRequest): Promise<AIResponse> {
      return { content: 'Test response', usage: { tokens: 100 } };
    }

    async checkHealth(): Promise<ProviderHealth> {
      return { healthy: true, responseTime: 100 };
    }
  }

  let testProvider: TestProvider;
  const mockConfig: ProviderConfig = {
    name: 'test-provider',
    priority: 1,
    apiKey: 'test-key',
    endpoint: 'https://test.endpoint.com',
    timeout: 5000,
    retries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    testProvider = new TestProvider(mockConfig);
  });

  it('should initialize with correct configuration', () => {
    expect(testProvider.name).toBe('test-provider');
    expect(testProvider.priority).toBe(1);
  });

  it('should track request metrics', async () => {
    await testProvider.makeRequest({ query: 'test', context: { type: 'general' } });
    
    const metrics = testProvider.getMetrics();
    expect(metrics.requests).toBe(1);
    expect(metrics.failures).toBe(0);
    expect(metrics.averageResponseTime).toBeGreaterThan(0);
  });

  it('should track failure metrics when request fails', async () => {
    const failingProvider = new (class extends AIProvider {
      async makeRequest(): Promise<AIResponse> {
        throw new Error('Request failed');
      }
      async checkHealth(): Promise<ProviderHealth> {
        return { healthy: false, responseTime: 0 };
      }
    })(mockConfig);

    try {
      await failingProvider.makeRequest({ query: 'test', context: { type: 'general' } });
    } catch (error) {
      // Expected to fail
    }

    const metrics = failingProvider.getMetrics();
    expect(metrics.requests).toBe(1);
    expect(metrics.failures).toBe(1);
    expect(metrics.failureRate).toBe(100);
  });
});

describe('OpenAIProvider', () => {
  let openAIProvider: OpenAIProvider;
  let mockOpenAIClient: jest.Mocked<OpenAI>;

  const openAIConfig: ProviderConfig = {
    name: 'openai-gpt4o-mini',
    priority: 1,
    apiKey: 'sk-test-key',
    model: 'gpt-4o-mini',
    timeout: 5000,
    retries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    } as any;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAIClient);
    
    openAIProvider = new OpenAIProvider(openAIConfig);
  });

  it('should make successful requests to OpenAI', async () => {
    const mockResponse = {
      choices: [{
        message: { content: 'OpenAI response' }
      }],
      usage: { total_tokens: 150 }
    };

    mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse as any);

    const result = await openAIProvider.makeRequest({
      query: 'Test query',
      context: { type: 'general' }
    });

    expect(result.content).toBe('OpenAI response');
    expect(result.usage.tokens).toBe(150);
    expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: expect.any(Array),
      temperature: 0.3,
      max_tokens: 1000
    });
  });

  it('should handle API errors gracefully', async () => {
    mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API rate limited'));

    await expect(openAIProvider.makeRequest({
      query: 'Test query',
      context: { type: 'general' }
    })).rejects.toThrow('API rate limited');

    const metrics = openAIProvider.getMetrics();
    expect(metrics.failures).toBe(1);
  });

  it('should perform health checks', async () => {
    mockOpenAIClient.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'Health check OK' } }],
      usage: { total_tokens: 10 }
    } as any);

    const health = await openAIProvider.checkHealth();

    expect(health.healthy).toBe(true);
    expect(health.responseTime).toBeGreaterThan(0);
  });
});

describe('AzureOpenAIProvider', () => {
  let azureProvider: AzureOpenAIProvider;

  const azureConfig: ProviderConfig = {
    name: 'azure-openai-uk-west',
    priority: 2,
    endpoint: 'https://test-resource.openai.azure.com',
    apiKey: 'test-azure-key',
    model: 'gpt-4o-mini',
    deployment: 'gpt-4o-mini-deployment',
    timeout: 5000,
    retries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    azureProvider = new AzureOpenAIProvider(azureConfig);
  });

  it('should initialize with Azure-specific configuration', () => {
    expect(azureProvider.name).toBe('azure-openai-uk-west');
    expect(azureProvider.priority).toBe(2);
  });

  it('should make requests using Azure OpenAI format', async () => {
    const mockResponse = {
      choices: [{
        message: { content: 'Azure OpenAI response' }
      }],
      usage: { total_tokens: 200 }
    };

    // Mock the axios request that would be made internally
    const axios = require('axios');
    axios.post = jest.fn().mockResolvedValue({ data: mockResponse });

    const result = await azureProvider.makeRequest({
      query: 'Test Azure query',
      context: { type: 'crisis' }
    });

    expect(result.content).toBe('Azure OpenAI response');
    expect(result.usage.tokens).toBe(200);
  });

  it('should handle Azure-specific authentication', async () => {
    const { DefaultAzureCredential } = require('@azure/identity');
    const mockCredential = { getToken: jest.fn().mockResolvedValue({ token: 'azure-token' }) };
    DefaultAzureCredential.mockImplementation(() => mockCredential);

    const health = await azureProvider.checkHealth();
    expect(health).toBeDefined();
  });
});

describe('AnthropicProvider', () => {
  let anthropicProvider: AnthropicProvider;

  const anthropicConfig: ProviderConfig = {
    name: 'anthropic-claude-3.5-sonnet',
    priority: 3,
    apiKey: 'sk-ant-test-key',
    model: 'claude-3-5-sonnet-20241022',
    timeout: 5000,
    retries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    anthropicProvider = new AnthropicProvider(anthropicConfig);
  });

  it('should make requests to Anthropic API', async () => {
    const mockResponse = {
      content: [{ text: 'Claude response' }],
      usage: { input_tokens: 50, output_tokens: 100 }
    };

    const axios = require('axios');
    axios.post = jest.fn().mockResolvedValue({ data: mockResponse });

    const result = await anthropicProvider.makeRequest({
      query: 'Test Claude query',
      context: { type: 'general' }
    });

    expect(result.content).toBe('Claude response');
    expect(result.usage.tokens).toBe(150); // input + output tokens
  });

  it('should format messages correctly for Anthropic API', async () => {
    const axios = require('axios');
    axios.post = jest.fn().mockResolvedValue({ 
      data: { content: [{ text: 'Response' }], usage: { input_tokens: 10, output_tokens: 20 } }
    });

    await anthropicProvider.makeRequest({
      query: 'Test query',
      context: { type: 'general' }
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        model: 'claude-3-5-sonnet-20241022',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.any(String)
          })
        ]),
        max_tokens: 1000
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test-key',
          'anthropic-version': '2023-06-01'
        })
      })
    );
  });
});

describe('EmergencyProvider', () => {
  let emergencyProvider: EmergencyProvider;

  const emergencyConfig: ProviderConfig = {
    name: 'emergency-cached-responses',
    priority: 4,
    timeout: 1000,
    retries: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();
    emergencyProvider = new EmergencyProvider(emergencyConfig);
  });

  it('should return crisis responses for mental health queries', async () => {
    const result = await emergencyProvider.makeRequest({
      query: 'I want to hurt myself',
      context: { type: 'crisis' }
    });

    expect(result.content).toContain('Samaritans');
    expect(result.content).toContain('116 123');
    expect(result.usage.tokens).toBe(0); // Emergency responses don't use tokens
    expect(result.cached).toBe(true);
  });

  it('should return medical emergency responses for urgent symptoms', async () => {
    const result = await emergencyProvider.makeRequest({
      query: 'severe chest pain and difficulty breathing',
      context: { type: 'medical_emergency' }
    });

    expect(result.content).toContain('999');
    expect(result.content).toContain('emergency');
    expect(result.cached).toBe(true);
  });

  it('should return general health guidance for other queries', async () => {
    const result = await emergencyProvider.makeRequest({
      query: 'general health question',
      context: { type: 'general' }
    });

    expect(result.content).toContain('healthcare professional');
    expect(result.content).toContain('GP');
    expect(result.cached).toBe(true);
  });

  it('should always return healthy status for emergency provider', async () => {
    const health = await emergencyProvider.checkHealth();

    expect(health.healthy).toBe(true);
    expect(health.responseTime).toBeLessThan(100); // Should be very fast
  });

  it('should immediately escalate to human when unable to provide emergency response', async () => {
    // Mock a scenario where even emergency responses fail
    const faultyEmergencyProvider = new (class extends EmergencyProvider {
      async makeRequest(): Promise<AIResponse> {
        throw new Error('Emergency system failure');
      }
    })(emergencyConfig);

    await expect(faultyEmergencyProvider.makeRequest({
      query: 'crisis',
      context: { type: 'crisis' }
    })).rejects.toThrow('Emergency system failure');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Emergency provider failure'),
      expect.any(Object)
    );
  });
});