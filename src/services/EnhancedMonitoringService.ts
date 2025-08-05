import { SLAMonitoringService } from './SLAMonitoringService';
import { FailoverManager, ProviderHealth } from './FailoverManager';
import { AIRequest } from './AIProvider';
import { logger } from '../utils/logger';

export interface AlertConfig {
  slaViolationThreshold: number;
  providerFailureThreshold: number;
  responseTimeThreshold: number;
  alertCooldownMs: number;
  enableEmailAlerts: boolean;
  enableTeamsAlerts: boolean;
  criticalAlertEscalation: boolean;
}

export interface SystemHealthMetrics {
  timestamp: number;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  slaCompliance: number;
  activeProviders: number;
  failedProviders: number;
  averageResponseTime: number;
  providerHealth: ProviderHealth[];
}

export interface ProviderPerformanceMetrics {
  timestamp: number;
  totalRequests: number;
  successRate: number;
  failoverRate: number;
  providers: Array<{
    provider: string;
    performance: 'EXCELLENT' | 'GOOD' | 'POOR' | 'CRITICAL';
    successRate: number;
    averageResponseTime: number;
    requestCount: number;
    failureCount: number;
  }>;
}

export interface SLAReport {
  period: string;
  overallCompliance: number;
  meetsTarget: boolean;
  summary: {
    totalOperations: number;
    successfulOperations: number;
    violations: number;
  };
  breakdown: {
    detection: {
      compliance: number;
      averageTime: number;
      violations: number;
    };
    response: {
      compliance: number;
      averageTime: number;
      violations: number;
    };
    notification: {
      compliance: number;
      averageTime: number;
      violations: number;
    };
  };
  trends?: {
    trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
    prediction: string;
  };
}

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL'
}

export interface MonitoringAlert {
  id: string;
  severity: AlertSeverity;
  type: 'SLA_VIOLATION' | 'PROVIDER_FAILURE' | 'PERFORMANCE_DEGRADATION' | 'SYSTEM_CRITICAL';
  message: string;
  timestamp: number;
  requiresEscalation: boolean;
  metadata?: Record<string, any>;
}

export interface DashboardData {
  systemHealth: {
    status: string;
    compliance: number;
    activeAlerts: number;
  };
  providers: Array<{
    name: string;
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
    responseTime: number;
    successRate: number;
  }>;
  alerts: MonitoringAlert[];
  metrics: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    failoverRate: number;
  };
}

export interface HistoricalData {
  period: string;
  dataPoints: Array<{
    timestamp: number;
    compliance: number;
    responseTime: number;
    errorRate: number;
  }>;
  trends: {
    complianceTrend: 'UP' | 'DOWN' | 'STABLE';
    responseTrend: 'UP' | 'DOWN' | 'STABLE';
    errorTrend: 'UP' | 'DOWN' | 'STABLE';
  };
}

/**
 * Enhanced monitoring service providing comprehensive system health,
 * performance tracking, and alerting for the Ask Eve Assist platform.
 */
export class EnhancedMonitoringService {
  private readonly slaService: SLAMonitoringService;
  private readonly failoverManager: FailoverManager;
  private readonly alertConfig: AlertConfig;
  
  // Alert tracking
  private recentAlerts = new Map<string, number>();
  private historicalMetrics: Array<{
    timestamp: number;
    compliance: number;
    responseTime: number;
    errorRate: number;
  }> = [];
  
  // Notification service (optional)
  private notificationService?: {
    sendTeamsAlert: (alert: MonitoringAlert) => Promise<void>;
    sendEmailAlert: (alert: MonitoringAlert) => Promise<void>;
  };

  constructor(
    slaService: SLAMonitoringService,
    failoverManager: FailoverManager,
    alertConfig: AlertConfig
  ) {
    this.slaService = slaService;
    this.failoverManager = failoverManager;
    this.alertConfig = alertConfig;

    logger.info('Enhanced monitoring service initialized', {
      slaThreshold: alertConfig.slaViolationThreshold,
      providerThreshold: alertConfig.providerFailureThreshold,
      cooldown: alertConfig.alertCooldownMs
    });

    // Start periodic metrics collection
    this.startMetricsCollection();
  }

  /**
   * Set notification service for alert escalation
   */
  setNotificationService(service: {
    sendTeamsAlert: (alert: MonitoringAlert) => Promise<void>;
    sendEmailAlert: (alert: MonitoringAlert) => Promise<void>;
  }): void {
    this.notificationService = service;
  }

  /**
   * Get comprehensive system health metrics
   */
  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    const slaStatus = this.slaService.getRealTimeSLAStatus();
    const providerHealth = await this.failoverManager.getHealthStatus();
    
    const activeProviders = providerHealth.filter(p => p.healthy).length;
    const failedProviders = providerHealth.length - activeProviders;
    
    const averageResponseTime = providerHealth.length > 0
      ? Math.round(providerHealth.reduce((sum, p) => sum + p.responseTime, 0) / providerHealth.length)
      : 0;

    // Determine overall health status
    let overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    if (failedProviders === 0 && slaStatus.overallCompliance >= 99.0) {
      overallHealth = 'HEALTHY';
    } else if (failedProviders >= 2 || slaStatus.overallCompliance < 95.0) {
      overallHealth = 'CRITICAL';
    } else {
      overallHealth = 'DEGRADED';
    }

    return {
      timestamp: Date.now(),
      overallHealth,
      slaCompliance: slaStatus.overallCompliance,
      activeProviders,
      failedProviders,
      averageResponseTime,
      providerHealth
    };
  }

  /**
   * Get provider performance metrics with classification
   */
  async getProviderPerformanceMetrics(): Promise<ProviderPerformanceMetrics> {
    const failoverMetrics = this.failoverManager.getFailoverMetrics();
    
    const providers = failoverMetrics.providerMetrics.map(provider => {
      // Classify performance based on success rate and response time
      let performance: 'EXCELLENT' | 'GOOD' | 'POOR' | 'CRITICAL';
      
      if (provider.successRate >= 99.0 && provider.averageResponseTime < 1000) {
        performance = 'EXCELLENT';
      } else if (provider.successRate >= 95.0 && provider.averageResponseTime < 3000) {
        performance = 'GOOD';
      } else if (provider.successRate >= 80.0 && provider.averageResponseTime < 5000) {
        performance = 'POOR';
      } else {
        performance = 'CRITICAL';
      }

      return {
        provider: provider.provider,
        performance,
        successRate: provider.successRate,
        averageResponseTime: provider.averageResponseTime,
        requestCount: provider.requests,
        failureCount: provider.failures
      };
    });

    const successRate = failoverMetrics.totalRequests > 0
      ? Math.round((failoverMetrics.successfulRequests / failoverMetrics.totalRequests) * 10000) / 100
      : 100;

    const failoverRate = failoverMetrics.totalRequests > 0
      ? Math.round((failoverMetrics.failoverCount / failoverMetrics.totalRequests) * 10000) / 100
      : 0;

    return {
      timestamp: Date.now(),
      totalRequests: failoverMetrics.totalRequests,
      successRate,
      failoverRate,
      providers
    };
  }

  /**
   * Generate comprehensive SLA report
   */
  async generateSLAReport(period: '1h' | '24h' | '7d'): Promise<SLAReport> {
    const timePeriod = this.parsePeriod(period);
    const report = this.slaService.generateSLAComplianceReport(timePeriod);

    const summary = {
      totalOperations: 
        (report.crisisDetection.totalDetections || 0) +
        (report.crisisResponse.totalResponses || 0) +
        (report.nurseNotification.totalNotifications || 0),
      successfulOperations:
        report.crisisDetection.withinSLA +
        report.crisisResponse.withinSLA +
        report.nurseNotification.withinSLA,
      violations: report.totalViolations
    };

    const breakdown = {
      detection: {
        compliance: report.crisisDetection.complianceRate,
        averageTime: report.crisisDetection.averageDetectionTime || 0,
        violations: report.crisisDetection.violations
      },
      response: {
        compliance: report.crisisResponse.complianceRate,
        averageTime: report.crisisResponse.averageResponseTime || 0,
        violations: report.crisisResponse.violations
      },
      notification: {
        compliance: report.nurseNotification.complianceRate,
        averageTime: report.nurseNotification.averageNotificationTime || 0,
        violations: report.nurseNotification.violations
      }
    };

    return {
      period,
      overallCompliance: report.overallComplianceRate,
      meetsTarget: report.meetsTargetSLA,
      summary,
      breakdown,
      trends: this.analyzeTrends()
    };
  }

  /**
   * Check for alerts and return active alerts
   */
  async checkAlerts(): Promise<MonitoringAlert[]> {
    const alerts: MonitoringAlert[] = [];
    const now = Date.now();

    // Check SLA violation alerts
    const slaAlerts = this.slaService.getActiveAlerts();
    for (const slaAlert of slaAlerts) {
      if (this.shouldTriggerAlert('sla_violation', now)) {
        alerts.push({
          id: slaAlert.id,
          severity: slaAlert.severity === 'critical' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          type: 'SLA_VIOLATION',
          message: slaAlert.description,
          timestamp: now,
          requiresEscalation: slaAlert.severity === 'critical',
          metadata: { violationCount: slaAlert.violationCount }
        });
      }
    }

    // Check provider failure alerts
    const providerHealth = await this.failoverManager.getHealthStatus();
    const failedProviders = providerHealth.filter(p => !p.healthy);
    
    if (failedProviders.length >= this.alertConfig.providerFailureThreshold) {
      if (this.shouldTriggerAlert('provider_failure', now)) {
        alerts.push({
          id: `provider_failure_${now}`,
          severity: AlertSeverity.CRITICAL,
          type: 'PROVIDER_FAILURE',
          message: `Multiple providers failing: ${failedProviders.map(p => p.provider).join(', ')}`,
          timestamp: now,
          requiresEscalation: true,
          metadata: { failedProviders: failedProviders.length }
        });
      }
    }

    // Escalate critical alerts
    for (const alert of alerts) {
      if (alert.requiresEscalation) {
        await this.escalateAlert(alert);
      }
    }

    return alerts;
  }

  /**
   * Get real-time dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    const systemMetrics = await this.getSystemHealthMetrics();
    const failoverMetrics = this.failoverManager.getFailoverMetrics();
    const recentAlerts = await this.checkAlerts();

    const providers = systemMetrics.providerHealth.map(provider => ({
      name: provider.provider,
      status: provider.healthy ? 'HEALTHY' as const : 'FAILED' as const,
      responseTime: provider.responseTime,
      successRate: 100 // Placeholder - would need more detailed metrics
    }));

    const requestsPerMinute = Math.round(failoverMetrics.totalRequests / 60); // Approximate
    const errorRate = failoverMetrics.totalRequests > 0
      ? Math.round(((failoverMetrics.totalRequests - failoverMetrics.successfulRequests) / failoverMetrics.totalRequests) * 10000) / 100
      : 0;

    const failoverRate = failoverMetrics.totalRequests > 0
      ? Math.round((failoverMetrics.failoverCount / failoverMetrics.totalRequests) * 10000) / 100
      : 0;

    return {
      systemHealth: {
        status: systemMetrics.overallHealth,
        compliance: systemMetrics.slaCompliance,
        activeAlerts: recentAlerts.length
      },
      providers,
      alerts: recentAlerts,
      metrics: {
        requestsPerMinute,
        averageResponseTime: systemMetrics.averageResponseTime,
        errorRate,
        failoverRate
      }
    };
  }

  /**
   * Get historical performance data for charts
   */
  getHistoricalData(period: string): HistoricalData {
    // Return recent historical metrics
    const recentMetrics = this.historicalMetrics.slice(-100); // Last 100 data points

    // Analyze trends
    const trends = this.calculateTrends(recentMetrics);

    return {
      period,
      dataPoints: recentMetrics,
      trends
    };
  }

  /**
   * Track a crisis request for SLA monitoring
   */
  async trackCrisisRequest(request: AIRequest, userId: string): Promise<void> {
    const startTime = Date.now();
    
    // This would integrate with the existing SLA monitoring
    this.slaService.trackCrisisDetection(userId, startTime, Date.now() - startTime);
  }

  /**
   * Handle crisis request with failover monitoring
   */
  async handleCrisisRequest(request: AIRequest, userId: string): Promise<{
    slaCompliant: boolean;
    failoverUsed: boolean;
    responseTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      const result = await this.failoverManager.makeRequest(request.query, request.context);
      const responseTime = Date.now() - startTime;
      
      const slaCompliant = !result.slaViolation;
      const failoverUsed = result.tier > 1;

      if (failoverUsed) {
        logger.info('Crisis request handled successfully with failover', {
          userId,
          finalProvider: result.provider,
          tier: result.tier,
          failoverTime: result.failoverTime,
          slaCompliant
        });
      }

      return {
        slaCompliant,
        failoverUsed,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Crisis request failed completely', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });

      return {
        slaCompliant: false,
        failoverUsed: true,
        responseTime
      };
    }
  }

  /**
   * Get SLA trends analysis
   */
  getSLATrends(): { trend: 'IMPROVING' | 'DECLINING' | 'STABLE'; prediction: string } {
    return this.analyzeTrends() || {
      trend: 'STABLE',
      prediction: 'Performance is stable'
    };
  }

  private parsePeriod(period: string): number {
    switch (period) {
      case '1h': return 3600000;
      case '24h': return 86400000;
      case '7d': return 604800000;
      default: return 3600000;
    }
  }

  private shouldTriggerAlert(alertType: string, timestamp: number): boolean {
    const lastAlert = this.recentAlerts.get(alertType);
    
    if (!lastAlert || (timestamp - lastAlert) > this.alertConfig.alertCooldownMs) {
      this.recentAlerts.set(alertType, timestamp);
      return true;
    }
    
    return false;
  }

  private async escalateAlert(alert: MonitoringAlert): Promise<void> {
    if (!this.notificationService) {
      logger.warn('No notification service configured for alert escalation', { alertId: alert.id });
      return;
    }

    try {
      if (this.alertConfig.enableTeamsAlerts) {
        await this.notificationService.sendTeamsAlert(alert);
      }

      if (this.alertConfig.enableEmailAlerts) {
        await this.notificationService.sendEmailAlert(alert);
      }

      logger.info('Alert escalated successfully', {
        alertId: alert.id,
        severity: alert.severity,
        type: alert.type
      });

    } catch (error) {
      logger.error('Failed to escalate alert', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private analyzeTrends(): { trend: 'IMPROVING' | 'DECLINING' | 'STABLE'; prediction: string } | undefined {
    if (this.historicalMetrics.length < 3) {
      return undefined;
    }

    const recent = this.historicalMetrics.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];

    const complianceDiff = last.compliance - first.compliance;

    if (complianceDiff > 1.0) {
      return {
        trend: 'IMPROVING',
        prediction: 'SLA compliance is improving'
      };
    } else if (complianceDiff < -1.0) {
      return {
        trend: 'DECLINING',
        prediction: 'SLA compliance may drop below target if trend continues'
      };
    } else {
      return {
        trend: 'STABLE',
        prediction: 'SLA compliance is stable'
      };
    }
  }

  private calculateTrends(metrics: Array<{ compliance: number; responseTime: number; errorRate: number }>): {
    complianceTrend: 'UP' | 'DOWN' | 'STABLE';
    responseTrend: 'UP' | 'DOWN' | 'STABLE';
    errorTrend: 'UP' | 'DOWN' | 'STABLE';
  } {
    if (metrics.length < 2) {
      return {
        complianceTrend: 'STABLE',
        responseTrend: 'STABLE',
        errorTrend: 'STABLE'
      };
    }

    const first = metrics[0];
    const last = metrics[metrics.length - 1];

    return {
      complianceTrend: last.compliance > first.compliance ? 'UP' : 
                      last.compliance < first.compliance ? 'DOWN' : 'STABLE',
      responseTrend: last.responseTime > first.responseTime ? 'UP' : 
                    last.responseTime < first.responseTime ? 'DOWN' : 'STABLE',
      errorTrend: last.errorRate > first.errorRate ? 'UP' : 
                 last.errorRate < first.errorRate ? 'DOWN' : 'STABLE'
    };
  }

  private startMetricsCollection(): void {
    // Collect metrics every 5 minutes
    setInterval(async () => {
      try {
        const systemMetrics = await this.getSystemHealthMetrics();
        
        this.historicalMetrics.push({
          timestamp: Date.now(),
          compliance: systemMetrics.slaCompliance,
          responseTime: systemMetrics.averageResponseTime,
          errorRate: 100 - systemMetrics.slaCompliance // Approximate error rate
        });

        // Keep only last 24 hours of data (288 data points at 5min intervals)
        if (this.historicalMetrics.length > 288) {
          this.historicalMetrics.shift();
        }

      } catch (error) {
        logger.error('Failed to collect metrics', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}