import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ContentService, SearchResponse } from '../types';
import { Logger } from '../utils/logger';

export interface PiFDocument {
  id: string;
  filename: string;
  title: string;
  source_url: string;
  document_type: string;
  last_reviewed: string;
  pif_approved: boolean;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
}

export interface PiFContentChunk {
  id: string;
  document_id: string;
  chunk_id: string;
  title: string;
  content: string;
  content_type: string;
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  source_url: string;
  page_number?: number;
  relevance_keywords: string[];
  medical_categories: string[];
  created_at: string;
  search_vector?: string;
  metadata: Record<string, any>;
}

export interface SearchResult {
  chunk_id: string;
  title: string;
  content: string;
  source_url: string;
  relevance_score: number;
  content_type: string;
  priority_level: string;
  medical_categories: string[];
}

/**
 * ContentService implementation using Supabase for PiF content retrieval
 * Provides RAG (Retrieval Augmented Generation) for Ask Eve Assist
 * Replaces Azure AI Search with cost-effective Supabase full-text search
 */
export class SupabaseContentService implements ContentService {
  private supabase: SupabaseClient;
  private logger: Logger;
  private initialized = false;

  constructor(supabaseUrl: string, supabaseKey: string, logger: Logger) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      // Test connection by checking if tables exist
      const { error } = await this.supabase
        .from('pif_documents')
        .select('count')
        .limit(1);

      if (error) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }

      this.initialized = true;
      this.logger.info('SupabaseContentService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SupabaseContentService:', error);
      throw new Error('Supabase content service initialization failed');
    }
  }

  async searchContent(query: string): Promise<SearchResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const startTime = Date.now();
      const cleanedQuery = this.cleanQuery(query);
      
      if (!cleanedQuery) {
        return { found: false };
      }

      // Determine search strategy based on query
      const searchStrategy = this.determineSearchStrategy(cleanedQuery);
      let searchResults: SearchResult[] = [];

      switch (searchStrategy) {
        case 'emergency':
          searchResults = await this.searchEmergencyContent(cleanedQuery);
          break;
        case 'symptoms':
          searchResults = await this.searchSymptomContent(cleanedQuery);
          break;
        case 'screening':
          searchResults = await this.searchScreeningContent(cleanedQuery);
          break;
        default:
          searchResults = await this.searchGeneralContent(cleanedQuery);
      }

      // Log search analytics
      await this.logSearchAnalytics(cleanedQuery, searchResults, Date.now() - startTime);

      if (searchResults.length === 0) {
        this.logger.info('No relevant PiF content found', { query: cleanedQuery });
        return { found: false };
      }

      const bestMatch = searchResults[0];
      
      this.logger.info('Found relevant PiF content', {
        query: cleanedQuery,
        chunkId: bestMatch.chunk_id,
        relevanceScore: bestMatch.relevance_score,
        contentType: bestMatch.content_type
      });

      return {
        found: true,
        content: this.enhanceContent(bestMatch.content, bestMatch.content_type),
        source: this.extractDocumentTitle(bestMatch.title),
        sourceUrl: bestMatch.source_url,
        relevanceScore: bestMatch.relevance_score,
        metadata: {
          bestMatchSource: this.extractDocumentTitle(bestMatch.title),
          contentType: bestMatch.content_type,
          priorityLevel: bestMatch.priority_level,
          medicalCategories: bestMatch.medical_categories,
          chunkId: bestMatch.chunk_id
        }
      };

    } catch (error) {
      this.logger.error('Supabase content search failed', { error, query });
      return { found: false };
    }
  }

  private cleanQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 200);
  }

  private determineSearchStrategy(query: string): string {
    if (this.isEmergencyQuery(query)) {
      return 'emergency';
    }
    if (this.isSymptomQuery(query)) {
      return 'symptoms';
    }
    if (this.isScreeningQuery(query)) {
      return 'screening';
    }
    return 'general';
  }

  private isEmergencyQuery(query: string): boolean {
    const emergencyKeywords = ['emergency', 'urgent', '999', 'crisis', 'immediately', 'serious'];
    return emergencyKeywords.some(keyword => query.includes(keyword));
  }

  private isSymptomQuery(query: string): boolean {
    const symptomKeywords = ['symptom', 'symptoms', 'signs', 'pain', 'bleeding', 'discharge', 'lump'];
    return symptomKeywords.some(keyword => query.includes(keyword));
  }

  private isScreeningQuery(query: string): boolean {
    const screeningKeywords = ['screening', 'test', 'examination', 'check', 'smear'];
    return screeningKeywords.some(keyword => query.includes(keyword));
  }

  private async searchEmergencyContent(query: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase
      .rpc('search_medical_content', {
        query_text: query,
        limit_results: 5,
        content_types: ['emergency', 'when_to_see_gp'],
        priority_filter: 'critical'
      });

    if (error) {
      this.logger.error('Emergency content search failed:', { error: new Error(error.message || 'Unknown error') });
      return [];
    }

    return data || [];
  }

  private async searchSymptomContent(query: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase
      .rpc('search_medical_content', {
        query_text: query,
        limit_results: 5,
        content_types: ['symptoms', 'when_to_see_gp'],
        priority_filter: 'high'
      });

    if (error) {
      this.logger.error('Symptom content search failed:', { error: new Error(error.message || 'Unknown error') });
      return [];
    }

    return data || [];
  }

  private async searchScreeningContent(query: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase
      .rpc('search_medical_content', {
        query_text: query,
        limit_results: 5,
        content_types: ['screening', 'medical_information'],
        priority_filter: null
      });

    if (error) {
      this.logger.error('Screening content search failed:', { error: new Error(error.message || 'Unknown error') });
      return [];
    }

    return data || [];
  }

  private async searchGeneralContent(query: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase
      .rpc('search_medical_content', {
        query_text: query,
        limit_results: 5,
        content_types: null,
        priority_filter: null
      });

    if (error) {
      this.logger.error('General content search failed:', { error: new Error(error.message || 'Unknown error') });
      return [];
    }

    return data || [];
  }

  private enhanceContent(content: string, contentType: string): string {
    // Add contextual enhancements based on content type
    switch (contentType) {
      case 'emergency':
        return `🚨 IMPORTANT: ${content}\n\nIf this is an emergency, call 999 immediately.`;
      
      case 'when_to_see_gp':
        return `📋 Medical Advice: ${content}\n\nPlease consult your GP or healthcare provider for personalized medical guidance.`;
      
      case 'symptoms':
        return `🔍 Symptoms Information: ${content}\n\nIf you're experiencing any concerning symptoms, please contact your healthcare provider.`;
      
      case 'screening':
        return `🏥 Screening Information: ${content}\n\nRegular screening is important for early detection. Discuss with your healthcare provider.`;
      
      default:
        return content;
    }
  }

  private extractDocumentTitle(chunkTitle: string): string {
    // Extract main document title from chunk title
    const parts = chunkTitle.split(' - ');
    return parts[0] || chunkTitle;
  }

  private async logSearchAnalytics(
    query: string,
    results: SearchResult[],
    responseTimeMs: number
  ): Promise<void> {
    try {
      const matchedChunks = results.map(r => r.chunk_id);
      
      await this.supabase
        .from('content_search_logs')
        .insert({
          query,
          matched_chunks: matchedChunks,
          response_generated: results.length > 0,
          search_method: 'supabase_fulltext',
          response_time_ms: responseTimeMs,
          metadata: {
            resultCount: results.length,
            searchStrategy: this.determineSearchStrategy(query)
          }
        });
    } catch (error) {
      this.logger.warn('Failed to log search analytics:', error);
    }
  }

  // Additional methods for content management

  async getDocumentsByType(documentType: string): Promise<PiFDocument[]> {
    const { data, error } = await this.supabase
      .from('pif_documents')
      .select('*')
      .eq('document_type', documentType)
      .order('last_reviewed', { ascending: false });

    if (error) {
      this.logger.error('Failed to get documents by type:', { error: new Error(error.message || 'Unknown error') });
      return [];
    }

    return data || [];
  }

  async getChunksByCategory(category: string): Promise<PiFContentChunk[]> {
    const { data, error } = await this.supabase
      .from('pif_content_chunks')
      .select('*')
      .contains('medical_categories', [category])
      .order('priority_level', { ascending: true });

    if (error) {
      this.logger.error('Failed to get chunks by category:', { error: new Error(error.message || 'Unknown error') });
      return [];
    }

    return data || [];
  }

  async getContentAnalytics(): Promise<any> {
    const { data, error } = await this.supabase
      .from('content_usage_summary')
      .select('*');

    if (error) {
      this.logger.error('Failed to get content analytics:', { error: new Error(error.message || 'Unknown error') });
      return null;
    }

    return data;
  }
}