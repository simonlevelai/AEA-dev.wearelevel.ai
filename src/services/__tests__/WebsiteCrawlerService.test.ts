import { WebsiteCrawlerService } from '../WebsiteCrawlerService';
import { ValidationService } from '../ValidationService';
import { CrawlResult, CrawlConfig } from '../../types/content';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('axios');
jest.mock('cheerio');
jest.mock('fs/promises');
jest.mock('../ValidationService');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCheerio = cheerio as jest.Mocked<typeof cheerio>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const MockedValidationService = ValidationService as jest.MockedClass<typeof ValidationService>;

describe('WebsiteCrawlerService', () => {
  let crawlerService: WebsiteCrawlerService;
  let mockValidationService: jest.Mocked<ValidationService>;
  
  const mockConfig: CrawlConfig = {
    baseUrl: 'https://eveappeal.org.uk',
    rateLimit: {
      maxConcurrent: 2,
      delayBetweenRequests: 1000,
      respectRobotsTxt: true,
      userAgent: 'Ask Eve Assist Content Pipeline Bot'
    },
    includePatterns: ['/information/*', '/symptoms/*'],
    excludePatterns: ['/shop/*', '/admin/*'],
    contentSelectors: {
      title: 'h1, .entry-title',
      content: '.entry-content, main',
      exclude: '.sidebar, .footer'
    },
    validation: {
      minContentLength: 100,
      maxContentLength: 50000,
      requiredSections: ['symptoms', 'information']
    }
  };

  beforeEach(() => {
    mockValidationService = new MockedValidationService() as jest.Mocked<ValidationService>;
    crawlerService = new WebsiteCrawlerService(mockConfig, mockValidationService);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('crawlWebsite', () => {
    it('should successfully crawl valid pages and save content', async () => {
      // Arrange
      const mockHtml = `
        <html>
          <head><title>Ovarian Cancer Symptoms</title></head>
          <body>
            <h1>Understanding Ovarian Cancer Symptoms</h1>
            <main class="entry-content">
              <p>Ovarian cancer symptoms can include persistent bloating, pelvic pain, and changes in bowel habits. Early detection is crucial for effective treatment.</p>
              <p>Women should be aware of these symptoms and consult their healthcare provider if they persist for more than a few weeks.</p>
            </main>
            <div class="sidebar">Advertisement</div>
          </body>
        </html>
      `;

      const mockRobotsContent = `
        User-agent: *
        Allow: /information/
        Allow: /symptoms/
        Disallow: /admin/
        Disallow: /shop/
      `;

      // Mock robots.txt fetch
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({ data: mockRobotsContent, status: 200 });
        }
        if (url.includes('/information/ovarian-cancer/symptoms')) {
          return Promise.resolve({ data: mockHtml, status: 200 });
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock cheerio load
      const mockCheerioInstance = {
        'h1, .entry-title': jest.fn().mockReturnValue({
          first: jest.fn().mockReturnValue({
            text: jest.fn().mockReturnValue('Understanding Ovarian Cancer Symptoms')
          })
        }),
        '.entry-content, main': jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            remove: jest.fn().mockReturnThis() // For removing excluded elements
          }),
          text: jest.fn().mockReturnValue('Ovarian cancer symptoms can include persistent bloating, pelvic pain, and changes in bowel habits. Early detection is crucial for effective treatment. Women should be aware of these symptoms and consult their healthcare provider if they persist for more than a few weeks.')
        }),
        'a[href]': jest.fn().mockReturnValue({
          map: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue([
              '/information/endometrial-cancer/symptoms',
              '/information/cervical-cancer/prevention'
            ])
          })
        })
      };

      mockedCheerio.load.mockReturnValue(mockCheerioInstance as any);

      // Mock file system operations
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      // Mock validation service
      mockValidationService.generateSourceUrl.mockReturnValue('https://eveappeal.org.uk/information/ovarian-cancer/symptoms');

      // Act
      const result = await crawlerService.crawlWebsite(['/information/ovarian-cancer/symptoms']);

      // Assert
      expect(result.pagesChecked).toBe(1);
      expect(result.newPages).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ovarian-cancer-symptoms.json'),
        expect.stringContaining('Understanding Ovarian Cancer Symptoms'),
        'utf-8'
      );
    });

    it('should respect robots.txt and skip disallowed pages', async () => {
      // Arrange
      const mockRobotsContent = `
        User-agent: Ask Eve Assist Content Pipeline Bot
        Disallow: /shop/
        Disallow: /admin/
        Allow: /information/
      `;

      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({ data: mockRobotsContent, status: 200 });
        }
        return Promise.reject(new Error('Should not be called for disallowed pages'));
      });

      // Act
      const result = await crawlerService.crawlWebsite(['/shop/products', '/information/symptoms']);

      // Assert
      expect(result.pagesChecked).toBe(1); // Only /information/symptoms should be checked
      expect(result.errors).toContain('Page /shop/products disallowed by robots.txt');
    });

    it('should filter content based on include/exclude patterns', async () => {
      // Arrange - Create service with restrictive patterns
      const restrictiveConfig: CrawlConfig = {
        ...mockConfig,
        includePatterns: ['/information/ovarian-cancer/*'],
        excludePatterns: ['/information/cervical-cancer/*']
      };
      
      const restrictiveCrawler = new WebsiteCrawlerService(restrictiveConfig, mockValidationService);

      // Act
      const shouldInclude1 = restrictiveCrawler['shouldCrawlUrl']('/information/ovarian-cancer/symptoms');
      const shouldInclude2 = restrictiveCrawler['shouldCrawlUrl']('/information/cervical-cancer/symptoms');
      const shouldInclude3 = restrictiveCrawler['shouldCrawlUrl']('/about-us');

      // Assert
      expect(shouldInclude1).toBe(true);
      expect(shouldInclude2).toBe(false); // Excluded by excludePatterns
      expect(shouldInclude3).toBe(false); // Not in includePatterns
    });

    it('should validate content length and reject content that is too short', async () => {
      // Arrange
      const mockHtml = `
        <html>
          <head><title>Short Content</title></head>
          <body>
            <h1>Brief Title</h1>
            <main class="entry-content">
              <p>Too short.</p>
            </main>
          </body>
        </html>
      `;

      const mockRobotsContent = 'User-agent: *\nAllow: /';

      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({ data: mockRobotsContent, status: 200 });
        }
        return Promise.resolve({ data: mockHtml, status: 200 });
      });

      const mockCheerioInstance = {
        'h1, .entry-title': jest.fn().mockReturnValue({
          first: jest.fn().mockReturnValue({
            text: jest.fn().mockReturnValue('Brief Title')
          })
        }),
        '.entry-content, main': jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            remove: jest.fn().mockReturnThis()
          }),
          text: jest.fn().mockReturnValue('Too short.') // Only 11 characters
        }),
        'a[href]': jest.fn().mockReturnValue({
          map: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue([])
          })
        })
      };

      mockedCheerio.load.mockReturnValue(mockCheerioInstance as any);

      // Act
      const result = await crawlerService.crawlWebsite(['/information/short-content']);

      // Assert
      expect(result.errors).toContain(
        expect.stringContaining('Content too short')
      );
    });

    it('should handle HTTP errors gracefully', async () => {
      // Arrange
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({ data: 'User-agent: *\nAllow: /', status: 200 });
        }
        return Promise.reject(new Error('Network error'));
      });

      // Act
      const result = await crawlerService.crawlWebsite(['/information/network-error']);

      // Assert
      expect(result.pagesChecked).toBe(1);
      expect(result.newPages).toBe(0);
      expect(result.errors).toContain(
        expect.stringContaining('Failed to crawl /information/network-error')
      );
    });

    it('should discover and queue additional pages from links', async () => {
      // Arrange
      const mockHtml = `
        <html>
          <body>
            <h1>Main Page</h1>
            <main class="entry-content">
              <p>This page contains links to other relevant health information.</p>
              <a href="/information/ovarian-cancer/treatment">Treatment Options</a>
              <a href="/information/cervical-cancer/screening">Screening Information</a>
              <a href="/external-site">External Link</a>
            </main>
          </body>
        </html>
      `;

      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('robots.txt')) {
          return Promise.resolve({ data: 'User-agent: *\nAllow: /', status: 200 });
        }
        return Promise.resolve({ data: mockHtml, status: 200 });
      });

      const mockCheerioInstance = {
        'h1, .entry-title': jest.fn().mockReturnValue({
          first: jest.fn().mockReturnValue({
            text: jest.fn().mockReturnValue('Main Page')
          })
        }),
        '.entry-content, main': jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            remove: jest.fn().mockReturnThis()
          }),
          text: jest.fn().mockReturnValue('This page contains links to other relevant health information. Treatment Options Screening Information External Link')
        }),
        'a[href]': jest.fn().mockReturnValue({
          map: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue([
              '/information/ovarian-cancer/treatment',
              '/information/cervical-cancer/screening',
              'https://external-site.com/info' // Should be filtered out
            ])
          })
        })
      };

      mockedCheerio.load.mockReturnValue(mockCheerioInstance as any);
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      mockValidationService.generateSourceUrl.mockReturnValue('https://eveappeal.org.uk/information/main-page');

      // Act
      const result = await crawlerService.crawlWebsite(['/information/main-page']);

      // Assert
      expect(result.pagesChecked).toBeGreaterThan(1); // Should crawl discovered pages too
    });
  });

  describe('parseRobotsTxt', () => {
    it('should correctly parse robots.txt rules', async () => {
      // Arrange
      const robotsContent = `
        User-agent: *
        Disallow: /admin/
        Disallow: /private/
        Allow: /information/
        
        User-agent: Ask Eve Assist Content Pipeline Bot
        Allow: /
        Disallow: /shop/
      `;

      mockedAxios.get.mockResolvedValue({ data: robotsContent, status: 200 });

      // Act
      const rules = await crawlerService['parseRobotsTxt']();

      // Assert
      expect(rules.isAllowed('/information/symptoms')).toBe(true);
      expect(rules.isAllowed('/admin/settings')).toBe(false);
      expect(rules.isAllowed('/shop/products')).toBe(false); // Specific to our user agent
    });
  });
});