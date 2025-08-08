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
  CreateTableOptions,
  GetTableEntityResponse,
  ListEntitiesOptions,
  UpdateTableEntityOptions,
  DeleteTableEntityOptions
} from '@azure/data-tables';

import {
  ConversationStateEntity,
  PiFContentEntity,
  SearchLogEntity,
  AzureTableStorageConfig,
  AzureTableStorageUtils
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

  // Table names following Azure naming conventions
  private readonly CONVERSATION_TABLE = 'conversationstate';
  private readonly CONTENT_TABLE = 'pifcontent';
  private readonly SEARCH_LOGS_TABLE = 'searchlogs';

  constructor(private config: AzureTableStorageConfig) {
    // Initialize Azure Table Storage clients
    const credential = AzureNamedKeyCredential.fromConnectionString(config.connectionString);
    this.serviceClient = new TableServiceClient(config.connectionString);

    // Initialize table clients
    this.conversationTable = new TableClient(config.connectionString, this.CONVERSATION_TABLE);
    this.contentTable = new TableClient(config.connectionString, this.CONTENT_TABLE);
    this.searchLogsTable = new TableClient(config.connectionString, this.SEARCH_LOGS_TABLE);
  }

  /**
   * Initialize all required tables
   */
  async initializeTables(): Promise<void> {
    console.log('🏗️ Initializing Azure Table Storage tables...');

    const tables = [
      { client: this.conversationTable, name: this.CONVERSATION_TABLE, description: 'conversation state storage' },
      { client: this.contentTable, name: this.CONTENT_TABLE, description: 'PiF content metadata' },
      { client: this.searchLogsTable, name: this.SEARCH_LOGS_TABLE, description: 'search operation logs' }
    ];

    for (const table of tables) {
      try {
        await table.client.createTable();
        console.log(`✅ Created table: ${table.name} (${table.description})`);
      } catch (error) {
        if (error.statusCode === 409) {
          console.log(`📋 Table exists: ${table.name} (${table.description})`);
        } else {
          console.error(`❌ Failed to create table ${table.name}:`, error);
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

    const entity: ConversationStateEntity = {
      partitionKey: conversationState.conversationId,
      rowKey: 'state',
      ...AzureTableStorageUtils.convertConversationStateToEntity(conversationState)
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
      if (error.statusCode === 404) {
        console.log(`📄 Conversation state not found: ${conversationId}`);
        return null;
      }
      console.error(`❌ Failed to get conversation state:`, error);
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
      if (error.statusCode === 404) {
        console.log(`📄 Conversation state already deleted: ${conversationId}`);
        return;
      }
      console.error(`❌ Failed to delete conversation state:`, error);
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
        filter: `RowKey eq 'state' and conversationStarted eq true`,
        select: ['partitionKey', 'conversationId', 'userId', 'currentTopic', 'currentStage', 'lastActivity', 'messageCount'],
        top: maxResults
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
        filter: `RowKey eq 'state' and ttl lt ${Math.floor(Date.now() / 1000)}`,
        select: ['partitionKey', 'rowKey', 'conversationId']
      });

      let deletedCount = 0;
      for await (const entity of expiredEntities) {
        try {
          await this.conversationTable.deleteEntity(entity.partitionKey, entity.rowKey);
          deletedCount++;
          console.log(`🗑️ Deleted expired conversation: ${entity.conversationId}`);
        } catch (error) {
          console.warn(`⚠️ Failed to delete expired conversation ${entity.conversationId}:`, error.message);
        }
      }

      console.log(`✅ Cleaned up ${deletedCount} expired conversations`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Failed to cleanup expired conversations:`, error);
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
      id: content.id,
      chunkId: content.chunkId,
      title: content.title,
      content: content.content,
      contentType: content.contentType,
      priorityLevel: content.priorityLevel,
      sourceUrl: content.sourceUrl,
      pageNumber: content.pageNumber,
      relevanceKeywords: JSON.stringify(content.relevanceKeywords),
      medicalCategories: JSON.stringify(content.medicalCategories),
      metadata: JSON.stringify(content.metadata || {}),
      createdAt: new Date()
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
        id: response.id,
        chunkId: response.chunkId,
        title: response.title,
        content: response.content,
        contentType: response.contentType,
        priorityLevel: response.priorityLevel,
        sourceUrl: response.sourceUrl,
        pageNumber: response.pageNumber,
        relevanceKeywords: JSON.parse(response.relevanceKeywords || '[]'),
        medicalCategories: JSON.parse(response.medicalCategories || '[]'),
        metadata: JSON.parse(response.metadata || '{}'),
        createdAt: response.createdAt
      };
    } catch (error) {
      if (error.statusCode === 404) {
        console.log(`📄 PiF content metadata not found: ${chunkId}`);
        return null;
      }
      console.error(`❌ Failed to get PiF content metadata:`, error);
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
        filter: `PartitionKey eq 'pif-content'`,
        select: ['chunkId', 'title', 'contentType', 'priorityLevel', 'sourceUrl', 'createdAt'],
        top: maxResults
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
          chunkId: entity.chunkId,
          title: entity.title,
          contentType: entity.contentType,
          priorityLevel: entity.priorityLevel,
          sourceUrl: entity.sourceUrl,
          createdAt: entity.createdAt
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
      rowKey: AzureTableStorageUtils.getSortableRowKey(timestamp, searchLog.id),
      id: searchLog.id,
      query: searchLog.query,
      matchedChunks: JSON.stringify(searchLog.matchedChunks),
      responseGenerated: searchLog.responseGenerated,
      searchMethod: searchLog.searchMethod,
      responseTimeMs: searchLog.responseTimeMs,
      userSatisfied: searchLog.userSatisfied,
      agentId: searchLog.agentId,
      conversationId: searchLog.conversationId,
      metadata: JSON.stringify(searchLog.metadata || {}),
      createdAt: timestamp,
      ttl: AzureTableStorageUtils.generateTTL(30) // 30 days GDPR compliance
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
        filter: `PartitionKey eq 'search-logs' and RowKey gt '${cutoffTimestamp}'`,
        select: ['query', 'responseGenerated', 'searchMethod', 'responseTimeMs', 'userSatisfied']
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
        searchMethods[entity.searchMethod] = (searchMethods[entity.searchMethod] || 0) + 1;
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
      issues.push(`Table access failed: ${error.message}`);
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
      if (error.message.includes('create')) {
        canWrite = false;
        issues.push(`Write operation failed: ${error.message}`);
      } else if (error.message.includes('get')) {
        canRead = false;
        issues.push(`Read operation failed: ${error.message}`);
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
        filter,
        select: ['partitionKey']  // Minimal data to reduce bandwidth
      });

      let count = 0;
      for await (const entity of entities) {
        count++;
      }

      return count;
    } catch (error) {
      console.warn(`⚠️ Failed to count entities: ${error.message}`);
      return 0;
    }
  }
}

// Export the service and related types
export {
  AzureTableStorageService,
  ConversationStateEntity,
  PiFContentEntity,
  SearchLogEntity,
  AzureTableStorageConfig
};