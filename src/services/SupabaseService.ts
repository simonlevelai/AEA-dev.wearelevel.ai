import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Database schema types
const ConversationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  session_id: z.string(),
  title: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  metadata: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
});

const MessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  entities: z.record(z.any()).optional(),
  is_crisis: z.boolean().optional(),
  response_time_ms: z.number().nullable().optional(),
  token_usage: z.record(z.any()).optional(),
  created_at: z.string(),
  metadata: z.record(z.any()).optional()
});

const SafetyIncidentSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  message_id: z.string().uuid(),
  incident_type: z.string(),
  severity_level: z.enum(['low', 'medium', 'high', 'critical']),
  trigger_words: z.array(z.string()).optional(),
  escalated: z.boolean().optional(),
  escalated_at: z.string().optional(),
  resolution_status: z.string().optional(),
  created_at: z.string(),
  metadata: z.record(z.any()).optional()
});

export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type SafetyIncident = z.infer<typeof SafetyIncidentSchema>;

export interface ConversationCreateOptions {
  userId: string;
  sessionId: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface MessageCreateOptions {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  entities?: Record<string, any>;
  isCrisis?: boolean;
  responseTimeMs?: number;
  tokenUsage?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface SafetyIncidentCreateOptions {
  conversationId: string;
  messageId: string;
  incidentType: string;
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
  triggerWords?: string[];
  metadata?: Record<string, any>;
}

export class SupabaseService {
  private supabase: SupabaseClient;
  private initialized = false;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const { error } = await this.supabase
        .from('conversations')
        .select('count')
        .limit(1);

      if (error) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }

      this.initialized = true;
      logger.info('SupabaseService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SupabaseService:', error);
      throw new Error('Supabase service initialization failed');
    }
  }

  async createConversation(options: ConversationCreateOptions): Promise<Conversation> {
    this.ensureInitialized();

    const { data, error } = await this.supabase
      .from('conversations')
      .insert([
        {
          user_id: options.userId,
          session_id: options.sessionId,
          title: options.title,
          metadata: options.metadata || {},
          is_active: true
        }
      ])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create conversation:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    return ConversationSchema.parse(data);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    this.ensureInitialized();

    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      logger.error('Failed to get conversation:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to get conversation: ${error.message}`);
    }

    return ConversationSchema.parse(data);
  }

  async addMessage(options: MessageCreateOptions): Promise<Message> {
    this.ensureInitialized();

    const { data, error } = await this.supabase
      .from('messages')
      .insert([
        {
          conversation_id: options.conversationId,
          role: options.role,
          content: options.content,
          entities: options.entities || {},
          is_crisis: options.isCrisis || false,
          response_time_ms: options.responseTimeMs,
          token_usage: options.tokenUsage || {},
          metadata: options.metadata || {}
        }
      ])
      .select()
      .single();

    if (error) {
      logger.error('Failed to add message:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to add message: ${error.message}`);
    }

    return MessageSchema.parse(data);
  }

  async getConversationMessages(conversationId: string): Promise<Message[]> {
    this.ensureInitialized();

    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to get messages:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to get messages: ${error.message}`);
    }

    return data.map(msg => MessageSchema.parse(msg));
  }

  async recordSafetyIncident(options: SafetyIncidentCreateOptions): Promise<SafetyIncident> {
    this.ensureInitialized();

    const { data, error } = await this.supabase
      .from('safety_incidents')
      .insert([
        {
          conversation_id: options.conversationId,
          message_id: options.messageId,
          incident_type: options.incidentType,
          severity_level: options.severityLevel,
          trigger_words: options.triggerWords || [],
          escalated: false,
          resolution_status: 'open',
          metadata: options.metadata || {}
        }
      ])
      .select()
      .single();

    if (error) {
      logger.error('Failed to record safety incident:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to record safety incident: ${error.message}`);
    }

    return SafetyIncidentSchema.parse(data);
  }

  async escalateSafetyIncident(incidentId: string): Promise<void> {
    this.ensureInitialized();

    const { error } = await this.supabase
      .from('safety_incidents')
      .update({
        escalated: true,
        escalated_at: new Date().toISOString(),
        resolution_status: 'escalated'
      })
      .eq('id', incidentId);

    if (error) {
      logger.error('Failed to escalate safety incident:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to escalate safety incident: ${error.message}`);
    }
  }

  async getActiveCrises(): Promise<SafetyIncident[]> {
    this.ensureInitialized();

    const { data, error } = await this.supabase
      .from('safety_incidents')
      .select('*')
      .in('severity_level', ['high', 'critical'])
      .eq('resolution_status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get active crises:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to get active crises: ${error.message}`);
    }

    return data.map(incident => SafetyIncidentSchema.parse(incident));
  }

  async recordContentAnalytics(query: string, searchResults: number, entities: string[], satisfied?: boolean): Promise<void> {
    this.ensureInitialized();

    const { error } = await this.supabase
      .from('content_analytics')
      .insert([
        {
          query,
          search_results_count: searchResults,
          entities_matched: entities,
          response_generated: searchResults > 0,
          user_satisfied: satisfied
        }
      ]);

    if (error) {
      logger.error('Failed to record content analytics:', { error: new Error(error.message), details: error.details });
      // Don't throw - analytics shouldn't break the main flow
    }
  }

  async cleanupOldConversations(daysOld: number = 30): Promise<number> {
    this.ensureInitialized();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await this.supabase
      .from('conversations')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .eq('is_active', false)
      .select('id');

    if (error) {
      logger.error('Failed to cleanup old conversations:', { error: new Error(error.message), details: error.details });
      throw new Error(`Failed to cleanup conversations: ${error.message}`);
    }

    const deletedCount = data?.length || 0;
    logger.info(`Cleaned up ${deletedCount} old conversations`);
    return deletedCount;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SupabaseService not initialized. Call initialize() first.');
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: string }> {
    try {
      const { error } = await this.supabase
        .from('conversations')
        .select('count')
        .limit(1);

      if (error) {
        return { status: 'unhealthy', details: error.message };
      }

      return { status: 'healthy', details: 'Supabase connection active' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}