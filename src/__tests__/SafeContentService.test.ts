import { SafeContentService } from '../services/SafeContentService';
import { ContentService } from '../services/ContentService';
import { SafetyServiceAdapter } from '../services/SafetyServiceAdapter';
import { SearchResponse } from '../types/content';

// Mock dependencies
jest.mock('../services/ContentService');
jest.mock('../services/SafetyServiceAdapter');

const MockedContentService = ContentService as jest.MockedClass<typeof ContentService>;
const MockedSafetyServiceAdapter = SafetyServiceAdapter as jest.MockedClass<typeof SafetyServiceAdapter>;

describe('SafeContentService', () => {
  let safeContentService: SafeContentService;
  let mockContentService: jest.Mocked<ContentService>;
  let mockSafetyService: jest.Mocked<SafetyServiceAdapter>;

  beforeEach(() => {
    mockContentService = new MockedContentService() as jest.Mocked<ContentService>;
    mockSafetyService = new MockedSafetyServiceAdapter() as jest.Mocked<SafetyServiceAdapter>;
    safeContentService = new SafeContentService(mockContentService, mockSafetyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchWithSafetyMonitoring', () => {
    const mockContext = {
      userId: 'user123',
      sessionId: 'session456',
      conversationHistory: [
        { text: 'Hello', isUser: true, timestamp: new Date() },
        { text: 'Hi there! How can I help?', isUser: false, timestamp: new Date() }
      ]
    };

    it('should perform safe content search with low safety risk', async () => {
      // Arrange
      const query = 'cervical screening information';
      const mockSearchResponse: SearchResponse = {
        found: true,
        content: 'Cervical screening is a health test...',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/cervical-screening',
        relevanceScore: 0.92
      };

      mockSafetyService.analyzeMessage.mockResolvedValue({
        shouldEscalate: false,
        severity: 'low',
        reason: 'Normal health information query'
      });

      mockContentService.searchWithSafetyFilter.mockResolvedValue(mockSearchResponse);

      // Act
      const result = await safeContentService.searchWithSafetyMonitoring(query, mockContext);

      // Assert
      expect(mockSafetyService.analyzeMessage).toHaveBeenCalledWith(
        query,
        mockContext.conversationHistory
      );
      
      expect(mockContentService.searchWithSafetyFilter).toHaveBeenCalledWith(query, {
        userId: mockContext.userId,
        sessionId: mockContext.sessionId,
        isCrisis: false
      });

      expect(result.searchResponse).toEqual(mockSearchResponse);
      expect(result.safetyAnalysis).toEqual({
        shouldEscalate: false,
        severity: 'low',
        escalationType: undefined,
        reason: 'Normal health information query'
      });
    });

    it('should handle crisis situations with escalation', async () => {
      // Arrange
      const query = 'severe bleeding emergency help';
      const mockSearchResponse: SearchResponse = {
        found: true,
        content: 'If you are experiencing severe bleeding...',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/emergencies',
        relevanceScore: 0.95
      };

      mockSafetyService.analyzeMessage.mockResolvedValue({
        shouldEscalate: true,
        severity: 'critical',
        escalationType: 'medical_emergency',
        reason: 'Medical emergency detected'
      });

      mockContentService.searchWithSafetyFilter.mockResolvedValue(mockSearchResponse);

      // Act
      const result = await safeContentService.searchWithSafetyMonitoring(query, mockContext);

      // Assert
      expect(mockContentService.searchWithSafetyFilter).toHaveBeenCalledWith(query, {
        userId: mockContext.userId,
        sessionId: mockContext.sessionId,
        isCrisis: true // Should be true for critical severity
      });

      expect(result.searchResponse).toEqual(mockSearchResponse);
      expect(result.safetyAnalysis).toEqual({
        shouldEscalate: true,
        severity: 'critical',
        escalationType: 'medical_emergency',
        reason: 'Medical emergency detected'
      });
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const query = 'test query';
      mockSafetyService.analyzeMessage.mockRejectedValue(new Error('Safety service error'));

      // Act
      const result = await safeContentService.searchWithSafetyMonitoring(query, mockContext);

      // Assert
      expect(result.searchResponse).toEqual({
        found: false,
        content: '',
        source: '',
        sourceUrl: ''
      });
      
      expect(result.safetyAnalysis).toEqual({
        shouldEscalate: true,
        severity: 'high',
        reason: 'Content search system error - recommend human assistance'
      });
    });
  });

  describe('searchMultipleWithSafety', () => {
    const mockContext = {
      userId: 'user123',
      sessionId: 'session456',
      conversationHistory: []
    };

    it('should search multiple content with safety monitoring', async () => {
      // Arrange
      const query = 'gynecological cancers information';
      const maxResults = 3;
      
      const mockSearchResults = {
        found: true,
        results: [
          {
            found: true,
            content: 'Cervical cancer information...',
            source: 'Eve Appeal',
            sourceUrl: 'https://eveappeal.org.uk/information/cervical-cancer',
            relevanceScore: 0.9
          },
          {
            found: true,
            content: 'Ovarian cancer information...',
            source: 'Eve Appeal',
            sourceUrl: 'https://eveappeal.org.uk/information/ovarian-cancer',
            relevanceScore: 0.85
          }
        ],
        totalCount: 2
      };

      mockSafetyService.analyzeMessage.mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      });

      mockContentService.searchMultipleContent.mockResolvedValue(mockSearchResults);

      // Act
      const result = await safeContentService.searchMultipleWithSafety(query, mockContext, maxResults);

      // Assert
      expect(mockContentService.searchMultipleContent).toHaveBeenCalledWith(query, maxResults);
      
      expect(result.searchResults).toEqual(mockSearchResults);
      expect(result.safetyAnalysis.shouldEscalate).toBe(false);
      expect(result.safetyAnalysis.severity).toBe('low');
    });

    it('should handle multiple content search errors', async () => {
      // Arrange
      const query = 'test query';
      mockSafetyService.analyzeMessage.mockResolvedValue({
        shouldEscalate: false,
        severity: 'low'
      });
      mockContentService.searchMultipleContent.mockRejectedValue(new Error('Search error'));

      // Act
      const result = await safeContentService.searchMultipleWithSafety(query, mockContext);

      // Assert
      expect(result.searchResults).toEqual({
        found: false,
        results: [],
        totalCount: 0
      });
      
      expect(result.safetyAnalysis.shouldEscalate).toBe(true);
      expect(result.safetyAnalysis.severity).toBe('high');
    });
  });

  describe('validateMHRACompliance', () => {
    it('should validate compliant content with valid Eve Appeal source', () => {
      // Arrange
      const compliantResponse: SearchResponse = {
        found: true,
        content: 'Health information content...',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/health-guide'
      };

      // Act
      const result = safeContentService.validateMHRACompliance(compliantResponse);

      // Assert
      expect(result.isCompliant).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.sourceAttribution).toEqual({
        hasSourceUrl: true,
        isValidDomain: true,
        sourceUrl: 'https://eveappeal.org.uk/information/health-guide'
      });
    });

    it('should identify non-compliant content without source URL', () => {
      // Arrange
      const nonCompliantResponse: SearchResponse = {
        found: true,
        content: 'Health information content...',
        source: 'Eve Appeal',
        sourceUrl: '' // Missing source URL
      };

      // Act
      const result = safeContentService.validateMHRACompliance(nonCompliantResponse);

      // Assert
      expect(result.isCompliant).toBe(false);
      expect(result.issues).toContain('Missing source URL - MHRA requires source attribution for all health information');
      expect(result.sourceAttribution.hasSourceUrl).toBe(false);
    });

    it('should identify non-compliant content with invalid domain', () => {
      // Arrange
      const nonCompliantResponse: SearchResponse = {
        found: true,
        content: 'Health information content...',
        source: 'Other Source',
        sourceUrl: 'https://example.com/health-info' // Invalid domain
      };

      // Act
      const result = safeContentService.validateMHRACompliance(nonCompliantResponse);

      // Assert
      expect(result.isCompliant).toBe(false);
      expect(result.issues).toContain('Invalid source domain: https://example.com/health-info - Only eveappeal.org.uk content is approved');
      expect(result.sourceAttribution.isValidDomain).toBe(false);
    });

    it('should identify missing source information', () => {
      // Arrange
      const nonCompliantResponse: SearchResponse = {
        found: true,
        content: 'Health information content...',
        source: '', // Missing source
        sourceUrl: 'https://eveappeal.org.uk/information/health-guide'
      };

      // Act
      const result = safeContentService.validateMHRACompliance(nonCompliantResponse);

      // Assert
      expect(result.isCompliant).toBe(false);
      expect(result.issues).toContain('Missing source information - Content must identify its source organization');
    });
  });

  describe('generateSafeResponse', () => {
    it('should generate compliant response with low safety risk', () => {
      // Arrange
      const searchResponse: SearchResponse = {
        found: true,
        content: 'Cervical screening is recommended every 3 years...',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/cervical-screening',
        sourcePage: 2
      };

      const safetyAnalysis = {
        shouldEscalate: false,
        severity: 'low' as const
      };

      // Act
      const result = safeContentService.generateSafeResponse(searchResponse, safetyAnalysis);

      // Assert
      expect(result.content).toBe(searchResponse.content);
      expect(result.sourceAttribution).toBe('Source: Eve Appeal (https://eveappeal.org.uk/information/cervical-screening) - Page 2');
      expect(result.escalationMessage).toBeUndefined();
      expect(result.requiresEscalation).toBe(false);
    });

    it('should generate response with critical escalation message', () => {
      // Arrange
      const searchResponse: SearchResponse = {
        found: true,
        content: 'Emergency symptoms information...',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/emergencies'
      };

      const safetyAnalysis = {
        shouldEscalate: true,
        severity: 'critical' as const,
        escalationType: 'medical_emergency' as const
      };

      // Act
      const result = safeContentService.generateSafeResponse(searchResponse, safetyAnalysis);

      // Assert
      expect(result.content).toBe(searchResponse.content);
      expect(result.escalationMessage).toBe('This appears to be a medical emergency. Please call 999 or go to your nearest A&E immediately.');
      expect(result.requiresEscalation).toBe(true);
    });

    it('should handle non-compliant content', () => {
      // Arrange
      const nonCompliantResponse: SearchResponse = {
        found: true,
        content: 'Health information...',
        source: '',
        sourceUrl: '' // Missing source URL
      };

      const safetyAnalysis = {
        shouldEscalate: false,
        severity: 'low' as const
      };

      // Act
      const result = safeContentService.generateSafeResponse(nonCompliantResponse, safetyAnalysis);

      // Assert
      expect(result.content).toBe('I apologize, but I cannot provide this information as it does not meet medical information standards. Please consult with a healthcare professional.');
      expect(result.sourceAttribution).toBe('Content validation failed - no source attribution available');
      expect(result.escalationMessage).toBe('Content compliance issues detected - human review required');
      expect(result.requiresEscalation).toBe(true);
    });

    it('should generate different escalation messages based on severity', () => {
      // Arrange
      const searchResponse: SearchResponse = {
        found: true,
        content: 'Health concern information...',
        source: 'Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/information/health-concerns'
      };

      // Test high severity
      const highSeverityAnalysis = {
        shouldEscalate: true,
        severity: 'high' as const
      };

      // Act
      const highResult = safeContentService.generateSafeResponse(searchResponse, highSeverityAnalysis);

      // Assert
      expect(highResult.escalationMessage).toBe('This sounds concerning. Please contact your GP or NHS 111 for urgent medical advice.');
      expect(highResult.requiresEscalation).toBe(true);

      // Test medium severity
      const mediumSeverityAnalysis = {
        shouldEscalate: true,
        severity: 'medium' as const
      };

      // Act
      const mediumResult = safeContentService.generateSafeResponse(searchResponse, mediumSeverityAnalysis);

      // Assert
      expect(mediumResult.escalationMessage).toBe('Please consider speaking with a healthcare professional about your concerns.');
      expect(mediumResult.requiresEscalation).toBe(true);
    });

    it('should handle content not found scenario', () => {
      // Arrange
      const searchResponse: SearchResponse = {
        found: false,
        content: '',
        source: 'Eve Appeal', // Valid source but no content found
        sourceUrl: 'https://eveappeal.org.uk/information/not-found'
      };

      const safetyAnalysis = {
        shouldEscalate: false,
        severity: 'low' as const
      };

      // Act
      const result = safeContentService.generateSafeResponse(searchResponse, safetyAnalysis);

      // Assert
      expect(result.content).toBe('I could not find specific information about this topic. Please consult with a healthcare professional for personalized advice.');
      expect(result.sourceAttribution).toBe('Source: Eve Appeal (https://eveappeal.org.uk/information/not-found)');
      expect(result.requiresEscalation).toBe(false);
    });
  });
});