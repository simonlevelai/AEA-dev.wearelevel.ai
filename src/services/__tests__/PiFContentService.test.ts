import { PiFContentService } from '../PiFContentService';
import { Logger } from '../../utils/logger';
import * as fs from 'fs/promises';

// Mock fs.readFile
jest.mock('fs/promises');
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe('PiFContentService', () => {
  let service: PiFContentService;
  let mockLogger: jest.Mocked<Logger>;

  const mockPiFData = [
    {
      id: 'ovarian-cancer-chunk-1',
      content: 'Ovarian cancer symptoms include persistent bloating, feeling full quickly when eating, pelvic or abdominal pain, and needing to urinate urgently or more often.',
      source: 'The Eve Appeal - Ovarian Cancer Guide',
      title: 'Ovarian Cancer Symptoms'
    },
    {
      id: 'cervical-screening-chunk-1', 
      content: 'Cervical screening checks the health of your cervix. It is not a test for cancer, it is a test to help prevent cancer.',
      source: 'The Eve Appeal - Cervical Screening',
      title: 'Cervical Screening Information'
    },
    {
      id: 'hpv-guide-chunk-1',
      content: 'HPV (human papillomavirus) is very common and around 80% of people will get it in their lifetime. In most cases it has no symptoms and will usually be cleared by the immune system.',
      source: 'The Eve Appeal - HPV Guide',
      title: 'What is HPV?'
    }
  ];

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    service = new PiFContentService(mockLogger);

    // Mock successful file read
    mockReadFile.mockResolvedValue(JSON.stringify(mockPiFData));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with PiF content chunks', async () => {
      await service.initialize();

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('data/pif-chunks.json'),
        'utf-8'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized with 3 content chunks')
      );
    });

    it('should throw error if PiF data cannot be loaded', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(service.initialize()).rejects.toThrow(
        'Critical failure: Could not load PiF content'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchContent', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should find relevant content for ovarian cancer query', async () => {
      const result = await service.searchContent('ovarian cancer symptoms');

      expect(result.found).toBe(true);
      expect(result.content).toContain('persistent bloating');
      expect(result.source).toBe('The Eve Appeal - Ovarian Cancer Guide');
      expect(result.sourceUrl).toBe('https://eveappeal.org.uk/gynae-health/ovarian-cancer');
      expect(result.relevanceScore).toBeGreaterThan(0.1);
    });

    it('should find relevant content for cervical screening query', async () => {
      const result = await service.searchContent('cervical screening');

      expect(result.found).toBe(true);
      expect(result.content).toContain('checks the health of your cervix');
      expect(result.source).toBe('The Eve Appeal - Cervical Screening');
      expect(result.sourceUrl).toBe('https://eveappeal.org.uk/gynae-health/cervical-screening');
    });

    it('should find relevant content for HPV query', async () => {
      const result = await service.searchContent('what is HPV');

      expect(result.found).toBe(true);
      expect(result.content).toContain('human papillomavirus');
      expect(result.sourceUrl).toBe('https://eveappeal.org.uk/gynae-health/hpv');
    });

    it('should return no results for irrelevant queries', async () => {
      const result = await service.searchContent('car maintenance');

      expect(result.found).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No relevant PiF content found',
        expect.objectContaining({ query: 'car maintenance' })
      );
    });

    it('should return no results for empty queries', async () => {
      const result = await service.searchContent('');

      expect(result.found).toBe(false);
    });

    it('should clean queries properly', async () => {
      const result = await service.searchContent('um... can you tell me about ovarian cancer symptoms please?');

      expect(result.found).toBe(true);
      expect(result.content).toContain('persistent bloating');
    });

    it('should handle search errors gracefully', async () => {
      // Force an error during search
      const errorService = new PiFContentService(mockLogger);
      const malformedData = 'invalid json';
      mockReadFile.mockResolvedValue(malformedData);

      await expect(errorService.initialize()).rejects.toThrow();
    });

    it('should auto-initialize if not already initialized', async () => {
      const uninitializedService = new PiFContentService(mockLogger);
      const result = await uninitializedService.searchContent('ovarian cancer');

      expect(result.found).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized with 3 content chunks')
      );
    });

    it('should prioritize title matches over content matches', async () => {
      // Add content where title matches are different from content matches  
      const testData = [
        {
          id: 'test-1',
          content: 'This content mentions cervical screening briefly.',
          source: 'Test Source',
          title: 'Ovarian Cancer Overview'
        },
        {
          id: 'test-2', 
          content: 'This has lots of ovarian cancer information and details.',
          source: 'Test Source',
          title: 'Cervical Screening Guide'
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(testData));
      const testService = new PiFContentService(mockLogger);
      
      const result = await testService.searchContent('cervical screening');

      // Should prefer the one with cervical screening in the title
      expect(result.content).toContain('lots of ovarian cancer information');
    });

    it('should boost health topic relevance scores', async () => {
      const result1 = await service.searchContent('ovarian cancer symptoms');
      const result2 = await service.searchContent('ovarian symptoms');

      // Full topic match should have higher relevance
      expect(result1.relevanceScore).toBeGreaterThanOrEqual(result2.relevanceScore || 0);
    });

    it('should truncate long content appropriately', async () => {
      const longContentData = [{
        id: 'long-content',
        content: 'A'.repeat(1000) + '. This is the end.',
        source: 'Test Source',
        title: 'Long Content Test'
      }];

      mockReadFile.mockResolvedValue(JSON.stringify(longContentData));
      const testService = new PiFContentService(mockLogger);

      const result = await testService.searchContent('long content');

      expect(result.content?.length).toBeLessThanOrEqual(500);
      // Should end with sentence if possible
      expect(result.content).toMatch(/\.$|\.\.\.$/);
    });

    it('should enforce MHRA compliance by requiring valid source URLs', async () => {
      const noUrlData = [{
        id: 'no-url',
        content: 'Some health information without proper attribution.',
        source: 'Unknown Source'
        // No sourceUrl field
      }];

      mockReadFile.mockResolvedValue(JSON.stringify(noUrlData));
      const testService = new PiFContentService(mockLogger);

      const result = await testService.searchContent('health information');

      // Should not return content without valid source URL
      expect(result.found).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No valid source URL for PiF content',
        expect.objectContaining({ chunkId: 'no-url' })
      );
    });

    it('should generate appropriate Eve Appeal URLs for different content types', async () => {
      const result = await service.searchContent('ovarian cancer');
      expect(result.sourceUrl).toBe('https://eveappeal.org.uk/gynae-health/ovarian-cancer');
    });

    it('should maintain sub-second search response times', async () => {
      const startTime = Date.now();
      await service.searchContent('ovarian cancer symptoms');
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(1000); // Sub-second response
    });
  });

  describe('content quality and safety', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should only return content from trusted Eve Appeal sources', async () => {
      const result = await service.searchContent('ovarian cancer');

      expect(result.sourceUrl).toMatch(/^https:\/\/(www\.)?eveappeal\.org\.uk/);
    });

    it('should provide source attribution for all returned content', async () => {
      const result = await service.searchContent('cervical screening');

      expect(result.source).toBeDefined();
      expect(result.source).toContain('The Eve Appeal');
      expect(result.sourceUrl).toBeDefined();
    });

    it('should limit query length to prevent abuse', async () => {
      const veryLongQuery = 'A'.repeat(500);
      const result = await service.searchContent(veryLongQuery);

      // Should handle gracefully without errors
      expect(result).toBeDefined();
    });
  });
});