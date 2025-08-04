import { SearchService } from './SearchService';
import { 
  ContentChunk, 
  SearchResponse, 
  DocumentProcessingResult,
  ContentValidationError,
  SourceUrlMissingError,
  InvalidSourceUrlError,
  ContentChunkSchema,
  SearchResponseSchema
} from '../types/content';
import { logger } from '../utils/logger';

/**
 * ContentService handles RAG (Retrieval-Augmented Generation) operations
 * with MANDATORY source URL validation for every piece of content.
 * 
 * CRITICAL: Every content chunk MUST have a verifiable source URL 
 * linking back to eveappeal.org.uk
 */
export class ContentService {
  private readonly EVE_APPEAL_DOMAIN = 'https://eveappeal.org.uk';

  constructor(private readonly searchService: SearchService) {}

  /**
   * Search for health content with semantic search capabilities
   * ENFORCES source URL validation on all results
   */
  async searchContent(query: string): Promise<SearchResponse> {
    try {
      logger.info('Searching content', { query });

      // 1. Perform semantic search with high relevance
      const searchResults = await this.searchService.search(query, {
        queryType: 'semantic',
        top: 5,
        select: ['content', 'source', 'sourceUrl', 'sourcePage', 'title']
      });

      if (searchResults.results.length === 0) {
        logger.info('No search results found', { query });
        return {
          found: false,
          content: '',
          source: '',
          sourceUrl: ''
        };
      }

      const topResult = searchResults.results[0];
      const document = topResult.document;

      // 2. CRITICAL: Validate source URL exists
      if (!document.sourceUrl) {
        const error = new SourceUrlMissingError(document.id);
        logger.error('Content without source URL found', { 
          contentId: document.id,
          error: error.message 
        });
        throw error;
      }

      // 3. CRITICAL: Validate source URL is from Eve Appeal domain
      if (!this.isValidEveAppealUrl(document.sourceUrl)) {
        const error = new InvalidSourceUrlError(document.sourceUrl, document.id);
        logger.error('Invalid source URL found', {
          contentId: document.id,
          sourceUrl: document.sourceUrl,
          error: error.message
        });
        throw error;
      }

      // 4. Generate response with source attribution
      const response: SearchResponse = {
        found: true,
        content: document.content,
        source: document.source,
        sourceUrl: document.sourceUrl,
        sourcePage: document.sourcePage,
        relevanceScore: topResult.score,
        title: document.title
      };

      // Validate response schema
      const validatedResponse = SearchResponseSchema.parse(response);
      
      logger.info('Content search successful', {
        query,
        sourceUrl: validatedResponse.sourceUrl,
        relevanceScore: validatedResponse.relevanceScore
      });

      return validatedResponse;

    } catch (error) {
      if (error instanceof ContentValidationError) {
        throw error; // Re-throw validation errors
      }
      
      logger.error('Search error', { query, error });
      throw error;
    }
  }

  /**
   * Validate a content chunk meets all requirements
   * ENFORCES mandatory source URL validation
   */
  validateContentChunk(chunk: ContentChunk): void {
    try {
      // Use Zod schema for comprehensive validation
      ContentChunkSchema.parse(chunk);
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const zodError = error as any;
        const sourceUrlIssues = zodError.issues.filter((issue: any) => 
          issue.path.includes('sourceUrl')
        );

        if (sourceUrlIssues.length > 0) {
          const issue = sourceUrlIssues[0];
          if (issue.message.includes('Required')) {
            throw new SourceUrlMissingError(chunk.id);
          } else if (issue.message.includes('eveappeal.org.uk')) {
            throw new InvalidSourceUrlError(chunk.sourceUrl || '', chunk.id);
          }
        }
      }
      throw error;
    }

    // Additional explicit checks for clarity
    if (!chunk.sourceUrl) {
      throw new SourceUrlMissingError(chunk.id);
    }

    if (!this.isValidEveAppealUrl(chunk.sourceUrl)) {
      throw new InvalidSourceUrlError(chunk.sourceUrl, chunk.id);
    }
  }

  /**
   * Index content chunks after validation
   * REQUIRES all chunks to have valid source URLs
   */
  async indexContent(chunks: ContentChunk[]): Promise<DocumentProcessingResult> {
    try {
      logger.info('Indexing content chunks', { count: chunks.length });

      // 1. CRITICAL: Validate every chunk before indexing
      for (const chunk of chunks) {
        this.validateContentChunk(chunk);
      }

      // 2. Index validated chunks
      const indexResult = await this.searchService.indexDocuments(chunks);

      const result: DocumentProcessingResult = {
        success: indexResult.success,
        chunksCreated: indexResult.indexed,
        sourceUrl: chunks.length > 0 ? chunks[0]!.sourceUrl : '',
        errors: indexResult.errors
      };

      logger.info('Content indexing completed', {
        success: result.success,
        chunksCreated: result.chunksCreated,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      logger.error('Content indexing failed', { error, chunkCount: chunks.length });
      throw error;
    }
  }

  /**
   * Validate that a URL is from the Eve Appeal domain
   */
  private isValidEveAppealUrl(url: string): boolean {
    try {
      return url.startsWith(this.EVE_APPEAL_DOMAIN);
    } catch {
      return false;
    }
  }
}