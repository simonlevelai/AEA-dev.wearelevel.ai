import { EntityService } from '../EntityService';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
jest.mock('../../utils/logger');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('EntityService', () => {
  let entityService: EntityService;
  const mockEntitiesPath = './test-entities';
  const mockSystemPromptPath = './test-entities/system-prompt.txt';

  beforeEach(() => {
    jest.clearAllMocks();
    entityService = new EntityService(mockEntitiesPath, mockSystemPromptPath);
  });

  describe('initialize', () => {
    it('should load system prompt and entity categories successfully', async () => {
      // Arrange
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (filePath.includes('system-prompt.txt')) return true;
        if (filePath.includes('test-entities')) return true;
        return false;
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('system-prompt.txt')) {
          return 'Test system prompt for healthcare chatbot';
        }
        return '';
      });

      mockFs.readdirSync.mockReturnValue([
        'system-prompt.txt',
        'Ask_Eve_Assist_v1_Entity_Cancer_Types_Items.txt'
      ] as any);

      // Act & Assert
      await expect(entityService.initialize()).resolves.not.toThrow();
    });

    it('should throw error if system prompt file does not exist', async () => {
      // Arrange
      mockFs.existsSync.mockImplementation((filePath: any) => {
        return !filePath.includes('system-prompt.txt');
      });

      // Act & Assert
      await expect(entityService.initialize()).rejects.toThrow(
        'System prompt file not found'
      );
    });

    it('should throw error if system prompt file is empty', async () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('system-prompt.txt')) return '   ';
        return '';
      });
      mockFs.readdirSync.mockReturnValue([]);

      // Act & Assert
      await expect(entityService.initialize()).rejects.toThrow(
        'System prompt file is empty'
      );
    });

    it('should throw error if entities directory does not exist', async () => {
      // Arrange
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (filePath.includes('system-prompt.txt')) return true;
        return false;
      });

      mockFs.readFileSync.mockReturnValue('Test prompt');

      // Act & Assert
      await expect(entityService.initialize()).rejects.toThrow(
        'Entities directory not found'
      );
    });
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt after initialization', async () => {
      // Arrange
      const expectedPrompt = 'Healthcare chatbot system prompt';
      await setupMockInitialization(expectedPrompt);
      await entityService.initialize();

      // Act
      const result = entityService.getSystemPrompt();

      // Assert
      expect(result).toBe(expectedPrompt);
    });

    it('should throw error if not initialized', () => {
      // Act & Assert
      expect(() => entityService.getSystemPrompt()).toThrow(
        'EntityService not initialized'
      );
    });
  });

  describe('findMatchingEntities', () => {
    beforeEach(async () => {
      await setupMockInitializationWithEntities();
      await entityService.initialize();
    });

    it('should find matching cancer entities in user text', () => {
      // Arrange
      const userText = 'I am worried about ovarian cancer symptoms';

      // Act
      const matches = entityService.findMatchingEntities(userText);

      // Assert
      expect(matches).toEqual([
        {
          category: 'cancer types',
          matches: ['ovarian cancer']
        }
      ]);
    });

    it('should find multiple entity matches across categories', () => {
      // Arrange
      const userText = 'cervical screening for HPV detection';

      // Act
      const matches = entityService.findMatchingEntities(userText);

      // Assert
      expect(matches).toHaveLength(2);
      expect(matches.some(m => m.category === 'procedures')).toBe(true);
      expect(matches.some(m => m.category === 'hpv types')).toBe(true);
    });

    it('should return empty array if no matches found', () => {
      // Arrange
      const userText = 'completely unrelated topic about cars';

      // Act
      const matches = entityService.findMatchingEntities(userText);

      // Assert
      expect(matches).toEqual([]);
    });
  });

  describe('isCrisisIndicator', () => {
    beforeEach(async () => {
      await setupMockInitializationWithEntities();
      await entityService.initialize();
    });

    it('should detect crisis language in user input', () => {
      // Arrange
      const crisisTexts = [
        'I want to die',
        'thinking about ending it all',
        'I want to kill myself'
      ];

      // Act & Assert
      crisisTexts.forEach(text => {
        expect(entityService.isCrisisIndicator(text)).toBe(true);
      });
    });

    it('should not flag non-crisis medical concerns', () => {
      // Arrange
      const normalTexts = [
        'I have symptoms of ovarian cancer',
        'worried about cervical screening results',
        'need information about HPV'
      ];

      // Act & Assert
      normalTexts.forEach(text => {
        expect(entityService.isCrisisIndicator(text)).toBe(false);
      });
    });
  });

  describe('isUrgencyIndicator', () => {
    beforeEach(async () => {
      await setupMockInitializationWithEntities();
      await entityService.initialize();
    });

    it('should detect urgent medical situations', () => {
      // Arrange
      const urgentText = 'severe bleeding emergency';

      // Act
      const isUrgent = entityService.isUrgencyIndicator(urgentText);

      // Assert
      expect(isUrgent).toBe(true);
    });

    it('should not flag routine health queries as urgent', () => {
      // Arrange
      const routineText = 'information about regular screening';

      // Act
      const isUrgent = entityService.isUrgencyIndicator(routineText);

      // Assert
      expect(isUrgent).toBe(false);
    });
  });

  // Helper functions
  function setupMockInitialization(systemPrompt: string = 'Test prompt') {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(systemPrompt);
    mockFs.readdirSync.mockReturnValue([]);
  }

  function setupMockInitializationWithEntities() {
    mockFs.existsSync.mockReturnValue(true);
    
    mockFs.readFileSync.mockImplementation((filePath: any) => {
      if (filePath.includes('system-prompt.txt')) {
        return 'Healthcare chatbot system prompt';
      }
      if (filePath.includes('Cancer_Types')) {
        return 'ovarian cancer\ncervical cancer\nendometrial cancer';
      }
      if (filePath.includes('Procedures')) {
        return 'cervical screening\ncolposcopy\nbiopsy';
      }
      if (filePath.includes('HPV_Types')) {
        return 'HPV 16\nHPV 18\nHPV detection';
      }
      if (filePath.includes('Urgency_Indicators')) {
        return 'severe bleeding\nemergency\nurgent care needed';
      }
      return '';
    });

    mockFs.readdirSync.mockReturnValue([
      'system-prompt.txt',
      'Ask_Eve_Assist_v1_Entity_Cancer_Types_Items.txt',
      'Ask_Eve_Assist_v1_Entity_Procedures_Items.txt',
      'Ask_Eve_Assist_v1_Entity_HPV_Types_Items.txt',
      'Ask_Eve_Assist_v1_Entity_Urgency_Indicators_Items.txt'
    ] as any);
  }
});