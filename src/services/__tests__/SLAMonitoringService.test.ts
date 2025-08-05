import { SLAMonitoringService } from '../SLAMonitoringService';
import { Logger } from '../../utils/logger';
import { SafetyResult, SeverityLevel } from '../../types/safety';

describe('SLAMonitoringService', () => {
  let slaService: SLAMonitoringService;
  let mockLogger: jest.Mocked<Logger>;

  const mockSafetyConfig = {
    response_times: {
      crisis_detection_ms: 500,
      crisis_response_ms: 2000,
      nurse_notification_ms: 60000,
      audit_logging_ms: 100
    }
  };

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    slaService = new SLAMonitoringService(mockLogger, mockSafetyConfig);
  });

  describe('Crisis Detection SLA Monitoring', () => {
    it('should track crisis detection time under SLA limit', async () => {
      const startTime = Date.now();
      const analysisTime = 300; // Under 500ms limit

      const result = slaService.trackCrisisDetection('user123', startTime, analysisTime);

      expect(result.withinSLA).toBe(true);
      expect(result.detectionTime).toBe(analysisTime);
      expect(result.slaLimit).toBe(500);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis detection within SLA',
        expect.objectContaining({
          userId: 'user123',
          detectionTime: analysisTime,
          slaLimit: 500
        })
      );
    });

    it('should alert when crisis detection exceeds SLA limit', async () => {
      const startTime = Date.now();
      const analysisTime = 800; // Over 500ms limit

      const result = slaService.trackCrisisDetection('user123', startTime, analysisTime);

      expect(result.withinSLA).toBe(false);
      expect(result.detectionTime).toBe(analysisTime);
      expect(result.violation).toBeDefined();
      expect(result.violation?.type).toBe('crisis_detection_timeout');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Crisis detection SLA violation',
        expect.objectContaining({
          userId: 'user123',
          detectionTime: analysisTime,
          slaLimit: 500,
          overrun: 300
        })
      );
    });

    it('should generate performance metrics for crisis detection', async () => {
      // Track multiple detections
      slaService.trackCrisisDetection('user1', Date.now(), 200);
      slaService.trackCrisisDetection('user2', Date.now(), 400);
      slaService.trackCrisisDetection('user3', Date.now(), 600); // Violation

      const metrics = slaService.getCrisisDetectionMetrics(3600000); // Last hour

      expect(metrics.totalDetections).toBe(3);
      expect(metrics.withinSLA).toBe(2);
      expect(metrics.violations).toBe(1);
      expect(metrics.complianceRate).toBe(66.67);
      expect(metrics.averageDetectionTime).toBe(400);
    });
  });

  describe('Crisis Response SLA Monitoring', () => {
    it('should track crisis response time within SLA', async () => {
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      const responseTime = 1500; // Under 2000ms limit

      const result = slaService.trackCrisisResponse('escalation123', mockSafetyResult, responseTime);

      expect(result.withinSLA).toBe(true);
      expect(result.responseTime).toBe(responseTime);
      expect(result.slaLimit).toBe(2000);
    });

    it('should alert when crisis response exceeds SLA limit', async () => {
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      const responseTime = 2500; // Over 2000ms limit

      const result = slaService.trackCrisisResponse('escalation123', mockSafetyResult, responseTime);

      expect(result.withinSLA).toBe(false);
      expect(result.violation?.type).toBe('crisis_response_timeout');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: Crisis response SLA violation',
        expect.objectContaining({
          escalationId: 'escalation123',
          responseTime: 2500,
          slaLimit: 2000,
          overrun: 500
        })
      );
    });

    it('should track end-to-end crisis response metrics', async () => {
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      // Track multiple responses
      slaService.trackCrisisResponse('esc1', mockSafetyResult, 1200);
      slaService.trackCrisisResponse('esc2', mockSafetyResult, 1800);
      slaService.trackCrisisResponse('esc3', mockSafetyResult, 2200); // Violation

      const metrics = slaService.getCrisisResponseMetrics(3600000);

      expect(metrics.totalResponses).toBe(3);
      expect(metrics.withinSLA).toBe(2);
      expect(metrics.violations).toBe(1);
      expect(metrics.complianceRate).toBe(66.67);
    });
  });

  describe('Nurse Notification SLA Monitoring', () => {
    it('should track nurse notification time within SLA', async () => {
      const notificationTime = 45000; // Under 60000ms limit

      const result = slaService.trackNurseNotification('escalation123', 'crisis', notificationTime);

      expect(result.withinSLA).toBe(true);
      expect(result.notificationTime).toBe(notificationTime);
      expect(result.slaLimit).toBe(60000);
    });

    it('should alert when nurse notification exceeds SLA limit', async () => {
      const notificationTime = 75000; // Over 60000ms limit

      const result = slaService.trackNurseNotification('escalation123', 'crisis', notificationTime);

      expect(result.withinSLA).toBe(false);
      expect(result.violation?.type).toBe('nurse_notification_timeout');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: Nurse notification SLA violation',
        expect.objectContaining({
          escalationId: 'escalation123',
          notificationTime: 75000,
          slaLimit: 60000,
          overrun: 15000
        })
      );
    });
  });

  describe('SLA Compliance Reporting', () => {
    it('should generate overall SLA compliance report', async () => {
      // Setup test data
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      // Track various SLA metrics
      slaService.trackCrisisDetection('user1', Date.now(), 400);
      slaService.trackCrisisDetection('user2', Date.now(), 600); // Violation
      slaService.trackCrisisResponse('esc1', mockSafetyResult, 1500);
      slaService.trackCrisisResponse('esc2', mockSafetyResult, 2200); // Violation
      slaService.trackNurseNotification('esc1', 'crisis', 45000);
      slaService.trackNurseNotification('esc2', 'crisis', 70000); // Violation

      const report = slaService.generateSLAComplianceReport(3600000);

      expect(report.overallComplianceRate).toBe(50); // 3 within SLA out of 6 total
      expect(report.crisisDetection.complianceRate).toBe(50);
      expect(report.crisisResponse.complianceRate).toBe(50);
      expect(report.nurseNotification.complianceRate).toBe(50);
      expect(report.totalViolations).toBe(3);
      expect(report.criticalViolations).toBe(2); // Only response and notification violations are critical
    });

    it('should identify when 99.9% SLA compliance is not met', async () => {
      // Track 1000 requests with 2 violations (99.8% compliance)
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      // Track 998 successful requests
      for (let i = 0; i < 998; i++) {
        slaService.trackCrisisDetection(`user${i}`, Date.now(), 400);
      }
      // Track 2 violations
      slaService.trackCrisisDetection('user998', Date.now(), 600);
      slaService.trackCrisisDetection('user999', Date.now(), 700);

      const report = slaService.generateSLAComplianceReport(3600000);

      expect(report.overallComplianceRate).toBe(99.8);
      expect(report.meetsTargetSLA).toBe(false); // Below 99.9%
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SLA compliance below target',
        expect.objectContaining({
          currentCompliance: 99.8,
          targetCompliance: 99.9
        })
      );
    });
  });

  describe('Alert Thresholds', () => {
    it('should trigger critical alert when multiple SLA violations occur within time window', async () => {
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      // Create multiple violations in short time period
      slaService.trackCrisisResponse('esc1', mockSafetyResult, 2500);
      slaService.trackCrisisResponse('esc2', mockSafetyResult, 2600);
      slaService.trackCrisisResponse('esc3', mockSafetyResult, 2700);

      const alerts = slaService.getActiveAlerts();

      expect(alerts).toContainEqual(
        expect.objectContaining({
          type: 'multiple_sla_violations',
          severity: 'critical',
          violationCount: 3
        })
      );
    });

    it('should clear alerts when SLA performance improves', async () => {
      const mockSafetyResult: SafetyResult = {
        severity: 'crisis' as SeverityLevel,
        confidence: 0.95,
        requiresEscalation: true,
        matches: [],
        riskFactors: [],
        contextualConcerns: [],
        analysisTime: 300,
        recommendedActions: []
      };

      // Create violations
      slaService.trackCrisisResponse('esc1', mockSafetyResult, 2500);
      slaService.trackCrisisResponse('esc2', mockSafetyResult, 2600);

      let alerts = slaService.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      // Add successful responses
      for (let i = 0; i < 10; i++) {
        slaService.trackCrisisResponse(`esc${i+3}`, mockSafetyResult, 1500);
      }

      alerts = slaService.getActiveAlerts();
      expect(alerts.length).toBe(0);
    });
  });
});