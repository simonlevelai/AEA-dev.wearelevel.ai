import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';

const EntityCategorySchema = z.object({
  name: z.string(),
  items: z.array(z.string()),
  description: z.string().optional()
});

const EntityCollectionSchema = z.object({
  systemPrompt: z.string(),
  categories: z.array(EntityCategorySchema)
});

export type EntityCategory = z.infer<typeof EntityCategorySchema>;
export type EntityCollection = z.infer<typeof EntityCollectionSchema>;

export class EntityService {
  private entities: EntityCollection | null = null;
  private readonly entitiesPath: string;
  private readonly systemPromptPath: string;

  constructor(
    entitiesPath: string = './config/entities',
    systemPromptPath: string = './config/entities/system-prompt.txt'
  ) {
    this.entitiesPath = path.resolve(entitiesPath);
    this.systemPromptPath = path.resolve(systemPromptPath);
  }

  async initialize(): Promise<void> {
    try {
      const systemPrompt = await this.loadSystemPrompt();
      const categories = await this.loadEntityCategories();
      
      this.entities = EntityCollectionSchema.parse({
        systemPrompt,
        categories
      });

      logger.info(`Loaded ${categories.length} entity categories and system prompt`);
    } catch (error) {
      logger.error('Failed to initialize EntityService:', error);
      
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Entity service initialization failed');
    }
  }

  private async loadSystemPrompt(): Promise<string> {
    if (!fs.existsSync(this.systemPromptPath)) {
      throw new Error(`System prompt file not found: ${this.systemPromptPath}`);
    }

    const content = fs.readFileSync(this.systemPromptPath, 'utf-8');
    
    if (!content.trim()) {
      throw new Error('System prompt file is empty');
    }

    return content.trim();
  }

  private async loadEntityCategories(): Promise<EntityCategory[]> {
    if (!fs.existsSync(this.entitiesPath)) {
      throw new Error(`Entities directory not found: ${this.entitiesPath}`);
    }

    const files = fs.readdirSync(this.entitiesPath)
      .filter(file => file.endsWith('.txt') && file !== 'system-prompt.txt');

    const categories: EntityCategory[] = [];

    for (const file of files) {
      const filePath = path.join(this.entitiesPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const items = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      if (items.length > 0) {
        const categoryName = this.extractCategoryName(file);
        
        categories.push({
          name: categoryName,
          items,
          description: `Medical entities for ${categoryName}`
        });
      }
    }

    return categories;
  }

  private extractCategoryName(filename: string): string {
    return filename
      .replace('Ask_Eve_Assist_v1_Entity_', '')
      .replace('_Items.txt', '')
      .replace(/_/g, ' ')
      .toLowerCase();
  }

  getSystemPrompt(): string {
    if (!this.entities) {
      throw new Error('EntityService not initialized. Call initialize() first.');
    }
    return this.entities.systemPrompt;
  }

  getEntityCategories(): EntityCategory[] {
    if (!this.entities) {
      throw new Error('EntityService not initialized. Call initialize() first.');
    }
    return this.entities.categories;
  }

  getCategoryByName(name: string): EntityCategory | undefined {
    if (!this.entities) {
      throw new Error('EntityService not initialized. Call initialize() first.');
    }
    return this.entities.categories.find(
      category => category.name.toLowerCase() === name.toLowerCase()
    );
  }

  getAllEntities(): string[] {
    if (!this.entities) {
      throw new Error('EntityService not initialized. Call initialize() first.');
    }
    return this.entities.categories.flatMap(category => category.items);
  }

  findMatchingEntities(text: string): { category: string; matches: string[] }[] {
    if (!this.entities) {
      throw new Error('EntityService not initialized. Call initialize() first.');
    }

    const textLower = text.toLowerCase();
    const results: { category: string; matches: string[] }[] = [];

    for (const category of this.entities.categories) {
      const matches: string[] = [];
      
      for (const entityLine of category.items) {
        // Parse entity format: entity_key|synonym1,synonym2,synonym3
        const parts = entityLine.split('|');
        if (parts.length === 2) {
          const synonyms = parts[1].split(',').map(s => s.trim());
          
          // Check if any synonym matches the text
          for (const synonym of synonyms) {
            if (textLower.includes(synonym.toLowerCase())) {
              matches.push(synonym);
            }
          }
        }
      }

      if (matches.length > 0) {
        results.push({
          category: category.name,
          matches: [...new Set(matches)] // Remove duplicates
        });
      }
    }

    return results;
  }

  isUrgencyIndicator(text: string): boolean {
    const urgencyCategory = this.getCategoryByName('urgency indicators');
    if (!urgencyCategory) return false;

    const textLower = text.toLowerCase();
    return urgencyCategory.items.some(indicator => 
      textLower.includes(indicator.toLowerCase())
    );
  }

  isCrisisIndicator(text: string): boolean {
    const urgencyCategory = this.getCategoryByName('urgency indicators');
    if (!urgencyCategory) return false;

    const textLower = text.toLowerCase();
    const crisisTerms = [
      'want to die', 'ending it all', 'kill myself', 'suicide', 
      'self harm', 'hurt myself', 'end my life'
    ];

    return crisisTerms.some(term => textLower.includes(term)) ||
           urgencyCategory.items.some(indicator => 
             textLower.includes(indicator.toLowerCase()) && 
             indicator.toLowerCase().includes('crisis')
           );
  }
}