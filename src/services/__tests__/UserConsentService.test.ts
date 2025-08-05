import { UserConsentService } from '../UserConsentService';
import { Logger } from '../../utils/logger';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as unknown as Logger;

describe('UserConsentService', () => {
  let consentService: UserConsentService;

  beforeEach(() => {
    jest.clearAllMocks();
    consentService = new UserConsentService(mockLogger);
  });

  describe('Consent Collection', () => {
    test('should collect initial consent for health data processing', async () => {
      const userId = 'user-123';
      const consentData = {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      };

      const result = await consentService.collectConsent(userId, consentData);

      expect(result.success).toBe(true);
      expect(result.consentId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });

    test('should reject consent for users under 16 without parental consent', async () => {
      const userId = 'user-minor';
      const consentData = {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 15,
        parentalConsent: false
      };

      const result = await consentService.collectConsent(userId, consentData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('parental consent required');
    });

    test('should accept consent for users under 16 with parental consent', async () => {
      const userId = 'user-minor-with-parent';
      const consentData = {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 15,
        parentalConsent: true,
        parentalConsentVerification: 'parent-email@example.com'
      };

      const result = await consentService.collectConsent(userId, consentData);

      expect(result.success).toBe(true);
      expect(result.consentId).toBeDefined();
      expect(result.requiresParentalConsent).toBe(true);
    });

    test('should require all mandatory consent fields', async () => {
      const userId = 'user-incomplete';
      const incompleteConsentData = {
        healthDataProcessing: true,
        // Missing dataRetentionAcknowledged and ageVerified
      };

      const result = await consentService.collectConsent(userId, incompleteConsentData as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required consent fields');
    });
  });

  describe('Consent Status Checking', () => {
    test('should return valid consent status for consented user', async () => {
      const userId = 'user-consented';
      
      // First collect consent
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 30
      });

      const status = await consentService.getConsentStatus(userId);

      expect(status.hasValidConsent).toBe(true);
      expect(status.consentType).toBe('health_data_processing');
      expect(status.isExpired).toBe(false);
      expect(status.expiresAt).toBeDefined();
    });

    test('should return no consent for user who has not consented', async () => {
      const userId = 'user-not-consented';

      const status = await consentService.getConsentStatus(userId);

      expect(status.hasValidConsent).toBe(false);
      expect(status.consentType).toBeUndefined();
      expect(status.requiresConsent).toBe(true);
    });

    test('should detect expired consent', async () => {
      const userId = 'user-expired';
      
      // Mock expired consent (by setting internal state for testing)
      const expiredDate = new Date();
      expiredDate.setFullYear(expiredDate.getFullYear() - 2); // 2 years ago
      
      // Simulate consent collection with expired date
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 30
      });

      // Manually set expiration for testing
      (consentService as any).userConsents.set(userId, {
        ...((consentService as any).userConsents.get(userId)),
        expiresAt: expiredDate.getTime()
      });

      const status = await consentService.getConsentStatus(userId);

      expect(status.hasValidConsent).toBe(false);
      expect(status.isExpired).toBe(true);
      expect(status.requiresRenewal).toBe(true);
    });
  });

  describe('Consent Withdrawal', () => {
    test('should allow consent withdrawal with immediate data deletion', async () => {
      const userId = 'user-withdraw';
      
      // First collect consent
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      const withdrawalResult = await consentService.withdrawConsent(userId, {
        reason: 'user_request',
        deleteData: true
      });

      expect(withdrawalResult.success).toBe(true);
      expect(withdrawalResult.dataDeleted).toBe(true);
      expect(withdrawalResult.timestamp).toBeDefined();

      // Verify consent is no longer valid
      const status = await consentService.getConsentStatus(userId);
      expect(status.hasValidConsent).toBe(false);
      expect(status.isWithdrawn).toBe(true);
    });

    test('should create audit trail for consent withdrawal', async () => {
      const userId = 'user-audit';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 30
      });

      await consentService.withdrawConsent(userId, {
        reason: 'privacy_concerns',
        deleteData: true
      });

      const auditTrail = await consentService.getConsentAuditTrail(userId);

      expect(auditTrail).toHaveLength(2); // consent collection + withdrawal
      expect(auditTrail[0].action).toBe('consent_collected');
      expect(auditTrail[1].action).toBe('consent_withdrawn');
      expect(auditTrail[1].reason).toBe('privacy_concerns');
    });
  });

  describe('Data Subject Rights (GDPR)', () => {
    test('should provide complete data export for user', async () => {
      const userId = 'user-export';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 28
      });

      const exportData = await consentService.exportUserData(userId);

      expect(exportData.userId).toBe(userId);
      expect(exportData.consentHistory).toBeDefined();
      expect(exportData.currentConsentStatus).toBeDefined();
      expect(exportData.dataProcessingActivities).toBeDefined();
      expect(exportData.exportTimestamp).toBeDefined();
    });

    test('should handle data portability requests', async () => {
      const userId = 'user-portability';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 35
      });

      const portabilityData = await consentService.getPortableUserData(userId);

      expect(portabilityData.format).toBe('json');
      expect(portabilityData.data).toBeDefined();
      expect(portabilityData.structuredData).toBe(true);
      expect(portabilityData.machineReadable).toBe(true);
    });

    test('should provide rectification capabilities for user data', async () => {
      const userId = 'user-rectify';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      const rectificationResult = await consentService.rectifyUserData(userId, {
        field: 'userAge',
        newValue: 26,
        reason: 'incorrect_age_provided'
      });

      expect(rectificationResult.success).toBe(true);
      expect(rectificationResult.changedFields).toContain('userAge');
      expect(rectificationResult.auditEntry).toBeDefined();
    });
  });

  describe('Consent Renewal', () => {
    test('should identify users requiring consent renewal', async () => {
      const userId1 = 'user-needs-renewal';
      const userId2 = 'user-recent-consent';
      
      // Create old consent (simulate near expiry)
      await consentService.collectConsent(userId1, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 30
      });

      // Create recent consent
      await consentService.collectConsent(userId2, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      // Simulate old consent by manually adjusting expiry date to be within renewal window
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const nearExpiryDate = Date.now() + (thirtyDays - 1000); // Expires in slightly less than 30 days
      (consentService as any).userConsents.set(userId1, {
        ...((consentService as any).userConsents.get(userId1)),
        expiresAt: nearExpiryDate
      });

      const usersNeedingRenewal = await consentService.getUsersRequiringRenewal();

      expect(usersNeedingRenewal).toContain(userId1);
      expect(usersNeedingRenewal).not.toContain(userId2);
    });

    test('should handle consent renewal process', async () => {
      const userId = 'user-renew';
      
      // Initial consent
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 32
      });

      const renewalResult = await consentService.renewConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 33
      });

      expect(renewalResult.success).toBe(true);
      expect(renewalResult.previousConsentId).toBeDefined();
      expect(renewalResult.newConsentId).toBeDefined();
      expect(renewalResult.newConsentId).not.toBe(renewalResult.previousConsentId);
    });
  });

  describe('Compliance and Monitoring', () => {
    test('should generate GDPR compliance report', async () => {
      // Create various consent scenarios
      await consentService.collectConsent('user1', {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      await consentService.collectConsent('user2', {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 15,
        parentalConsent: true,
        parentalConsentVerification: 'parent@example.com'
      });

      await consentService.withdrawConsent('user1', {
        reason: 'user_request',
        deleteData: true
      });

      const complianceReport = await consentService.generateComplianceReport();

      expect(complianceReport.totalUsers).toBe(2);
      expect(complianceReport.activeConsents).toBe(1);
      expect(complianceReport.withdrawnConsents).toBe(1);
      expect(complianceReport.minorConsents).toBe(1);
      expect(complianceReport.dataProcessingActivities).toBeDefined();
      expect(complianceReport.auditTrailIntegrity).toBe(true);
    });

    test('should track data processing activities for compliance', async () => {
      const userId = 'user-processing';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 30
      });

      // Simulate data processing activities
      await consentService.logDataProcessingActivity(userId, {
        activity: 'health_query_analysis',
        purpose: 'provide_health_information',
        legalBasis: 'consent',
        dataCategories: ['health_queries', 'conversation_history'],
        timestamp: Date.now()
      });

      const activities = await consentService.getDataProcessingActivities(userId);

      expect(activities).toHaveLength(1);
      expect(activities[0].activity).toBe('health_query_analysis');
      expect(activities[0].legalBasis).toBe('consent');
    });
  });

  describe('30-Day Data Retention Policy', () => {
    test('should use 30-day consent validity period instead of 365 days', async () => {
      // RED: This test will fail because UserConsentService still uses 365 days
      const userId = 'user-30-day-test';
      
      const result = await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();
      
      // Check that consent expires in 30 days, not 365 days
      const thirtyDaysFromNow = Date.now() + (30 * 24 * 60 * 60 * 1000);
      const threeSixtyFiveDaysFromNow = Date.now() + (365 * 24 * 60 * 60 * 1000);
      
      // Should be close to 30 days (within 1 minute tolerance)
      expect(Math.abs(result.expiresAt! - thirtyDaysFromNow)).toBeLessThan(60000);
      
      // Should not be close to 365 days
      expect(Math.abs(result.expiresAt! - threeSixtyFiveDaysFromNow)).toBeGreaterThan(30 * 24 * 60 * 60 * 1000);
    });

    test('should show consent as expired after 30 days', async () => {
      // RED: This test will fail because UserConsentService still uses 365 days
      const userId = 'user-expired-30';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      // Manually set consent to be 31 days old (expired)
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      (consentService as any).userConsents.set(userId, {
        ...((consentService as any).userConsents.get(userId)),
        timestamp: thirtyOneDaysAgo,
        expiresAt: thirtyOneDaysAgo + (30 * 24 * 60 * 60 * 1000) // 30 days from old timestamp
      });

      const status = await consentService.getConsentStatus(userId);

      expect(status.hasValidConsent).toBe(false);
      expect(status.isExpired).toBe(true);
      expect(status.requiresConsent).toBe(true);
    });

    test('should show consent as requiring renewal within 30-day period', async () => {
      // RED: This test will fail because renewal warning is currently 30 days before 365-day expiry
      const userId = 'user-renewal-30';
      
      await consentService.collectConsent(userId, {
        healthDataProcessing: true,
        dataRetentionAcknowledged: true,
        ageVerified: true,
        userAge: 25
      });

      // Set consent to expire in 5 days (within 7-day renewal warning period for 30-day consent)
      const fiveDaysFromNow = Date.now() + (5 * 24 * 60 * 60 * 1000);
      (consentService as any).userConsents.set(userId, {
        ...((consentService as any).userConsents.get(userId)),
        expiresAt: fiveDaysFromNow
      });

      const status = await consentService.getConsentStatus(userId);

      expect(status.hasValidConsent).toBe(true);
      expect(status.requiresRenewal).toBe(true);
      expect(status.isExpired).toBe(false);
    });
  });
});