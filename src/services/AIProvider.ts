import OpenAI from 'openai';
import { DefaultAzureCredential } from '@azure/identity';
import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

export interface AIRequest {
  query: string;
  context: {
    type: 'crisis' | 'general' | 'medical_emergency';
  };
}

export interface AIResponse {
  content: string;
  usage: {
    tokens: number;
  };
  cached?: boolean;
}

export interface ProviderConfig {
  name: string;
  priority: number;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  deployment?: string;
  timeout: number;
  retries: number;
}

export interface ProviderHealth {
  healthy: boolean;
  responseTime: number;
  error?: string;
}

export interface ProviderMetrics {
  requests: number;
  failures: number;
  averageResponseTime: number;
  failureRate: number;
  lastFailure?: number;
}

/**
 * Abstract base class for AI providers with unified interface
 */
export abstract class AIProvider {
  public readonly name: string;
  public readonly priority: number;
  protected readonly config: ProviderConfig;
  
  // Metrics tracking
  private requests = 0;
  private failures = 0;
  private responseTimes: number[] = [];
  private lastFailure?: number;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.name = config.name;
    this.priority = config.priority;
    
    logger.info('AI Provider initialized', {
      name: this.name,
      priority: this.priority,
      model: config.model
    });
  }

  /**
   * Make a request to the AI provider
   */
  abstract makeRequest(request: AIRequest): Promise<AIResponse>;

  /**
   * Check provider health
   */
  abstract checkHealth(): Promise<ProviderHealth>;

  /**
   * Get provider metrics
   */
  getMetrics(): ProviderMetrics {
    const averageResponseTime = this.responseTimes.length > 0
      ? Math.round(this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length)
      : 0;

    const failureRate = this.requests > 0
      ? Math.round((this.failures / this.requests) * 10000) / 100
      : 0;

    return {
      requests: this.requests,
      failures: this.failures,
      averageResponseTime,
      failureRate,
      lastFailure: this.lastFailure
    };
  }

  /**
   * Track successful request
   */
  protected trackSuccess(responseTime: number): void {
    this.requests++;
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
  }

  /**
   * Track failed request
   */
  protected trackFailure(responseTime: number): void {
    this.requests++;
    this.failures++;
    this.lastFailure = Date.now();
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
  }

  /**
   * Build system message for health information context
   */
  protected buildSystemMessage(): string {
    return `You are Ask Eve Assist, a helpful AI assistant providing accurate health information about gynaecological conditions. 

CRITICAL SAFETY REQUIREMENTS:
- You are NOT a medical professional and cannot provide medical advice
- Always include appropriate disclaimers about consulting healthcare professionals
- Never diagnose, prescribe medications, or provide specific medical recommendations
- For urgent symptoms, always direct users to emergency services or their GP
- Be empathetic and supportive while maintaining clinical boundaries

Your responses should be:
- Accurate and based on trusted medical sources
- Clear and easy to understand
- Empathetic and supportive
- Include appropriate disclaimers and next steps
- Direct users to professional medical care when appropriate

Remember: You provide general health information only, not medical advice.`;
  }

  /**
   * Format user query with context
   */
  protected formatUserMessage(request: AIRequest): string {
    let message = request.query;

    // Add context-specific guidance
    if (request.context.type === 'crisis') {
      message += '\n\n[CRISIS CONTEXT: This appears to be a crisis situation requiring immediate, supportive response with emergency resources.]';
    } else if (request.context.type === 'medical_emergency') {
      message += '\n\n[EMERGENCY CONTEXT: This appears to be a medical emergency requiring immediate medical attention guidance.]';
    }

    return message;
  }
}

/**
 * OpenAI GPT-4o-mini provider (Primary - Tier 1)
 */
export class OpenAIProvider extends AIProvider {
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout
    });
  }

  async makeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.buildSystemMessage() },
          { role: 'user', content: this.formatUserMessage(request) }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const responseTime = Date.now() - startTime;
      this.trackSuccess(responseTime);

      const content = completion.choices[0]?.message?.content || '';
      const tokens = completion.usage?.total_tokens || 0;

      logger.info('OpenAI request successful', {
        responseTime,
        tokens,
        model: this.config.model
      });

      return {
        content,
        usage: { tokens }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.trackFailure(responseTime);

      logger.error('OpenAI request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });

      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Health check' }],
        max_tokens: 10
      });

      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Azure OpenAI provider (Secondary - Tier 2)
 */
export class AzureOpenAIProvider extends AIProvider {
  private credential: DefaultAzureCredential;
  private endpoint: string;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.endpoint) {
      throw new Error('Azure OpenAI endpoint is required');
    }

    this.endpoint = config.endpoint;
    this.credential = new DefaultAzureCredential();
  }

  async makeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Get access token for Azure
      const tokenResponse = await this.credential.getToken('https://cognitiveservices.azure.com/.default');
      
      const response: AxiosResponse = await axios.post(
        `${this.endpoint}/openai/deployments/${this.config.deployment}/chat/completions?api-version=2024-02-01`,
        {
          messages: [
            { role: 'system', content: this.buildSystemMessage() },
            { role: 'user', content: this.formatUserMessage(request) }
          ],
          temperature: 0.3,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${tokenResponse.token}`,
            'Content-Type': 'application/json'
          },
          timeout: this.config.timeout
        }
      );

      const responseTime = Date.now() - startTime;
      this.trackSuccess(responseTime);

      const content = response.data.choices[0]?.message?.content || '';
      const tokens = response.data.usage?.total_tokens || 0;

      logger.info('Azure OpenAI request successful', {
        responseTime,
        tokens,
        deployment: this.config.deployment
      });

      return {
        content,
        usage: { tokens }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.trackFailure(responseTime);

      logger.error('Azure OpenAI request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });

      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      const tokenResponse = await this.credential.getToken('https://cognitiveservices.azure.com/.default');
      
      await axios.post(
        `${this.endpoint}/openai/deployments/${this.config.deployment}/chat/completions?api-version=2024-02-01`,
        {
          messages: [{ role: 'user', content: 'Health check' }],
          max_tokens: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${tokenResponse.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Anthropic Claude provider (Tertiary - Tier 3)
 */
export class AnthropicProvider extends AIProvider {
  private readonly apiUrl = 'https://api.anthropic.com/v1/messages';

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  async makeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const response: AxiosResponse = await axios.post(
        this.apiUrl,
        {
          model: this.config.model || 'claude-3-5-sonnet-20241022',
          messages: [
            { role: 'user', content: this.formatUserMessage(request) }
          ],
          system: this.buildSystemMessage(),
          max_tokens: 1000
        },
        {
          headers: {
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: this.config.timeout
        }
      );

      const responseTime = Date.now() - startTime;
      this.trackSuccess(responseTime);

      const content = response.data.content[0]?.text || '';
      const inputTokens = response.data.usage?.input_tokens || 0;
      const outputTokens = response.data.usage?.output_tokens || 0;
      const tokens = inputTokens + outputTokens;

      logger.info('Anthropic request successful', {
        responseTime,
        tokens,
        model: this.config.model
      });

      return {
        content,
        usage: { tokens }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.trackFailure(responseTime);

      logger.error('Anthropic request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });

      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      await axios.post(
        this.apiUrl,
        {
          model: this.config.model || 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Health check' }],
          max_tokens: 10
        },
        {
          headers: {
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Emergency provider with cached responses (Emergency - Tier 4)
 */
export class EmergencyProvider extends AIProvider {
  private readonly emergencyResponses = {
    crisis: {
      mentalHealth: `I'm very concerned about what you've shared. Your safety and wellbeing are the most important things right now.

**Immediate support is available:**
• **Samaritans: 116 123** (free, 24/7, confidential)
• **Crisis Text Line: Text SHOUT to 85258**
• **Emergency Services: 999** (if in immediate danger)

You don't have to go through this alone. These services are staffed by trained professionals who understand what you're going through and want to help.

*This is an automated emergency response. Please contact a healthcare professional or emergency services for immediate support.*`,

      selfHarm: `I'm deeply concerned about what you've told me. Please reach out for help right now:

**Urgent support:**
• **Call 999** if you're in immediate danger
• **Samaritans: 116 123** (free, 24/7)
• **Crisis Text Line: Text SHOUT to 85258**
• **Go to your nearest A&E**

Your life has value and there are people who want to help you through this difficult time.

*This is an automated emergency response. Please seek immediate professional help.*`
    },

    medicalEmergency: {
      severe: `This sounds like it could be a serious medical emergency. Please:

**Take immediate action:**
• **Call 999 for emergency services**
• **Go to your nearest A&E department**
• **Don't delay - seek medical attention now**

If symptoms are severe (severe pain, heavy bleeding, difficulty breathing, chest pain), this needs urgent medical assessment.

*This is an automated emergency response. I cannot assess medical emergencies - please seek immediate medical help.*`,

      urgent: `These symptoms sound concerning and may need urgent medical attention:

**Next steps:**
• **Contact your GP urgently** (same day appointment)
• **Call NHS 111** for immediate advice
• **Go to A&E** if symptoms worsen
• **Call 999** if you feel seriously unwell

Don't wait - it's better to seek help early for any concerning symptoms.

*This is an automated emergency response. Please contact a healthcare professional for proper medical assessment.*`
    },

    general: `I'm experiencing technical difficulties and can't provide a complete response right now.

**For health information and support:**
• **Contact your GP** for medical concerns
• **The Eve Appeal Nurse Line** for gynaecological health questions
• **NHS 111** for non-emergency health advice
• **Visit eveappeal.org.uk** for trusted health information

*This is an automated response. Please contact a healthcare professional for medical advice.*`
  };

  constructor(config: ProviderConfig) {
    super(config);
  }

  async makeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      let response = '';

      // Analyze query for appropriate emergency response
      const query = request.query.toLowerCase();
      
      if (request.context.type === 'crisis') {
        if (query.includes('hurt myself') || query.includes('kill myself') || 
            query.includes('suicide') || query.includes('end it all')) {
          response = this.emergencyResponses.crisis.selfHarm;
        } else {
          response = this.emergencyResponses.crisis.mentalHealth;
        }
      } else if (request.context.type === 'medical_emergency') {
        if (query.includes('severe') || query.includes('emergency') || 
            query.includes('urgent') || query.includes('pain')) {
          response = this.emergencyResponses.medicalEmergency.severe;
        } else {
          response = this.emergencyResponses.medicalEmergency.urgent;
        }
      } else {
        response = this.emergencyResponses.general;
      }

      const responseTime = Date.now() - startTime;
      this.trackSuccess(responseTime);

      logger.info('Emergency response provided', {
        type: request.context.type,
        responseTime,
        cached: true
      });

      return {
        content: response,
        usage: { tokens: 0 }, // Emergency responses don't use tokens
        cached: true
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.trackFailure(responseTime);

      logger.error('Emergency provider failure', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
        context: request.context
      });

      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    // Emergency provider should always be healthy as it uses cached responses
    return {
      healthy: true,
      responseTime: 10 // Very fast since it's cached
    };
  }
}