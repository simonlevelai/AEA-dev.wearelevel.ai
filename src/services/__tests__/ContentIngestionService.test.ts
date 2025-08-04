import { ContentIngestionService } from '../ContentIngestionService';
import { ValidationService } from '../ValidationService';
import { SearchService } from '../SearchService';
import { ContentChunk, CrawledPage, DocumentProcessingResult } from '../../types/content';
import { OpenAI } from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('openai');
jest.mock('fs/promises');
jest.mock('../ValidationService');
jest.mock('../SearchService');

const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const MockedValidationService = ValidationService as jest.MockedClass<typeof ValidationService>;
const MockedSearchService = SearchService as jest.MockedClass<typeof SearchService>;

describe('ContentIngestionService', () => {
  let ingestionService: ContentIngestionService;
  let mockValidationService: jest.Mocked<ValidationService>;
  let mockSearchService: jest.Mocked<SearchService>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(() => {
    mockValidationService = new MockedValidationService() as jest.Mocked<ValidationService>;
    mockSearchService = new MockedSearchService() as jest.Mocked<SearchService>;
    mockOpenAI = new MockedOpenAI() as jest.Mocked<OpenAI>;
    
    // Mock OpenAI constructor
    (MockedOpenAI as any).mockImplementation(() => mockOpenAI);
    
    ingestionService = new ContentIngestionService(
      mockValidationService,
      mockSearchService,
      {
        apiKey: 'test-key',
        embeddingModel: 'text-embedding-ada-002',
        maxTokensPerChunk: 8000,
        chunkOverlap: 200
      }
    );

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('processContent', () => {
    it('should process all crawled content files and create chunks with embeddings', async () => {
      // Arrange
      const mockCrawledPage: CrawledPage = {
        url: 'https://eveappeal.org.uk/information/ovarian-cancer/symptoms',
        title: 'Ovarian Cancer Symptoms',
        content: 'Ovarian cancer symptoms include persistent bloating, pelvic pain, feeling full quickly when eating, and urinary urgency. These symptoms can be vague and are often mistaken for less serious conditions. If you experience these symptoms regularly for more than a few weeks, it is important to see your GP. Early detection is crucial for effective treatment of ovarian cancer.',
        sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer/symptoms',
        crawledAt: new Date('2024-01-15T10:00:00Z'),
        contentLength: 400,
        links: ['/information/ovarian-cancer/diagnosis'],
        metadata: { urlPath: '/information/ovarian-cancer/symptoms' }
      };

      const mockEmbedding = Array(1536).fill(0.1);

      // Mock file system operations
      mockedFs.readdir.mockResolvedValue(['ovarian-cancer-symptoms.json'] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockCrawledPage));

      // Mock OpenAI embeddings
      mockOpenAI.embeddings = {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: mockEmbedding }]
        })
      } as any;

      // Mock validation service
      mockValidationService.validateContentChunks.mockResolvedValue({
        validChunks: [
          {
            id: 'ovarian-cancer-symptoms-chunk-1',
            content: mockCrawledPage.content,
            title: mockCrawledPage.title,
            source: 'Eve Appeal Website',
            sourceUrl: mockCrawledPage.sourceUrl,
            lastReviewed: new Date('2024-01-15'),
            contentVector: mockEmbedding
          }
        ],
        invalidChunks: []
      });

      // Mock search service indexing
      mockSearchService.indexDocuments.mockResolvedValue({
        success: true,
        indexed: 1,
        errors: []
      });

      // Act
      const result = await ingestionService.processContent();

      // Assert
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(1);
      expect(result.chunksCreated).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockSearchService.indexDocuments).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer/symptoms',
            contentVector: mockEmbedding
          })
        ])
      );
    });

    it('should chunk long content into multiple pieces preserving source URL', async () => {
      // Arrange
      const longContent = 'A'.repeat(10000); // Content longer than chunk size
      const mockCrawledPage: CrawledPage = {
        url: 'https://eveappeal.org.uk/information/long-article',
        title: 'Long Medical Article',
        content: longContent,
        sourceUrl: 'https://eveappeal.org.uk/information/long-article',
        crawledAt: new Date(),
        contentLength: longContent.length,
        links: [],
        metadata: {}
      };

      const mockEmbedding = Array(1536).fill(0.1);

      mockedFs.readdir.mockResolvedValue(['long-article.json'] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockCrawledPage));

      mockOpenAI.embeddings = {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: mockEmbedding }]
        })
      } as any;

      // Mock validation to return multiple valid chunks
      const mockChunks = [
        {
          id: 'long-article-chunk-1',
          content: longContent.substring(0, 5000),
          title: 'Long Medical Article',
          source: 'Eve Appeal Website',
          sourceUrl: 'https://eveappeal.org.uk/information/long-article',
          lastReviewed: new Date(),
          contentVector: mockEmbedding
        },
        {
          id: 'long-article-chunk-2',
          content: longContent.substring(4800), // With overlap
          title: 'Long Medical Article',
          source: 'Eve Appeal Website',
          sourceUrl: 'https://eveappeal.org.uk/information/long-article',
          lastReviewed: new Date(),
          contentVector: mockEmbedding
        }
      ];

      mockValidationService.validateContentChunks.mockResolvedValue({
        validChunks: mockChunks,
        invalidChunks: []
      });

      mockSearchService.indexDocuments.mockResolvedValue({
        success: true,
        indexed: 2,
        errors: []
      });

      // Act
      const result = await ingestionService.processContent();

      // Assert
      expect(result.chunksCreated).toBe(2);
      // Verify all chunks have the same source URL
      const indexedChunks = (mockSearchService.indexDocuments as jest.Mock).mock.calls[0][0];
      expect(indexedChunks).toHaveLength(2);
      indexedChunks.forEach((chunk: ContentChunk) => {
        expect(chunk.sourceUrl).toBe('https://eveappeal.org.uk/information/long-article');
      });
    });

    it('should reject content chunks without valid source URLs', async () => {
      // Arrange
      const mockCrawledPage: CrawledPage = {
        url: 'https://external-site.com/health-info',
        title: 'External Health Info',
        content: 'Some health information from an external site.',
        sourceUrl: 'https://external-site.com/health-info', // Invalid domain
        crawledAt: new Date(),
        contentLength: 50,
        links: [],
        metadata: {}
      };

      mockedFs.readdir.mockResolvedValue(['external-health-info.json'] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockCrawledPage));

      // Mock validation service to reject invalid chunks
      mockValidationService.validateContentChunks.mockResolvedValue({
        validChunks: [],
        invalidChunks: [
          {
            chunk: {
              id: 'external-health-info-chunk-1',
              content: mockCrawledPage.content,
              title: mockCrawledPage.title,
              source: 'External Site',
              sourceUrl: mockCrawledPage.sourceUrl,
              lastReviewed: new Date()
            } as ContentChunk,
            errors: ['Source URL must be from eveappeal.org.uk domain']
          }
        ]
      });

      // Act
      const result = await ingestionService.processContent();

      // Assert
      expect(result.success).toBe(false);
      expect(result.chunksCreated).toBe(0);
      expect(result.errors).toContain(
        expect.stringContaining('Invalid content chunks found')
      );
      expect(mockSearchService.indexDocuments).not.toHaveBeenCalled();
    });

    it('should generate embeddings for all content chunks', async () => {
      // Arrange
      const mockCrawledPage: CrawledPage = {
        url: 'https://eveappeal.org.uk/symptoms/pelvic-pain',
        title: 'Understanding Pelvic Pain',
        content: 'Pelvic pain can be a symptom of various gynecological conditions including ovarian cysts, endometriosis, or more serious conditions like gynecological cancers.',
        sourceUrl: 'https://eveappeal.org.uk/symptoms/pelvic-pain',
        crawledAt: new Date(),
        contentLength: 150,
        links: [],
        metadata: {}
      };

      const mockEmbedding = Array(1536).fill(0.2);

      mockedFs.readdir.mockResolvedValue(['pelvic-pain.json'] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockCrawledPage));

      mockOpenAI.embeddings = {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: mockEmbedding }]
        })
      } as any;

      mockValidationService.validateContentChunks.mockResolvedValue({
        validChunks: [
          {
            id: 'pelvic-pain-chunk-1',
            content: mockCrawledPage.content,
            title: mockCrawledPage.title,
            source: 'Eve Appeal Website',
            sourceUrl: mockCrawledPage.sourceUrl,
            lastReviewed: new Date(),
            contentVector: mockEmbedding
          }
        ],
        invalidChunks: []
      });

      mockSearchService.indexDocuments.mockResolvedValue({
        success: true,
        indexed: 1,
        errors: []
      });

      // Act
      await ingestionService.processContent();

      // Assert
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: mockCrawledPage.content
      });
      
      const indexedChunks = (mockSearchService.indexDocuments as jest.Mock).mock.calls[0][0];
      expect(indexedChunks[0].contentVector).toEqual(mockEmbedding);
    });

    it('should handle OpenAI API errors gracefully', async () => {
      // Arrange
      const mockCrawledPage: CrawledPage = {
        url: 'https://eveappeal.org.uk/information/test',
        title: 'Test Content',
        content: 'Test health information content.',
        sourceUrl: 'https://eveappeal.org.uk/information/test',
        crawledAt: new Date(),
        contentLength: 30,
        links: [],
        metadata: {}
      };

      mockedFs.readdir.mockResolvedValue(['test.json'] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockCrawledPage));

      // Mock OpenAI to throw an error
      mockOpenAI.embeddings = {
        create: jest.fn().mockRejectedValue(new Error('OpenAI API quota exceeded'))
      } as any;

      // Act
      const result = await ingestionService.processContent();

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Failed to generate embeddings')
      );
      expect(mockSearchService.indexDocuments).not.toHaveBeenCalled();
    });

    it('should preserve clinical accuracy during content chunking', async () => {
      // Arrange
      const medicalContent = 'Ovarian cancer risk factors include age (most common after menopause), family history of ovarian or breast cancer, genetic mutations (BRCA1 and BRCA2), and never having been pregnant. However, having risk factors does not mean you will definitely develop ovarian cancer. Many women with risk factors never develop the disease, while some with no known risk factors do.';
      
      const mockCrawledPage: CrawledPage = {
        url: 'https://eveappeal.org.uk/information/ovarian-cancer/risk-factors',
        title: 'Ovarian Cancer Risk Factors',
        content: medicalContent,
        sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer/risk-factors',
        crawledAt: new Date(),
        contentLength: medicalContent.length,
        links: [],
        metadata: {}
      };

      const mockEmbedding = Array(1536).fill(0.3);

      mockedFs.readdir.mockResolvedValue(['risk-factors.json'] as any);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockCrawledPage));

      mockOpenAI.embeddings = {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: mockEmbedding }]
        })
      } as any;

      mockValidationService.validateContentChunks.mockResolvedValue({
        validChunks: [
          {
            id: 'risk-factors-chunk-1',
            content: medicalContent,
            title: 'Ovarian Cancer Risk Factors',
            source: 'Eve Appeal Website',
            sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer/risk-factors',
            lastReviewed: new Date(),
            contentVector: mockEmbedding
          }
        ],
        invalidChunks: []
      });

      mockSearchService.indexDocuments.mockResolvedValue({
        success: true,
        indexed: 1,
        errors: []
      });

      // Act
      const result = await ingestionService.processContent();

      // Assert
      const indexedChunks = (mockSearchService.indexDocuments as jest.Mock).mock.calls[0][0];
      const chunk = indexedChunks[0];
      
      // Verify content integrity
      expect(chunk.content).toBe(medicalContent);
      expect(chunk.content).toContain('BRCA1 and BRCA2');
      expect(chunk.content).toContain('risk factors does not mean you will definitely develop');
      expect(chunk.sourceUrl).toBe('https://eveappeal.org.uk/information/ovarian-cancer/risk-factors');
    });
  });

  describe('chunkContent', () => {
    it('should split long content into appropriate chunks with overlap', () => {
      // Arrange
      const longContent = 'A'.repeat(10000);
      
      // Act
      const chunks = ingestionService['chunkContent'](longContent, 'Test Title', 'https://eveappeal.org.uk/test');
      
      // Assert
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(8000);
        expect(chunk.sourceUrl).toBe('https://eveappeal.org.uk/test');
        expect(chunk.title).toBe('Test Title');
      });
    });

    it('should preserve sentence boundaries when chunking', () => {
      // Arrange
      const content = 'First sentence about symptoms. Second sentence about diagnosis. Third sentence about treatment. '.repeat(100);
      
      // Act
      const chunks = ingestionService['chunkContent'](content, 'Medical Info', 'https://eveappeal.org.uk/medical');
      
      // Assert
      chunks.forEach(chunk => {
        // Should not break in the middle of sentences
        expect(chunk.content.trim()).toMatch(/[.!?]$/);
      });
    });
  });
});