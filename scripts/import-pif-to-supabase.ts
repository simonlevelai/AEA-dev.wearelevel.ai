#!/usr/bin/env ts-node

/**
 * Import PiF Content to Supabase Script
 * 
 * Imports processed PiF Tick approved documents from JSON into Supabase
 * for RAG (Retrieval Augmented Generation) with Azure OpenAI
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

interface PiFChunk {
  id: string;
  content: string;
  title?: string;
  source: string;
  sourceUrl?: string;
  lastReviewed?: string;
  pageNumber?: number;
  relevanceScore?: number;
}

interface DocumentMapping {
  filename: string;
  title: string;
  sourceUrl: string;
  documentType: string;
  lastReviewed: string;
  keywords: string[];
  categories: string[];
  contentTypes: string[];
}

class PiFSupabaseImporter {
  private supabase;
  private importStats = {
    documentsImported: 0,
    chunksImported: 0,
    errors: 0,
    startTime: Date.now()
  };

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin operations
    );
  }

  async importPiFContent(): Promise<void> {
    console.log('🏥 Starting PiF Content Import to Supabase');
    console.log('================================================');
    
    try {
      // Load PiF chunks data
      const pifData = await this.loadPiFData();
      console.log(`📄 Loaded ${pifData.length} PiF content chunks`);

      // Clear existing data (development mode)
      await this.clearExistingData();

      // Import documents and chunks
      await this.importDocumentsAndChunks(pifData);

      // Display results
      this.displayImportSummary();

    } catch (error) {
      console.error('❌ Import failed:', error);
      process.exit(1);
    }
  }

  private async loadPiFData(): Promise<PiFChunk[]> {
    const pifPath = path.join(__dirname, '../data/pif-chunks.json');
    const data = await fs.readFile(pifPath, 'utf-8');
    return JSON.parse(data);
  }

  private async clearExistingData(): Promise<void> {
    console.log('🧹 Clearing existing PiF data...');
    
    // Delete in correct order due to foreign key constraints
    await this.supabase.from('pif_content_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('pif_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('✅ Cleared existing data');
  }

  private async importDocumentsAndChunks(chunks: PiFChunk[]): Promise<void> {
    // Group chunks by document
    const documentGroups = this.groupChunksByDocument(chunks);
    
    for (const [docKey, docChunks] of Object.entries(documentGroups)) {
      await this.importSingleDocument(docKey, docChunks);
    }
  }

  private groupChunksByDocument(chunks: PiFChunk[]): Record<string, PiFChunk[]> {
    const groups: Record<string, PiFChunk[]> = {};
    
    for (const chunk of chunks) {
      // Extract document identifier from chunk ID
      const docKey = chunk.id.split('-chunk-')[0];
      if (!groups[docKey]) {
        groups[docKey] = [];
      }
      groups[docKey].push(chunk);
    }
    
    return groups;
  }

  private async importSingleDocument(docKey: string, chunks: PiFChunk[]): Promise<void> {
    try {
      const firstChunk = chunks[0];
      const documentMapping = this.getDocumentMapping(docKey, firstChunk);
      
      console.log(`📖 Importing: ${documentMapping.title} (${chunks.length} chunks)`);

      // Insert document
      const { data: document, error: docError } = await this.supabase
        .from('pif_documents')
        .insert({
          filename: documentMapping.filename,
          title: documentMapping.title,
          source_url: documentMapping.sourceUrl,
          document_type: documentMapping.documentType,
          last_reviewed: documentMapping.lastReviewed,
          pif_approved: true,
          metadata: {
            originalDocKey: docKey,
            totalChunks: chunks.length,
            categories: documentMapping.categories
          }
        })
        .select()
        .single();

      if (docError) {
        console.error(`❌ Failed to insert document ${docKey}:`, docError);
        this.importStats.errors++;
        return;
      }

      // Insert chunks
      const chunkInserts = chunks.map((chunk, index) => ({
        document_id: document.id,
        chunk_id: chunk.id,
        title: chunk.title || `${documentMapping.title} - Part ${index + 1}`,
        content: chunk.content,
        content_type: this.determineContentType(chunk.content, chunk.title || ''),
        priority_level: this.determinePriorityLevel(chunk.content),
        source_url: chunk.sourceUrl || documentMapping.sourceUrl,
        page_number: chunk.pageNumber,
        relevance_keywords: this.extractKeywords(chunk.content),
        medical_categories: this.extractMedicalCategories(chunk.content),
        metadata: {
          originalChunkId: chunk.id,
          relevanceScore: chunk.relevanceScore,
          processedAt: new Date().toISOString()
        }
      }));

      const { error: chunksError } = await this.supabase
        .from('pif_content_chunks')
        .insert(chunkInserts);

      if (chunksError) {
        console.error(`❌ Failed to insert chunks for ${docKey}:`, chunksError);
        this.importStats.errors++;
        return;
      }

      this.importStats.documentsImported++;
      this.importStats.chunksImported += chunks.length;
      console.log(`   ✅ Imported ${chunks.length} chunks`);

    } catch (error) {
      console.error(`❌ Error importing document ${docKey}:`, error);
      this.importStats.errors++;
    }
  }

  private getDocumentMapping(docKey: string, chunk: PiFChunk): DocumentMapping {
    // Map document keys to proper metadata
    const mappings: Record<string, Partial<DocumentMapping>> = {
      'hpv-guide-2025-brand-update-v1-min-pdf': {
        filename: 'HPV-Guide-2025-brand-update-v1-min.pdf',
        title: 'HPV Guide (2025 Brand Update)',
        documentType: 'hpv_guide',
        categories: ['hpv', 'prevention', 'vaccination', 'screening'],
        keywords: ['hpv', 'human papillomavirus', 'vaccination', 'cervical', 'screening']
      },
      'lynch-syndrome-patient-guide-vs2-digital-final-21-02-23-pdf': {
        filename: 'Lynch-Syndrome_Patient-guide_vs2_digital_FINAL_21.02.23.pdf', 
        title: 'Lynch Syndrome Patient Guide',
        documentType: 'genetic_testing',
        categories: ['genetic', 'lynch syndrome', 'hereditary'],
        keywords: ['lynch syndrome', 'genetic', 'hereditary', 'family history']
      },
      'vaginal-cancer-er-april-2024-pdf': {
        filename: 'Vaginal-cancer-ER_April-2024.pdf',
        title: 'Vaginal Cancer Early Recognition Guide', 
        documentType: 'early_recognition',
        categories: ['vaginal cancer', 'symptoms', 'early recognition'],
        keywords: ['vaginal', 'cancer', 'symptoms', 'bleeding', 'discharge']
      },
      'vulval-cancer-er-april-2024-pdf': {
        filename: 'Vulval-cancer-ER_April-2024.pdf',
        title: 'Vulval Cancer Early Recognition Guide',
        documentType: 'early_recognition', 
        categories: ['vulval cancer', 'symptoms', 'early recognition'],
        keywords: ['vulval', 'cancer', 'symptoms', 'itching', 'lumps']
      },
      'womb-cancer-er-april-2024-pdf': {
        filename: 'Womb-cancer-ER_April-2024.pdf',
        title: 'Womb Cancer Early Recognition Guide',
        documentType: 'early_recognition',
        categories: ['womb cancer', 'uterine', 'symptoms', 'early recognition'],
        keywords: ['womb', 'uterine', 'endometrial', 'cancer', 'bleeding']
      },
      'genetic-testing-in-ovarian-a5-vs2-22-04-2024-pdf': {
        filename: 'genetic testing in ovarian-A5_vs2_22.04.2024.pdf',
        title: 'Genetic Testing in Ovarian Cancer',
        documentType: 'genetic_testing',
        categories: ['ovarian cancer', 'genetic testing', 'brca'],
        keywords: ['genetic', 'testing', 'ovarian', 'brca', 'mutation']
      }
    };

    const mapping = mappings[docKey];
    if (!mapping) {
      console.warn(`⚠️ No mapping found for document: ${docKey}`);
    }

    return {
      filename: mapping?.filename || `${docKey}.pdf`,
      title: mapping?.title || chunk.source || 'Unknown Document',
      sourceUrl: chunk.sourceUrl || 'https://eveappeal.org.uk/gynae-health',
      documentType: mapping?.documentType || 'medical_information',
      lastReviewed: chunk.lastReviewed || '2024-04-01',
      keywords: mapping?.keywords || [],
      categories: mapping?.categories || ['general'],
      contentTypes: ['medical_information']
    };
  }

  private determineContentType(content: string, title: string): string {
    const lowerContent = content.toLowerCase();
    const lowerTitle = title.toLowerCase();
    
    if (lowerContent.includes('emergency') || lowerContent.includes('999') || 
        lowerContent.includes('urgent') || lowerContent.includes('immediately')) {
      return 'emergency';
    }
    
    if (lowerContent.includes('see your gp') || lowerContent.includes('see a doctor') ||
        lowerContent.includes('contact your doctor')) {
      return 'when_to_see_gp';
    }
    
    if (lowerTitle.includes('symptom') || lowerContent.includes('signs of') ||
        lowerContent.includes('symptoms of')) {
      return 'symptoms';
    }
    
    if (lowerContent.includes('screening') || lowerContent.includes('test') ||
        lowerContent.includes('examination')) {
      return 'screening';
    }
    
    if (lowerContent.includes('treatment') || lowerContent.includes('therapy') ||
        lowerContent.includes('surgery')) {
      return 'treatment';
    }
    
    return 'medical_information';
  }

  private determinePriorityLevel(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('emergency') || lowerContent.includes('999') ||
        lowerContent.includes('immediately') || lowerContent.includes('urgent')) {
      return 'critical';
    }
    
    if (lowerContent.includes('see your gp') || lowerContent.includes('symptoms') ||
        lowerContent.includes('bleeding') || lowerContent.includes('pain')) {
      return 'high';
    }
    
    if (lowerContent.includes('screening') || lowerContent.includes('prevention') ||
        lowerContent.includes('testing')) {
      return 'medium';
    }
    
    return 'low';
  }

  private extractKeywords(content: string): string[] {
    const medicalKeywords = [
      'symptom', 'symptoms', 'cancer', 'screening', 'test', 'genetic', 'treatment',
      'gp', 'doctor', 'urgent', 'emergency', 'pain', 'bleeding', 'discharge',
      'lump', 'family history', 'brca', 'hpv', 'vaccination', 'cervical',
      'ovarian', 'vulval', 'vaginal', 'womb', 'uterine', 'lynch syndrome'
    ];
    
    const lowerContent = content.toLowerCase();
    return medicalKeywords.filter(keyword => lowerContent.includes(keyword));
  }

  private extractMedicalCategories(content: string): string[] {
    const categories = [];
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('cervical')) categories.push('cervical');
    if (lowerContent.includes('ovarian')) categories.push('ovarian'); 
    if (lowerContent.includes('vulval')) categories.push('vulval');
    if (lowerContent.includes('vaginal')) categories.push('vaginal');
    if (lowerContent.includes('womb') || lowerContent.includes('uterine')) categories.push('womb');
    if (lowerContent.includes('hpv') || lowerContent.includes('human papillomavirus')) categories.push('hpv');
    if (lowerContent.includes('genetic') || lowerContent.includes('brca')) categories.push('genetic');
    if (lowerContent.includes('screening')) categories.push('screening');
    if (lowerContent.includes('lynch syndrome')) categories.push('lynch_syndrome');
    
    return categories.length > 0 ? categories : ['general'];
  }

  private displayImportSummary(): void {
    const duration = Date.now() - this.importStats.startTime;
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 PIF CONTENT IMPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Documents Imported: ${this.importStats.documentsImported}`);
    console.log(`✅ Content Chunks Imported: ${this.importStats.chunksImported}`);
    console.log(`❌ Errors: ${this.importStats.errors}`);
    console.log(`⏱️ Import Duration: ${(duration / 1000).toFixed(1)} seconds`);
    
    if (this.importStats.errors === 0) {
      console.log('\n🎉 IMPORT COMPLETED SUCCESSFULLY!');
      console.log('🔍 PiF content is now available for RAG searches in Supabase');
      console.log('🤖 Azure OpenAI can now access The Eve Appeal medical content');
    } else {
      console.log('\n⚠️ Import completed with errors. Please review the logs.');
    }
    
    console.log('\n📋 Next Steps:');
    console.log('   1. Test content search with: SELECT * FROM search_medical_content(\'ovarian cancer symptoms\');');
    console.log('   2. Update Azure OpenAI chat server to use Supabase content');
    console.log('   3. Test integrated medical responses');
    console.log('='.repeat(50));
  }
}

// Run import if called directly
async function main(): Promise<void> {
  try {
    const importer = new PiFSupabaseImporter();
    await importer.importPiFContent();
    
    console.log('\n✅ PiF content import completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ PiF content import failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { PiFSupabaseImporter };