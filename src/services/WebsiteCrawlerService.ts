import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  CrawlConfig, 
  CrawlResult, 
  CrawledPage,
  CrawlConfigSchema,
  CrawledPageSchema,
  CrawlResultSchema 
} from '../types/content';
import { ValidationService } from './ValidationService';
import { logger } from '../utils/logger';

/**
 * Robots.txt rule implementation
 */
class RobotsTxtRules {
  private rules: Map<string, { allow: string[]; disallow: string[] }> = new Map();

  constructor(robotsContent: string, userAgent: string) {
    this.parseRobots(robotsContent, userAgent);
  }

  private parseRobots(content: string, userAgent: string): void {
    const lines = content.split('\n').map(line => line.trim());
    let currentUserAgent = '';
    let currentRules = { allow: [] as string[], disallow: [] as string[] };

    for (const line of lines) {
      if (line.startsWith('User-agent:')) {
        // Save previous rules if we were tracking them
        if (currentUserAgent && (currentUserAgent === '*' || currentUserAgent === userAgent)) {
          this.rules.set(currentUserAgent, { ...currentRules });
        }
        
        currentUserAgent = line.substring('User-agent:'.length).trim();
        currentRules = { allow: [], disallow: [] };
      } else if (line.startsWith('Allow:')) {
        currentRules.allow.push(line.substring('Allow:'.length).trim());
      } else if (line.startsWith('Disallow:')) {
        currentRules.disallow.push(line.substring('Disallow:'.length).trim());
      }
    }

    // Save the last set of rules
    if (currentUserAgent && (currentUserAgent === '*' || currentUserAgent === userAgent)) {
      this.rules.set(currentUserAgent, currentRules);
    }
  }

  isAllowed(url: string): boolean {
    const path = new URL(url, 'https://example.com').pathname;
    
    // Check user-agent specific rules first, then fall back to *
    const userAgentRules = Array.from(this.rules.keys()).find(ua => ua !== '*');
    const specificRules = userAgentRules ? this.rules.get(userAgentRules) : null;
    const generalRules = this.rules.get('*');
    
    const rulesToCheck = specificRules || generalRules;
    
    if (!rulesToCheck) {
      return true; // No rules means everything is allowed
    }

    // Check disallow rules first (more restrictive)
    for (const disallowPattern of rulesToCheck.disallow) {
      if (disallowPattern === '/') {
        return false; // Disallow all
      }
      if (path.startsWith(disallowPattern)) {
        return false;
      }
    }

    // Check allow rules
    for (const allowPattern of rulesToCheck.allow) {
      if (allowPattern === '/') {
        return true; // Allow all
      }
      if (path.startsWith(allowPattern)) {
        return true;
      }
    }

    // If we have disallow rules but no matching allow rules, default to allowed
    // If we have only allow rules and no match, default to disallowed
    return rulesToCheck.allow.length === 0;
  }
}

/**
 * WebsiteCrawlerService crawls eveappeal.org.uk and extracts health content
 * following robots.txt rules and respecting rate limits
 */
export class WebsiteCrawlerService {
  private readonly config: CrawlConfig;
  private robotsRules?: RobotsTxtRules;
  private crawledUrls = new Set<string>();
  private readonly outputDir: string;

  constructor(
    config: CrawlConfig,
    private readonly validationService: ValidationService
  ) {
    this.config = CrawlConfigSchema.parse(config);
    this.outputDir = path.join(process.cwd(), 'content', 'documents');
  }

  /**
   * Crawl website starting from provided URLs
   * Discovers additional pages through links and respects crawl configuration
   */
  async crawlWebsite(startUrls: string[]): Promise<CrawlResult> {
    try {
      logger.info('Starting website crawl', { 
        baseUrl: this.config.baseUrl,
        startUrls: startUrls.length
      });

      const result: CrawlResult = {
        pagesChecked: 0,
        pagesUpdated: 0,
        newPages: 0,
        missingUrls: [],
        errors: []
      };

      // Parse robots.txt if configured
      if (this.config.rateLimit.respectRobotsTxt) {
        try {
          this.robotsRules = await this.parseRobotsTxt();
        } catch (error) {
          logger.warn('Failed to parse robots.txt, proceeding without restrictions', { error });
        }
      }

      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      // Create crawl queue
      const crawlQueue = [...startUrls];
      const processedUrls = new Set<string>();
      let concurrentRequests = 0;

      while (crawlQueue.length > 0 && result.pagesChecked < 1000) { // Safety limit
        if (concurrentRequests >= this.config.rateLimit.maxConcurrent) {
          await this.delay(100); // Wait before checking again
          continue;
        }

        const urlPath = crawlQueue.shift()!;
        if (processedUrls.has(urlPath)) {
          continue;
        }

        processedUrls.add(urlPath);
        concurrentRequests++;

        // Process URL asynchronously
        this.crawlSinglePage(urlPath, result, crawlQueue)
          .finally(() => {
            concurrentRequests--;
          });

        // Rate limiting delay
        if (this.config.rateLimit.delayBetweenRequests > 0) {
          await this.delay(this.config.rateLimit.delayBetweenRequests);
        }
      }

      // Wait for any remaining requests to complete
      while (concurrentRequests > 0) {
        await this.delay(100);
      }

      // Validate result schema
      const validatedResult = CrawlResultSchema.parse(result);

      logger.info('Website crawl completed', {
        pagesChecked: validatedResult.pagesChecked,
        newPages: validatedResult.newPages,
        errors: validatedResult.errors.length
      });

      return validatedResult;

    } catch (error) {
      logger.error('Website crawl failed', { error });
      throw error;
    }
  }

  /**
   * Crawl a single page and extract content
   */
  private async crawlSinglePage(
    urlPath: string, 
    result: CrawlResult, 
    crawlQueue: string[]
  ): Promise<void> {
    try {
      result.pagesChecked++;

      // Check if URL should be crawled
      if (!this.shouldCrawlUrl(urlPath)) {
        result.errors.push(`Page ${urlPath} excluded by crawl patterns`);
        return;
      }

      // Check robots.txt
      const fullUrl = this.buildFullUrl(urlPath);
      if (this.robotsRules && !this.robotsRules.isAllowed(fullUrl)) {
        result.errors.push(`Page ${urlPath} disallowed by robots.txt`);
        return;
      }

      // Fetch page content
      const response = await axios.get(fullUrl, {
        headers: {
          'User-Agent': this.config.rateLimit.userAgent
        },
        timeout: 10000
      });

      // Parse HTML content
      const $ = cheerio.load(response.data);
      
      // Extract title
      const title = $(this.config.contentSelectors.title)
        .first()
        .text()
        .trim();

      // Extract main content
      const contentElement = $(this.config.contentSelectors.content);
      
      // Remove excluded elements
      contentElement.find(this.config.contentSelectors.exclude).remove();
      
      const content = contentElement.text().trim();

      // Validate content
      if (content.length < this.config.validation.minContentLength) {
        result.errors.push(`Content too short for ${urlPath}: ${content.length} characters`);
        return;
      }

      if (content.length > this.config.validation.maxContentLength) {
        result.errors.push(`Content too long for ${urlPath}: ${content.length} characters`);
        return;
      }

      // Extract links for further crawling
      const links = $('a[href]')
        .map((_, element) => $(element).attr('href'))
        .get()
        .filter((href): href is string => {
          if (!href) return false;
          // Only internal links
          return href.startsWith('/') && !href.startsWith('//');
        })
        .filter(href => this.shouldCrawlUrl(href))
        .filter(href => !crawlQueue.includes(href) && !this.crawledUrls.has(href));

      // Add discovered links to crawl queue
      crawlQueue.push(...links);

      // Generate source URL
      const sourceUrl = this.validationService.generateSourceUrl({
        type: 'website',
        path: urlPath
      });

      // Create crawled page data
      const crawledPage: CrawledPage = {
        url: fullUrl,
        title,
        content,
        sourceUrl,
        crawledAt: new Date(),
        contentLength: content.length,
        links,
        metadata: {
          urlPath,
          httpStatus: response.status,
          contentType: response.headers['content-type']
        }
      };

      // Validate crawled page schema
      const validatedPage = CrawledPageSchema.parse(crawledPage);

      // Save to file system
      await this.saveCrawledPage(validatedPage, urlPath);
      
      result.newPages++;
      this.crawledUrls.add(urlPath);

      logger.debug('Successfully crawled page', {
        url: urlPath,
        title,
        contentLength: content.length,
        linksFound: links.length
      });

    } catch (error) {
      const errorMessage = `Failed to crawl ${urlPath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMessage);
      logger.error('Failed to crawl page', { urlPath, error });
    }
  }

  /**
   * Save crawled page data to file system
   */
  private async saveCrawledPage(page: CrawledPage, urlPath: string): Promise<void> {
    const filename = this.generateFilename(urlPath);
    const filepath = path.join(this.outputDir, filename);
    
    const pageData = {
      ...page,
      crawledAt: page.crawledAt.toISOString()
    };

    await fs.writeFile(filepath, JSON.stringify(pageData, null, 2), 'utf-8');
    
    logger.debug('Saved crawled page', { filepath, title: page.title });
  }

  /**
   * Generate safe filename from URL path
   */
  private generateFilename(urlPath: string): string {
    const safeName = urlPath
      .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
      .replace(/\//g, '-') // Replace slashes with hyphens
      .replace(/[^a-zA-Z0-9-_]/g, '') // Remove special characters
      .toLowerCase();
    
    return `${safeName || 'homepage'}.json`;
  }

  /**
   * Check if URL should be crawled based on include/exclude patterns
   */
  private shouldCrawlUrl(urlPath: string): boolean {
    // Check exclude patterns first
    for (const pattern of this.config.excludePatterns) {
      if (this.matchesPattern(urlPath, pattern)) {
        return false;
      }
    }

    // Check include patterns
    if (this.config.includePatterns.length === 0) {
      return true; // No include patterns means include all (except excludes)
    }

    for (const pattern of this.config.includePatterns) {
      if (this.matchesPattern(urlPath, pattern)) {
        return true;
      }
    }

    return false; // Doesn't match any include pattern
  }

  /**
   * Simple pattern matching with wildcard support
   */
  private matchesPattern(url: string, pattern: string): boolean {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return url.startsWith(prefix);
    }
    return url === pattern;
  }

  /**
   * Build full URL from path
   */
  private buildFullUrl(urlPath: string): string {
    return `${this.config.baseUrl}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
  }

  /**
   * Parse robots.txt from the website
   */
  private async parseRobotsTxt(): Promise<RobotsTxtRules> {
    const robotsUrl = `${this.config.baseUrl}/robots.txt`;
    
    try {
      const response = await axios.get(robotsUrl, {
        headers: {
          'User-Agent': this.config.rateLimit.userAgent
        },
        timeout: 5000
      });

      return new RobotsTxtRules(response.data, this.config.rateLimit.userAgent);
      
    } catch (error) {
      logger.warn('Failed to fetch robots.txt', { robotsUrl, error });
      throw error;
    }
  }

  /**
   * Rate limiting utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}