import { SearchService } from '../services/SearchService';
import { SearchClient } from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { ContentChunk, SearchConfig } from '../types/content';

// Mock Azure SDK
jest.mock('@azure/search-documents');
jest.mock('@azure/identity');

const MockedSearchClient = SearchClient as jest.MockedClass<typeof SearchClient>;
const MockedDefaultAzureCredential = DefaultAzureCredential as jest.MockedClass<typeof DefaultAzureCredential>;

describe('SearchService', () => {
  let searchService: SearchService;
  let mockSearchClient: jest.Mocked<SearchClient<ContentChunk>>;
  let searchConfig: SearchConfig;

  beforeEach(() => {
    mockSearchClient = new MockedSearchClient() as jest.Mocked<SearchClient<ContentChunk>>;
    MockedSearchClient.mockImplementation(() => mockSearchClient);

    searchConfig = {
      endpoint: 'https://test-search.search.windows.net',
      apiKey: 'test-api-key',
      indexName: 'askeve-content-test'
    };

    searchService = new SearchService(searchConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create SearchClient with API key authentication', () => {
      // Arrange & Act
      new SearchService(searchConfig);

      // Assert
      expect(MockedSearchClient).toHaveBeenCalledWith(
        searchConfig.endpoint,
        searchConfig.indexName,
        expect.any(Object) // AzureKeyCredential
      );
    });

    it('should create SearchClient with DefaultAzureCredential when no API key', () => {
      // Arrange
      const configWithoutKey = {
        endpoint: 'https://test-search.search.windows.net',
        apiKey: '',
        indexName: 'askeve-content-test'
      };

      // Act
      new SearchService(configWithoutKey);

      // Assert
      expect(MockedDefaultAzureCredential).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should perform semantic search with correct parameters', async () => {
      // Arrange
      const query = 'ovarian cancer symptoms';
      const searchOptions = {
        queryType: 'semantic' as const,
        top: 5,
        select: ['content', 'source', 'sourceUrl', 'sourcePage', 'title']
      };

      const mockResults = [
        {
          document: {
            id: 'test-1',
            content: 'Ovarian cancer symptoms include bloating...',
            title: 'Ovarian Cancer Symptoms',
            source: 'Eve Appeal',
            sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer/symptoms',
            lastReviewed: new Date()
          },
          score: 0.95
        }
      ];

      mockSearchClient.search.mockResolvedValue({
        results: mockResults,
        count: 1
      } as any);

      // Act
      const result = await searchService.search(query, searchOptions);

      // Assert
      expect(mockSearchClient.search).toHaveBeenCalledWith(query, {
        queryType: 'semantic',
        top: 5,
        select: ['content', 'source', 'sourceUrl', 'sourcePage', 'title'],
        searchMode: 'any',
        includeTotalCount: true
      });
      
      expect(result.results).toEqual(mockResults);
      expect(result.count).toBe(1);
    });

    it('should handle empty search results', async () => {
      // Arrange
      const query = 'non-existent condition';
      mockSearchClient.search.mockResolvedValue({
        results: [],
        count: 0
      } as any);

      // Act
      const result = await searchService.search(query, {});

      // Assert
      expect(result.results).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle search client errors', async () => {
      // Arrange
      const query = 'test query';
      const searchError = new Error('Azure Search service unavailable');
      mockSearchClient.search.mockRejectedValue(searchError);

      // Act & Assert
      await expect(searchService.search(query, {}))
        .rejects
        .toThrow('Azure Search service unavailable');
    });
  });

  describe('indexDocuments', () => {
    it('should successfully index valid content chunks', async () => {
      // Arrange
      const chunks: ContentChunk[] = [
        {
          id: 'chunk-1',
          content: 'Information about cervical cancer screening',
          title: 'Cervical Cancer Screening',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/cervical-cancer/screening',
          lastReviewed: new Date('2024-01-15')
        },
        {
          id: 'chunk-2',
          content: 'Information about endometrial cancer symptoms',
          title: 'Endometrial Cancer Symptoms',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/endometrial-cancer/symptoms',
          sourcePage: 2,
          lastReviewed: new Date('2024-01-20')
        }
      ];

      mockSearchClient.mergeOrUploadDocuments.mockResolvedValue({
        results: [
          { key: 'chunk-1', succeeded: true, statusCode: 200 },
          { key: 'chunk-2', succeeded: true, statusCode: 200 }
        ]
      } as any);

      // Act
      const result = await searchService.indexDocuments(chunks);

      // Assert
      expect(mockSearchClient.mergeOrUploadDocuments).toHaveBeenCalledWith(chunks);
      expect(result.success).toBe(true);
      expect(result.indexed).toBe(2);
      expect(result.errors).toEqual([]);
    });

    it('should handle partial indexing failures', async () => {
      // Arrange
      const chunks: ContentChunk[] = [
        {
          id: 'chunk-1',
          content: 'Valid content',
          title: 'Valid Title',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/valid',
          lastReviewed: new Date()
        },
        {
          id: 'chunk-2',
          content: 'Another content',
          title: 'Another Title',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/another',
          lastReviewed: new Date()
        }
      ];

      mockSearchClient.mergeOrUploadDocuments.mockResolvedValue({
        results: [
          { key: 'chunk-1', succeeded: true, statusCode: 200 },
          { 
            key: 'chunk-2', 
            succeeded: false, 
            statusCode: 400,
            errorMessage: 'Document too large'
          }
        ]
      } as any);

      // Act
      const result = await searchService.indexDocuments(chunks);

      // Assert
      expect(result.success).toBe(false);
      expect(result.indexed).toBe(1);
      expect(result.errors).toEqual(['chunk-2: Document too large']);
    });

    it('should handle complete indexing failure', async () => {
      // Arrange
      const chunks: ContentChunk[] = [
        {
          id: 'chunk-1',
          content: 'Test content',
          title: 'Test Title',
          source: 'Eve Appeal',
          sourceUrl: 'https://eveappeal.org.uk/information/test',
          lastReviewed: new Date()
        }
      ];

      const indexError = new Error('Index not found');
      mockSearchClient.mergeOrUploadDocuments.mockRejectedValue(indexError);

      // Act & Assert
      await expect(searchService.indexDocuments(chunks))
        .rejects
        .toThrow('Index not found');
    });

    it('should handle empty chunks array', async () => {
      // Arrange
      const chunks: ContentChunk[] = [];
      
      mockSearchClient.mergeOrUploadDocuments.mockResolvedValue({
        results: []
      } as any);

      // Act
      const result = await searchService.indexDocuments(chunks);

      // Assert
      expect(result.success).toBe(true);
      expect(result.indexed).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('createIndex', () => {
    it('should create search index with proper schema', async () => {
      // Arrange
      const mockSearchIndexClient = {
        createIndex: jest.fn().mockResolvedValue({ name: 'askeve-content-test' })
      };
      
      // Mock the SearchIndexClient creation
      jest.doMock('@azure/search-documents', () => ({
        ...jest.requireActual('@azure/search-documents'),
        SearchIndexClient: jest.fn(() => mockSearchIndexClient)
      }));

      // Act
      const result = await searchService.createIndex();

      // Assert
      expect(result.success).toBe(true);
      expect(result.indexName).toBe('askeve-content-test');
    });
  });
});