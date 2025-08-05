import { AIProvider, AIRequest, AIResponse } from './AIProvider';
import { CircuitBreaker } from './CircuitBreaker';
import { logger } from '../utils/logger';

export interface FailoverConfig {
  timeoutMs: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTimeout: number;
  emergencyResponsesEnabled: boolean;
  slaMonitoringEnabled: boolean;
}

export interface FailoverTier {
  provider: AIProvider;
  circuitBreaker: CircuitBreaker;
  tier: number;
}

export interface FailoverResult {
  success: boolean;
  response?: AIResponse;
  provider: string;
  tier: number;
  responseTime: number;
  failoverTime?: number;
  slaViolation?: boolean;
  emergencyResponse?: boolean;
  humanEscalation?: boolean;
  error?: string;
}

export interface ProviderHealth {
  provider: string;
  tier: number;
  healthy: boolean;
  responseTime: number;
  circuitBreakerState?: string;
  lastFailure?: number;
}

export interface FailoverMetrics {
  totalRequests: number;
  successfulRequests: number;
  failoverCount: number;
  slaViolations: number;
  averageFailoverTime: number;
  providerMetrics: Array<{
    provider: string;
    requests: number;
    failures: number;
    averageResponseTime: number;
    successRate: number;
  }>;
  circuitBreakerMetrics?: {
    requests: number;
    failures: number;
    state: string;
    failureRate: number;
  };
}

/**
 * FailoverManager implements a 4-tier failover architecture with circuit breakers
 * and comprehensive SLA monitoring for the Ask Eve Assist chatbot.
 * 
 * Tier 1: OpenAI GPT-4o-mini (primary)
 * Tier 2: Azure OpenAI GPT-4o-mini (secondary)
 * Tier 3: Anthropic Claude 3.5 Sonnet (tertiary)
 * Tier 4: Emergency cached responses + human escalation
 */
export class FailoverManager {
  private readonly tiers: FailoverTier[];
  private readonly config: FailoverConfig;
  private readonly SLA_LIMIT_MS = 3000; // 3-second SLA for crisis responses
  
  // Metrics tracking
  private totalRequests = 0;
  private successfulRequests = 0;
  private failoverCount = 0;
  private slaViolations = 0;
  private failoverTimes: number[] = [];
  private readonly providerStats = new Map<string, {
    requests: number;
    failures: number;
    responseTimes: number[];
  }>();

  constructor(providers: AIProvider[], config: FailoverConfig) {
    this.config = config;
    
    // Sort providers by priority and create tiers with circuit breakers
    const sortedProviders = providers.sort((a, b) => a.priority - b.priority);
    
    this.tiers = sortedProviders.map((provider, index) => ({
      provider,
      circuitBreaker: new CircuitBreaker({
        failureThreshold: config.circuitBreakerThreshold,
        resetTimeout: config.circuitBreakerResetTimeout,
        timeout: config.timeoutMs,
        monitoringWindow: 60000
      }),
      tier: index + 1
    }));

    // Initialize provider stats
    providers.forEach(provider => {
      this.providerStats.set(provider.name, {
        requests: 0,
        failures: 0,
        responseTimes: []
      });
    });

    logger.info('FailoverManager initialized', {
      tiers: this.tiers.length,
      providers: providers.map(p => p.name),
      slaLimit: this.SLA_LIMIT_MS
    });
  }

  /**
   * Make a request with automatic failover through all tiers
   */
  async makeRequest(query: string, context: { type: 'crisis' | 'general' | 'medical_emergency' }): Promise<FailoverResult> {
    const startTime = Date.now();
    this.totalRequests++;

    const request: AIRequest = { query, context };
    const isCrisis = context.type === 'crisis';

    logger.info('Starting failover request', {
      query: query.substring(0, 100),
      type: context.type,
      isCrisis,
      totalTiers: this.tiers.length
    });

    for (const tier of this.tiers) {
      // Skip providers with open circuit breakers (unless crisis bypass)
      if (tier.circuitBreaker.isOpen() && !isCrisis) {
        logger.info('Skipping provider with open circuit breaker', {
          provider: tier.provider.name,
          tier: tier.tier
        });
        continue;
      }

      const tierStartTime = Date.now();
      
      try {
        // Use circuit breaker for the call
        const response = await tier.circuitBreaker.call(
          () => tier.provider.makeRequest(request),
          { bypassCircuitBreaker: isCrisis }
        );

        const responseTime = Date.now() - tierStartTime;
        const totalTime = Date.now() - startTime;
        
        // Track metrics
        this.trackProviderSuccess(tier.provider.name, responseTime);
        this.successfulRequests++;

        // Check for SLA violation
        const slaViolation = totalTime > this.SLA_LIMIT_MS;
        if (slaViolation) {
          this.slaViolations++;
          logger.error('SLA violation in failover request', {
            provider: tier.provider.name,
            tier: tier.tier,
            failoverTime: totalTime,
            slaLimit: this.SLA_LIMIT_MS,
            overrun: totalTime - this.SLA_LIMIT_MS
          });
        }

        // Track failover time if not primary tier
        if (tier.tier > 1) {
          this.failoverCount++;
          this.failoverTimes.push(totalTime);
        }

        logger.info('Failover request successful', {
          provider: tier.provider.name,
          tier: tier.tier,
          responseTime,
          totalTime,
          slaViolation
        });

        return {
          success: true,
          response,
          provider: tier.provider.name,
          tier: tier.tier,
          responseTime: totalTime,
          failoverTime: tier.tier > 1 ? totalTime : undefined,
          slaViolation,
          emergencyResponse: tier.tier === 4
        };

      } catch (error) {
        const responseTime = Date.now() - tierStartTime;
        this.trackProviderFailure(tier.provider.name, responseTime);

        logger.warn('Provider failed in failover chain', {
          provider: tier.provider.name,
          tier: tier.tier,
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime
        });

        // Continue to next tier
        continue;
      }
    }

    // All tiers failed - critical failure
    const totalTime = Date.now() - startTime;
    this.slaViolations++;

    logger.error('CRITICAL: All failover tiers failed', {
      totalTime,
      tiersAttempted: this.tiers.length,
      requestType: context.type,
      isCrisis
    });

    // For crisis requests, this requires immediate human escalation
    return {
      success: false,
      provider: 'none',
      tier: 0,
      responseTime: totalTime,
      failoverTime: totalTime,
      slaViolation: true,
      humanEscalation: isCrisis,
      error: 'All failover tiers failed'
    };
  }

  /**
   * Get health status for all providers
   */
  async getHealthStatus(): Promise<ProviderHealth[]> {
    const healthChecks = await Promise.allSettled(
      this.tiers.map(async (tier) => {
        try {
          const health = await tier.provider.checkHealth();
          return {
            provider: tier.provider.name,
            tier: tier.tier,
            healthy: health.healthy,
            responseTime: health.responseTime,
            circuitBreakerState: tier.circuitBreaker.getState(),
            lastFailure: tier.circuitBreaker.getMetrics().lastFailureTime
          };
        } catch (error) {
          return {
            provider: tier.provider.name,
            tier: tier.tier,
            healthy: false,
            responseTime: 0,
            circuitBreakerState: tier.circuitBreaker.getState(),
            lastFailure: Date.now()
          };
        }
      })
    );

    return healthChecks.map((result, index) => 
      result.status === 'fulfilled' 
        ? result.value 
        : {
            provider: this.tiers[index].provider.name,
            tier: this.tiers[index].tier,
            healthy: false,
            responseTime: 0,
            circuitBreakerState: 'UNKNOWN'
          }
    );
  }

  /**
   * Get comprehensive failover metrics
   */
  getFailoverMetrics(): FailoverMetrics {
    const providerMetrics = Array.from(this.providerStats.entries()).map(([provider, stats]) => {
      const successRate = stats.requests > 0 
        ? Math.round(((stats.requests - stats.failures) / stats.requests) * 10000) / 100
        : 100;
      
      const averageResponseTime = stats.responseTimes.length > 0
        ? Math.round(stats.responseTimes.reduce((sum, time) => sum + time, 0) / stats.responseTimes.length)
        : 0;

      return {
        provider,
        requests: stats.requests,
        failures: stats.failures,
        averageResponseTime,
        successRate
      };
    });

    const averageFailoverTime = this.failoverTimes.length > 0
      ? Math.round(this.failoverTimes.reduce((sum, time) => sum + time, 0) / this.failoverTimes.length)
      : 0;

    // Get circuit breaker metrics from primary provider
    const primaryCircuitBreaker = this.tiers[0]?.circuitBreaker;
    const circuitBreakerMetrics = primaryCircuitBreaker ? primaryCircuitBreaker.getMetrics() : undefined;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failoverCount: this.failoverCount,
      slaViolations: this.slaViolations,
      averageFailoverTime,
      providerMetrics,
      circuitBreakerMetrics
    };
  }

  /**
   * Get failover tiers configuration
   */
  getTiers(): FailoverTier[] {
    return [...this.tiers];
  }

  private trackProviderSuccess(providerName: string, responseTime: number): void {
    const stats = this.providerStats.get(providerName);
    if (stats) {
      stats.requests++;
      stats.responseTimes.push(responseTime);
      
      // Keep only last 100 response times for rolling average
      if (stats.responseTimes.length > 100) {
        stats.responseTimes.shift();
      }
    }
  }

  private trackProviderFailure(providerName: string, responseTime: number): void {
    const stats = this.providerStats.get(providerName);
    if (stats) {
      stats.requests++;
      stats.failures++;
      stats.responseTimes.push(responseTime);
      
      // Keep only last 100 response times for rolling average
      if (stats.responseTimes.length > 100) {
        stats.responseTimes.shift();
      }
    }
  }
}