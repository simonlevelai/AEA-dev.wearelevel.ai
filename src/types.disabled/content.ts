import { z } from 'zod';

/**
 * Schema for content chunks with mandatory source URL validation
 * Every piece of content MUST have a verifiable source URL from eveappeal.org.uk
 */
export const ContentChunkSchema = z.object({
  id: z.string().min(1, 'Content ID is required'),
  content: z.string().min(1, 'Content is required'),
  title: z.string().min(1, 'Title is required'),
  source: z.string().min(1, 'Source is required'),
  sourceUrl: z.string()
    .url('Source URL must be a valid URL')
    .refine(
      (url) => url.startsWith('https://eveappeal.org.uk'),
      { message: 'Source URL must be from eveappeal.org.uk domain' }
    ),
  sourcePage: z.number().int().positive().optional(),
  lastReviewed: z.date(),
  contentVector: z.array(z.number()).length(1536).optional()
});

export type ContentChunk = z.infer<typeof ContentChunkSchema>;

/**
 * Search response with mandatory source attribution
 */
export const SearchResponseSchema = z.object({
  found: z.boolean(),
  content: z.string(),
  source: z.string(),
  sourceUrl: z.string().url(),
  sourcePage: z.number().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  title: z.string().optional(),
  metadata: z.object({
    bestMatchSource: z.string().optional(),
    contentType: z.string().optional()
  }).optional()
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Document processing result
 */
export const DocumentProcessingResultSchema = z.object({
  success: z.boolean(),
  chunksCreated: z.number().int().nonnegative(),
  sourceUrl: z.string().url(),
  errors: z.array(z.string()).default([])
});

export type DocumentProcessingResult = z.infer<typeof DocumentProcessingResultSchema>;

/**
 * Source URL validation result
 */
export const SourceValidationResultSchema = z.object({
  isValid: z.boolean(),
  url: z.string(),
  errors: z.array(z.string()).default([]),
  isAccessible: z.boolean().optional()
});

export type SourceValidationResult = z.infer<typeof SourceValidationResultSchema>;

/**
 * Website crawl result
 */
export const CrawlResultSchema = z.object({
  pagesChecked: z.number().int().nonnegative(),
  pagesUpdated: z.number().int().nonnegative(),
  newPages: z.number().int().nonnegative(),
  missingUrls: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([])
});

export type CrawlResult = z.infer<typeof CrawlResultSchema>;

/**
 * Content validation report
 */
export const ValidationReportSchema = z.object({
  totalContent: z.number().int().nonnegative(),
  withSourceUrls: z.number().int().nonnegative(),
  missingUrls: z.array(z.string()).default([]),
  invalidUrls: z.array(z.object({
    id: z.string(),
    url: z.string()
  })).default([]),
  brokenLinks: z.array(z.object({
    id: z.string(),
    url: z.string()
  })).default([])
});

export type ValidationReport = z.infer<typeof ValidationReportSchema>;

/**
 * Azure AI Search configuration
 */
export const SearchConfigSchema = z.object({
  endpoint: z.string().url(),
  apiKey: z.string(),
  indexName: z.string().default('askeve-content')
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

/**
 * Website crawl configuration
 */
export const CrawlConfigSchema = z.object({
  baseUrl: z.string().url(),
  rateLimit: z.object({
    maxConcurrent: z.number().int().positive(),
    delayBetweenRequests: z.number().int().nonnegative(),
    respectRobotsTxt: z.boolean(),
    userAgent: z.string().min(1)
  }),
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  contentSelectors: z.object({
    title: z.string(),
    content: z.string(),
    exclude: z.string()
  }),
  validation: z.object({
    minContentLength: z.number().int().positive(),
    maxContentLength: z.number().int().positive(),
    requiredSections: z.array(z.string())
  })
});

export type CrawlConfig = z.infer<typeof CrawlConfigSchema>;

/**
 * Crawled page data
 */
export const CrawledPageSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  content: z.string(),
  sourceUrl: z.string().url(),
  crawledAt: z.date(),
  contentLength: z.number().int().nonnegative(),
  links: z.array(z.string()),
  metadata: z.record(z.any()).optional()
});

export type CrawledPage = z.infer<typeof CrawledPageSchema>;

/**
 * Content ingestion configuration
 */
export const IngestionConfigSchema = z.object({
  apiKey: z.string(),
  embeddingModel: z.string().default('text-embedding-ada-002'),
  maxTokensPerChunk: z.number().int().positive().default(8000),
  chunkOverlap: z.number().int().nonnegative().default(200)
});

export type IngestionConfig = z.infer<typeof IngestionConfigSchema>;

/**
 * Content processing result
 */
export const ProcessingResultSchema = z.object({
  success: z.boolean(),
  totalFiles: z.number().int().nonnegative(),
  chunksCreated: z.number().int().nonnegative(),
  errors: z.array(z.string()).default([])
});

export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;

/**
 * Error types for content pipeline
 */
export class ContentValidationError extends Error {
  constructor(message: string, public readonly _contentId?: string) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

export class SourceUrlMissingError extends ContentValidationError {
  constructor(contentId: string) {
    super(`Missing source URL for content: ${contentId}`, contentId);
    this.name = 'SourceUrlMissingError';
  }
}

export class InvalidSourceUrlError extends ContentValidationError {
  constructor(url: string, contentId?: string) {
    super(`Invalid source URL: ${url}. Must be from eveappeal.org.uk domain`, contentId);
    this.name = 'InvalidSourceUrlError';
  }
}