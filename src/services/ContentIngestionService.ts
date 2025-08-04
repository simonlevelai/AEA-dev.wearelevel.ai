import { OpenAI } from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  IngestionConfig, 
  ProcessingResult, 
  ContentChunk, 
  CrawledPage,
  IngestionConfigSchema,
  ProcessingResultSchema,
  CrawledPageSchema,
  ContentChunkSchema
} from '../types/content';
import { ValidationService } from './ValidationService';
import { SearchService } from './SearchService';
import { logger } from '../utils/logger';

/**
 * ContentIngestionService processes crawled content and creates searchable chunks
 * with embeddings while preserving source URL for every piece of content
 */
export class ContentIngestionService {
  private readonly config: IngestionConfig;
  private readonly openai: OpenAI;
  private readonly documentsDir: string;

  constructor(
    private readonly validationService: ValidationService,
    private readonly searchService: SearchService,
    config: IngestionConfig
  ) {
    this.config = IngestionConfigSchema.parse(config);
    this.openai = new OpenAI({ apiKey: this.config.apiKey });
    this.documentsDir = path.join(process.cwd(), 'content', 'documents');
  }

  /**
   * Process all crawled content files and create indexed chunks
   * ENFORCES source URL validation for every chunk
   */
  async processContent(): Promise<ProcessingResult> {
    try {
      logger.info('Starting content processing and ingestion');

      const result: ProcessingResult = {
        success: true,
        totalFiles: 0,
        chunksCreated: 0,
        errors: []
      };

      // Read all crawled content files
      const files = await fs.readdir(this.documentsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      result.totalFiles = jsonFiles.length;
      logger.info('Found crawled content files', { count: jsonFiles.length });

      if (jsonFiles.length === 0) {
        logger.warn('No content files found to process');
        return result;
      }

      // Process each file and create chunks
      const allChunks: ContentChunk[] = [];

      for (const file of jsonFiles) {
        try {
          const chunks = await this.processSingleFile(file);
          allChunks.push(...chunks);
          logger.debug('Processed content file', { 
            file, 
            chunksCreated: chunks.length 
          });
        } catch (error) {
          const errorMessage = `Failed to process ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMessage);
          logger.error('Failed to process content file', { file, error });
        }
      }

      logger.info('Content chunking completed', { 
        totalChunks: allChunks.length 
      });

      // Validate all chunks have proper source URLs
      const validation = await this.validationService.validateContentChunks(allChunks);
      
      if (validation.invalidChunks.length > 0) {
        const errorMessage = `Invalid content chunks found: ${validation.invalidChunks.length}`;
        result.errors.push(errorMessage);
        result.success = false;
        
        logger.error('Content validation failed', {
          invalidChunks: validation.invalidChunks.length,
          validChunks: validation.validChunks.length
        });

        return ProcessingResultSchema.parse(result);
      }

      // Index all valid chunks
      if (validation.validChunks.length > 0) {
        const indexResult = await this.searchService.indexDocuments(validation.validChunks);
        
        result.chunksCreated = indexResult.indexed;
        result.errors.push(...indexResult.errors);
        
        if (!indexResult.success) {
          result.success = false;
        }

        logger.info('Content indexing completed', {
          indexed: indexResult.indexed,
          errors: indexResult.errors.length
        });
      }

      return ProcessingResultSchema.parse(result);

    } catch (error) {
      logger.error('Content processing failed', { error });
      throw error;
    }
  }

  /**
   * Process a single crawled content file
   */
  private async processSingleFile(filename: string): Promise<ContentChunk[]> {
    const filepath = path.join(this.documentsDir, filename);
    
    try {
      // Read and parse crawled page data
      const fileContent = await fs.readFile(filepath, 'utf-8');
      const crawledData = JSON.parse(fileContent);
      
      // Parse crawledAt back to Date if it's a string
      if (typeof crawledData.crawledAt === 'string') {
        crawledData.crawledAt = new Date(crawledData.crawledAt);
      }
      
      // Validate crawled page schema
      const crawledPage = CrawledPageSchema.parse(crawledData);

      // Create content chunks from the page
      const chunks = this.chunkContent(
        crawledPage.content,
        crawledPage.title,
        crawledPage.sourceUrl
      );

      // Generate embeddings for each chunk
      const chunksWithEmbeddings: ContentChunk[] = [];
      
      for (const chunk of chunks) {
        try {
          const embedding = await this.generateEmbedding(chunk.content);
          
          const chunkWithEmbedding: ContentChunk = {
            ...chunk,
            contentVector: embedding
          };

          // Validate chunk schema
          const validatedChunk = ContentChunkSchema.parse(chunkWithEmbedding);
          chunksWithEmbeddings.push(validatedChunk);
          
        } catch (error) {
          logger.error('Failed to generate embedding for chunk', { 
            chunkId: chunk.id, 
            error 
          });
          throw new Error(`Failed to generate embeddings for ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      logger.debug('Successfully processed file', {
        filename,
        chunks: chunksWithEmbeddings.length,
        sourceUrl: crawledPage.sourceUrl
      });

      return chunksWithEmbeddings;

    } catch (error) {
      logger.error('Failed to process content file', { filename, error });
      throw error;
    }
  }

  /**
   * Split content into chunks while preserving clinical accuracy
   * Each chunk maintains the source URL for proper attribution
   */
  private chunkContent(content: string, title: string, sourceUrl: string): Omit<ContentChunk, 'contentVector'>[] {
    const chunks: Omit<ContentChunk, 'contentVector'>[] = [];
    
    // For shorter content, return as single chunk
    if (content.length <= this.config.maxTokensPerChunk) {
      const chunk: Omit<ContentChunk, 'contentVector'> = {
        id: this.generateChunkId(sourceUrl, 1),
        content: content.trim(),
        title,
        source: 'Eve Appeal Website',
        sourceUrl,
        lastReviewed: new Date()
      };
      
      return [chunk];
    }

    // Split long content into chunks with overlap
    const sentences = this.splitIntoSentences(content);
    let currentChunk = '';
    let chunkNumber = 1;
    let sentenceIndex = 0;

    while (sentenceIndex < sentences.length) {
      const sentence = sentences[sentenceIndex];
      
      // Check if adding this sentence would exceed chunk size
      if (currentChunk.length + sentence.length > this.config.maxTokensPerChunk && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: this.generateChunkId(sourceUrl, chunkNumber),
          content: currentChunk.trim(),
          title,
          source: 'Eve Appeal Website',
          sourceUrl,
          lastReviewed: new Date()
        });

        // Start new chunk with overlap
        currentChunk = this.createOverlappingChunk(currentChunk, this.config.chunkOverlap);
        chunkNumber++;
      }

      currentChunk += sentence + ' ';
      sentenceIndex++;
    }

    // Add the final chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: this.generateChunkId(sourceUrl, chunkNumber),
        content: currentChunk.trim(),
        title,
        source: 'Eve Appeal Website',
        sourceUrl,
        lastReviewed: new Date()
      });
    }

    logger.debug('Content chunked', {
      originalLength: content.length,
      chunks: chunks.length,
      sourceUrl
    });

    return chunks;
  }

  /**
   * Split text into sentences for better chunk boundaries
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries while preserving the punctuation
    return text
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => sentence.trim().length > 0)
      .map(sentence => sentence.trim());
  }

  /**
   * Create overlapping chunk content to maintain context
   */
  private createOverlappingChunk(previousChunk: string, overlapLength: number): string {
    if (overlapLength === 0 || previousChunk.length <= overlapLength) {
      return '';
    }

    // Take the last part of the previous chunk as overlap
    const overlap = previousChunk.slice(-overlapLength);
    
    // Find the start of the last complete sentence within the overlap
    const sentences = this.splitIntoSentences(overlap);
    if (sentences.length > 1) {
      // Return the last complete sentence(s) as overlap
      return sentences.slice(-1).join(' ') + ' ';
    }
    
    return overlap + ' ';
  }

  /**
   * Generate unique chunk ID based on source URL and sequence
   */
  private generateChunkId(sourceUrl: string, chunkNumber: number): string {
    // Extract a meaningful identifier from the URL
    const urlPath = new URL(sourceUrl).pathname;
    const pathParts = urlPath.split('/').filter(part => part.length > 0);
    const identifier = pathParts.join('-').toLowerCase();
    
    return `${identifier}-chunk-${chunkNumber}`;
  }

  /**
   * Generate embeddings using OpenAI API
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.embeddingModel,
        input: text
      });

      const embedding = response.data[0]?.embedding;
      
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI API');
      }

      if (embedding.length !== 1536) {
        throw new Error(`Expected embedding dimension 1536, got ${embedding.length}`);
      }

      return embedding;

    } catch (error) {
      logger.error('Failed to generate embedding', { error, textLength: text.length });
      throw error;
    }
  }

  /**
   * Get statistics about processed content
   */
  async getProcessingStatistics(): Promise<{
    totalFiles: number;
    totalChunks: number;
    averageChunkSize: number;
    sourcesWithoutUrls: number;
  }> {
    try {
      // Get index statistics from search service
      const indexStats = await this.searchService.getIndexStatistics();
      
      // Count files in documents directory
      const files = await fs.readdir(this.documentsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      // Get validation report
      const validationReport = await this.validationService.validateAllSources();

      return {
        totalFiles: jsonFiles.length,
        totalChunks: indexStats.documentCount,
        averageChunkSize: Math.round(indexStats.documentCount > 0 ? indexStats.storageSize / indexStats.documentCount : 0),
        sourcesWithoutUrls: validationReport.missingUrls.length
      };

    } catch (error) {
      logger.error('Failed to get processing statistics', { error });
      throw error;
    }
  }
}