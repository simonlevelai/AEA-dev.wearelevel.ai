import axios from 'axios';
import { SearchService } from './SearchService';
import { 
  SourceValidationResult, 
  ValidationReport,
  ContentChunk,
  SourceValidationResultSchema,
  ValidationReportSchema
} from '../types/content';
import { logger } from '../utils/logger';

/**
 * ValidationService ensures all content meets source URL requirements
 * CRITICAL: Every piece of content must link back to eveappeal.org.uk
 */
export class ValidationService {
  private readonly EVE_APPEAL_DOMAIN = 'https://eveappeal.org.uk';
  private readonly HTTP_TIMEOUT = 10000; // 10 seconds

  constructor(private readonly searchService: SearchService) {}

  /**
   * Validate a single source URL
   * Checks domain validity and accessibility
   */
  async validateSourceUrl(url: string): Promise<SourceValidationResult> {
    const errors: string[] = [];
    let isAccessible: boolean | undefined;

    try {
      // 1. Check if URL is from Eve Appeal domain
      if (!this.isValidEveAppealUrl(url)) {
        errors.push(`URL must be from ${this.EVE_APPEAL_DOMAIN} domain`);
      }

      // 2. Check if URL is well-formed
      try {
        new URL(url);
      } catch {
        errors.push('URL is not well-formed');
      }

      // 3. Check if URL is accessible (if valid so far)
      if (errors.length === 0) {
        isAccessible = await this.isUrlAccessible(url);
        if (!isAccessible) {
          errors.push('URL is not accessible (404 or network error)');
        }
      }

      const result: SourceValidationResult = {
        isValid: errors.length === 0,
        url,
        errors,
        isAccessible
      };

      // Validate result schema
      return SourceValidationResultSchema.parse(result);

    } catch (error) {
      logger.error('Source URL validation error', { url, error: error as Error });
      
      return {
        isValid: false,
        url,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        isAccessible: false
      };
    }
  }

  /**
   * Validate all content in the search index
   * Ensures every indexed item has a valid source URL
   */
  async validateAllSources(): Promise<ValidationReport> {
    try {
      logger.info('Starting comprehensive source validation');

      const report: ValidationReport = {
        totalContent: 0,
        withSourceUrls: 0,
        missingUrls: [],
        invalidUrls: [],
        brokenLinks: []
      };

      // Get all content from search index
      const searchResults = await this.searchService.search('*', {
        top: 1000, // Adjust based on content volume
        select: ['id', 'sourceUrl']
      });

      report.totalContent = searchResults.count;

      // Validate each content item
      for (const result of searchResults.results) {
        const content = result.document;
        const contentId = content.id;

        if (!content.sourceUrl) {
          report.missingUrls.push(contentId);
          continue;
        }

        // Validate source URL
        const validation = await this.validateSourceUrl(content.sourceUrl);
        
        if (!validation.isValid) {
          if (validation.errors.some(error => error.includes('domain'))) {
            report.invalidUrls.push({
              id: contentId,
              url: content.sourceUrl
            });
          } else if (validation.errors.some(error => error.includes('accessible'))) {
            report.brokenLinks.push({
              id: contentId,
              url: content.sourceUrl
            });
          }
        } else {
          report.withSourceUrls++;
        }

        // Rate limiting to be respectful to the website
        await this.delay(100);
      }

      // Alert if any content lacks source URLs
      if (report.missingUrls.length > 0) {
        await this.alertMissingSourceUrls(report.missingUrls);
      }

      // Validate report schema
      const validatedReport = ValidationReportSchema.parse(report);

      logger.info('Source validation completed', {
        totalContent: validatedReport.totalContent,
        withValidUrls: validatedReport.withSourceUrls,
        missingUrls: validatedReport.missingUrls.length,
        invalidUrls: validatedReport.invalidUrls.length,
        brokenLinks: validatedReport.brokenLinks.length
      });

      return validatedReport;

    } catch (error) {
      logger.error('Source validation failed', { error: error as Error });
      throw error;
    }
  }

  /**
   * Validate content chunks before indexing
   * Ensures all chunks have valid source URLs
   */
  async validateContentChunks(chunks: ContentChunk[]): Promise<{
    validChunks: ContentChunk[];
    invalidChunks: Array<{ chunk: ContentChunk; errors: string[] }>;
  }> {
    const validChunks: ContentChunk[] = [];
    const invalidChunks: Array<{ chunk: ContentChunk; errors: string[] }> = [];

    for (const chunk of chunks) {
      const validation = await this.validateSourceUrl(chunk.sourceUrl);
      
      if (validation.isValid) {
        validChunks.push(chunk);
      } else {
        invalidChunks.push({
          chunk,
          errors: validation.errors
        });
      }
    }

    logger.info('Content chunk validation completed', {
      totalChunks: chunks.length,
      validChunks: validChunks.length,
      invalidChunks: invalidChunks.length
    });

    return { validChunks, invalidChunks };
  }

  /**
   * Check if URL is from Eve Appeal domain
   */
  private isValidEveAppealUrl(url: string): boolean {
    try {
      return url.startsWith(this.EVE_APPEAL_DOMAIN);
    } catch {
      return false;
    }
  }

  /**
   * Check if URL is accessible via HTTP request
   */
  private async isUrlAccessible(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: this.HTTP_TIMEOUT,
        validateStatus: (status) => status < 400
      });
      
      return response.status >= 200 && response.status < 400;
      
    } catch (error) {
      logger.debug('URL accessibility check failed', { url, error });
      return false;
    }
  }

  /**
   * Alert about content missing source URLs
   */
  private async alertMissingSourceUrls(missingIds: string[]): Promise<void> {
    logger.error('CRITICAL: Content found without source URLs', {
      count: missingIds.length,
      contentIds: missingIds.slice(0, 10), // Log first 10 for debugging
      message: 'All content must have verifiable source URLs from eveappeal.org.uk'
    });

    // In production, this could send alerts to monitoring systems
    // For now, we log the critical error
  }

  /**
   * Rate limiting utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate source URL based on content type and location
   */
  generateSourceUrl(options: {
    type: 'website' | 'pdf' | 'pdfPage';
    path?: string;
    filename?: string;
    page?: number;
    topic?: string;
  }): string {
    const { type, path, filename, page, topic } = options;

    switch (type) {
      case 'website':
        return path ? `${this.EVE_APPEAL_DOMAIN}${path}` : this.EVE_APPEAL_DOMAIN;
        
      case 'pdf':
        if (!filename) {
          throw new Error('PDF filename is required');
        }
        return `${this.EVE_APPEAL_DOMAIN}/documents/${filename}`;
        
      case 'pdfPage':
        if (!filename || !page) {
          throw new Error('PDF filename and page number are required');
        }
        return `${this.EVE_APPEAL_DOMAIN}/documents/${filename}#page=${page}`;
        
      default:
        // Fallback to topic-based URL
        const topicPath = topic ? `/information/${topic}` : '/information';
        return `${this.EVE_APPEAL_DOMAIN}${topicPath}`;
    }
  }
}