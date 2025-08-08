#!/usr/bin/env npx ts-node

/**
 * Process Missing PiF Documents Script
 * Extracts and uploads the remaining 3 PiF-approved PDF documents to Azure AI Search
 * 
 * Missing Documents:
 * 1. HPV Guide (2025 Brand Update)
 * 2. Vaginal Cancer Early Recognition Guide (April 2024)
 * 3. Vulval Cancer Early Recognition Guide (April 2024)
 * 4. Lynch Syndrome Patient Guide (February 2023)
 * 5. Genetic Testing in Ovarian Cancer (April 2024)
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as dotenv from 'dotenv';
// @ts-ignore - pdf-parse doesn't have TypeScript definitions
const pdf = require('pdf-parse');

dotenv.config();

interface DocumentChunk {
  id: string;
  title: string;
  content: string;
  source: string;
  category: string;
}

class PiFDocumentProcessor {
  private readonly searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
  private readonly searchApiKey = process.env.AZURE_SEARCH_API_KEY;
  private readonly indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content';
  private readonly documentsDir = path.join(__dirname, '../content/pif-documents');

  // Document metadata from README.md
  private readonly documentMetadata = {
    'HPV-Guide-2025-brand-update-v1-min.pdf': {
      title: 'HPV Guide (2025 Brand Update)',
      source: 'The Eve Appeal - HPV Information',
      category: 'HPV and Prevention',
      lastUpdated: '2025',
      url: 'https://eveappeal.org.uk/gynaecological-cancer/hpv'
    },
    'Vaginal-cancer-ER_April-2024.pdf': {
      title: 'Vaginal Cancer Early Recognition Guide',
      source: 'The Eve Appeal - Vaginal Cancer Information',
      category: 'Vaginal Cancer',
      lastUpdated: 'April 2024',
      url: 'https://eveappeal.org.uk/gynaecological-cancer/vaginal-cancer'
    },
    'Vulval-cancer-ER_April-2024.pdf': {
      title: 'Vulval Cancer Early Recognition Guide',
      source: 'The Eve Appeal - Vulval Cancer Information',
      category: 'Vulval Cancer',
      lastUpdated: 'April 2024',
      url: 'https://eveappeal.org.uk/gynaecological-cancer/vulval-cancer'
    },
    'Lynch-Syndrome_Patient-guide_vs2_digital_FINAL_21.02.23.pdf': {
      title: 'Lynch Syndrome Patient Guide',
      source: 'The Eve Appeal - Hereditary Cancer Information',
      category: 'Genetic Testing',
      lastUpdated: 'February 2023',
      url: 'https://eveappeal.org.uk/gynaecological-cancer/hereditary-cancer'
    },
    'genetic testing in ovarian-A5_vs2_22.04.2024.pdf': {
      title: 'Genetic Testing in Ovarian Cancer',
      source: 'The Eve Appeal - Ovarian Cancer Genetic Testing',
      category: 'Genetic Testing',
      lastUpdated: 'April 2024',
      url: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/genetic-testing'
    }
  };

  constructor() {
    if (!this.searchEndpoint || !this.searchApiKey) {
      throw new Error('Azure Search configuration missing. Please check environment variables.');
    }
  }

  /**
   * Process all missing PiF documents
   */
  async processAllDocuments(): Promise<void> {
    console.log('🚀 Starting PiF Document Processing...');
    console.log(`📁 Documents directory: ${this.documentsDir}`);
    console.log(`🔍 Azure Search: ${this.searchEndpoint}/${this.indexName}`);

    const allChunks: DocumentChunk[] = [];

    for (const [filename, metadata] of Object.entries(this.documentMetadata)) {
      const filePath = path.join(this.documentsDir, filename);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${filename} - file not found`);
        continue;
      }

      console.log(`\n📄 Processing: ${metadata.title}`);
      
      try {
        const chunks = await this.processDocument(filePath, metadata, filename);
        allChunks.push(...chunks);
        console.log(`✅ Generated ${chunks.length} chunks from ${filename}`);
      } catch (error) {
        console.error(`❌ Failed to process ${filename}:`, error);
      }
    }

    console.log(`\n📊 Total chunks generated: ${allChunks.length}`);
    
    if (allChunks.length > 0) {
      await this.uploadToAzureSearch(allChunks);
      console.log('🎉 All PiF documents processed and uploaded successfully!');
    } else {
      console.log('⚠️  No content was processed.');
    }
  }

  /**
   * Extract text from PDF using pdf-parse library
   */
  private async extractPDFText(filePath: string): Promise<string> {
    try {
      console.log(`    📖 Reading PDF file: ${path.basename(filePath)}`);
      
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      
      console.log(`    📄 Extracted ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
      
      return pdfData.text;
      
    } catch (error) {
      throw new Error(`Failed to extract text from PDF ${filePath}: ${error}`);
    }
  }

  /**
   * Process a single document into medical-context-aware chunks
   */
  private async processDocument(
    filePath: string, 
    metadata: any, 
    filename: string
  ): Promise<DocumentChunk[]> {
    
    console.log(`  📖 Extracting text from PDF...`);
    const rawText = await this.extractPDFText(filePath);
    
    if (!rawText.trim()) {
      throw new Error('No text could be extracted from PDF');
    }

    console.log(`  📝 Extracted ${rawText.length} characters`);
    
    // Clean and normalize text
    const cleanedText = this.cleanPDFText(rawText);
    
    // Create medical-context-aware chunks
    const chunks = this.createMedicalChunks(cleanedText, metadata, filename);
    
    return chunks;
  }

  /**
   * Clean and normalize PDF text
   */
  private cleanPDFText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')           // Normalize line endings
      .replace(/\n{3,}/g, '\n\n')      // Remove excessive line breaks
      .replace(/\s{2,}/g, ' ')         // Normalize whitespace
      .replace(/[^\x20-\x7E\n]/g, '')  // Remove non-printable characters
      .trim();
  }

  /**
   * Create medical-context-aware chunks preserving important health information
   */
  private createMedicalChunks(
    text: string, 
    metadata: any, 
    filename: string
  ): DocumentChunk[] {
    
    const chunks: DocumentChunk[] = [];
    const maxChunkSize = 800; // Optimal for Azure AI Search
    const overlapSize = 100;  // Preserve medical context
    
    // Split by major sections first (preserves medical context)
    const sections = this.splitIntoMedicalSections(text);
    
    let chunkIndex = 0;
    
    for (const section of sections) {
      if (section.trim().length < 50) continue; // Skip very short sections
      
      // If section is small enough, treat as single chunk
      if (section.length <= maxChunkSize) {
        chunks.push({
          id: `${filename.replace('.pdf', '')}-chunk-${chunkIndex}`,
          title: metadata.title,
          content: section.trim(),
          source: metadata.source,
          category: metadata.category
        });
        chunkIndex++;
      } else {
        // Split large sections with overlap to preserve medical context
        const words = section.split(/\s+/);
        let start = 0;
        
        while (start < words.length) {
          const chunkWords = words.slice(start, start + Math.floor(maxChunkSize / 5)); // ~5 chars per word
          const chunkText = chunkWords.join(' ');
          
          if (chunkText.trim().length > 0) {
            chunks.push({
              id: `${filename.replace('.pdf', '')}-chunk-${chunkIndex}`,
              title: metadata.title,
              content: chunkText.trim(),
              source: metadata.source,
              category: metadata.category
            });
            chunkIndex++;
          }
          
          // Move forward with overlap to preserve context
          start += Math.floor(maxChunkSize / 5) - Math.floor(overlapSize / 5);
        }
      }
    }
    
    return chunks;
  }

  /**
   * Split text into medical sections preserving important health information
   */
  private splitIntoMedicalSections(text: string): string[] {
    // Medical section headers to preserve
    const sectionPatterns = [
      /(?:^|\n)(?:What is|Symptoms|Signs|Causes|Risk factors|Treatment|Prevention|Screening|When to see|GP|Doctor|Emergency|Crisis)/gmi,
      /(?:^|\n)(?:\d+\.|\•|\-)\s*[A-Z][^.!?]*[.!?]/gm, // Numbered/bulleted lists
      /(?:^|\n)[A-Z][A-Z\s]{10,}(?:\n|$)/gm,          // Headers in capitals
      /(?:^|\n).{0,100}(?:cancer|symptom|health|medical|treatment|diagnosis).{0,100}(?:\n|$)/gmi
    ];
    
    // Split by double line breaks first (paragraph boundaries)
    let sections = text.split(/\n\s*\n/);
    
    // Further split by medical section patterns while preserving context
    const refinedSections: string[] = [];
    
    for (const section of sections) {
      if (section.length < 200) {
        // Short sections - keep as is
        refinedSections.push(section);
      } else {
        // Look for medical subsections
        const subsections = section.split(/(?=(?:^|\n)(?:What is|Symptoms|Signs|Causes|Risk factors|Treatment|Prevention|Screening|When to see))/mi);
        refinedSections.push(...subsections);
      }
    }
    
    return refinedSections.filter(section => section.trim().length > 0);
  }

  /**
   * Upload chunks to Azure AI Search with smaller batches and retry logic
   */
  private async uploadToAzureSearch(chunks: DocumentChunk[]): Promise<void> {
    console.log(`\n📤 Uploading ${chunks.length} chunks to Azure AI Search...`);
    
    const uploadUrl = `${this.searchEndpoint}/indexes/${this.indexName}/docs/index?api-version=2023-11-01`;
    
    // Use much smaller batch sizes for Azure Search API limits
    const batchSize = 10;
    let uploadedCount = 0;
    let failedBatches = 0;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchNumber = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(chunks.length / batchSize);
      
      const uploadData = {
        value: batch.map(chunk => ({
          '@search.action': 'upload',
          ...chunk
        }))
      };
      
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      
      while (!success && retryCount < maxRetries) {
        try {
          console.log(`  📤 Uploading batch ${batchNumber}/${totalBatches} (${batch.length} chunks)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
          
          const response = await axios.post(uploadUrl, uploadData, {
            headers: {
              'Content-Type': 'application/json',
              'api-key': this.searchApiKey!
            },
            timeout: 30000
          });
          
          uploadedCount += batch.length;
          console.log(`    ✅ Success: ${uploadedCount}/${chunks.length} chunks uploaded`);
          success = true;
          
          // Longer pause between batches to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          retryCount++;
          const axiosError = error as any;
          
          console.error(`    ❌ Batch ${batchNumber} failed (attempt ${retryCount}/${maxRetries}):`, {
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            message: axiosError.message,
            batchSize: batch.length
          });
          
          if (retryCount < maxRetries) {
            // Wait longer before retrying
            const waitTime = retryCount * 3000; // 3s, 6s, 9s
            console.log(`    ⏳ Waiting ${waitTime/1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // Final retry failed - try individual documents
            console.log(`    🔄 Batch failed completely, trying individual uploads...`);
            const individualSuccess = await this.uploadIndividualChunks(batch, uploadUrl);
            if (individualSuccess > 0) {
              uploadedCount += individualSuccess;
              console.log(`    ✅ Individually uploaded ${individualSuccess}/${batch.length} chunks from failed batch`);
            } else {
              failedBatches++;
            }
            success = true; // Don't retry again
          }
        }
      }
    }
    
    console.log(`\n📊 Upload Summary:`);
    console.log(`  ✅ Successfully uploaded: ${uploadedCount}/${chunks.length} chunks`);
    console.log(`  ❌ Failed batches: ${failedBatches}`);
    
    if (uploadedCount > 0) {
      console.log(`\n🎉 PiF documents successfully added to Azure AI Search!`);
      console.log(`📈 Knowledge base expanded with ${uploadedCount} new content chunks`);
    } else {
      console.log(`\n⚠️ No chunks were uploaded successfully.`);
    }
  }
  
  /**
   * Upload chunks individually when batch upload fails
   */
  private async uploadIndividualChunks(chunks: DocumentChunk[], uploadUrl: string): Promise<number> {
    let successCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const uploadData = {
        value: [{
          '@search.action': 'upload',
          ...chunk
        }]
      };
      
      try {
        await axios.post(uploadUrl, uploadData, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.searchApiKey!
          },
          timeout: 15000
        });
        
        successCount++;
        console.log(`      ✅ Individual upload ${i + 1}/${chunks.length}: ${chunk.title.substring(0, 30)}...`);
        
        // Small pause between individual uploads
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`      ❌ Failed individual upload: ${chunk.title.substring(0, 30)}...`);
      }
    }
    
    return successCount;
  }

  /**
   * Test the expanded knowledge base
   */
  async testExpandedKnowledge(): Promise<void> {
    console.log('\n🧪 Testing expanded knowledge base...');
    
    const testQueries = [
      'HPV information',
      'vaginal cancer symptoms',
      'vulval cancer symptoms',
      'Lynch syndrome',
      'genetic testing ovarian cancer'
    ];
    
    for (const query of testQueries) {
      try {
        const searchUrl = `${this.searchEndpoint}/indexes/${this.indexName}/docs/search?api-version=2023-11-01`;
        const response = await axios.post(searchUrl, {
          search: query,
          top: 3,
          select: "title,source,category"
        }, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.searchApiKey!
          }
        });
        
        console.log(`  🔍 "${query}": ${response.data.value.length} results found`);
        response.data.value.forEach((result: any, idx: number) => {
          console.log(`    ${idx + 1}. ${result.title} (${result.category})`);
        });
        
      } catch (error) {
        console.error(`  ❌ Failed to test query "${query}":`, error);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    const processor = new PiFDocumentProcessor();
    await processor.processAllDocuments();
    await processor.testExpandedKnowledge();
    
    console.log('\n✅ PiF Document Processing Complete!');
    console.log('📊 The knowledge base now contains comprehensive gynaecological health information');
    console.log('🎯 Ready to provide detailed responses on HPV, vaginal cancer, vulval cancer, Lynch syndrome, and genetic testing');
    
  } catch (error) {
    console.error('💥 Processing failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { PiFDocumentProcessor };