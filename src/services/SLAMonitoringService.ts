import { Logger } from '../utils/logger';
import { SafetyResult, SeverityLevel } from '../types/safety';

export type SLAViolationType = 
  | 'crisis_detection_timeout'
  | 'crisis_response_timeout'
  | 'nurse_notification_timeout';

export type SLAMetricType = 'crisis_detection' | 'crisis_response' | 'nurse_notification';

export interface SLAViolation {
  id: string;
  type: SLAViolationType;
  timestamp: number;
  userId?: string;
  escalationId?: string;
  actualTime: number;
  slaLimit: number;
  overrun: number;
  severity: SeverityLevel;
}

export interface SLAResult {
  withinSLA: boolean;
  detectionTime?: number;
  responseTime?: number;
  notificationTime?: number;
  slaLimit: number;
  violation?: SLAViolation;
}

export interface SLAMetrics {
  totalDetections?: number;
  totalResponses?: number;
  totalNotifications?: number;
  withinSLA: number;
  violations: number;
  complianceRate: number;
  averageDetectionTime?: number;
  averageResponseTime?: number;
  averageNotificationTime?: number;
  timePeriod: number;
}

export interface SLAAlert {
  id: string;
  type: 'multiple_sla_violations' | 'compliance_below_target' | 'critical_response_failure';
  severity: 'warning' | 'critical';
  timestamp: number;
  violationCount?: number;
  complianceRate?: number;
  description: string;
}

export interface SLAComplianceReport {
  timestamp: number;
  timePeriod: number;
  overallComplianceRate: number;
  meetsTargetSLA: boolean;
  targetCompliance: number;
  crisisDetection: SLAMetrics;
  crisisResponse: SLAMetrics;
  nurseNotification: SLAMetrics;
  totalViolations: number;
  criticalViolations: number;
  activeAlerts: SLAAlert[];
}

export class SLAMonitoringService {
  private logger: Logger;
  private safetyConfig: any;
  private violations: SLAViolation[] = [];
  private detectionMetrics: Array<{timestamp: number, userId: string, time: number, withinSLA: boolean}> = [];
  private responseMetrics: Array<{timestamp: number, escalationId: string, time: number, withinSLA: boolean}> = [];
  private notificationMetrics: Array<{timestamp: number, escalationId: string, time: number, withinSLA: boolean}> = [];
  private activeAlerts: SLAAlert[] = [];

  // SLA Requirements
  private readonly TARGET_COMPLIANCE = 99.9; // 99.9% compliance required
  private readonly CRITICAL_VIOLATION_THRESHOLD = 3; // Alert after 3 violations in 10 minutes
  private readonly VIOLATION_WINDOW = 600000; // 10 minutes

  constructor(logger: Logger, safetyConfig: any) {
    this.logger = logger;
    this.safetyConfig = safetyConfig;
  }

  trackCrisisDetection(userId: string, startTime: number, analysisTime: number): SLAResult {
    const slaLimit = this.safetyConfig.response_times.crisis_detection_ms;
    const withinSLA = analysisTime <= slaLimit;
    const timestamp = Date.now();

    // Record metric
    this.detectionMetrics.push({
      timestamp,
      userId,
      time: analysisTime,
      withinSLA
    });

    let violation: SLAViolation | undefined;

    if (!withinSLA) {
      violation = {
        id: `detection_${timestamp}_${userId}`,
        type: 'crisis_detection_timeout',
        timestamp,
        userId,
        actualTime: analysisTime,
        slaLimit,
        overrun: analysisTime - slaLimit,
        severity: 'crisis' as SeverityLevel
      };

      this.violations.push(violation);

      this.logger.warn('Crisis detection SLA violation', {
        userId,
        detectionTime: analysisTime,
        slaLimit,
        overrun: violation.overrun
      });

      this.checkViolationThresholds();
    } else {
      this.logger.info('Crisis detection within SLA', {
        userId,
        detectionTime: analysisTime,
        slaLimit
      });
    }

    return {
      withinSLA,
      detectionTime: analysisTime,
      slaLimit,
      violation
    };
  }

  trackCrisisResponse(escalationId: string, safetyResult: SafetyResult, responseTime: number): SLAResult {
    const slaLimit = this.safetyConfig.response_times.crisis_response_ms;
    const withinSLA = responseTime <= slaLimit;
    const timestamp = Date.now();

    // Record metric
    this.responseMetrics.push({
      timestamp,
      escalationId,
      time: responseTime,
      withinSLA
    });

    let violation: SLAViolation | undefined;

    if (!withinSLA) {
      violation = {
        id: `response_${timestamp}_${escalationId}`,
        type: 'crisis_response_timeout',
        timestamp,
        escalationId,
        actualTime: responseTime,
        slaLimit,
        overrun: responseTime - slaLimit,
        severity: safetyResult.severity
      };

      this.violations.push(violation);

      this.logger.error('CRITICAL: Crisis response SLA violation', {
        escalationId,
        responseTime,
        slaLimit,
        overrun: violation.overrun,
        severity: safetyResult.severity
      });

      this.checkViolationThresholds();
      this.triggerCriticalResponseAlert(violation);
    } else {
      this.logger.info('Crisis response within SLA', {
        escalationId,
        responseTime,
        slaLimit
      });
      
      // Check if performance has improved and alerts can be cleared
      this.checkViolationThresholds();
    }

    return {
      withinSLA,
      responseTime,
      slaLimit,
      violation
    };
  }

  trackNurseNotification(escalationId: string, severity: string, notificationTime: number): SLAResult {
    const slaLimit = this.safetyConfig.response_times.nurse_notification_ms;
    const withinSLA = notificationTime <= slaLimit;
    const timestamp = Date.now();

    // Record metric
    this.notificationMetrics.push({
      timestamp,
      escalationId,
      time: notificationTime,
      withinSLA
    });

    let violation: SLAViolation | undefined;

    if (!withinSLA) {
      violation = {
        id: `notification_${timestamp}_${escalationId}`,
        type: 'nurse_notification_timeout',
        timestamp,
        escalationId,
        actualTime: notificationTime,
        slaLimit,
        overrun: notificationTime - slaLimit,
        severity: severity as SeverityLevel
      };

      this.violations.push(violation);

      this.logger.error('CRITICAL: Nurse notification SLA violation', {
        escalationId,
        notificationTime,
        slaLimit,
        overrun: violation.overrun,
        severity
      });

      this.checkViolationThresholds();
    } else {
      this.logger.info('Nurse notification within SLA', {
        escalationId,
        notificationTime,
        slaLimit
      });
    }

    return {
      withinSLA,
      notificationTime,
      slaLimit,
      violation
    };
  }

  getCrisisDetectionMetrics(timePeriod: number): SLAMetrics {
    const cutoff = Date.now() - timePeriod;
    const relevantMetrics = this.detectionMetrics.filter(m => m.timestamp > cutoff);

    const totalDetections = relevantMetrics.length;
    const withinSLA = relevantMetrics.filter(m => m.withinSLA).length;
    const violations = totalDetections - withinSLA;
    const complianceRate = totalDetections > 0 ? Math.round((withinSLA / totalDetections) * 10000) / 100 : 0;
    const averageDetectionTime = totalDetections > 0 ? 
      Math.round(relevantMetrics.reduce((sum, m) => sum + m.time, 0) / totalDetections) : 0;

    return {
      totalDetections,
      withinSLA,
      violations,
      complianceRate,
      averageDetectionTime,
      timePeriod
    };
  }

  getCrisisResponseMetrics(timePeriod: number): SLAMetrics {
    const cutoff = Date.now() - timePeriod;
    const relevantMetrics = this.responseMetrics.filter(m => m.timestamp > cutoff);

    const totalResponses = relevantMetrics.length;
    const withinSLA = relevantMetrics.filter(m => m.withinSLA).length;
    const violations = totalResponses - withinSLA;
    const complianceRate = totalResponses > 0 ? Math.round((withinSLA / totalResponses) * 10000) / 100 : 0;
    const averageResponseTime = totalResponses > 0 ? 
      Math.round(relevantMetrics.reduce((sum, m) => sum + m.time, 0) / totalResponses) : 0;

    return {
      totalResponses,
      withinSLA,
      violations,
      complianceRate,
      averageResponseTime,
      timePeriod
    };
  }

  getNurseNotificationMetrics(timePeriod: number): SLAMetrics {
    const cutoff = Date.now() - timePeriod;
    const relevantMetrics = this.notificationMetrics.filter(m => m.timestamp > cutoff);

    const totalNotifications = relevantMetrics.length;
    const withinSLA = relevantMetrics.filter(m => m.withinSLA).length;
    const violations = totalNotifications - withinSLA;
    const complianceRate = totalNotifications > 0 ? Math.round((withinSLA / totalNotifications) * 10000) / 100 : 0;
    const averageNotificationTime = totalNotifications > 0 ? 
      Math.round(relevantMetrics.reduce((sum, m) => sum + m.time, 0) / totalNotifications) : 0;

    return {
      totalNotifications,
      withinSLA,
      violations,
      complianceRate,
      averageNotificationTime,
      timePeriod
    };
  }

  generateSLAComplianceReport(timePeriod: number): SLAComplianceReport {
    const crisisDetection = this.getCrisisDetectionMetrics(timePeriod);
    const crisisResponse = this.getCrisisResponseMetrics(timePeriod);
    const nurseNotification = this.getNurseNotificationMetrics(timePeriod);

    const totalOperations = 
      (crisisDetection.totalDetections || 0) + 
      (crisisResponse.totalResponses || 0) + 
      (nurseNotification.totalNotifications || 0);

    const totalWithinSLA = 
      crisisDetection.withinSLA + 
      crisisResponse.withinSLA + 
      nurseNotification.withinSLA;

    const overallComplianceRate = totalOperations > 0 ? 
      Math.round((totalWithinSLA / totalOperations) * 10000) / 100 : 100;

    const totalViolations = 
      crisisDetection.violations + 
      crisisResponse.violations + 
      nurseNotification.violations;

    // Critical violations are response and notification timeouts (not detection)
    const criticalViolations = crisisResponse.violations + nurseNotification.violations;

    const meetsTargetSLA = overallComplianceRate >= this.TARGET_COMPLIANCE;

    if (!meetsTargetSLA) {
      this.logger.warn('SLA compliance below target', {
        currentCompliance: overallComplianceRate,
        targetCompliance: this.TARGET_COMPLIANCE
      });
    }

    return {
      timestamp: Date.now(),
      timePeriod,
      overallComplianceRate,
      meetsTargetSLA,
      targetCompliance: this.TARGET_COMPLIANCE,
      crisisDetection,
      crisisResponse,
      nurseNotification,
      totalViolations,
      criticalViolations,
      activeAlerts: this.getActiveAlerts()
    };
  }

  getActiveAlerts(): SLAAlert[] {
    // Clean up old alerts
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.activeAlerts = this.activeAlerts.filter(alert => alert.timestamp > cutoff);

    return [...this.activeAlerts];
  }

  private checkViolationThresholds(): void {
    const cutoff = Date.now() - this.VIOLATION_WINDOW;
    const recentViolations = this.violations.filter(v => v.timestamp > cutoff);

    if (recentViolations.length >= this.CRITICAL_VIOLATION_THRESHOLD) {
      const alertId = `multiple_violations_${Date.now()}`;
      
      // Check if we already have this type of alert
      const existingAlert = this.activeAlerts.find(alert => 
        alert.type === 'multiple_sla_violations' && 
        alert.timestamp > cutoff
      );

      if (!existingAlert) {
        const alert: SLAAlert = {
          id: alertId,
          type: 'multiple_sla_violations',
          severity: 'critical',
          timestamp: Date.now(),
          violationCount: recentViolations.length,
          description: `${recentViolations.length} SLA violations detected within ${this.VIOLATION_WINDOW / 60000} minutes`
        };

        this.activeAlerts.push(alert);

        this.logger.error('CRITICAL: Multiple SLA violations detected', {
          alertId,
          violationCount: recentViolations.length,
          timeWindow: this.VIOLATION_WINDOW,
          violations: recentViolations.map(v => ({
            type: v.type,
            overrun: v.overrun,
            timestamp: v.timestamp
          }))
        });
      }
    }

    // Check if compliance has improved and clear alerts if needed
    // Also consider recent successful operations to determine if performance has improved
    const recentSuccessCount = this.countRecentSuccessfulOperations(cutoff);
    const improvementThreshold = 10; // Need 10 successful operations to clear alerts
    
    if (recentViolations.length < this.CRITICAL_VIOLATION_THRESHOLD && recentSuccessCount >= improvementThreshold) {
      const violationAlerts = this.activeAlerts.filter(alert => 
        alert.type === 'multiple_sla_violations' || alert.type === 'critical_response_failure'
      );

      if (violationAlerts.length > 0) {
        this.activeAlerts = this.activeAlerts.filter(alert => 
          alert.type !== 'multiple_sla_violations' && alert.type !== 'critical_response_failure'
        );

        this.logger.info('SLA performance improved, clearing violation alerts', {
          recentViolations: recentViolations.length,
          recentSuccesses: recentSuccessCount,
          threshold: this.CRITICAL_VIOLATION_THRESHOLD,
          clearedAlerts: violationAlerts.length
        });
      }
    }
  }

  private countRecentSuccessfulOperations(cutoff: number): number {
    const recentDetections = this.detectionMetrics.filter(m => m.timestamp > cutoff && m.withinSLA);
    const recentResponses = this.responseMetrics.filter(m => m.timestamp > cutoff && m.withinSLA);
    const recentNotifications = this.notificationMetrics.filter(m => m.timestamp > cutoff && m.withinSLA);
    
    return recentDetections.length + recentResponses.length + recentNotifications.length;
  }

  private triggerCriticalResponseAlert(violation: SLAViolation): void {
    const alert: SLAAlert = {
      id: `critical_response_${violation.id}`,
      type: 'critical_response_failure',
      severity: 'critical',
      timestamp: Date.now(),
      description: `Crisis response exceeded SLA by ${violation.overrun}ms for ${violation.escalationId}`
    };

    this.activeAlerts.push(alert);

    this.logger.error('CRITICAL ALERT: Crisis response SLA failure', {
      alertId: alert.id,
      escalationId: violation.escalationId,
      overrun: violation.overrun,
      actualTime: violation.actualTime,
      slaLimit: violation.slaLimit
    });
  }

  // Method to get real-time SLA status for dashboard
  getRealTimeSLAStatus(): {
    crisisDetectionSLA: boolean;
    crisisResponseSLA: boolean;
    nurseNotificationSLA: boolean;
    overallCompliance: number;
    activeAlertsCount: number;
  } {
    const hourlyMetrics = {
      detection: this.getCrisisDetectionMetrics(3600000), // Last hour
      response: this.getCrisisResponseMetrics(3600000),
      notification: this.getNurseNotificationMetrics(3600000)
    };

    const totalOps = 
      (hourlyMetrics.detection.totalDetections || 0) + 
      (hourlyMetrics.response.totalResponses || 0) + 
      (hourlyMetrics.notification.totalNotifications || 0);

    const totalWithinSLA = 
      hourlyMetrics.detection.withinSLA + 
      hourlyMetrics.response.withinSLA + 
      hourlyMetrics.notification.withinSLA;

    const overallCompliance = totalOps > 0 ? 
      Math.round((totalWithinSLA / totalOps) * 10000) / 100 : 100;

    return {
      crisisDetectionSLA: hourlyMetrics.detection.complianceRate >= this.TARGET_COMPLIANCE,
      crisisResponseSLA: hourlyMetrics.response.complianceRate >= this.TARGET_COMPLIANCE,
      nurseNotificationSLA: hourlyMetrics.notification.complianceRate >= this.TARGET_COMPLIANCE,
      overallCompliance,
      activeAlertsCount: this.getActiveAlerts().length
    };
  }
}