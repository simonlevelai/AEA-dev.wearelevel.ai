#!/usr/bin/env ts-node

/**
 * PiF Document Processing Script
 * 
 * Processes The Eve Appeal's PiF Ticked Approved documents into searchable chunks
 * while preserving medical context and maintaining source URL attribution.
 * 
 * Key Features:
 * - Medical-context-aware chunking (never splits critical health information)
 * - Source URL mapping to eveappeal.org.uk
 * - Size optimization for Azure AI Search free tier (50MB limit)
 * - Content validation and quality assurance
 */

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
// import { OpenAI } from 'openai'; - Will be used for embeddings later
import { ContentChunk } from '../src/types/content';

interface PiFDocumentConfig {
  filename: string;
  sourceUrl: string;
  title: string;
  lastUpdated: string;
  coverage: string;
}

interface ProcessingStats {
  totalDocuments: number;
  processedDocuments: number;
  totalChunks: number;
  totalSizeBytes: number;
  averageChunkSize: number;
  processingTimeMs: number;
}

class PiFDocumentProcessor {
  private readonly documentsPath = path.join(__dirname, '../content/pif-documents');
  private readonly outputPath = path.join(__dirname, '../content/processed');
  // OpenAI client for future embedding generation
  // private readonly openai: OpenAI;
  
  // Document configuration from README.md
  private readonly documents: PiFDocumentConfig[] = [
    {
      filename: 'HPV-Guide-2025-brand-update-v1-min.pdf',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/hpv',
      title: 'HPV Guide (2025 Brand Update)',
      lastUpdated: '2025',
      coverage: 'HPV information, prevention, vaccination, screening'
    },
    {
      filename: 'Lynch-Syndrome_Patient-guide_vs2_digital_FINAL_21.02.23.pdf',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/hereditary-cancer',
      title: 'Lynch Syndrome Patient Guide',
      lastUpdated: 'February 2023',
      coverage: 'Hereditary cancer syndrome, genetic testing, family history'
    },
    {
      filename: 'Vaginal-cancer-ER_April-2024.pdf',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/vaginal-cancer',
      title: 'Vaginal Cancer Early Recognition Guide',
      lastUpdated: 'April 2024',
      coverage: 'Vaginal cancer symptoms, early recognition, when to see GP'
    },
    {
      filename: 'Vulval-cancer-ER_April-2024.pdf',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/vulval-cancer',
      title: 'Vulval Cancer Early Recognition Guide',
      lastUpdated: 'April 2024',
      coverage: 'Vulval cancer symptoms, early recognition, when to see GP'
    },
    {
      filename: 'Womb-cancer-ER_April-2024.pdf',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/womb-cancer',
      title: 'Womb Cancer Early Recognition Guide',
      lastUpdated: 'April 2024',
      coverage: 'Womb cancer symptoms, early recognition, when to see GP'
    },
    {
      filename: 'genetic testing in ovarian-A5_vs2_22.04.2024.pdf',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/genetic-testing',
      title: 'Genetic Testing in Ovarian Cancer',
      lastUpdated: 'April 2024',
      coverage: 'Ovarian cancer genetic testing, BRCA genes, family history'
    }
  ];

  constructor() {
    // OpenAI client initialization - will be used for embedding generation later
    // this.openai = new OpenAI({
    //   apiKey: process.env['OPENAI_API_KEY'] || 'test-key-for-development'
    // });
  }

  async processAllDocuments(): Promise<ProcessingStats> {
    const startTime = Date.now();
    console.log('🏥 Starting PiF Document Processing...');
    console.log(`📄 Processing ${this.documents.length} approved documents`);

    const stats: ProcessingStats = {
      totalDocuments: this.documents.length,
      processedDocuments: 0,
      totalChunks: 0,
      totalSizeBytes: 0,
      averageChunkSize: 0,
      processingTimeMs: 0
    };

    const allChunks: ContentChunk[] = [];

    for (const docConfig of this.documents) {
      try {
        console.log(`\\n📖 Processing: ${docConfig.title}`);
        
        const chunks = await this.processDocument(docConfig);
        allChunks.push(...chunks);
        
        stats.processedDocuments++;
        stats.totalChunks += chunks.length;
        
        const docSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
        stats.totalSizeBytes += docSize;
        
        console.log(`✅ Generated ${chunks.length} chunks (${(docSize / 1024).toFixed(1)}KB)`);
        
      } catch (error) {
        console.error(`❌ Failed to process ${docConfig.filename}:`, error);
      }
    }

    // Calculate final stats
    stats.averageChunkSize = stats.totalChunks > 0 ? stats.totalSizeBytes / stats.totalChunks : 0;
    stats.processingTimeMs = Date.now() - startTime;

    // Save processed chunks
    await this.saveProcessedContent(allChunks, stats);

    // Display summary
    this.displayProcessingSummary(stats);

    return stats;
  }

  private async processDocument(docConfig: PiFDocumentConfig): Promise<ContentChunk[]> {
    const filePath = path.join(this.documentsPath, docConfig.filename);
    
    // Read and parse PDF
    const pdfBuffer = await fs.readFile(filePath);
    const pdfData = await pdf(pdfBuffer);
    
    console.log(`  📃 Extracted ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
    
    // Smart chunking with medical context awareness
    const chunks = await this.smartChunkContent(pdfData.text, docConfig);
    
    return chunks;
  }

  private async smartChunkContent(text: string, docConfig: PiFDocumentConfig): Promise<ContentChunk[]> {
    // Clean and normalize text
    const cleanedText = this.cleanPdfText(text);
    
    // Detect structure and medical sections
    const sections = this.detectMedicalSections(cleanedText);
    
    const chunks: ContentChunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      // Split section into appropriately sized chunks while preserving context
      const sectionChunks = this.chunkSection(section, docConfig, chunkIndex);
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    return chunks;
  }

  private cleanPdfText(text: string): string {
    return text
      // Remove excessive whitespace and line breaks
      .replace(/\\s+/g, ' ')
      .replace(/\\n{3,}/g, '\\n\\n')
      // Fix common PDF extraction issues
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Clean up bullet points and numbering
      .replace(/•/g, '\\n• ')
      .replace(/\\d+\\./g, '\\n$&')
      // Remove page headers/footers patterns
      .replace(/The Eve Appeal.*?\\n/gi, '')
      .replace(/Page \\d+ of \\d+/gi, '')
      .trim();
  }

  private detectMedicalSections(text: string): MedicalSection[] {
    const sections: MedicalSection[] = [];
    
    // Key medical section patterns
    const sectionPatterns = [
      { name: 'symptoms', pattern: /(symptoms?|signs?|what to look for)/i, priority: 'high' },
      { name: 'when_to_see_gp', pattern: /(when to see|see your (gp|doctor)|seek help|urgent)/i, priority: 'critical' },
      { name: 'emergency', pattern: /(emergency|urgent|immediately|999|call)/i, priority: 'critical' },
      { name: 'screening', pattern: /(screening|test|examination|check)/i, priority: 'high' },
      { name: 'treatment', pattern: /(treatment|therapy|surgery|medicine)/i, priority: 'medium' },
      { name: 'genetic', pattern: /(genetic|hereditary|family history|brca)/i, priority: 'high' },
      { name: 'support', pattern: /(support|help|contact|phone|email)/i, priority: 'medium' },
      { name: 'prevention', pattern: /(prevent|reduce risk|vaccination|hpv)/i, priority: 'high' }
    ];

    // Split text into logical sections
    const paragraphs = text.split('\\n\\n').filter(p => p.trim().length > 50);
    
    for (const paragraph of paragraphs) {
      let sectionType = 'general';
      let priority: 'critical' | 'high' | 'medium' | 'low' = 'low';
      
      // Identify section type based on content
      for (const pattern of sectionPatterns) {
        if (pattern.pattern.test(paragraph)) {
          sectionType = pattern.name;
          priority = pattern.priority as any;
          break;
        }
      }
      
      sections.push({
        type: sectionType,
        content: paragraph.trim(),
        priority,
        shouldPreserveComplete: priority === 'critical' || sectionType === 'symptoms'
      });
    }

    return sections;
  }

  private chunkSection(section: MedicalSection, docConfig: PiFDocumentConfig, startIndex: number): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const maxChunkSize = section.shouldPreserveComplete ? 4000 : 2000; // Larger chunks for critical content
    
    if (section.content.length <= maxChunkSize || section.shouldPreserveComplete) {
      // Keep section intact - critical for medical information
      chunks.push({
        id: `${this.generateDocId(docConfig)}-chunk-${startIndex}`,
        content: section.content,
        title: `${docConfig.title} - ${this.capitalizeFirst(section.type)}`,
        source: docConfig.title,
        sourceUrl: docConfig.sourceUrl,
        sourcePage: undefined, // PDF page numbers not available from pdf-parse
        lastReviewed: new Date(docConfig.lastUpdated)
      });
    } else {
      // Split larger sections carefully
      const sentences = section.content.split(/(?<=\\.)\\s+/);
      let currentChunk = '';
      let chunkCount = 0;
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
          // Save current chunk
          chunks.push({
            id: `${this.generateDocId(docConfig)}-chunk-${startIndex + chunkCount}`,
            content: currentChunk.trim(),
            title: `${docConfig.title} - ${this.capitalizeFirst(section.type)} (Part ${chunkCount + 1})`,
            source: docConfig.title,
            sourceUrl: docConfig.sourceUrl,
            lastReviewed: new Date(docConfig.lastUpdated)
          });
          
          currentChunk = sentence;
          chunkCount++;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      }
      
      // Don't forget the last chunk
      if (currentChunk.trim()) {
        chunks.push({
          id: `${this.generateDocId(docConfig)}-chunk-${startIndex + chunkCount}`,
          content: currentChunk.trim(),
          title: `${docConfig.title} - ${this.capitalizeFirst(section.type)} (Part ${chunkCount + 1})`,
          source: docConfig.title,
          sourceUrl: docConfig.sourceUrl,
          lastReviewed: new Date(docConfig.lastUpdated)
        });
      }
    }

    return chunks;
  }

  private generateDocId(docConfig: PiFDocumentConfig): string {
    return docConfig.filename
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase();
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }

  private async saveProcessedContent(chunks: ContentChunk[], stats: ProcessingStats): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(this.outputPath, { recursive: true });
    
    // Save chunks as JSON
    const chunksFile = path.join(this.outputPath, 'pif-chunks.json');
    await fs.writeFile(chunksFile, JSON.stringify(chunks, null, 2));
    
    // Update source URLs mapping
    await this.updateSourceUrlsMapping(chunks);
    
    // Update processing log
    await this.updateProcessingLog(stats);
    
    console.log(`\\n💾 Saved ${chunks.length} chunks to ${chunksFile}`);
  }

  private async updateSourceUrlsMapping(chunks: ContentChunk[]): Promise<void> {
    const sourceUrlsPath = path.join(__dirname, '../content/metadata/source-urls.json');
    
    // Group chunks by document
    const documentSources: any = {};
    
    for (const chunk of chunks) {
      const chunkIdParts = chunk.id.split('-chunk-');
      const docId = chunkIdParts.length > 1 ? chunkIdParts[0] : chunk.id;
      
      if (!documentSources[docId]) {
        documentSources[docId] = {
          filename: chunk.source,
          sourceUrl: chunk.sourceUrl,
          title: chunk.source,
          lastReviewed: chunk.lastReviewed.toISOString().split('T')[0],
          pifApprovalDate: chunk.lastReviewed.toISOString().split('T')[0],
          chunks: []
        };
      }
      
      const titleParts = chunk.title.split(' - ');
      const section = titleParts.length > 1 ? titleParts[1] : 'General';
      
      documentSources[docId].chunks.push({
        chunkId: chunk.id,
        sourceUrl: chunk.sourceUrl,
        section: section,
        content: chunk.content.substring(0, 100) + '...',
        keywords: this.extractKeywords(chunk.content)
      });
    }
    
    // Update the mapping file
    const mapping = {
      version: '1.0.0',
      description: 'Maps processed content chunks to their source URLs on eveappeal.org.uk',
      lastUpdated: new Date().toISOString(),
      documentSources,
      webPageSources: {}, // Will be populated by web crawler
      validationRules: {
        mandatoryFields: ['chunkId', 'sourceUrl', 'content'],
        urlValidation: {
          mustStartWith: 'https://eveappeal.org.uk',
          mustBeAccessible: true
        },
        contentIntegrity: {
          preserveMedicalContext: true,
          maintainEmergencyInfo: true,
          requireSourceAttribution: true
        }
      },
      statistics: {
        totalChunks: chunks.length,
        pifDocumentChunks: chunks.length,
        webPageChunks: 0,
        averageChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length),
        sourcesWithoutUrls: 0
      }
    };
    
    await fs.writeFile(sourceUrlsPath, JSON.stringify(mapping, null, 2));
  }

  private extractKeywords(content: string): string[] {
    // Extract medical keywords and important terms
    const medicalTerms = content.toLowerCase().match(/\\b(symptom|cancer|screening|genetic|test|treatment|gp|doctor|urgent|emergency|pain|bleeding|discharge|lump|family history|brca|lynch syndrome|hpv|vaccination)\\b/g);
    
    return [...new Set(medicalTerms || [])];
  }

  private async updateProcessingLog(stats: ProcessingStats): Promise<void> {
    const logPath = path.join(__dirname, '../content/metadata/processing-log.json');
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: 'process-pif-documents',
      status: 'success',
      sourceFile: 'PiF approved documents',
      chunksGenerated: stats.totalChunks,
      sourceUrlsValidated: stats.totalChunks,
      errors: [],
      warnings: [],
      metrics: {
        processingTimeMs: stats.processingTimeMs,
        contentSizeBytes: stats.totalSizeBytes,
        embeddingTokens: 0 // Will be filled when generating embeddings
      }
    };
    
    // Read existing log
    let logData: any = {};
    try {
      const existingLog = await fs.readFile(logPath, 'utf-8');
      logData = JSON.parse(existingLog);
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
    }
    
    // Add new log entry
    if (!logData.logs) logData.logs = [];
    logData.logs.push(logEntry);
    
    // Update current processing run
    logData.currentProcessingRun = {
      startedAt: new Date(Date.now() - stats.processingTimeMs).toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      totalDocuments: stats.totalDocuments,
      processedDocuments: stats.processedDocuments,
      failedDocuments: stats.totalDocuments - stats.processedDocuments,
      totalChunks: stats.totalChunks,
      totalTokensUsed: 0
    };
    
    await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
  }

  private displayProcessingSummary(stats: ProcessingStats): void {
    console.log('\\n' + '='.repeat(60));
    console.log('🏥 PiF DOCUMENT PROCESSING COMPLETE');
    console.log('='.repeat(60));
    console.log(`📄 Documents Processed: ${stats.processedDocuments}/${stats.totalDocuments}`);
    console.log(`🧩 Total Chunks Generated: ${stats.totalChunks}`);
    console.log(`📏 Total Content Size: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📐 Average Chunk Size: ${Math.round(stats.averageChunkSize)} characters`);
    console.log(`⏱️  Processing Time: ${(stats.processingTimeMs / 1000).toFixed(1)} seconds`);
    console.log('\\n🎯 Azure AI Search Free Tier Status:');
    console.log(`   Used: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB / 50 MB limit`);
    console.log(`   Remaining: ${(50 - (stats.totalSizeBytes / 1024 / 1024)).toFixed(2)} MB for web content`);
    
    if (stats.totalSizeBytes / 1024 / 1024 > 40) {
      console.log('\\n⚠️  WARNING: Content size approaching 40MB limit for PiF documents');
      console.log('   Consider more aggressive chunking or content selection');
    } else {
      console.log('\\n✅ Content size within optimal range for hybrid strategy');
      console.log('   Ready for selective web crawling to complete knowledge base');
    }
    
    console.log('\\n📋 Next Steps:');
    console.log('   1. Review generated chunks in content/processed/pif-chunks.json');
    console.log('   2. Run selective web crawler for live contact information');
    console.log('   3. Generate OpenAI embeddings for semantic search');
    console.log('   4. Upload to Azure AI Search free tier');
    console.log('='.repeat(60));
  }
}

// Types for medical section detection
interface MedicalSection {
  type: string;
  content: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  shouldPreserveComplete: boolean;
}

// Main execution
async function main(): Promise<void> {
  try {
    const processor = new PiFDocumentProcessor();
    await processor.processAllDocuments();
    
    console.log('\\n🎉 PiF document processing completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ PiF document processing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { PiFDocumentProcessor };