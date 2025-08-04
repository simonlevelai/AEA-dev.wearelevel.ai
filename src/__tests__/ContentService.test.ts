import { ContentService } from '../services/ContentService';
import { SearchService } from '../services/SearchService';
import { ContentChunk, SearchResponse, SourceUrlMissingError, InvalidSourceUrlError } from '../types/content';

// Mock dependencies
jest.mock('../services/SearchService');
const MockedSearchService = SearchService as jest.MockedClass<typeof SearchService>;

describe('ContentService', () => {
  let contentService: ContentService;
  let mockSearchService: jest.Mocked<SearchService>;

  beforeEach(() => {
    mockSearchService = new MockedSearchService() as jest.Mocked<SearchService>;
    contentService = new ContentService(mockSearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchContent', () => {
    it('should throw SourceUrlMissingError when content lacks source URL', async () => {
      // Arrange
      const query = 'ovarian cancer symptoms';
      const resultWithoutSourceUrl = {
        id: 'test-content-1',
        content: 'Test content about ovarian cancer',
        title: 'Ovarian Cancer Information',
        source: 'Eve Appeal',
        // sourceUrl is missing - this should cause failure
        lastReviewed: new Date()
      };

      mockSearchService.search.mockResolvedValue({
        results: [{ document: resultWithoutSourceUrl, score: 0.95 }],
        count: 1
      });

      // Act & Assert
      await expect(contentService.searchContent(query))
        .rejects
        .toThrow(SourceUrlMissingError);
    });

    it('should throw InvalidSourceUrlError when source URL is not from eveappeal.org.uk', async () => {
      // Arrange
      const query = 'cervical cancer screening';
      const resultWithInvalidSourceUrl = {
        id: 'test-content-2',
        content: 'Test content about cervical screening',
        title: 'Cervical Screening Guide',
        source: 'Eve Appeal',
        sourceUrl: 'https://nhs.uk/conditions/cervical-screening', // Invalid domain
        lastReviewed: new Date()
      };

      mockSearchService.search.mockResolvedValue({
        results: [{ document: resultWithInvalidSourceUrl, score: 0.89 }],
        count: 1
      });

      // Act & Assert
      await expect(contentService.searchContent(query))
        .rejects
        .toThrow(InvalidSourceUrlError);
    });

    it('should return valid search response when content has proper source URL', async () => {
      // Arrange
      const query = 'endometrial cancer risk factors';
      const validContent = {
        id: 'test-content-3',
        content: 'Information about endometrial cancer risk factors including age, obesity, and hormone therapy.',
        title: 'Endometrial Cancer Risk Factors',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/endometrial-cancer/risk-factors',
        sourcePage: 2,
        lastReviewed: new Date('2024-01-15')
      };

      mockSearchService.search.mockResolvedValue({
        results: [{ document: validContent, score: 0.92 }],
        count: 1
      });

      // Act
      const result = await contentService.searchContent(query);

      // Assert
      expect(result).toEqual({
        found: true,
        content: validContent.content,
        source: validContent.source,
        sourceUrl: validContent.sourceUrl,
        sourcePage: validContent.sourcePage,
        relevanceScore: 0.92,
        title: validContent.title
      });
    });

    it('should return not found response when no search results', async () => {
      // Arrange
      const query = 'non-existent medical term';
      mockSearchService.search.mockResolvedValue({
        results: [],
        count: 0
      });

      // Act
      const result = await contentService.searchContent(query);

      // Assert
      expect(result).toEqual({
        found: false,
        content: '',
        source: '',
        sourceUrl: ''
      });
    });

    it('should use semantic search with proper configuration', async () => {
      // Arrange
      const query = 'gynecological health symptoms';
      const validContent = {
        id: 'test-content-4',
        content: 'General gynecological health information.',
        title: 'Gynecological Health',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/gynecological-health',
        lastReviewed: new Date()
      };

      mockSearchService.search.mockResolvedValue({
        results: [{ document: validContent, score: 0.85 }],
        count: 1
      });

      // Act
      await contentService.searchContent(query);

      // Assert
      expect(mockSearchService.search).toHaveBeenCalledWith(query, {
        queryType: 'semantic',
        top: 5,
        select: ['content', 'source', 'sourceUrl', 'sourcePage', 'title']
      });
    });

    it('should handle search service errors gracefully', async () => {
      // Arrange
      const query = 'vulval cancer information';
      const searchError = new Error('Azure Search service unavailable');
      mockSearchService.search.mockRejectedValue(searchError);

      // Act & Assert
      await expect(contentService.searchContent(query))
        .rejects
        .toThrow('Azure Search service unavailable');
    });
  });

  describe('validateContentChunk', () => {
    it('should throw SourceUrlMissingError for chunk without sourceUrl', () => {
      // Arrange
      const invalidChunk = {
        id: 'invalid-chunk-1',
        content: 'Some health information',
        title: 'Health Info',
        source: 'Eve Appeal',
        // sourceUrl is missing
        lastReviewed: new Date()
      } as ContentChunk;

      // Act & Assert
      expect(() => contentService.validateContentChunk(invalidChunk))
        .toThrow(SourceUrlMissingError);
    });

    it('should throw InvalidSourceUrlError for chunk with invalid domain', () => {
      // Arrange
      const invalidChunk: ContentChunk = {
        id: 'invalid-chunk-2',
        content: 'Some health information',
        title: 'Health Info',
        source: 'Eve Appeal',
        sourceUrl: 'https://example.com/health-info', // Wrong domain
        lastReviewed: new Date()
      };

      // Act & Assert
      expect(() => contentService.validateContentChunk(invalidChunk))
        .toThrow(InvalidSourceUrlError);
    });

    it('should pass validation for chunk with valid eveappeal.org.uk URL', () => {
      // Arrange
      const validChunk: ContentChunk = {
        id: 'valid-chunk-1',
        content: 'Information about ovarian cancer symptoms',
        title: 'Ovarian Cancer Symptoms',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer/symptoms',
        sourcePage: 1,
        lastReviewed: new Date()
      };

      // Act & Assert
      expect(() => contentService.validateContentChunk(validChunk))
        .not.toThrow();
    });
  });

  describe('indexContent', () => {
    it('should validate content chunks before indexing', async () => {
      // Arrange
      const chunksWithInvalidUrl = [
        {
          id: 'chunk-1',
          content: 'Health information',
          title: 'Health Info',
          source: 'Eve Appeal',
          sourceUrl: 'https://invalid-domain.com/info', // Invalid domain
          lastReviewed: new Date()
        }
      ] as ContentChunk[];

      // Act & Assert
      await expect(contentService.indexContent(chunksWithInvalidUrl))
        .rejects
        .toThrow(InvalidSourceUrlError);
    });

    it('should successfully index valid content chunks', async () => {
      // Arrange
      const validChunks: ContentChunk[] = [
        {
          id: 'chunk-1',
          content: 'Information about cervical cancer prevention',
          title: 'Cervical Cancer Prevention',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/cervical-cancer/prevention',
          lastReviewed: new Date()
        },
        {
          id: 'chunk-2',
          content: 'Information about endometrial cancer symptoms',
          title: 'Endometrial Cancer Symptoms',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/endometrial-cancer/symptoms',
          sourcePage: 3,
          lastReviewed: new Date()
        }
      ];

      mockSearchService.indexDocuments.mockResolvedValue({
        success: true,
        indexed: 2,
        errors: []
      });

      // Act
      const result = await contentService.indexContent(validChunks);

      // Assert
      expect(result.success).toBe(true);
      expect(result.chunksCreated).toBe(2);
      expect(mockSearchService.indexDocuments).toHaveBeenCalledWith(validChunks);
    });
  });
});