/**
 * Azure AI Search Service with Hybrid Text + Vector Search
 * Ultra-cheap architecture using Azure AI Search Free Tier for both text and vector search
 */

import { SearchClient, SearchIndexClient, AzureKeyCredential, SearchIndex, SearchDocument } from '@azure/search-documents';
import OpenAI from 'openai';

/**
 * Healthcare content document for Azure AI Search
 */
interface HealthcareSearchDocument extends SearchDocument {
  id: string;
  chunkId: string;
  title: string;
  content: string;
  contentType: string;
  priorityLevel: 'critical' | 'high' | 'medium' | 'low';
  sourceUrl: string;
  pageNumber?: number;
  relevanceKeywords: string[];
  medicalCategories: string[];
  
  // Vector field for semantic search
  contentVector?: number[]; // Embedding vector
  
  // Metadata
  createdAt: Date;
  lastUpdated: Date;
}

/**
 * Search result with relevance scoring
 */
interface HealthcareSearchResult {
  document: HealthcareSearchDocument;
  score: number;
  highlights?: Record<string, string[]>;
  captions?: Array<{
    text: string;
    highlights: string;
  }>;
}

/**
 * Hybrid search configuration
 */
interface HybridSearchOptions {
  query: string;
  vectorQuery?: number[];
  top?: number;
  skip?: number;
  searchMode?: 'any' | 'all';
  includeTotalCount?: boolean;
  facets?: string[];
  filter?: string;
  orderBy?: string[];
  select?: string[];
  searchFields?: string[];
  highlightFields?: string[];
  highlightPreTag?: string;
  highlightPostTag?: string;
  minimumCoverage?: number;
  queryType?: 'simple' | 'full' | 'semantic';
}

/**
 * Azure AI Search Service for Healthcare Content
 */
export class AzureAISearchService {
  private searchClient: SearchClient<HealthcareSearchDocument>;
  private indexClient: SearchIndexClient;
  private openai: OpenAI;
  private readonly indexName: string = 'healthcare-content';
  
  constructor(
    private config: {
      searchEndpoint: string;
      searchApiKey: string;
      openaiApiKey: string;
      openaiEndpoint?: string;
    }
  ) {
    // Initialize Azure AI Search clients
    const credential = new AzureKeyCredential(this.config.searchApiKey);
    this.searchClient = new SearchClient<HealthcareSearchDocument>(
      this.config.searchEndpoint,
      this.indexName,
      credential
    );
    this.indexClient = new SearchIndexClient(this.config.searchEndpoint, credential);
    
    // Initialize OpenAI for embeddings
    this.openai = new OpenAI({
      apiKey: this.config.openaiApiKey,
      baseURL: this.config.openaiEndpoint
    });
  }
  
  /**
   * Initialize the Azure AI Search index with hybrid search capabilities
   */
  async initializeIndex(): Promise<void> {
    console.log('🔍 Initializing Azure AI Search index with vector support...');
    
    const indexDefinition: SearchIndex = {
      name: this.indexName,
      fields: [
        { name: 'id', type: 'Edm.String', key: true, sortable: false },
        { name: 'chunkId', type: 'Edm.String', searchable: false, filterable: true },
        { name: 'title', type: 'Edm.String', searchable: true, filterable: false, sortable: false },
        { name: 'content', type: 'Edm.String', searchable: true, filterable: false, sortable: false },
        { name: 'contentType', type: 'Edm.String', searchable: false, filterable: true, facetable: true },
        { name: 'priorityLevel', type: 'Edm.String', searchable: false, filterable: true, facetable: true },
        { name: 'sourceUrl', type: 'Edm.String', searchable: false, filterable: false, sortable: false },
        { name: 'pageNumber', type: 'Edm.Int32', searchable: false, filterable: true, sortable: true },
        { name: 'relevanceKeywords', type: 'Collection(Edm.String)', searchable: true, filterable: true, facetable: true },
        { name: 'medicalCategories', type: 'Collection(Edm.String)', searchable: true, filterable: true, facetable: true },
        { name: 'createdAt', type: 'Edm.DateTimeOffset', searchable: false, filterable: true, sortable: true },
        { name: 'lastUpdated', type: 'Edm.DateTimeOffset', searchable: false, filterable: true, sortable: true },
        
        // Vector field for semantic search
        {
          name: 'contentVector',
          type: 'Collection(Edm.Single)',
          searchable: true,
          vectorSearchDimensions: 1536, // text-embedding-ada-002 dimensions
          vectorSearchProfileName: 'healthcare-vector-profile'
        }
      ],
      
      // Vector search configuration
      vectorSearch: {
        profiles: [{
          name: 'healthcare-vector-profile',
          algorithm: 'healthcare-hnsw-algorithm'
        }],
        algorithms: [{
          name: 'healthcare-hnsw-algorithm',
          kind: 'hnsw',
          hnswParameters: {
            metric: 'cosine',
            m: 4,
            efConstruction: 400,
            efSearch: 500
          }
        }]
      },
      
      // Semantic configuration for enhanced search
      semanticSearch: {
        configurations: [{
          name: 'healthcare-semantic-config',
          prioritizedFields: {
            titleField: { fieldName: 'title' },
            prioritizedContentFields: [
              { fieldName: 'content' }
            ],
            prioritizedKeywordsFields: [
              { fieldName: 'relevanceKeywords' },
              { fieldName: 'medicalCategories' }
            ]
          }
        }]
      }
    };
    
    try {
      await this.indexClient.createOrUpdateIndex(indexDefinition);
      console.log('✅ Azure AI Search index created/updated successfully');
    } catch (error) {
      console.error('❌ Error creating search index:', error);
      throw error;
    }
  }
  
  /**
   * Generate embedding vector for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000), // Limit input length
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ Error generating embedding:', error);
      throw error;
    }
  }
  
  /**
   * Index healthcare content with vector embeddings
   */
  async indexHealthcareContent(documents: Omit<HealthcareSearchDocument, 'contentVector'>[]): Promise<void> {
    console.log(`📚 Indexing ${documents.length} healthcare documents with embeddings...`);
    
    const documentsWithVectors: HealthcareSearchDocument[] = [];
    
    for (const doc of documents) {
      try {
        // Generate embedding for content
        console.log(`🧮 Generating embedding for: ${doc.title.substring(0, 50)}...`);
        const contentVector = await this.generateEmbedding(doc.content);
        
        documentsWithVectors.push({
          ...doc,
          contentVector
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.warn(`⚠️ Failed to generate embedding for ${doc.id}:`, error);
        // Index without vector if embedding fails
        documentsWithVectors.push({
          ...doc,
          contentVector: undefined
        });
      }
    }
    
    try {
      const result = await this.searchClient.uploadDocuments(documentsWithVectors);
      const succeeded = result.results.filter(r => r.succeeded).length;
      const failed = result.results.filter(r => !r.succeeded).length;
      
      console.log(`✅ Indexed ${succeeded} documents successfully`);
      if (failed > 0) {
        console.warn(`⚠️ Failed to index ${failed} documents`);
      }
    } catch (error) {
      console.error('❌ Error uploading documents:', error);
      throw error;
    }
  }
  
  /**
   * Perform hybrid search (text + vector)
   */
  async hybridSearch(options: HybridSearchOptions): Promise<{
    results: HealthcareSearchResult[];
    totalCount?: number;
    facets?: Record<string, Array<{ value: string; count: number }>>;
  }> {
    try {
      const searchOptions: any = {
        top: options.top || 10,
        skip: options.skip || 0,
        searchMode: options.searchMode || 'any',
        includeTotalCount: options.includeTotalCount || false,
        queryType: options.queryType || 'semantic',
        semanticConfiguration: 'healthcare-semantic-config',
        select: options.select,
        searchFields: options.searchFields,
        filter: options.filter,
        facets: options.facets,
        orderBy: options.orderBy,
        highlightFields: options.highlightFields,
        highlightPreTag: options.highlightPreTag || '<mark>',
        highlightPostTag: options.highlightPostTag || '</mark>',
        captions: 'extractive',
        answers: 'extractive'
      };
      
      // Add vector search if vector query provided
      if (options.vectorQuery) {
        searchOptions.vectors = [{
          value: options.vectorQuery,
          kNearestNeighborsCount: options.top || 10,
          fields: 'contentVector'
        }];
      }
      
      const searchResults = await this.searchClient.search(options.query, searchOptions);
      
      const results: HealthcareSearchResult[] = [];
      let totalCount: number | undefined;
      let facets: Record<string, Array<{ value: string; count: number }>> | undefined;
      
      for await (const result of searchResults.results) {
        results.push({
          document: result.document,
          score: result.score || 0,
          highlights: result.highlights,
          captions: result.captions
        });
      }
      
      if (searchResults.count !== undefined) {
        totalCount = searchResults.count;
      }
      
      if (searchResults.facets) {
        facets = {};
        for (const [key, value] of Object.entries(searchResults.facets)) {
          facets[key] = value.map((item: any) => ({
            value: item.value,
            count: item.count
          }));
        }
      }
      
      return { results, totalCount, facets };
    } catch (error) {
      console.error('❌ Error performing hybrid search:', error);
      throw error;
    }
  }
  
  /**
   * Perform semantic search for healthcare queries
   */
  async searchHealthcareContent(
    query: string,
    options: {
      useVector?: boolean;
      priorityLevels?: ('critical' | 'high' | 'medium' | 'low')[];
      medicalCategories?: string[];
      contentTypes?: string[];
      top?: number;
    } = {}
  ): Promise<HealthcareSearchResult[]> {
    console.log(`🔍 Searching for: "${query}"`);
    
    const searchOptions: HybridSearchOptions = {
      query,
      top: options.top || 5,
      queryType: 'semantic',
      highlightFields: ['content', 'title'],
      select: ['id', 'chunkId', 'title', 'content', 'sourceUrl', 'priorityLevel', 'medicalCategories']
    };
    
    // Add filters
    const filters: string[] = [];
    if (options.priorityLevels) {
      const priorityFilter = options.priorityLevels.map(p => `priorityLevel eq '${p}'`).join(' or ');
      filters.push(`(${priorityFilter})`);
    }
    if (options.medicalCategories) {
      const categoryFilter = options.medicalCategories.map(c => `medicalCategories/any(cat: cat eq '${c}')`).join(' or ');
      filters.push(`(${categoryFilter})`);
    }
    if (options.contentTypes) {
      const typeFilter = options.contentTypes.map(t => `contentType eq '${t}'`).join(' or ');
      filters.push(`(${typeFilter})`);
    }
    
    if (filters.length > 0) {
      searchOptions.filter = filters.join(' and ');
    }
    
    // Add vector search if requested
    if (options.useVector) {
      try {
        searchOptions.vectorQuery = await this.generateEmbedding(query);
      } catch (error) {
        console.warn('⚠️ Failed to generate query embedding, falling back to text search only');
      }
    }
    
    const { results } = await this.hybridSearch(searchOptions);
    return results;
  }
  
  /**
   * Get healthcare content by priority for crisis scenarios
   */
  async getCriticalHealthcareContent(query: string): Promise<HealthcareSearchResult[]> {
    return this.searchHealthcareContent(query, {
      priorityLevels: ['critical', 'high'],
      useVector: true,
      top: 3
    });
  }
  
  /**
   * Get index statistics for monitoring
   */
  async getIndexStatistics(): Promise<{
    documentCount: number;
    storageSize: number;
    indexSizeMB: number;
  }> {
    try {
      const index = await this.indexClient.getIndex(this.indexName);
      const stats = await this.indexClient.getIndexStatistics(this.indexName);
      
      return {
        documentCount: stats.documentCount,
        storageSize: stats.storageSize,
        indexSizeMB: Math.round(stats.storageSize / (1024 * 1024) * 100) / 100
      };
    } catch (error) {
      console.error('❌ Error getting index statistics:', error);
      throw error;
    }
  }
  
  /**
   * Migrate existing PiF content from Supabase to Azure AI Search
   */
  async migrateFromSupabase(supabaseUrl: string, supabaseKey: string): Promise<void> {
    console.log('📦 Starting migration from Supabase to Azure AI Search...');
    
    try {
      // Import Supabase client dynamically to avoid dependency issues
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Fetch existing PiF content chunks
      const { data: chunks, error } = await supabase
        .from('pif_content_chunks')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        throw new Error(`Failed to fetch Supabase content: ${error.message}`);
      }
      
      if (!chunks || chunks.length === 0) {
        console.log('📄 No content found in Supabase to migrate');
        return;
      }
      
      console.log(`📚 Found ${chunks.length} content chunks to migrate`);
      
      // Transform Supabase chunks to Azure AI Search documents
      const azureDocuments: Omit<HealthcareSearchDocument, 'contentVector'>[] = chunks.map(chunk => ({
        id: chunk.id,
        chunkId: chunk.chunk_id,
        title: chunk.title || 'Untitled',
        content: chunk.content,
        contentType: chunk.content_type || 'medical_information',
        priorityLevel: chunk.priority_level || 'medium',
        sourceUrl: chunk.source_url,
        pageNumber: chunk.page_number,
        relevanceKeywords: chunk.relevance_keywords || [],
        medicalCategories: chunk.medical_categories || [],
        createdAt: new Date(chunk.created_at),
        lastUpdated: new Date(chunk.created_at)
      }));
      
      // Index the migrated content with embeddings
      await this.indexHealthcareContent(azureDocuments);
      
      console.log(`✅ Successfully migrated ${chunks.length} documents to Azure AI Search`);
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }
  
  /**
   * Validate search index health and configuration
   */
  async validateIndexHealth(): Promise<{
    isHealthy: boolean;
    indexExists: boolean;
    documentCount: number;
    vectorFieldConfigured: boolean;
    semanticConfigured: boolean;
    issues: string[];
  }> {
    console.log('🔍 Validating Azure AI Search index health...');
    
    const issues: string[] = [];
    let indexExists = false;
    let documentCount = 0;
    let vectorFieldConfigured = false;
    let semanticConfigured = false;
    
    try {
      // Check if index exists
      const index = await this.indexClient.getIndex(this.indexName);
      indexExists = true;
      console.log('✅ Index exists');
      
      // Check vector field configuration
      const vectorField = index.fields?.find(f => f.name === 'contentVector');
      if (vectorField && vectorField.vectorSearchDimensions === 1536) {
        vectorFieldConfigured = true;
        console.log('✅ Vector field properly configured');
      } else {
        issues.push('Vector field not properly configured');
        console.warn('⚠️ Vector field missing or misconfigured');
      }
      
      // Check semantic configuration
      if (index.semanticSearch?.configurations?.length > 0) {
        semanticConfigured = true;
        console.log('✅ Semantic search configured');
      } else {
        issues.push('Semantic search not configured');
        console.warn('⚠️ Semantic search not configured');
      }
      
      // Check document count
      const stats = await this.indexClient.getIndexStatistics(this.indexName);
      documentCount = stats.documentCount;
      
      if (documentCount === 0) {
        issues.push('No documents indexed');
        console.warn('⚠️ Index is empty');
      } else {
        console.log(`✅ Index contains ${documentCount} documents`);
      }
      
    } catch (error) {
      issues.push(`Index access error: ${error.message}`);
      console.error('❌ Index health check failed:', error);
    }
    
    const isHealthy = issues.length === 0 && indexExists && documentCount > 0;
    
    console.log(`🏥 Index health status: ${isHealthy ? 'HEALTHY' : 'NEEDS ATTENTION'}`);
    if (issues.length > 0) {
      console.log('⚠️ Issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    return {
      isHealthy,
      indexExists,
      documentCount,
      vectorFieldConfigured,
      semanticConfigured,
      issues
    };
  }
  
  /**
   * Batch operations with retry logic for reliability
   */
  async retryOperation<T>(
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
   * Clear all documents from index (for testing/development)
   */
  async clearIndex(): Promise<void> {
    console.log('🗑️ Clearing Azure AI Search index...');
    
    try {
      // Get all document IDs
      const searchResults = await this.searchClient.search('*', {
        select: ['id'],
        top: 1000
      });
      
      const documentIds: string[] = [];
      for await (const result of searchResults.results) {
        documentIds.push(result.document.id);
      }
      
      if (documentIds.length === 0) {
        console.log('📄 Index is already empty');
        return;
      }
      
      // Delete all documents
      const documentsToDelete = documentIds.map(id => ({ id }));
      await this.searchClient.deleteDocuments(documentsToDelete);
      
      console.log(`✅ Cleared ${documentIds.length} documents from index`);
      
    } catch (error) {
      console.error('❌ Error clearing index:', error);
      throw error;
    }
  }
  
  /**
   * Test search functionality with sample queries
   */
  async runSearchTests(): Promise<{
    textSearchWorks: boolean;
    vectorSearchWorks: boolean;
    semanticSearchWorks: boolean;
    results: Array<{
      testName: string;
      success: boolean;
      resultCount: number;
      executionTimeMs: number;
      error?: string;
    }>;
  }> {
    console.log('🧪 Running Azure AI Search functionality tests...');
    
    const testResults: Array<{
      testName: string;
      success: boolean;
      resultCount: number;
      executionTimeMs: number;
      error?: string;
    }> = [];
    
    const testQueries = [
      { name: 'Basic Text Search', query: 'cancer', useVector: false },
      { name: 'Vector Search', query: 'women health screening', useVector: true },
      { name: 'Semantic Search', query: 'What are symptoms of ovarian cancer?', useVector: false }
    ];
    
    let textSearchWorks = false;
    let vectorSearchWorks = false;
    let semanticSearchWorks = false;
    
    for (const testQuery of testQueries) {
      const startTime = Date.now();
      
      try {
        const results = await this.searchHealthcareContent(testQuery.query, {
          useVector: testQuery.useVector,
          top: 3
        });
        
        const executionTimeMs = Date.now() - startTime;
        const success = results.length > 0;
        
        testResults.push({
          testName: testQuery.name,
          success,
          resultCount: results.length,
          executionTimeMs
        });
        
        if (testQuery.name === 'Basic Text Search' && success) textSearchWorks = true;
        if (testQuery.name === 'Vector Search' && success) vectorSearchWorks = true;
        if (testQuery.name === 'Semantic Search' && success) semanticSearchWorks = true;
        
        console.log(`${success ? '✅' : '❌'} ${testQuery.name}: ${results.length} results in ${executionTimeMs}ms`);
        
      } catch (error) {
        const executionTimeMs = Date.now() - startTime;
        
        testResults.push({
          testName: testQuery.name,
          success: false,
          resultCount: 0,
          executionTimeMs,
          error: error.message
        });
        
        console.log(`❌ ${testQuery.name} failed: ${error.message}`);
      }
    }
    
    return {
      textSearchWorks,
      vectorSearchWorks,
      semanticSearchWorks,
      results: testResults
    };
  }
}

// Export types
export {
  HealthcareSearchDocument,
  HealthcareSearchResult,
  HybridSearchOptions
};