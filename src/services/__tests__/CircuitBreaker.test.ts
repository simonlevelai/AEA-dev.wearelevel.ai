import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerMetrics } from '../CircuitBreaker';
import { logger } from '../../utils/logger';

jest.mock('../../utils/logger');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 30000,
    timeout: 3000,
    monitoringWindow: 60000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    circuitBreaker = new CircuitBreaker(defaultConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('CLOSED state behavior', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should execute function successfully when CLOSED', async () => {
      const mockFunction = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.call(mockFunction);

      expect(result).toBe('success');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should track successful calls', async () => {
      const mockFunction = jest.fn().mockResolvedValue('success');

      await circuitBreaker.call(mockFunction);
      await circuitBreaker.call(mockFunction);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.requests).toBe(2);
      expect(metrics.failures).toBe(0);
      expect(metrics.state).toBe('CLOSED');
    });

    it('should track failed calls but remain CLOSED below threshold', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Make 4 failed calls (below threshold of 5)
      for (let i = 0; i < 4; i++) {
        try {
          await circuitBreaker.call(mockFunction);
        } catch (error) {
          // Expected failures
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(4);
      expect(metrics.failureRate).toBe(100);
    });
  });

  describe('OPEN state behavior', () => {
    it('should transition to OPEN after exceeding failure threshold', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Make 5 failed calls to reach threshold
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.call(mockFunction);
        } catch (error) {
          // Expected failures
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.isOpen()).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker opened due to failures',
        expect.objectContaining({
          failures: 5,
          threshold: 5
        })
      );
    });

    it('should reject calls immediately when OPEN', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Trigger circuit breaker to open
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.call(mockFunction);
        } catch (error) {
          // Expected failures
        }
      }

      // Reset mock to verify it's not called when circuit is open
      mockFunction.mockClear();

      await expect(circuitBreaker.call(mockFunction)).rejects.toThrow('Circuit breaker is OPEN');
      expect(mockFunction).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.call(mockFunction);
        } catch (error) {
          // Expected failures
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Fast-forward time by reset timeout
      jest.advanceTimersByTime(30000);

      // Check state first, should be HALF_OPEN after timeout
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      
      const successFunction = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.call(successFunction);

      // After successful call in HALF_OPEN, it should transition to CLOSED
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(result).toBe('success');
    });
  });

  describe('HALF_OPEN state behavior', () => {
    async function openCircuitBreaker() {
      const mockFunction = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.call(mockFunction);
        } catch (error) {
          // Expected failures
        }
      }
      jest.advanceTimersByTime(30000);
    }

    it('should close circuit breaker on successful call in HALF_OPEN', async () => {
      await openCircuitBreaker();

      const successFunction = jest.fn().mockResolvedValue('recovery');
      const result = await circuitBreaker.call(successFunction);

      expect(result).toBe('recovery');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(mockLogger.info).toHaveBeenCalledWith('Circuit breaker closed after successful recovery');
    });

    it('should reopen circuit breaker on failed call in HALF_OPEN', async () => {
      await openCircuitBreaker();

      const failFunction = jest.fn().mockRejectedValue(new Error('still failing'));

      try {
        await circuitBreaker.call(failFunction);
      } catch (error) {
        // Expected failure
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(mockLogger.warn).toHaveBeenCalledWith('Circuit breaker reopened after failed recovery attempt');
    });
  });

  describe('timeout handling', () => {
    it('should timeout calls that exceed configured timeout', async () => {
      const slowFunction = jest.fn(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 5000))
      );

      const callPromise = circuitBreaker.call(slowFunction);
      
      // Advance timers to trigger timeout (3000ms circuit breaker timeout)
      jest.advanceTimersByTime(3000);
      
      await expect(callPromise).rejects.toThrow('Function call timed out');
    }, 10000);

    it('should treat timeouts as failures for circuit breaker logic', async () => {
      const slowFunction = jest.fn(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 5000))
      );

      // Make 5 timeout calls to open circuit breaker
      for (let i = 0; i < 5; i++) {
        const callPromise = circuitBreaker.call(slowFunction);
        
        // Advance timers to trigger timeout
        jest.advanceTimersByTime(3000);
        
        try {
          await callPromise;
        } catch (error) {
          // Expected timeouts
        }
        
        jest.advanceTimersByTime(100); // Small advance between calls
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(5);
    }, 15000);
  });

  describe('metrics and monitoring', () => {
    it('should provide comprehensive metrics', async () => {
      const successFunction = jest.fn().mockResolvedValue('success');
      const failFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Make some successful and failed calls
      await circuitBreaker.call(successFunction);
      await circuitBreaker.call(successFunction);
      
      try {
        await circuitBreaker.call(failFunction);
      } catch (error) {
        // Expected failure
      }

      const metrics = circuitBreaker.getMetrics();
      
      expect(metrics).toMatchObject({
        requests: 3,
        failures: 1,
        failureRate: 33.33,
        state: 'CLOSED',
        lastFailureTime: expect.any(Number),
        averageResponseTime: expect.any(Number)
      });
    });

    it('should reset metrics when circuit closes after being open', async () => {
      const failFunction = jest.fn().mockRejectedValue(new Error('failure'));
      const successFunction = jest.fn().mockResolvedValue('success');

      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.call(failFunction);
        } catch (error) {
          // Expected failures
        }
      }

      // Verify circuit is open
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout and recover
      jest.advanceTimersByTime(30000);
      
      // Circuit should be HALF_OPEN now
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      
      // Make successful call to close circuit
      await circuitBreaker.call(successFunction);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe('CLOSED');
      expect(metrics.failures).toBe(0); // Should reset failure count
      expect(metrics.requests).toBe(0); // Should reset request count for fresh start
    });

    it('should track response times for performance monitoring', async () => {
      const fastFunction = jest.fn().mockResolvedValue('fast');
      const slowFunction = jest.fn(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 100))
      );

      // Execute fast function
      await circuitBreaker.call(fastFunction);
      
      // Execute slow function and advance timers
      const slowCallPromise = circuitBreaker.call(slowFunction);
      jest.advanceTimersByTime(100);
      await slowCallPromise;

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.minResponseTime).toBeDefined();
      expect(metrics.maxResponseTime).toBeDefined();
      expect(metrics.requests).toBe(2);
    }, 10000);
  });

  describe('crisis request prioritization', () => {
    it('should allow crisis requests even when circuit is OPEN', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.call(mockFunction);
        } catch (error) {
          // Expected failures
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Crisis request should bypass open circuit
      const crisisFunction = jest.fn().mockResolvedValue('crisis response');
      const result = await circuitBreaker.call(crisisFunction, { bypassCircuitBreaker: true });

      expect(result).toBe('crisis response');
      expect(crisisFunction).toHaveBeenCalled();
    });

    it('should have shorter timeout for crisis requests', async () => {
      const crisisConfig: CircuitBreakerConfig = {
        ...defaultConfig,
        timeout: 1000 // Shorter timeout for crisis requests
      };

      const crisisCircuitBreaker = new CircuitBreaker(crisisConfig);
      const slowFunction = jest.fn(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 2000))
      );

      const callPromise = crisisCircuitBreaker.call(slowFunction);
      
      // Advance timers to trigger shorter timeout (1000ms)
      jest.advanceTimersByTime(1000);
      
      await expect(callPromise).rejects.toThrow('Function call timed out');
    }, 10000);
  });

  describe('SLA monitoring integration', () => {
    it('should log SLA violations when calls exceed timeout', async () => {
      const slowFunction = jest.fn(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 4000))
      );

      const callPromise = circuitBreaker.call(slowFunction);
      
      // Advance timers to trigger timeout (3000ms circuit breaker timeout)
      jest.advanceTimersByTime(3001);
      
      try {
        await callPromise;
      } catch (error) {
        // Expected timeout
        expect(error.message).toBe('Function call timed out');
      }

      // The SLA warning should be logged during the trackCall method
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker call exceeded SLA timeout',
        expect.objectContaining({
          timeout: 3000,
          actualTime: expect.any(Number),
          slaViolation: true
        })
      );
    }, 15000);

    it('should provide real-time health status for monitoring dashboard', () => {
      const healthStatus = circuitBreaker.getHealthStatus();

      expect(healthStatus).toMatchObject({
        isHealthy: true,
        state: 'CLOSED',
        failureRate: 0,
        responseTime: expect.any(Number),
        lastFailure: null
      });
    });
  });
});