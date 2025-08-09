/**
 * Azure Table Storage Schema - Clean Implementation
 * Complete schema definitions for GDPR-compliant data retention
 */

/**
 * Base interface for all Azure Table Storage entities
 */
export interface BaseEntity {
  partitionKey: string;
  rowKey: string;
  timestamp?: Date;
  etag?: string;
  ttl?: number; // TTL in seconds for GDPR compliance
}

/**
 * Conversation State Entity for Azure Table Storage
 */
export interface ConversationStateEntity extends BaseEntity {
  conversationId: string;
  userId: string;
  sessionId: string;
  currentTopic: string;
  currentStage: string;
  consentStatus: string;
  userContactInfo?: string; // JSON serialized
  conversationStarted: boolean;
  hasSeenOpeningStatement: boolean;
  lastActivity: number;
  messageCount: number;
  topics: string; // JSON array
  context?: string; // JSON serialized
  escalationRequired?: boolean;
  escalationId?: string;
  escalatedToNurse?: boolean;
  escalationTimestamp?: Date;
  satisfactionRating?: number;
  completionReason?: string;
  crisisDetected?: boolean;
}

/**
 * PiF Content Entity for healthcare information storage
 */
export interface PiFContentEntity extends BaseEntity {
  contentId: string;
  title: string;
  content: string;
  category: string;
  tags?: string; // JSON array
  lastUpdated: Date;
  version: number;
  isActive: boolean;
  
  // Extended properties for PiF content chunks
  id?: string; // Chunk identifier
  chunkId?: string; // Alternative chunk ID
  contentType?: string; // Type of content
  priorityLevel?: 'critical' | 'high' | 'medium' | 'low';
  sourceUrl?: string; // Source URL
  pageNumber?: number; // Page number in source
  relevanceKeywords?: string; // JSON array of keywords
  medicalCategories?: string; // JSON array of medical categories
  metadata?: string; // JSON serialized metadata
  createdAt?: Date; // Creation timestamp
  
  // GDPR compliance - content kept for longer periods  
  ttl?: number; // Extended retention for medical content
}

/**
 * Search Log Entity for operational monitoring
 */
export interface SearchLogEntity extends BaseEntity {
  searchId: string;
  query: string;
  timestamp: Date;
  resultsCount: number;
  responseTimeMs: number;
  userId?: string;
  sessionId?: string;
  responseGenerated?: boolean; // Whether response was generated
  searchMethod?: string; // Method used for search
  
  // GDPR compliance - search logs kept for 30 days
  ttl?: number; // 30 days
}

/**
 * Audit Log Entity for compliance tracking
 */
export interface AuditLogEntity extends BaseEntity {
  auditId: string;
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  details?: string; // JSON serialized
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'success' | 'failure' | 'partial';
  createdAt: Date;
  
  // GDPR compliance - audit logs kept for 365 days
  ttl?: number; // 365 days for compliance
}

/**
 * Azure Table Storage Service Configuration
 */
export interface AzureTableStorageConfig {
  connectionString: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Data retention types for differentiated GDPR compliance
 */
export enum DataRetentionType {
  CONVERSATION_DATA = 'conversation_data',          // 30 days - basic interactions
  SEARCH_LOGS = 'search_logs',                     // 30 days - operational data  
  CRISIS_RESPONSE = 'crisis_response',             // 730 days (2 years) - safety monitoring
  AUDIT_LOGS = 'audit_logs',                       // 365 days - compliance tracking
  ADMINISTRATIVE_TRIAGE = 'administrative_triage'   // 30 days - post-handover to nurses
}

/**
 * Retention periods in days for different data types
 */
export const RETENTION_PERIODS: Record<DataRetentionType, number> = {
  [DataRetentionType.CONVERSATION_DATA]: 30,        // Standard conversation data
  [DataRetentionType.SEARCH_LOGS]: 30,             // Operational search logs  
  [DataRetentionType.CRISIS_RESPONSE]: 730,        // Crisis data (2 years for safety)
  [DataRetentionType.AUDIT_LOGS]: 365,             // Compliance and audit logs
  [DataRetentionType.ADMINISTRATIVE_TRIAGE]: 30     // Triage coordination data
};

/**
 * Utility functions for Azure Table Storage operations with GDPR compliance
 */
export class AzureTableStorageUtils {
  
  /**
   * Generate TTL timestamp for GDPR compliance
   */
  static generateTTL(daysFromNow: number): number {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + (daysFromNow * 24 * 60 * 60 * 1000));
    return Math.floor(expiryDate.getTime() / 1000); // Unix timestamp in seconds
  }

  /**
   * Calculate TTL based on data retention type
   */
  static calculateTTLForDataType(dataType: DataRetentionType): number {
    const days = RETENTION_PERIODS[dataType];
    return this.generateTTL(days);
  }

  /**
   * Check if an entity is expired based on TTL
   */
  static isEntityExpired(entity: BaseEntity): boolean {
    if (!entity.ttl) return false;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp > entity.ttl;
  }

  /**
   * Get days until expiry for an entity
   */
  static getDaysUntilExpiry(entity: BaseEntity): number | null {
    if (!entity.ttl) return null;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const secondsUntilExpiry = entity.ttl - currentTimestamp;
    return Math.max(0, Math.floor(secondsUntilExpiry / (24 * 60 * 60)));
  }

  /**
   * Convert Azure Table entity to ConversationState
   */
  static convertEntityToConversationState(entity: ConversationStateEntity): any {
    return {
      conversationId: entity.conversationId,
      userId: entity.userId,
      sessionId: entity.sessionId,
      currentTopic: entity.currentTopic,
      currentStage: entity.currentStage,
      consentStatus: entity.consentStatus,
      userContactInfo: entity.userContactInfo ? JSON.parse(entity.userContactInfo) : undefined,
      conversationStarted: entity.conversationStarted,
      hasSeenOpeningStatement: entity.hasSeenOpeningStatement,
      lastActivity: entity.lastActivity,
      messageCount: entity.messageCount,
      topics: JSON.parse(entity.topics || '[]'),
      context: entity.context ? JSON.parse(entity.context) : undefined
    };
  }

  /**
   * Convert ConversationState to Azure Table entity
   */
  static convertConversationStateToEntity(state: any): Partial<ConversationStateEntity> {
    return {
      conversationId: state.conversationId,
      userId: state.userId,
      sessionId: state.sessionId,
      currentTopic: state.currentTopic,
      currentStage: state.currentStage,
      consentStatus: state.consentStatus,
      userContactInfo: state.userContactInfo ? JSON.stringify(state.userContactInfo) : undefined,
      conversationStarted: state.conversationStarted,
      hasSeenOpeningStatement: state.hasSeenOpeningStatement,
      lastActivity: state.lastActivity,
      messageCount: state.messageCount,
      topics: JSON.stringify(state.topics || []),
      context: state.context ? JSON.stringify(state.context) : undefined,
      escalationRequired: state.escalationRequired,
      escalationId: state.escalationId,
      escalatedToNurse: state.escalatedToNurse,
      escalationTimestamp: state.escalationTimestamp,
      satisfactionRating: state.satisfactionRating,
      completionReason: state.completionReason,
      crisisDetected: state.crisisDetected,
      ttl: this.calculateTTLForDataType(DataRetentionType.CONVERSATION_DATA)
    };
  }

  /**
   * Generate a sortable row key for time-based entities
   */
  static getSortableRowKey(date?: Date): string {
    const useDate = date || new Date();
    const timestamp = useDate.getTime();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Generate TTL for specific data retention type
   */
  static generateTTLForDataType(dataType: DataRetentionType): number {
    return this.calculateTTLForDataType(dataType);
  }
}