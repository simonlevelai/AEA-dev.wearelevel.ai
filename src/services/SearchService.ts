import { 
  SearchClient, 
  SearchIndexClient,
  AzureKeyCredential,
  SearchOptions,
  SearchResult,
  IndexDocumentsResult
} from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { ContentChunk, SearchConfig } from '../types/content';
import { logger } from '../utils/logger';
import searchSchema from '../../config/search-schema.json';

/**
 * Azure AI Search service wrapper
 * Handles all interactions with Azure AI Search for content indexing and retrieval
 */
export class SearchService {
  private readonly searchClient: SearchClient<ContentChunk>;
  private readonly searchIndexClient: SearchIndexClient;
  private readonly config: SearchConfig;

  constructor(config: SearchConfig) {
    this.config = config;

    // Choose authentication method based on API key availability
    const credential = config.apiKey 
      ? new AzureKeyCredential(config.apiKey)
      : new DefaultAzureCredential();

    this.searchClient = new SearchClient<ContentChunk>(
      config.endpoint,
      config.indexName,
      credential
    );

    this.searchIndexClient = new SearchIndexClient(
      config.endpoint,
      credential
    );

    logger.info('SearchService initialized', {
      endpoint: config.endpoint,
      indexName: config.indexName,
      authMethod: config.apiKey ? 'api-key' : 'managed-identity'
    });
  }

  /**
   * Search for content using Azure AI Search semantic capabilities
   */
  async search(
    query: string, 
    options: Partial<SearchOptions> = {}
  ): Promise<{
    results: Array<{ document: ContentChunk; score?: number }>;
    count: number;
  }> {
    try {
      logger.info('Performing search', { query, options });

      const searchOptions: SearchOptions = {
        searchMode: 'any',
        includeTotalCount: true,
        ...options
      };

      const searchResults = await this.searchClient.search(query, searchOptions);
      
      // Convert async iterator to array
      const results: Array<{ document: ContentChunk; score?: number }> = [];
      let count = 0;

      for await (const result of searchResults.results) {
        results.push({
          document: result.document,
          score: result.score
        });
        count++;
      }

      logger.info('Search completed', {
        query,
        resultCount: count,
        totalCount: searchResults.count
      });

      return {
        results,
        count: searchResults.count || count
      };

    } catch (error) {
      logger.error('Search failed', { query, options, error });
      throw error;
    }
  }

  /**
   * Index content chunks into Azure AI Search
   * Uses mergeOrUpload to handle both new and updated content
   */
  async indexDocuments(chunks: ContentChunk[]): Promise<{
    success: boolean;
    indexed: number;
    errors: string[];
  }> {
    try {
      logger.info('Indexing documents', { count: chunks.length });

      if (chunks.length === 0) {
        return { success: true, indexed: 0, errors: [] };
      }

      const result = await this.searchClient.mergeOrUploadDocuments(chunks);
      
      let indexed = 0;
      const errors: string[] = [];

      for (const docResult of result.results) {
        if (docResult.succeeded) {
          indexed++;
        } else {
          errors.push(`${docResult.key}: ${docResult.errorMessage || 'Unknown error'}`);
        }
      }

      const success = errors.length === 0;

      logger.info('Document indexing completed', {
        success,
        totalDocuments: chunks.length,
        indexed,
        failed: errors.length
      });

      return { success, indexed, errors };

    } catch (error) {
      logger.error('Document indexing failed', { 
        chunkCount: chunks.length, 
        error 
      });
      throw error;
    }
  }

  /**
   * Create the search index with the proper schema
   */
  async createIndex(): Promise<{
    success: boolean;
    indexName: string;
    error?: string;
  }> {
    try {
      logger.info('Creating search index', { 
        indexName: this.config.indexName 
      });

      const index = await this.searchIndexClient.createIndex(searchSchema);

      logger.info('Search index created successfully', {
        indexName: index.name
      });

      return {
        success: true,
        indexName: index.name
      };

    } catch (error) {
      logger.error('Failed to create search index', { 
        indexName: this.config.indexName,
        error 
      });

      return {
        success: false,
        indexName: this.config.indexName,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete the search index (useful for testing/cleanup)
   */
  async deleteIndex(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.searchIndexClient.deleteIndex(this.config.indexName);
      
      logger.info('Search index deleted', {
        indexName: this.config.indexName
      });

      return { success: true };

    } catch (error) {
      logger.error('Failed to delete search index', {
        indexName: this.config.indexName,
        error
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get statistics about the search index
   */
  async getIndexStatistics(): Promise<{
    documentCount: number;
    storageSize: number;
  }> {
    try {
      const stats = await this.searchIndexClient.getSearchIndexStatistics(
        this.config.indexName
      );

      return {
        documentCount: stats.documentCount,
        storageSize: stats.storageSize
      };

    } catch (error) {
      logger.error('Failed to get index statistics', {
        indexName: this.config.indexName,
        error
      });
      throw error;
    }
  }
}