/**
 * Azure Function for Automated Data Retention Cleanup
 * 
 * Schedules: Daily at 02:00 GMT (off-peak hours)
 * Purpose: GDPR-compliant automatic deletion of expired data
 * 
 * Data Types Cleaned:
 * - Conversation Data: 30 days retention
 * - Search Logs: 30 days retention  
 * - Crisis Response Data: 730 days retention (2 years for safety)
 * - Audit Logs: 365 days retention (compliance)
 */

import { app, InvocationContext, Timer } from '@azure/functions';
import { AzureTableStorageService, DataRetentionType, RETENTION_PERIODS } from '../services/AzureTableStorageService';

// Environment configuration
const STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const APPLICATION_INSIGHTS_KEY = process.env.APPINSIGHTS_INSTRUMENTATION_KEY;

interface CleanupResults {
  conversationsDeleted: number;
  searchLogsDeleted: number;
  auditLogsDeleted: number;
  totalDeleted: number;
  errors: string[];
  executionTimeMs: number;
  timestamp: string;
}

/**
 * Main Azure Function - scheduled to run daily at 02:00 GMT
 */
export async function dataRetentionCleanup(myTimer: Timer, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  context.log('🧹 Starting scheduled data retention cleanup at', new Date().toISOString());

  // Validate environment configuration
  if (!STORAGE_CONNECTION_STRING) {
    context.error('❌ AZURE_STORAGE_CONNECTION_STRING not configured');
    throw new Error('Missing storage configuration');
  }

  let storageService: AzureTableStorageService;
  let results: CleanupResults;

  try {
    // Initialize Azure Table Storage service
    storageService = new AzureTableStorageService({
      connectionString: STORAGE_CONNECTION_STRING
    });

    // Ensure all tables exist
    await storageService.initializeTables();
    context.log('✅ Table Storage initialized');

    // Perform comprehensive cleanup
    context.log('🚀 Starting comprehensive data retention cleanup...');
    const cleanupResults = await storageService.performDataRetentionCleanup();

    // Calculate execution metrics
    const executionTimeMs = Date.now() - startTime;
    results = {
      ...cleanupResults,
      executionTimeMs,
      timestamp: new Date().toISOString()
    };

    // Log comprehensive results
    context.log('✅ Data retention cleanup completed successfully:');
    context.log(`   📊 Execution Time: ${executionTimeMs}ms`);
    context.log(`   💬 Conversations Deleted: ${results.conversationsDeleted}`);
    context.log(`   🔍 Search Logs Deleted: ${results.searchLogsDeleted}`);
    context.log(`   📋 Audit Logs Deleted: ${results.auditLogsDeleted}`);
    context.log(`   📈 Total Records Deleted: ${results.totalDeleted}`);
    
    if (results.errors.length > 0) {
      context.warn(`   ⚠️ Errors Encountered: ${results.errors.length}`);
      results.errors.forEach(error => context.warn(`     - ${error}`));
    }

    // Log retention configuration for audit trail
    context.log('📋 Current retention periods:');
    Object.entries(RETENTION_PERIODS).forEach(([type, days]) => {
      context.log(`   ${type}: ${days} days`);
    });

    // Send metrics to Application Insights (if configured)
    await sendMetricsToApplicationInsights(results, context);

    // Get compliance statistics
    await logComplianceStatistics(storageService, context);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    context.error('❌ Data retention cleanup failed:', {
      error: errorMessage,
      stack: errorStack,
      executionTimeMs,
      timestamp: new Date().toISOString()
    });

    // Create error results for monitoring
    results = {
      conversationsDeleted: 0,
      searchLogsDeleted: 0,
      auditLogsDeleted: 0,
      totalDeleted: 0,
      errors: [errorMessage],
      executionTimeMs,
      timestamp: new Date().toISOString()
    };

    // Still attempt to send error metrics
    try {
      await sendMetricsToApplicationInsights(results, context);
    } catch (metricsError) {
      const metricsErrorMessage = metricsError instanceof Error ? metricsError.message : String(metricsError);
      context.error('❌ Failed to send error metrics:', metricsErrorMessage);
    }

    throw error;
  }
}

/**
 * Send cleanup metrics to Application Insights for monitoring
 */
async function sendMetricsToApplicationInsights(
  results: CleanupResults, 
  context: InvocationContext
): Promise<void> {
  if (!APPLICATION_INSIGHTS_KEY) {
    context.warn('⚠️ Application Insights not configured - metrics not sent');
    return;
  }

  try {
    // Custom metrics for Azure monitoring
    const metrics = {
      'DataRetention_ConversationsDeleted': results.conversationsDeleted,
      'DataRetention_SearchLogsDeleted': results.searchLogsDeleted,
      'DataRetention_AuditLogsDeleted': results.auditLogsDeleted,
      'DataRetention_TotalDeleted': results.totalDeleted,
      'DataRetention_ExecutionTimeMs': results.executionTimeMs,
      'DataRetention_ErrorCount': results.errors.length
    };

    // Log metrics (Application Insights will automatically collect these)
    Object.entries(metrics).forEach(([name, value]) => {
      context.log(`📊 ${name}: ${value}`);
    });

    // Custom properties for filtering and analysis
    const properties = {
      'cleanup_timestamp': results.timestamp,
      'function_version': '1.0.0',
      'retention_schedule': 'daily_02_00_gmt',
      'compliance_status': results.errors.length === 0 ? 'success' : 'partial_failure'
    };

    context.log('📊 Metrics sent to Application Insights', { metrics, properties });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.warn('⚠️ Failed to send metrics to Application Insights:', errorMessage);
    // Don't throw - metrics failure shouldn't stop the function
  }
}

/**
 * Log compliance statistics and upcoming expirations
 */
async function logComplianceStatistics(
  storageService: AzureTableStorageService,
  context: InvocationContext
): Promise<void> {
  try {
    const stats = await storageService.getDataRetentionStatistics(7); // Last 7 days

    context.log('📊 GDPR Compliance Statistics:');
    context.log(`   Status: ${stats.complianceStatus.toUpperCase()}`);
    context.log(`   Recent Deletions: ${stats.totalDeletions}`);
    context.log(`   Average Retention Days: ${stats.averageDaysToExpiry.toFixed(1)}`);
    context.log(`   Upcoming Expirations (7 days): ${stats.upcomingExpirations.length}`);

    // Log breakdown by data type
    context.log('📋 Deletions by Data Type:');
    Object.entries(stats.deletionsByDataType).forEach(([type, count]) => {
      context.log(`   ${type}: ${count}`);
    });

    // Warn about compliance issues
    if (stats.complianceStatus !== 'compliant') {
      context.warn(`⚠️ GDPR Compliance Warning: ${stats.upcomingExpirations.length} items expiring soon`);
      
      if (stats.upcomingExpirations.length > 0) {
        context.warn('📋 Upcoming expirations:');
        stats.upcomingExpirations.slice(0, 10).forEach(exp => {
          context.warn(`   ${exp.entityType}:${exp.entityId} - ${exp.daysUntilExpiry} days (${exp.dataType})`);
        });
        
        if (stats.upcomingExpirations.length > 10) {
          context.warn(`   ... and ${stats.upcomingExpirations.length - 10} more`);
        }
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.warn('⚠️ Failed to get compliance statistics:', errorMessage);
    // Don't throw - statistics failure shouldn't stop the function
  }
}

/**
 * Health check function for monitoring
 */
export async function dataRetentionHealthCheck(context: InvocationContext): Promise<{
  status: 'healthy' | 'unhealthy';
  details: Record<string, unknown>;
}> {
  try {
    if (!STORAGE_CONNECTION_STRING) {
      return {
        status: 'unhealthy',
        details: { error: 'Missing storage configuration' }
      };
    }

    const storageService = new AzureTableStorageService({
      connectionString: STORAGE_CONNECTION_STRING
    });

    const healthCheck = await storageService.healthCheck();
    const storageStats = await storageService.getStorageStatistics();

    return {
      status: healthCheck.isHealthy ? 'healthy' : 'unhealthy',
      details: {
        storage: healthCheck,
        statistics: storageStats,
        retentionPeriods: RETENTION_PERIODS,
        lastCheck: new Date().toISOString()
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.error('❌ Health check failed:', errorMessage);
    return {
      status: 'unhealthy',
      details: { 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// Register Azure Functions
app.timer('dataRetentionCleanup', {
  // Schedule: Daily at 02:00 GMT (CRON: minute hour day month day-of-week)
  schedule: '0 2 * * *',  
  handler: dataRetentionCleanup
});

app.http('dataRetentionHealth', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    const healthStatus = await dataRetentionHealthCheck(context);
    return { 
      status: healthStatus.status === 'healthy' ? 200 : 500,
      jsonBody: healthStatus 
    };
  }
});

export default app;