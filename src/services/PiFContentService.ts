import { ContentService, SearchResponse } from '../types';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PiFChunk {
  id: string;
  content: string;
  source: string;
  sourceUrl?: string;
  title?: string;
  pageNumber?: number;
  relevanceScore?: number;
}

/**
 * ContentService implementation that searches through PiF (Patient Information) content chunks
 * Provides MHRA-compliant health information from The Eve Appeal
 */
export class PiFContentService implements ContentService {
  private logger: Logger;
  private pifChunks: PiFChunk[] = [];
  private initialized = false;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      const pifPath = path.join(process.cwd(), 'data/pif-chunks.json');
      const pifData = await fs.readFile(pifPath, 'utf-8');
      this.pifChunks = JSON.parse(pifData);
      this.initialized = true;

      this.logger.info(`PiFContentService initialized with ${this.pifChunks.length} content chunks`);
    } catch (error) {
      this.logger.error('Failed to initialize PiFContentService', { error });
      throw new Error('Critical failure: Could not load PiF content');
    }
  }

  async searchContent(query: string): Promise<SearchResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const cleanedQuery = this.cleanQuery(query);
      if (!cleanedQuery) {
        return { found: false };
      }

      // Search through PiF chunks for relevant content
      const scoredChunks = this.pifChunks
        .map(chunk => ({
          ...chunk,
          relevanceScore: this.calculateRelevanceScore(cleanedQuery, chunk)
        }))
        .filter(chunk => chunk.relevanceScore > 0.1)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      if (scoredChunks.length === 0) {
        this.logger.info('No relevant PiF content found', { query: cleanedQuery });
        return { found: false };
      }

      const bestMatch = scoredChunks[0];
      
      // Ensure we have a valid source URL - critical for MHRA compliance
      const sourceUrl = this.generateSourceUrl(bestMatch);
      if (!sourceUrl) {
        this.logger.warn('No valid source URL for PiF content', { chunkId: bestMatch.id });
        return { found: false };
      }

      this.logger.info('Found relevant PiF content', {
        query: cleanedQuery,
        chunkId: bestMatch.id,
        relevanceScore: bestMatch.relevanceScore,
        source: bestMatch.source
      });

      return {
        found: true,
        content: this.truncateContent(bestMatch.content),
        source: bestMatch.source || 'The Eve Appeal',
        sourceUrl,
        relevanceScore: bestMatch.relevanceScore
      };

    } catch (error) {
      this.logger.error('PiF content search failed', { error, query });
      return { found: false };
    }
  }

  private cleanQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 200); // Limit query length
  }

  private calculateRelevanceScore(query: string, chunk: PiFChunk): number {
    const queryWords = query.split(' ').filter(word => word.length > 2);
    const contentLower = chunk.content.toLowerCase();
    const titleLower = (chunk.title || '').toLowerCase();
    
    let score = 0;
    let wordMatches = 0;

    for (const word of queryWords) {
      // Title matches are weighted higher
      if (titleLower.includes(word)) {
        score += 0.3;
        wordMatches++;
      }
      
      // Content matches
      if (contentLower.includes(word)) {
        score += 0.1;
        wordMatches++;
        
        // Bonus for multiple occurrences of the same word
        const occurrences = (contentLower.match(new RegExp(word, 'g')) || []).length;
        if (occurrences > 1) {
          score += Math.min(occurrences * 0.05, 0.2);
        }
      }
    }

    // Boost score based on percentage of query words found
    if (queryWords.length > 0) {
      const matchPercentage = wordMatches / queryWords.length;
      score *= (0.5 + matchPercentage * 0.5);
    }

    // Apply health topic boosters
    score *= this.getTopicBooster(query, chunk);

    return Math.min(score, 1.0);
  }

  private getTopicBooster(query: string, chunk: PiFChunk): number {
    const healthTopics = {
      'ovarian': ['ovarian', 'ovary', 'ovaries'],
      'cervical': ['cervical', 'cervix'],
      'vulval': ['vulval', 'vulva'],
      'vaginal': ['vaginal', 'vagina'],
      'womb': ['womb', 'uterine', 'endometrial'],
      'hpv': ['hpv', 'human papillomavirus'],
      'screening': ['screening', 'smear', 'test'],
      'cancer': ['cancer', 'tumour', 'tumor', 'malignant'],
      'symptoms': ['symptom', 'sign', 'indicator']
    };

    let booster = 1.0;
    const queryLower = query.toLowerCase();
    const contentLower = chunk.content.toLowerCase();

    for (const [topic, keywords] of Object.entries(healthTopics)) {
      const queryHasTopic = keywords.some(keyword => queryLower.includes(keyword));
      const contentHasTopic = keywords.some(keyword => contentLower.includes(keyword));
      
      if (queryHasTopic && contentHasTopic) {
        booster += 0.2;
      }
    }

    return Math.min(booster, 2.0);
  }

  private generateSourceUrl(chunk: PiFChunk): string | null {
    // If chunk already has a source URL, use it
    if (chunk.sourceUrl && this.isValidUrl(chunk.sourceUrl)) {
      return chunk.sourceUrl;
    }

    // Generate URL based on source and content type
    const baseUrl = 'https://eveappeal.org.uk';
    
    // Map document names to URLs
    const urlMappings: Record<string, string> = {
      'HPV Guide': `${baseUrl}/gynae-health/hpv`,
      'Lynch Syndrome': `${baseUrl}/gynae-health/lynch-syndrome`,
      'Vaginal Cancer': `${baseUrl}/gynae-health/vaginal-cancer`,
      'Vulval Cancer': `${baseUrl}/gynae-health/vulval-cancer`,
      'Womb Cancer': `${baseUrl}/gynae-health/womb-cancer`,
      'Ovarian Cancer': `${baseUrl}/gynae-health/ovarian-cancer`,
      'Genetic Testing': `${baseUrl}/gynae-health/genetic-testing`
    };

    // Try to match source to known URLs
    for (const [docType, url] of Object.entries(urlMappings)) {
      if (chunk.source.toLowerCase().includes(docType.toLowerCase()) ||
          chunk.content.toLowerCase().includes(docType.toLowerCase())) {
        return url;
      }
    }

    // Default to main gynae health page
    return `${baseUrl}/gynae-health`;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('https://eveappeal.org.uk') || url.startsWith('https://www.eveappeal.org.uk');
    } catch {
      return false;
    }
  }

  private truncateContent(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to truncate at a sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    
    if (lastSentence > maxLength * 0.7) {
      return truncated.substring(0, lastSentence + 1);
    }

    // Fallback to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }
}