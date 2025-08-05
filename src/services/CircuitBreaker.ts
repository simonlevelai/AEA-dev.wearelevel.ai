import { logger } from '../utils/logger';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  timeout: number;
  monitoringWindow: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerMetrics {
  requests: number;
  failures: number;
  failureRate: number;
  state: string;
  lastFailureTime?: number;
  averageResponseTime: number;
  minResponseTime?: number;
  maxResponseTime?: number;
}

export interface CircuitBreakerHealthStatus {
  isHealthy: boolean;
  state: string;
  failureRate: number;
  responseTime: number;
  lastFailure: number | null;
}

export interface CallOptions {
  bypassCircuitBreaker?: boolean;
  timeout?: number;
}

/**
 * Circuit Breaker implementation with SLA monitoring integration
 * 
 * Implements the circuit breaker pattern to prevent cascading failures
 * and provide fast failure detection for AI provider calls.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private readonly config: CircuitBreakerConfig;
  
  // Metrics tracking
  private requests = 0;
  private failures = 0;
  private lastFailureTime?: number;
  private responseTimes: number[] = [];
  private lastStateChange = Date.now();
  private nextAttemptTime = 0;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    
    logger.info('Circuit breaker initialized', {
      failureThreshold: config.failureThreshold,
      resetTimeout: config.resetTimeout,
      timeout: config.timeout
    });
  }

  /**
   * Execute a function through the circuit breaker
   */
  async call<T>(
    fn: () => Promise<T>, 
    options: CallOptions = {}
  ): Promise<T> {
    const startTime = Date.now();

    // Allow bypass for crisis requests even when circuit is open
    if (options.bypassCircuitBreaker && this.state === CircuitBreakerState.OPEN) {
      logger.warn('Bypassing open circuit breaker for crisis request');
      return await this.executeWithTimeout(fn, options.timeout || this.config.timeout);
    }

    // Check if circuit breaker should transition states
    this.checkStateTransition();

    // If circuit is open, fail fast
    if (this.state === CircuitBreakerState.OPEN) {
      const error = new Error('Circuit breaker is OPEN');
      this.trackCall(startTime, false);
      throw error;
    }

    try {
      const result = await this.executeWithTimeout(
        fn, 
        options.timeout || this.config.timeout
      );
      
      this.trackCall(startTime, true);
      
      // If we're in HALF_OPEN state and call succeeds, close the circuit
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.closeCircuit();
      }

      return result;

    } catch (error) {
      this.trackCall(startTime, false);
      
      // If we're in HALF_OPEN state and call fails, reopen the circuit
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.openCircuit();
        logger.warn('Circuit breaker reopened after failed recovery attempt');
      }
      // If we're in CLOSED state, check if we should open
      else if (this.state === CircuitBreakerState.CLOSED) {
        this.checkForOpen();
      }

      throw error;
    }
  }

  /**
   * Check if circuit breaker is open
   */
  isOpen(): boolean {
    this.checkStateTransition();
    return this.state === CircuitBreakerState.OPEN;
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const failureRate = this.requests > 0 
      ? Math.round((this.failures / this.requests) * 10000) / 100 
      : 0;

    const averageResponseTime = this.responseTimes.length > 0
      ? Math.round(this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length)
      : 0;

    const minResponseTime = this.responseTimes.length > 0 
      ? Math.min(...this.responseTimes) 
      : undefined;

    const maxResponseTime = this.responseTimes.length > 0 
      ? Math.max(...this.responseTimes) 
      : undefined;

    return {
      requests: this.requests,
      failures: this.failures,
      failureRate,
      state: this.state,
      lastFailureTime: this.lastFailureTime,
      averageResponseTime,
      minResponseTime,
      maxResponseTime
    };
  }

  /**
   * Get health status for monitoring dashboard
   */
  getHealthStatus(): CircuitBreakerHealthStatus {
    const metrics = this.getMetrics();
    
    return {
      isHealthy: this.state === CircuitBreakerState.CLOSED && metrics.failureRate < 10,
      state: this.state,
      failureRate: metrics.failureRate,
      responseTime: metrics.averageResponseTime,
      lastFailure: this.lastFailureTime || null
    };
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Function call timed out'));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Track a function call and its result
   */
  private trackCall(startTime: number, success: boolean): void {
    const responseTime = Date.now() - startTime;
    
    this.requests++;
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times for rolling average
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    if (!success) {
      this.failures++;
      this.lastFailureTime = Date.now();

      // Log SLA violations for monitoring
      if (responseTime > this.config.timeout) {
        logger.warn('Circuit breaker call exceeded SLA timeout', {
          timeout: this.config.timeout,
          actualTime: responseTime,
          slaViolation: true
        });
      }
    }
  }

  /**
   * Check if circuit breaker should transition states
   */
  private checkStateTransition(): void {
    const now = Date.now();

    // If we're OPEN and enough time has passed, transition to HALF_OPEN
    if (this.state === CircuitBreakerState.OPEN && now >= this.nextAttemptTime) {
      this.state = CircuitBreakerState.HALF_OPEN;
      this.lastStateChange = now;
      
      logger.info('Circuit breaker transitioned to HALF_OPEN for recovery attempt');
    }
  }

  /**
   * Check if circuit should open due to failures
   */
  private checkForOpen(): void {
    const recentFailures = this.getRecentFailures();
    
    if (recentFailures >= this.config.failureThreshold) {
      this.openCircuit();
      
      logger.warn('Circuit breaker opened due to failures', {
        failures: recentFailures,
        threshold: this.config.failureThreshold,
        totalRequests: this.requests
      });
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = CircuitBreakerState.OPEN;
    this.lastStateChange = Date.now();
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
  }

  /**
   * Close the circuit breaker
   */
  private closeCircuit(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.lastStateChange = Date.now();
    
    // Reset metrics when circuit closes after being open
    this.requests = 0;
    this.failures = 0;
    this.responseTimes = [];
    
    logger.info('Circuit breaker closed after successful recovery');
  }

  /**
   * Get count of recent failures within monitoring window
   */
  private getRecentFailures(): number {
    const cutoff = Date.now() - this.config.monitoringWindow;
    
    // For simplicity, we'll use the current failure count
    // In a production system, you'd want to track failures with timestamps
    // and count only failures within the monitoring window
    return this.failures;
  }
}