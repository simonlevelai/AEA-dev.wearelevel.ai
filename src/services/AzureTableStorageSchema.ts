/**
 * Azure Table Storage Schema for M365 Agent Conversations
 * Adapted from existing Supabase schema for ultra-cheap architecture
 */

import { TableEntity } from '@azure/data-tables';
import { ConversationState, UserContactInfo, ConversationTopic, ConversationStage, ConsentStatus } from '../types/conversation';

// Base entity with Azure Table Storage required fields
interface BaseEntity extends TableEntity {
  partitionKey: string;
  rowKey: string;
  timestamp?: Date;
  etag?: string;
}

/**
 * Conversation State Entity - Adapted from existing ConversationState
 * PartitionKey: conversationId
 * RowKey: 'state'
 */
export interface ConversationStateEntity extends BaseEntity {
  // Required Azure Table Storage fields
  partitionKey: string; // conversationId
  rowKey: 'state';
  
  // Core conversation data (from existing ConversationState)
  conversationId: string;
  userId: string;
  sessionId: string;
  currentTopic: ConversationTopic;
  currentStage: ConversationStage;
  consentStatus: ConsentStatus;
  
  // User contact info (JSON serialized)
  userContactInfo?: string; // JSON serialized UserContactInfo
  
  // Conversation flow state
  conversationStarted: boolean;
  hasSeenOpeningStatement: boolean;
  lastActivity: number; // Unix timestamp
  messageCount: number;
  topics: string; // JSON serialized array
  context?: string; // JSON serialized context object
  
  // Escalation data
  escalationRequired?: boolean;
  escalationId?: string;
  escalatedToNurse?: boolean;
  escalationTimestamp?: Date;
  
  // Satisfaction and completion
  satisfactionRating?: number;
  completionReason?: string;
  
  // GDPR compliance - TTL for automatic deletion after 30 days
  ttl?: number;
}

/**
 * PiF Content Entity - Adapted from existing Supabase pif_content_chunks
 * PartitionKey: 'pif-content'
 * RowKey: chunk_id
 */
export interface PiFContentEntity extends BaseEntity {
  partitionKey: 'pif-content';
  rowKey: string; // chunk_id
  
  // Core content data (from existing pif_content_chunks)
  id: string; // UUID equivalent
  chunkId: string;
  title?: string;
  content: string;
  contentType: string; // default: 'medical_information'
  priorityLevel: 'critical' | 'high' | 'medium' | 'low';
  sourceUrl: string;
  pageNumber?: number;
  
  // Keywords and categories (JSON serialized arrays)
  relevanceKeywords: string; // JSON serialized string[]
  medicalCategories: string; // JSON serialized string[]
  
  // Metadata
  metadata: string; // JSON serialized object
  createdAt: Date;
  
  // For vector search (when we add it)
  vectorEmbedding?: string; // JSON serialized number[] for future use
}

/**
 * Search Log Entity - Adapted from existing content_search_logs
 * PartitionKey: 'search-logs'
 * RowKey: timestamp-searchId
 */
export interface SearchLogEntity extends BaseEntity {
  partitionKey: 'search-logs';
  rowKey: string; // format: {timestamp}-{searchId}
  
  // Core search data (from existing content_search_logs)
  id: string;
  query: string;
  matchedChunks: string; // JSON serialized UUID[]
  responseGenerated: boolean;
  searchMethod: string; // default: 'keyword', could be 'vector' later
  responseTimeMs?: number;
  userSatisfied?: boolean;
  
  // Metadata
  metadata: string; // JSON serialized object
  createdAt: Date;
  
  // Agent information
  agentId?: string; // Which agent performed this search
  conversationId?: string;
  
  // GDPR compliance
  ttl?: number; // 30 days
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
 * Utility functions for Azure Table Storage operations
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
   * Generate sortable row key with timestamp
   */
  static getSortableRowKey(timestamp: Date, suffix?: string): string {
    const sortableTimestamp = timestamp.toISOString().replace(/[:.]/g, '');
    return suffix ? `${sortableTimestamp}-${suffix}` : sortableTimestamp;
  }
  
  /**
   * Convert existing Supabase ConversationState to Table Storage entity
   */
  static convertConversationStateToEntity(state: ConversationState): Omit<ConversationStateEntity, 'partitionKey' | 'rowKey'> {
    return {
      ...state,
      userContactInfo: state.userContactInfo ? JSON.stringify(state.userContactInfo) : undefined,
      topics: JSON.stringify(state.topics),
      context: state.context ? JSON.stringify(state.context) : undefined,
      ttl: this.generateTTL(30) // 30 days GDPR compliance
    };
  }
  
  /**
   * Convert Table Storage entity back to ConversationState
   */
  static convertEntityToConversationState(entity: ConversationStateEntity): ConversationState {
    return {
      ...entity,
      userContactInfo: entity.userContactInfo ? JSON.parse(entity.userContactInfo) : undefined,
      topics: JSON.parse(entity.topics || '[]'),
      context: entity.context ? JSON.parse(entity.context) : undefined
    } as ConversationState;
  }
}

/**
 * Export all schema types and utilities
 */
export {
  BaseEntity,
  ConversationStateEntity,
  PiFContentEntity,
  SearchLogEntity,
  AzureTableStorageConfig,
  AzureTableStorageUtils
};