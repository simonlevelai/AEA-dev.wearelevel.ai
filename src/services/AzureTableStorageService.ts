/**
 * Cost-Optimized Azure Table Storage Service 
 * Replaces expensive Cosmos DB with £13-20/month savings
 * Handles conversation state, search logs, and GDPR compliance
 * Cost: £2-5/month for healthcare chatbot (vs £15-25 Cosmos DB)
 */

import { 
  TableClient, 
  TableServiceClient, 
  AzureNamedKeyCredential, 
  GetTableEntityResponse,
  ListTableEntitiesOptions,
  UpdateTableEntityOptions,
  DeleteTableEntityOptions
} from '@azure/data-tables';

import {
  ConversationStateEntity,
  PiFContentEntity,
  SearchLogEntity,
  AuditLogEntity,
  AzureTableStorageConfig,
  AzureTableStorageUtils,
  DataRetentionType,
  RETENTION_PERIODS
} from './AzureTableStorageSchema';

import { ConversationState, UserContactInfo } from '../types/conversation';

/**
 * Azure Table Storage Service Implementation
 */
export class AzureTableStorageService {
  private serviceClient: TableServiceClient;
  private conversationTable: TableClient;
  private contentTable: TableClient;
  private searchLogsTable: TableClient;
  private auditLogsTable: TableClient;

  // Table names following Azure naming conventions
  private readonly CONVERSATION_TABLE = 'conversationstate';
  private readonly CONTENT_TABLE = 'pifcontent';
  private readonly SEARCH_LOGS_TABLE = 'searchlogs';
  private readonly AUDIT_LOGS_TABLE = 'auditlogs';

  constructor(private config: AzureTableStorageConfig) {
    // Initialize Azure Table Storage clients
    this.serviceClient = new TableServiceClient(config.connectionString);

    // Initialize table clients
    this.conversationTable = new TableClient(config.connectionString, this.CONVERSATION_TABLE);
    this.contentTable = new TableClient(config.connectionString, this.CONTENT_TABLE);
    this.searchLogsTable = new TableClient(config.connectionString, this.SEARCH_LOGS_TABLE);
    this.auditLogsTable = new TableClient(config.connectionString, this.AUDIT_LOGS_TABLE);
  }

  /**
   * Initialize all required tables
   */
  async initializeTables(): Promise<void> {
    console.log('🏗️ Initializing Azure Table Storage tables...');

    const tables = [
      { client: this.conversationTable, name: this.CONVERSATION_TABLE, description: 'conversation state storage' },
      { client: this.contentTable, name: this.CONTENT_TABLE, description: 'PiF content metadata' },
      { client: this.searchLogsTable, name: this.SEARCH_LOGS_TABLE, description: 'search operation logs' },
      { client: this.auditLogsTable, name: this.AUDIT_LOGS_TABLE, description: 'data retention audit logs' }
    ];

    for (const table of tables) {
      try {
        await table.client.createTable();
        console.log(`✅ Created table: ${table.name} (${table.description})`);
      } catch (error) {
        const hasStatusCode = error && typeof error === 'object' && 'statusCode' in error;
        if (hasStatusCode && (error as any).statusCode === 409) {
          console.log(`📋 Table exists: ${table.name} (${table.description})`);
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to create table ${table.name}:`, errorMessage);
          throw error;
        }
      }
    }

    console.log('🎉 Table initialization completed');
  }

  // ==========================================
  // CONVERSATION STATE OPERATIONS
  // ==========================================

  /**
   * Save or update conversation state
   */
  async saveConversationState(conversationState: ConversationState): Promise<void> {
    console.log(`💾 Saving conversation state: ${conversationState.conversationId}`);

    const baseEntity = AzureTableStorageUtils.convertConversationStateToEntity(conversationState);
    const entity: ConversationStateEntity = {
      partitionKey: conversationState.conversationId,
      rowKey: 'state',
      conversationId: conversationState.conversationId,
      userId: conversationState.userId,
      sessionId: conversationState.sessionId,
      currentTopic: conversationState.currentTopic,
      currentStage: conversationState.currentStage,
      consentStatus: conversationState.consentStatus,
      conversationStarted: conversationState.conversationStarted,
      hasSeenOpeningStatement: conversationState.hasSeenOpeningStatement,
      lastActivity: conversationState.lastActivity,
      messageCount: conversationState.messageCount,
      topics: JSON.stringify(conversationState.topics || []),
      ...baseEntity
    };

    try {
      await this.retryOperation(() => 
        this.conversationTable.upsertEntity(entity, 'Replace')
      );
      console.log(`✅ Conversation state saved: ${conversationState.conversationId}`);
    } catch (error) {
      console.error(`❌ Failed to save conversation state:`, error);
      throw error;
    }
  }

  /**
   * Get conversation state by ID
   */
  async getConversationState(conversationId: string): Promise<ConversationState | null> {
    console.log(`🔍 Getting conversation state: ${conversationId}`);

    try {
      const response: GetTableEntityResponse<ConversationStateEntity> = await this.retryOperation(() =>
        this.conversationTable.getEntity(conversationId, 'state')
      );

      const entity = response;
      return AzureTableStorageUtils.convertEntityToConversationState(entity);
    } catch (error) {
      const hasStatusCode = error && typeof error === 'object' && 'statusCode' in error;
      if (hasStatusCode && (error as any).statusCode === 404) {
        console.log(`📄 Conversation state not found: ${conversationId}`);
        return null;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to get conversation state:`, errorMessage);
      throw error;
    }
  }

  /**
   * Delete conversation state (for GDPR compliance)
   */
  async deleteConversationState(conversationId: string): Promise<void> {
    console.log(`🗑️ Deleting conversation state: ${conversationId}`);

    try {
      await this.retryOperation(() =>
        this.conversationTable.deleteEntity(conversationId, 'state')
      );
      console.log(`✅ Conversation state deleted: ${conversationId}`);
    } catch (error) {
      const hasStatusCode = error && typeof error === 'object' && 'statusCode' in error;
      if (hasStatusCode && (error as any).statusCode === 404) {
        console.log(`📄 Conversation state already deleted: ${conversationId}`);
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to delete conversation state:`, errorMessage);
      throw error;
    }
  }

  /**
   * List active conversations (for monitoring)
   */
  async listActiveConversations(maxResults: number = 100): Promise<ConversationState[]> {
    console.log(`📋 Listing active conversations (max: ${maxResults})`);

    try {
      const entities = this.conversationTable.listEntities<ConversationStateEntity>({
        queryOptions: {
          filter: `RowKey eq 'state' and conversationStarted eq true`,
          select: ['partitionKey', 'conversationId', 'userId', 'currentTopic', 'currentStage', 'lastActivity', 'messageCount']
        }
      });

      const conversations: ConversationState[] = [];
      for await (const entity of entities) {
        conversations.push(AzureTableStorageUtils.convertEntityToConversationState(entity));
      }

      console.log(`✅ Found ${conversations.length} active conversations`);
      return conversations;
    } catch (error) {
      console.error(`❌ Failed to list active conversations:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired conversations (GDPR TTL)
   */
  async cleanupExpiredConversations(): Promise<number> {
    console.log('🧹 Cleaning up expired conversations...');

    try {
      const expiredEntities = this.conversationTable.listEntities<ConversationStateEntity>({
        queryOptions: {
          filter: `RowKey eq 'state' and ttl lt ${Math.floor(Date.now() / 1000)}`,
          select: ['partitionKey', 'rowKey', 'conversationId', 'ttl', 'escalatedToNurse', 'crisisDetected']
        }
      });

      let deletedCount = 0;
      for await (const entity of expiredEntities) {
        try {
          // Log the deletion before performing it
          await this.logDataRetentionActivity({
            action: 'data_retention_cleanup',
            entityType: 'conversation',
            entityId: entity.conversationId,
            originalTTL: entity.ttl,
            dataType: entity.crisisDetected ? DataRetentionType.CRISIS_RESPONSE : DataRetentionType.CONVERSATION_DATA,
            metadata: {
              escalatedToNurse: entity.escalatedToNurse || false,
              crisisDetected: entity.crisisDetected || false
            }
          });

          await this.conversationTable.deleteEntity(entity.partitionKey, entity.rowKey);
          deletedCount++;
          console.log(`🗑️ Deleted expired conversation: ${entity.conversationId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`⚠️ Failed to delete expired conversation ${entity.conversationId}:`, errorMessage);
        }
      }

      console.log(`✅ Cleaned up ${deletedCount} expired conversations`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Failed to cleanup expired conversations:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired search logs (GDPR TTL) - PREVIOUSLY MISSING
   */
  async cleanupExpiredSearchLogs(): Promise<number> {
    console.log('🧹 Cleaning up expired search logs...');

    try {
      const expiredEntities = this.searchLogsTable.listEntities<SearchLogEntity>({
        queryOptions: {
          filter: `PartitionKey eq 'search-logs' and ttl lt ${Math.floor(Date.now() / 1000)}`,
          select: ['partitionKey', 'rowKey', 'searchId', 'ttl']
        }
      });

      let deletedCount = 0;
      for await (const entity of expiredEntities) {
        try {
          // Log the deletion before performing it
          await this.logDataRetentionActivity({
            action: 'data_retention_cleanup',
            entityType: 'search_log',
            entityId: entity.searchId,
            originalTTL: entity.ttl,
            dataType: DataRetentionType.SEARCH_LOGS,
            metadata: {
              query: entity.query
            }
          });

          await this.searchLogsTable.deleteEntity(entity.partitionKey, entity.rowKey);
          deletedCount++;
          console.log(`🗑️ Deleted expired search log: ${entity.searchId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`⚠️ Failed to delete expired search log ${entity.searchId}:`, errorMessage);
        }
      }

      console.log(`✅ Cleaned up ${deletedCount} expired search logs`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Failed to cleanup expired search logs:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired audit logs (GDPR TTL)
   */
  async cleanupExpiredAuditLogs(): Promise<number> {
    console.log('🧹 Cleaning up expired audit logs...');

    try {
      const expiredEntities = this.auditLogsTable.listEntities<AuditLogEntity>({
        queryOptions: {
          filter: `PartitionKey eq 'audit-logs' and ttl lt ${Math.floor(Date.now() / 1000)}`,
          select: ['partitionKey', 'rowKey', 'auditId', 'ttl']
        }
      });

      let deletedCount = 0;
      for await (const entity of expiredEntities) {
        try {
          await this.auditLogsTable.deleteEntity(entity.partitionKey, entity.rowKey);
          deletedCount++;
          console.log(`🗑️ Deleted expired audit log: ${entity.auditId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`⚠️ Failed to delete expired audit log ${entity.auditId}:`, errorMessage);
        }
      }

      console.log(`✅ Cleaned up ${deletedCount} expired audit logs`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Failed to cleanup expired audit logs:`, error);
      throw error;
    }
  }

  /**
   * Comprehensive data retention cleanup - all expired data types
   */
  async performDataRetentionCleanup(): Promise<{
    conversationsDeleted: number;
    searchLogsDeleted: number;
    auditLogsDeleted: number;
    totalDeleted: number;
    errors: string[];
  }> {
    console.log('🧹 Starting comprehensive data retention cleanup...');

    const results = {
      conversationsDeleted: 0,
      searchLogsDeleted: 0,
      auditLogsDeleted: 0,
      totalDeleted: 0,
      errors: [] as string[]
    };

    try {
      // Clean up conversations
      try {
        results.conversationsDeleted = await this.cleanupExpiredConversations();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push(`Conversations cleanup failed: ${errorMessage}`);
      }

      // Clean up search logs
      try {
        results.searchLogsDeleted = await this.cleanupExpiredSearchLogs();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push(`Search logs cleanup failed: ${errorMessage}`);
      }

      // Clean up audit logs (these have longer retention)
      try {
        results.auditLogsDeleted = await this.cleanupExpiredAuditLogs();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push(`Audit logs cleanup failed: ${errorMessage}`);
      }

      results.totalDeleted = results.conversationsDeleted + results.searchLogsDeleted + results.auditLogsDeleted;

      console.log(`✅ Data retention cleanup completed:`);
      console.log(`   Conversations: ${results.conversationsDeleted}`);
      console.log(`   Search logs: ${results.searchLogsDeleted}`);
      console.log(`   Audit logs: ${results.auditLogsDeleted}`);
      console.log(`   Total deleted: ${results.totalDeleted}`);
      if (results.errors.length > 0) {
        console.log(`   Errors: ${results.errors.length}`);
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to perform comprehensive data retention cleanup:`, errorMessage);
      results.errors.push(`Comprehensive cleanup failed: ${errorMessage}`);
      throw error;
    }
  }

  // ==========================================
  // AUDIT LOGGING OPERATIONS
  // ==========================================

  /**
   * Log data retention activity for GDPR compliance audit trail
   */
  async logDataRetentionActivity(activity: {
    action: 'data_retention_cleanup' | 'manual_deletion' | 'gdpr_request' | 'crisis_data_retention';
    entityType: 'conversation' | 'search_log' | 'user_data' | 'crisis_data';
    entityId: string;
    userId?: string;
    originalTTL?: number;
    dataType: DataRetentionType;
    requestId?: string;
    requestType?: 'access' | 'rectification' | 'erasure' | 'portability';
    requestorEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const timestamp = new Date();
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const entity: AuditLogEntity = {
      partitionKey: 'audit-logs',
      rowKey: AzureTableStorageUtils.getSortableRowKey(timestamp),
      auditId: auditId,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      userId: activity.userId,
      details: JSON.stringify({
        originalTTL: activity.originalTTL,
        actualDeletionDate: timestamp.toISOString(),
        retentionPeriodDays: RETENTION_PERIODS[activity.dataType],
        dataType: activity.dataType,
        requestId: activity.requestId,
        requestType: activity.requestType,
        requestorEmail: activity.requestorEmail,
        metadata: activity.metadata || {}
      }),
      timestamp: timestamp,
      outcome: 'success' as const,
      createdAt: timestamp,
      ttl: AzureTableStorageUtils.generateTTLForDataType(DataRetentionType.AUDIT_LOGS)
    };

    try {
      await this.retryOperation(() =>
        this.auditLogsTable.createEntity(entity)
      );
      console.log(`📋 Logged data retention activity: ${activity.action} for ${activity.entityType}:${activity.entityId}`);
    } catch (error) {
      console.error(`❌ Failed to log data retention activity:`, error);
      // Don't throw error - audit logging failure shouldn't stop data retention
    }
  }

  /**
   * Get data retention statistics and compliance metrics
   */
  async getDataRetentionStatistics(days: number = 30): Promise<{
    totalDeletions: number;
    deletionsByType: Record<string, number>;
    deletionsByDataType: Record<DataRetentionType, number>;
    averageDaysToExpiry: number;
    upcomingExpirations: Array<{
      entityType: string;
      entityId: string;
      daysUntilExpiry: number;
      dataType: DataRetentionType;
    }>;
    complianceStatus: 'compliant' | 'warning' | 'non_compliant';
  }> {
    console.log(`📊 Getting data retention statistics for last ${days} days...`);

    const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const cutoffTimestamp = AzureTableStorageUtils.getSortableRowKey(cutoffDate);

    try {
      const entities = this.auditLogsTable.listEntities<AuditLogEntity>({
        queryOptions: {
          filter: `PartitionKey eq 'audit-logs' and RowKey gt '${cutoffTimestamp}'`,
          select: ['action', 'entityType', 'auditId', 'timestamp']
        }
      });

      const stats = {
        totalDeletions: 0,
        deletionsByType: {} as Record<string, number>,
        deletionsByDataType: {} as Record<DataRetentionType, number>,
        averageDaysToExpiry: 0,
        upcomingExpirations: [] as Array<{
          entityType: string;
          entityId: string;
          daysUntilExpiry: number;
          dataType: DataRetentionType;
        }>,
        complianceStatus: 'compliant' as 'compliant' | 'warning' | 'non_compliant'
      };

      let totalRetentionDays = 0;

      for await (const entity of entities) {
        if (entity.action === 'data_retention_cleanup') {
          stats.totalDeletions++;
          
          stats.deletionsByType[entity.entityType] = (stats.deletionsByType[entity.entityType] || 0) + 1;
          // Derive data type from entity type for statistics  
          const dataType = entity.entityType.includes('conversation') ? DataRetentionType.CONVERSATION_DATA :
                          entity.entityType.includes('search') ? DataRetentionType.SEARCH_LOGS : 
                          entity.entityType.includes('audit') ? DataRetentionType.AUDIT_LOGS : DataRetentionType.CONVERSATION_DATA;
          const dataTypeKey = dataType as keyof typeof stats.deletionsByDataType;
          stats.deletionsByDataType[dataTypeKey] = (stats.deletionsByDataType[dataTypeKey] || 0) + 1;
          
          // Use standard retention periods based on entity type
          const retentionDays = entity.entityType.includes('conversation') ? 30 :
                               entity.entityType.includes('search') ? 30 : 
                               entity.entityType.includes('audit') ? 365 : 30;
          totalRetentionDays += retentionDays;
        }
      }

      stats.averageDaysToExpiry = stats.totalDeletions > 0 ? totalRetentionDays / stats.totalDeletions : 0;

      // Check for upcoming expirations
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check conversations
      const conversationEntities = this.conversationTable.listEntities<ConversationStateEntity>({
        queryOptions: {
          filter: `RowKey eq 'state' and ttl gt ${currentTime}`,
          select: ['conversationId', 'ttl', 'crisisDetected']
        }
      });

      for await (const entity of conversationEntities) {
        const daysUntilExpiry = AzureTableStorageUtils.getDaysUntilExpiry(entity);
        if (daysUntilExpiry !== null && daysUntilExpiry <= 7) { // Flag items expiring in next 7 days
          stats.upcomingExpirations.push({
            entityType: 'conversation',
            entityId: entity.conversationId,
            daysUntilExpiry,
            dataType: entity.crisisDetected ? DataRetentionType.CRISIS_RESPONSE : DataRetentionType.CONVERSATION_DATA
          });
        }
      }

      // Determine compliance status
      if (stats.upcomingExpirations.length > 100) {
        stats.complianceStatus = 'non_compliant';
      } else if (stats.upcomingExpirations.length > 50) {
        stats.complianceStatus = 'warning';
      }

      console.log(`✅ Data retention statistics: ${stats.totalDeletions} total deletions, ${stats.upcomingExpirations.length} upcoming`);
      return stats;
    } catch (error) {
      console.error(`❌ Failed to get data retention statistics:`, error);
      throw error;
    }
  }

  // ==========================================
  // PiF CONTENT OPERATIONS
  // ==========================================

  /**
   * Store PiF content metadata
   */
  async storePiFContentMetadata(content: {
    id: string;
    chunkId: string;
    title?: string;
    content: string;
    contentType: string;
    priorityLevel: 'critical' | 'high' | 'medium' | 'low';
    sourceUrl: string;
    pageNumber?: number;
    relevanceKeywords: string[];
    medicalCategories: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    console.log(`💾 Storing PiF content metadata: ${content.chunkId}`);

    const entity: PiFContentEntity = {
      partitionKey: 'pif-content',
      rowKey: content.chunkId,
      contentId: content.id, // Map id to contentId
      title: content.title || 'Untitled',
      content: content.content,
      category: content.contentType || 'general', // Map contentType to category
      lastUpdated: new Date(),
      version: 1,
      isActive: true,
      id: content.id,
      chunkId: content.chunkId,
      contentType: content.contentType,
      priorityLevel: content.priorityLevel,
      sourceUrl: content.sourceUrl,
      pageNumber: content.pageNumber,
      relevanceKeywords: JSON.stringify(content.relevanceKeywords),
      medicalCategories: JSON.stringify(content.medicalCategories),
      metadata: JSON.stringify(content.metadata || {}),
      createdAt: new Date(),
      ttl: AzureTableStorageUtils.calculateTTLForDataType(DataRetentionType.ADMINISTRATIVE_TRIAGE)
    };

    try {
      await this.retryOperation(() =>
        this.contentTable.upsertEntity(entity, 'Replace')
      );
      console.log(`✅ PiF content metadata stored: ${content.chunkId}`);
    } catch (error) {
      console.error(`❌ Failed to store PiF content metadata:`, error);
      throw error;
    }
  }

  /**
   * Get PiF content metadata by chunk ID
   */
  async getPiFContentMetadata(chunkId: string): Promise<{
    id: string;
    chunkId: string;
    title?: string;
    content: string;
    contentType: string;
    priorityLevel: string;
    sourceUrl: string;
    pageNumber?: number;
    relevanceKeywords: string[];
    medicalCategories: string[];
    metadata: Record<string, unknown>;
    createdAt: Date;
  } | null> {
    console.log(`🔍 Getting PiF content metadata: ${chunkId}`);

    try {
      const response: GetTableEntityResponse<PiFContentEntity> = await this.retryOperation(() =>
        this.contentTable.getEntity('pif-content', chunkId)
      );

      return {
        id: response.id || response.contentId || '',
        chunkId: response.chunkId || response.rowKey || '',
        title: response.title || 'Untitled',
        content: response.content || '',
        contentType: response.contentType || response.category || 'general',
        priorityLevel: (response.priorityLevel as 'critical' | 'high' | 'medium' | 'low') || 'medium',
        sourceUrl: response.sourceUrl || '',
        pageNumber: response.pageNumber || undefined,
        relevanceKeywords: JSON.parse(response.relevanceKeywords || '[]'),
        medicalCategories: JSON.parse(response.medicalCategories || '[]'),
        metadata: JSON.parse(response.metadata || '{}'),
        createdAt: response.createdAt || response.lastUpdated || new Date()
      };
    } catch (error) {
      const hasStatusCode = error && typeof error === 'object' && 'statusCode' in error;
      if (hasStatusCode && (error as any).statusCode === 404) {
        console.log(`📄 PiF content metadata not found: ${chunkId}`);
        return null;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to get PiF content metadata:`, errorMessage);
      throw error;
    }
  }

  /**
   * List all PiF content chunks
   */
  async listPiFContent(maxResults: number = 1000): Promise<Array<{
    chunkId: string;
    title?: string;
    contentType: string;
    priorityLevel: string;
    sourceUrl: string;
    createdAt: Date;
  }>> {
    console.log(`📋 Listing PiF content (max: ${maxResults})`);

    try {
      const entities = this.contentTable.listEntities<PiFContentEntity>({
        queryOptions: {
          filter: `PartitionKey eq 'pif-content'`,
          select: ['contentId', 'title', 'category', 'tags', 'lastUpdated', 'version']
        }
      });

      const content: Array<{
        chunkId: string;
        title?: string;
        contentType: string;
        priorityLevel: string;
        sourceUrl: string;
        createdAt: Date;
      }> = [];

      for await (const entity of entities) {
        content.push({
          chunkId: entity.chunkId || entity.rowKey || '',
          title: entity.title || 'Untitled',
          contentType: entity.contentType || entity.category || 'general',
          priorityLevel: (entity.priorityLevel as 'critical' | 'high' | 'medium' | 'low') || 'medium',
          sourceUrl: entity.sourceUrl || '',
          createdAt: entity.createdAt || entity.lastUpdated || new Date()
        });
      }

      console.log(`✅ Found ${content.length} PiF content chunks`);
      return content;
    } catch (error) {
      console.error(`❌ Failed to list PiF content:`, error);
      throw error;
    }
  }

  // ==========================================
  // SEARCH LOG OPERATIONS
  // ==========================================

  /**
   * Log search operation
   */
  async logSearchOperation(searchLog: {
    id: string;
    query: string;
    matchedChunks: string[];
    responseGenerated: boolean;
    searchMethod: string;
    responseTimeMs?: number;
    userSatisfied?: boolean;
    agentId?: string;
    conversationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    console.log(`📊 Logging search operation: ${searchLog.query.substring(0, 50)}...`);

    const timestamp = new Date();
    const entity: SearchLogEntity = {
      partitionKey: 'search-logs',
      rowKey: AzureTableStorageUtils.getSortableRowKey(timestamp),
      searchId: searchLog.id,
      query: searchLog.query,
      timestamp: timestamp,
      resultsCount: searchLog.matchedChunks?.length || 0,
      responseTimeMs: searchLog.responseTimeMs || 0,
      responseGenerated: searchLog.responseGenerated,
      searchMethod: searchLog.searchMethod,
      ttl: AzureTableStorageUtils.generateTTLForDataType(DataRetentionType.SEARCH_LOGS)
    };

    try {
      await this.retryOperation(() =>
        this.searchLogsTable.createEntity(entity)
      );
      console.log(`✅ Search operation logged: ${searchLog.id}`);
    } catch (error) {
      console.error(`❌ Failed to log search operation:`, error);
      throw error;
    }
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(days: number = 7): Promise<{
    totalSearches: number;
    successfulSearches: number;
    averageResponseTime: number;
    topQueries: Array<{ query: string; count: number }>;
    searchMethods: Record<string, number>;
  }> {
    console.log(`📊 Getting search analytics for last ${days} days`);

    const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const cutoffTimestamp = AzureTableStorageUtils.getSortableRowKey(cutoffDate);

    try {
      const entities = this.searchLogsTable.listEntities<SearchLogEntity>({
        queryOptions: {
          filter: `PartitionKey eq 'search-logs' and RowKey gt '${cutoffTimestamp}'`,
          select: ['query', 'searchId', 'responseTimeMs', 'resultsCount', 'timestamp']
        }
      });

      let totalSearches = 0;
      let successfulSearches = 0;
      const responseTimes: number[] = [];
      const queryCount: Record<string, number> = {};
      const searchMethods: Record<string, number> = {};

      for await (const entity of entities) {
        totalSearches++;
        
        if (entity.responseGenerated) {
          successfulSearches++;
        }

        if (entity.responseTimeMs) {
          responseTimes.push(entity.responseTimeMs);
        }

        // Count query frequency (normalize to avoid PII)
        const normalizedQuery = entity.query.toLowerCase().substring(0, 20);
        queryCount[normalizedQuery] = (queryCount[normalizedQuery] || 0) + 1;

        // Count search methods
        const searchMethod = entity.searchMethod || 'unknown';
        searchMethods[searchMethod] = (searchMethods[searchMethod] || 0) + 1;
      }

      const averageResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
        : 0;

      const topQueries = Object.entries(queryCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));

      console.log(`✅ Analytics: ${totalSearches} searches, ${successfulSearches} successful, ${averageResponseTime.toFixed(0)}ms avg`);

      return {
        totalSearches,
        successfulSearches,
        averageResponseTime,
        topQueries,
        searchMethods
      };
    } catch (error) {
      console.error(`❌ Failed to get search analytics:`, error);
      throw error;
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Get storage statistics
   */
  async getStorageStatistics(): Promise<{
    conversationCount: number;
    contentChunkCount: number;
    searchLogCount: number;
    estimatedCostPerMonth: number;
  }> {
    console.log('📊 Getting storage statistics...');

    try {
      // Count entities in each table (sample-based for large tables)
      const [conversationCount, contentChunkCount, searchLogCount] = await Promise.all([
        this.countTableEntities(this.conversationTable, `RowKey eq 'state'`),
        this.countTableEntities(this.contentTable, `PartitionKey eq 'pif-content'`),
        this.countTableEntities(this.searchLogsTable, `PartitionKey eq 'search-logs'`)
      ]);

      // Estimate monthly cost based on entity count and operations
      // Azure Table Storage pricing: £0.037 per 10,000 transactions
      const totalEntities = conversationCount + contentChunkCount + searchLogCount;
      const estimatedMonthlyTransactions = totalEntities * 30; // Rough estimate
      const estimatedCostPerMonth = (estimatedMonthlyTransactions / 10000) * 0.037;

      console.log(`✅ Stats: ${conversationCount} conversations, ${contentChunkCount} content chunks, ${searchLogCount} search logs`);
      console.log(`💰 Estimated monthly cost: £${estimatedCostPerMonth.toFixed(2)}`);

      return {
        conversationCount,
        contentChunkCount, 
        searchLogCount,
        estimatedCostPerMonth: Math.max(estimatedCostPerMonth, 1) // Minimum £1/month
      };
    } catch (error) {
      console.error(`❌ Failed to get storage statistics:`, error);
      throw error;
    }
  }

  /**
   * Health check for Table Storage service
   */
  async healthCheck(): Promise<{
    isHealthy: boolean;
    tablesAccessible: boolean;
    canWrite: boolean;
    canRead: boolean;
    issues: string[];
  }> {
    console.log('🏥 Running Table Storage health check...');

    const issues: string[] = [];
    let tablesAccessible = true;
    let canWrite = true;
    let canRead = true;

    try {
      // Test table access
      await this.conversationTable.getAccessPolicy();
      console.log('✅ Tables accessible');
    } catch (error) {
      tablesAccessible = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      issues.push(`Table access failed: ${errorMessage}`);
    }

    // Test write operation
    const testEntityKey = `health-check-${Date.now()}`;
    try {
      const testEntity = {
        partitionKey: 'health-check',
        rowKey: testEntityKey,
        timestamp: new Date(),
        testData: 'health check'
      };

      await this.conversationTable.createEntity(testEntity);
      console.log('✅ Write operation successful');

      // Test read operation
      await this.conversationTable.getEntity('health-check', testEntityKey);
      console.log('✅ Read operation successful');

      // Clean up test entity
      await this.conversationTable.deleteEntity('health-check', testEntityKey);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('create')) {
        canWrite = false;
        issues.push(`Write operation failed: ${errorMessage}`);
      } else if (errorMessage.includes('get')) {
        canRead = false;
        issues.push(`Read operation failed: ${errorMessage}`);
      }
    }

    const isHealthy = tablesAccessible && canWrite && canRead && issues.length === 0;

    console.log(`🏥 Health status: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    if (issues.length > 0) {
      console.log('⚠️ Issues:', issues.join(', '));
    }

    return {
      isHealthy,
      tablesAccessible,
      canWrite,
      canRead,
      issues
    };
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          break;
        }

        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError!;
  }

  /**
   * Count entities in a table (optimized for large tables)
   */
  private async countTableEntities(table: TableClient, filter?: string): Promise<number> {
    try {
      const entities = table.listEntities({
        queryOptions: {
          filter,
          select: ['partitionKey']  // Minimal data to reduce bandwidth
        }
      });

      let count = 0;
      for await (const entity of entities) {
        count++;
      }

      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ Failed to count entities: ${errorMessage}`);
      return 0;
    }
  }
}

// Re-export types and constants from schema
export type { ConversationStateEntity, PiFContentEntity, SearchLogEntity, AuditLogEntity, AzureTableStorageConfig } from './AzureTableStorageSchema';
export { DataRetentionType, RETENTION_PERIODS } from './AzureTableStorageSchema';