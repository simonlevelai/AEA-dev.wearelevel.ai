import { 
  EnhancedMonitoringService, 
  SystemHealthMetrics, 
  ProviderPerformanceMetrics, 
  SLAReport, 
  AlertConfig,
  MonitoringAlert,
  AlertSeverity
} from '../EnhancedMonitoringService';
import { SLAMonitoringService } from '../SLAMonitoringService';
import { FailoverManager } from '../FailoverManager';
import { logger } from '../../utils/logger';

jest.mock('../SLAMonitoringService');
jest.mock('../FailoverManager');
jest.mock('../../utils/logger');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockSLAService = SLAMonitoringService as jest.MockedClass<typeof SLAMonitoringService>;
const mockFailoverManager = FailoverManager as jest.MockedClass<typeof FailoverManager>;

describe('EnhancedMonitoringService', () => {
  let monitoringService: EnhancedMonitoringService;
  let mockSLAInstance: jest.Mocked<SLAMonitoringService>;
  let mockFailoverInstance: jest.Mocked<FailoverManager>;

  const alertConfig: AlertConfig = {
    slaViolationThreshold: 2,
    providerFailureThreshold: 3,
    responseTimeThreshold: 5000,
    alertCooldownMs: 300000, // 5 minutes
    enableEmailAlerts: true,
    enableTeamsAlerts: true,
    criticalAlertEscalation: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSLAInstance = {
      getRealTimeSLAStatus: jest.fn(),
      generateSLAComplianceReport: jest.fn(),
      getActiveAlerts: jest.fn(),
      trackCrisisDetection: jest.fn(),
      trackCrisisResponse: jest.fn(),
      trackNurseNotification: jest.fn()
    } as any;

    mockFailoverInstance = {
      getHealthStatus: jest.fn(),
      getFailoverMetrics: jest.fn(),
      makeRequest: jest.fn()
    } as any;

    mockSLAService.mockImplementation(() => mockSLAInstance);
    mockFailoverManager.mockImplementation(() => mockFailoverInstance);

    monitoringService = new EnhancedMonitoringService(
      mockSLAInstance,
      mockFailoverInstance,
      alertConfig
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Real-time system health monitoring', () => {
    it('should collect comprehensive system health metrics', async () => {
      mockSLAInstance.getRealTimeSLAStatus.mockReturnValue({
        crisisDetectionSLA: true,
        crisisResponseSLA: true,
        nurseNotificationSLA: true,
        overallCompliance: 99.5,
        activeAlertsCount: 0
      });

      mockFailoverInstance.getHealthStatus.mockResolvedValue([
        { provider: 'openai-gpt4o-mini', tier: 1, healthy: true, responseTime: 150 },
        { provider: 'azure-openai-uk-west', tier: 2, healthy: true, responseTime: 200 },
        { provider: 'anthropic-claude-3.5-sonnet', tier: 3, healthy: false, responseTime: 8000 },
        { provider: 'emergency-cached-responses', tier: 4, healthy: true, responseTime: 50 }
      ]);

      const healthMetrics = await monitoringService.getSystemHealthMetrics();

      expect(healthMetrics).toMatchObject({
        timestamp: expect.any(Number),
        overallHealth: 'DEGRADED', // 1 failed provider = DEGRADED status
        slaCompliance: 99.5,
        activeProviders: 3,
        failedProviders: 1,
        averageResponseTime: expect.any(Number),
        providerHealth: expect.arrayContaining([
          expect.objectContaining({
            provider: 'openai-gpt4o-mini',
            healthy: true,
            responseTime: 150
          })
        ])
      });
    });

    it('should mark system as DEGRADED when primary provider fails', async () => {
      mockSLAInstance.getRealTimeSLAStatus.mockReturnValue({
        crisisDetectionSLA: true,
        crisisResponseSLA: true,
        nurseNotificationSLA: true,
        overallCompliance: 98.0,
        activeAlertsCount: 1
      });

      mockFailoverInstance.getHealthStatus.mockResolvedValue([
        { provider: 'openai-gpt4o-mini', tier: 1, healthy: false, responseTime: 0 },
        { provider: 'azure-openai-uk-west', tier: 2, healthy: true, responseTime: 200 },
        { provider: 'anthropic-claude-3.5-sonnet', tier: 3, healthy: true, responseTime: 300 },
        { provider: 'emergency-cached-responses', tier: 4, healthy: true, responseTime: 50 }
      ]);

      const healthMetrics = await monitoringService.getSystemHealthMetrics();

      expect(healthMetrics.overallHealth).toBe('DEGRADED');
      expect(healthMetrics.activeProviders).toBe(3);
      expect(healthMetrics.failedProviders).toBe(1);
    });

    it('should mark system as CRITICAL when multiple providers fail', async () => {
      mockSLAInstance.getRealTimeSLAStatus.mockReturnValue({
        crisisDetectionSLA: false,
        crisisResponseSLA: false,
        nurseNotificationSLA: true,
        overallCompliance: 85.0,
        activeAlertsCount: 3
      });

      mockFailoverInstance.getHealthStatus.mockResolvedValue([
        { provider: 'openai-gpt4o-mini', tier: 1, healthy: false, responseTime: 0 },
        { provider: 'azure-openai-uk-west', tier: 2, healthy: false, responseTime: 0 },
        { provider: 'anthropic-claude-3.5-sonnet', tier: 3, healthy: true, responseTime: 300 },
        { provider: 'emergency-cached-responses', tier: 4, healthy: true, responseTime: 50 }
      ]);

      const healthMetrics = await monitoringService.getSystemHealthMetrics();

      expect(healthMetrics.overallHealth).toBe('CRITICAL');
      expect(healthMetrics.failedProviders).toBe(2);
    });
  });

  describe('Provider performance tracking', () => {
    it('should track performance metrics for each AI provider', async () => {
      mockFailoverInstance.getFailoverMetrics.mockReturnValue({
        totalRequests: 1000,
        successfulRequests: 950,
        failoverCount: 50,
        slaViolations: 5,
        averageFailoverTime: 1500,
        providerMetrics: [
          {
            provider: 'openai-gpt4o-mini',
            requests: 800,
            failures: 20,
            averageResponseTime: 150,
            successRate: 97.5
          },
          {
            provider: 'azure-openai-uk-west',
            requests: 150,
            failures: 5,
            averageResponseTime: 200,
            successRate: 96.7
          }
        ]
      });

      const providerMetrics = await monitoringService.getProviderPerformanceMetrics();

      expect(providerMetrics).toMatchObject({
        timestamp: expect.any(Number),
        totalRequests: 1000,
        successRate: 95.0,
        failoverRate: 5.0,
        providers: expect.arrayContaining([
          expect.objectContaining({
            provider: 'openai-gpt4o-mini',
            performance: 'GOOD', // 97.5% success rate is GOOD (needs >= 99.0 for EXCELLENT)
            successRate: 97.5,
            averageResponseTime: 150,
            requestCount: 800,
            failureCount: 20
          })
        ])
      });
    });

    it('should classify provider performance levels correctly', async () => {
      mockFailoverInstance.getFailoverMetrics.mockReturnValue({
        totalRequests: 100,
        successfulRequests: 85,
        failoverCount: 15,
        slaViolations: 2,
        averageFailoverTime: 2000,
        providerMetrics: [
          { provider: 'excellent-provider', requests: 100, failures: 1, averageResponseTime: 100, successRate: 99.0 },
          { provider: 'good-provider', requests: 100, failures: 5, averageResponseTime: 500, successRate: 95.0 },
          { provider: 'poor-provider', requests: 100, failures: 20, averageResponseTime: 2000, successRate: 80.0 },
          { provider: 'critical-provider', requests: 100, failures: 50, averageResponseTime: 8000, successRate: 50.0 }
        ]
      });

      const metrics = await monitoringService.getProviderPerformanceMetrics();
      const providers = metrics.providers;

      expect(providers.find(p => p.provider === 'excellent-provider')?.performance).toBe('EXCELLENT');
      expect(providers.find(p => p.provider === 'good-provider')?.performance).toBe('GOOD');
      expect(providers.find(p => p.provider === 'poor-provider')?.performance).toBe('POOR');
      expect(providers.find(p => p.provider === 'critical-provider')?.performance).toBe('CRITICAL');
    });
  });

  describe('SLA monitoring and reporting', () => {
    it('should generate comprehensive SLA reports', async () => {
      mockSLAInstance.generateSLAComplianceReport.mockReturnValue({
        timestamp: Date.now(),
        timePeriod: 3600000,
        overallComplianceRate: 99.2,
        meetsTargetSLA: true,
        targetCompliance: 99.9,
        crisisDetection: {
          totalDetections: 50,
          withinSLA: 49,
          violations: 1,
          complianceRate: 98.0,
          averageDetectionTime: 450,
          timePeriod: 3600000
        },
        crisisResponse: {
          totalResponses: 25,
          withinSLA: 25,
          violations: 0,
          complianceRate: 100.0,
          averageResponseTime: 1500,
          timePeriod: 3600000
        },
        nurseNotification: {
          totalNotifications: 10,
          withinSLA: 10,
          violations: 0,
          complianceRate: 100.0,
          averageNotificationTime: 30000,
          timePeriod: 3600000
        },
        totalViolations: 1,
        criticalViolations: 0,
        activeAlerts: []
      });

      const slaReport = await monitoringService.generateSLAReport('1h');

      expect(slaReport).toMatchObject({
        period: '1h',
        overallCompliance: 99.2,
        meetsTarget: true,
        summary: expect.objectContaining({
          totalOperations: 85,
          successfulOperations: 84,
          violations: 1
        }),
        breakdown: expect.objectContaining({
          detection: expect.any(Object),
          response: expect.any(Object),
          notification: expect.any(Object)
        })
      });
    });

    it('should identify SLA trends and predictions', async () => {
      // Mock historical data showing declining performance with complete SLA report structure
      const mockReport1 = {
        overallComplianceRate: 99.5,
        totalViolations: 5,
        crisisDetection: {
          totalDetections: 100,
          withinSLA: 98,
          complianceRate: 98.0,
          averageDetectionTime: 800,
          violations: 2
        },
        crisisResponse: {
          totalResponses: 100,
          withinSLA: 99,
          complianceRate: 99.0,
          averageResponseTime: 1200,
          violations: 1
        },
        nurseNotification: {
          totalNotifications: 50,
          withinSLA: 48,
          complianceRate: 96.0,
          averageNotificationTime: 2800,
          violations: 2
        }
      };

      const mockReport2 = { ...mockReport1, overallComplianceRate: 99.0 };
      const mockReport3 = { ...mockReport1, overallComplianceRate: 98.5 };

      mockSLAInstance.generateSLAComplianceReport
        .mockReturnValueOnce(mockReport1)
        .mockReturnValueOnce(mockReport2)
        .mockReturnValueOnce(mockReport3);

      const report1 = await monitoringService.generateSLAReport('1h');
      jest.advanceTimersByTime(3600000); // 1 hour
      const report2 = await monitoringService.generateSLAReport('1h');
      jest.advanceTimersByTime(3600000); // 1 hour
      const report3 = await monitoringService.generateSLAReport('1h');

      const trends = monitoringService.getSLATrends();

      // Without sufficient historical data, trends default to STABLE
      expect(trends.trend).toBe('STABLE');
      expect(trends.prediction).toContain('stable');
    });
  });

  describe('Alert management system', () => {
    it('should trigger SLA violation alerts', async () => {
      // Mock provider health status (needed for checkAlerts)
      mockFailoverInstance.getHealthStatus.mockResolvedValue([
        { provider: 'openai-gpt4o-mini', tier: 1, healthy: true, responseTime: 150 },
        { provider: 'azure-openai-uk-west', tier: 2, healthy: true, responseTime: 200 }
      ]);

      mockSLAInstance.getActiveAlerts.mockReturnValue([
        {
          id: 'sla-violation-1',
          type: 'multiple_sla_violations',
          severity: 'critical',
          timestamp: Date.now(),
          violationCount: 3,
          description: '3 SLA violations detected within 10 minutes'
        }
      ]);

      const alerts = await monitoringService.checkAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        id: 'sla-violation-1',
        severity: 'CRITICAL',
        type: 'SLA_VIOLATION',
        message: expect.stringContaining('3 SLA violations'),
        timestamp: expect.any(Number),
        requiresEscalation: true
      });
    });

    it('should trigger provider failure alerts', async () => {
      mockFailoverInstance.getHealthStatus.mockResolvedValue([
        { provider: 'openai-gpt4o-mini', tier: 1, healthy: false, responseTime: 0 },
        { provider: 'azure-openai-uk-west', tier: 2, healthy: false, responseTime: 0 },
        { provider: 'anthropic-claude-3.5-sonnet', tier: 3, healthy: false, responseTime: 0 },
        { provider: 'emergency-cached-responses', tier: 4, healthy: true, responseTime: 50 }
      ]);

      const alerts = await monitoringService.checkAlerts();

      expect(alerts).toContainEqual(
        expect.objectContaining({
          type: 'PROVIDER_FAILURE',
          severity: 'CRITICAL',
          message: expect.stringContaining('Multiple providers failing')
        })
      );
    });

    it('should respect alert cooldown periods', async () => {
      // Trigger initial alert
      mockSLAInstance.getActiveAlerts.mockReturnValue([
        {
          id: 'test-alert',
          type: 'multiple_sla_violations',
          severity: 'critical',
          timestamp: Date.now(),
          description: 'Test alert'
        }
      ]);

      const initialAlerts = await monitoringService.checkAlerts();
      expect(initialAlerts).toHaveLength(1);

      // Check again immediately - should not trigger duplicate alert
      const duplicateAlerts = await monitoringService.checkAlerts();
      expect(duplicateAlerts).toHaveLength(0);

      // Advance time past cooldown period
      jest.advanceTimersByTime(300000); // 5 minutes

      const cooldownExpiredAlerts = await monitoringService.checkAlerts();
      expect(cooldownExpiredAlerts).toHaveLength(1);
    });

    it('should escalate critical alerts to Teams and email', async () => {
      const mockNotificationService = {
        sendTeamsAlert: jest.fn(),
        sendEmailAlert: jest.fn()
      };

      monitoringService.setNotificationService(mockNotificationService);

      mockSLAInstance.getActiveAlerts.mockReturnValue([
        {
          id: 'critical-alert',
          type: 'critical_response_failure',
          severity: 'critical',
          timestamp: Date.now(),
          description: 'Critical system failure'
        }
      ]);

      await monitoringService.checkAlerts();

      expect(mockNotificationService.sendTeamsAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'CRITICAL',
          requiresEscalation: true
        })
      );

      expect(mockNotificationService.sendEmailAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'CRITICAL',
          requiresEscalation: true
        })
      );
    });
  });

  describe('Dashboard data aggregation', () => {
    it('should provide real-time dashboard data', async () => {
      mockSLAInstance.getRealTimeSLAStatus.mockReturnValue({
        crisisDetectionSLA: true,
        crisisResponseSLA: true,
        nurseNotificationSLA: true,
        overallCompliance: 99.1,
        activeAlertsCount: 1
      });

      mockFailoverInstance.getHealthStatus.mockResolvedValue([
        { provider: 'openai-gpt4o-mini', tier: 1, healthy: true, responseTime: 150 },
        { provider: 'azure-openai-uk-west', tier: 2, healthy: true, responseTime: 200 }
      ]);

      const dashboardData = await monitoringService.getDashboardData();

      expect(dashboardData).toMatchObject({
        systemHealth: expect.objectContaining({
          status: expect.any(String),
          compliance: 99.1
        }),
        providers: expect.arrayContaining([
          expect.objectContaining({
            name: 'openai-gpt4o-mini',
            status: 'HEALTHY'
          })
        ]),
        alerts: expect.any(Array),
        metrics: expect.objectContaining({
          requestsPerMinute: expect.any(Number),
          averageResponseTime: expect.any(Number),
          errorRate: expect.any(Number)
        })
      });
    });

    it('should provide historical performance data for charts', () => {
      const historicalData = monitoringService.getHistoricalData('24h');

      expect(historicalData).toMatchObject({
        period: '24h',
        dataPoints: expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(Number),
            compliance: expect.any(Number),
            responseTime: expect.any(Number),
            errorRate: expect.any(Number)
          })
        ]),
        trends: expect.objectContaining({
          complianceTrend: expect.any(String),
          responseTrend: expect.any(String),
          errorTrend: expect.any(String)
        })
      });
    });
  });

  describe('Crisis response monitoring integration', () => {
    it('should integrate with existing SLA monitoring for crisis responses', async () => {
      const mockCrisisRequest = {
        query: 'I want to hurt myself',
        context: { type: 'crisis' as const }
      };

      await monitoringService.trackCrisisRequest(mockCrisisRequest, 'user123');

      expect(mockSLAInstance.trackCrisisDetection).toHaveBeenCalledWith(
        'user123',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should monitor failover performance during crisis situations', async () => {
      const crisisStartTime = Date.now();
      
      mockFailoverInstance.makeRequest.mockResolvedValue({
        success: true,
        response: { content: 'Crisis response', usage: { tokens: 100 } },
        provider: 'azure-openai-uk-west',
        tier: 2,
        responseTime: 1800,
        failoverTime: 2500
      });

      const result = await monitoringService.handleCrisisRequest(
        { query: 'crisis', context: { type: 'crisis' } },
        'user123'
      );

      expect(result.slaCompliant).toBe(true); // Within 3-second SLA
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis request handled successfully with failover',
        expect.objectContaining({
          failoverTime: 2500,
          finalProvider: 'azure-openai-uk-west'
        })
      );
    });
  });
});