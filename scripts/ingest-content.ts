#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SearchService } from '../src/services/SearchService';
import { ContentService } from '../src/services/ContentService';
import { ContentChunk, SearchConfig } from '../src/types/content';
import { logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

/**
 * Content ingestion script for Ask Eve Assist
 * Uploads processed content chunks to Azure AI Search with full validation
 */
async function ingestContent(): Promise<void> {
  try {
    logger.info('Starting content ingestion');

    // Validate required environment variables
    const requiredEnvVars = ['AZURE_SEARCH_ENDPOINT'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Initialize services
    const searchConfig: SearchConfig = {
      endpoint: process.env['AZURE_SEARCH_ENDPOINT']!,
      apiKey: process.env['AZURE_SEARCH_API_KEY'] || '',
      indexName: process.env['AZURE_SEARCH_INDEX_NAME'] || 'askeve-content'
    };

    const searchService = new SearchService(searchConfig);
    const contentService = new ContentService(searchService);

    console.log('📋 Content Ingestion Configuration');
    console.log('==================================');
    console.log(`Endpoint: ${searchConfig.endpoint}`);
    console.log(`Index name: ${searchConfig.indexName}`);
    console.log(`Authentication: ${searchConfig.apiKey ? 'API Key' : 'Managed Identity'}`);

    // Verify index exists
    try {
      const stats = await searchService.getIndexStatistics();
      console.log(`✅ Index verified: ${stats.documentCount} existing documents`);
    } catch (error) {
      throw new Error('Search index not found. Run "npm run setup-index" first.');
    }

    // Load content chunks
    const dataPath = path.join(__dirname, '..', 'data', 'pif-chunks.json');
    
    console.log(`\n📂 Loading content from: ${dataPath}`);
    
    let rawData: string;
    try {
      rawData = await fs.readFile(dataPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read content file: ${dataPath}. Ensure it exists and run content processing first.`);
    }

    let contentChunks: ContentChunk[];
    try {
      contentChunks = JSON.parse(rawData);
    } catch (error) {
      throw new Error(`Invalid JSON in content file: ${dataPath}`);
    }

    if (!Array.isArray(contentChunks)) {
      throw new Error('Content file must contain an array of content chunks');
    }

    console.log(`📊 Loaded ${contentChunks.length} content chunks`);

    // Validate content chunks before ingestion
    console.log('\n🔍 Validating content chunks...');
    let validChunks = 0;
    let invalidChunks = 0;
    const validationErrors: string[] = [];

    for (let i = 0; i < contentChunks.length; i++) {
      try {
        // Convert lastReviewed string to Date if needed
        if (typeof contentChunks[i]!.lastReviewed === 'string') {
          contentChunks[i]!.lastReviewed = new Date(contentChunks[i]!.lastReviewed);
        }

        contentService.validateContentChunk(contentChunks[i]!);
        validChunks++;
      } catch (error) {
        invalidChunks++;
        const errorMsg = `Chunk ${i} (${contentChunks[i]?.id}): ${error instanceof Error ? error.message : String(error)}`;
        validationErrors.push(errorMsg);
        
        if (invalidChunks <= 5) { // Show first 5 errors
          console.log(`❌ ${errorMsg}`);
        }
      }
    }

    console.log(`✅ Valid chunks: ${validChunks}`);
    console.log(`❌ Invalid chunks: ${invalidChunks}`);

    if (invalidChunks > 0) {
      if (invalidChunks > 5) {
        console.log(`   (${invalidChunks - 5} more validation errors...)`);
      }
      
      if (process.argv.includes('--skip-invalid')) {
        console.log('⚠️ Continuing with valid chunks only (--skip-invalid specified)');
        contentChunks = contentChunks.filter((_, i) => {
          try {
            contentService.validateContentChunk(contentChunks[i]!);
            return true;
          } catch {
            return false;
          }
        });
      } else {
        throw new Error(`${invalidChunks} content chunks failed validation. Fix errors or use --skip-invalid to continue with valid chunks only.`);
      }
    }

    if (contentChunks.length === 0) {
      throw new Error('No valid content chunks to ingest');
    }

    // Batch upload content
    console.log(`\n📤 Ingesting ${contentChunks.length} content chunks...`);
    
    const batchSize = 50; // Azure Search recommended batch size
    let totalIndexed = 0;
    let totalErrors = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < contentChunks.length; i += batchSize) {
      const batch = contentChunks.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(contentChunks.length / batchSize);

      console.log(`⏳ Processing batch ${batchNumber}/${totalBatches} (${batch.length} chunks)...`);

      try {
        const result = await contentService.indexContent(batch);
        
        totalIndexed += result.chunksCreated;
        if (result.errors.length > 0) {
          totalErrors += result.errors.length;
          allErrors.push(...result.errors);
          
          console.log(`⚠️ Batch ${batchNumber}: ${result.chunksCreated} indexed, ${result.errors.length} errors`);
          result.errors.slice(0, 3).forEach(error => console.log(`   - ${error}`));
          if (result.errors.length > 3) {
            console.log(`   - (${result.errors.length - 3} more errors...)`);
          }
        } else {
          console.log(`✅ Batch ${batchNumber}: ${result.chunksCreated} chunks indexed successfully`);
        }

      } catch (error) {
        console.log(`❌ Batch ${batchNumber} failed: ${error instanceof Error ? error.message : String(error)}`);
        totalErrors += batch.length;
        allErrors.push(`Batch ${batchNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Final statistics
    console.log('\n📊 Content Ingestion Summary');
    console.log('=============================');
    console.log(`Total chunks processed: ${contentChunks.length}`);
    console.log(`Successfully indexed: ${totalIndexed}`);
    console.log(`Failed to index: ${totalErrors}`);
    console.log(`Success rate: ${((totalIndexed / contentChunks.length) * 100).toFixed(1)}%`);

    if (allErrors.length > 0) {
      console.log(`\n❌ Errors encountered (${allErrors.length}):`);
      allErrors.slice(0, 10).forEach(error => console.log(`   - ${error}`));
      if (allErrors.length > 10) {
        console.log(`   - (${allErrors.length - 10} more errors...)`);
      }
    }

    // Verify final index state
    console.log('\n🔍 Verifying index state...');
    const finalStats = await searchService.getIndexStatistics();
    console.log(`📋 Index now contains ${finalStats.documentCount} documents`);
    console.log(`📏 Storage size: ${Math.round(finalStats.storageSize / 1024)} KB`);

    // Test search functionality
    console.log('\n🔍 Testing search functionality...');
    try {
      const testResult = await contentService.searchContent('cervical cancer symptoms');
      if (testResult.found) {
        console.log(`✅ Search test successful: Found content from ${testResult.sourceUrl}`);
      } else {
        console.log('⚠️ Search test: No results found for test query');
      }
    } catch (error) {
      console.log(`❌ Search test failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (totalIndexed === contentChunks.length) {
      console.log('\n🎉 Content ingestion completed successfully!');
      logger.info('Content ingestion completed successfully', {
        totalChunks: contentChunks.length,
        indexed: totalIndexed,
        errors: totalErrors
      });
    } else {
      console.log('\n⚠️ Content ingestion completed with errors.');
      logger.warn('Content ingestion completed with errors', {
        totalChunks: contentChunks.length,
        indexed: totalIndexed,
        errors: totalErrors
      });
    }

    console.log('\n💡 Next steps:');
    console.log('  1. Run "npm run validate-sources" to verify all source URLs');
    console.log('  2. Test the search functionality with various queries');
    console.log('  3. Monitor search performance and adjust as needed');

  } catch (error) {
    logger.error('Content ingestion failed', { error: error instanceof Error ? error : new Error(String(error)) });
    console.error('❌ Content ingestion failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('authentication')) {
        console.log('\n💡 Authentication troubleshooting:');
        console.log('  1. Verify AZURE_SEARCH_ENDPOINT is correct');
        console.log('  2. Check AZURE_SEARCH_API_KEY is valid');
        console.log('  3. Ensure the search service is accessible');
      } else if (error.message.includes('index not found')) {
        console.log('\n💡 Run "npm run setup-index" to create the search index first');
      } else if (error.message.includes('content file')) {
        console.log('\n💡 Run content processing scripts to generate pif-chunks.json:');
        console.log('  1. npm run process-pif');
        console.log('  2. npm run crawl');
      }
    }
    
    process.exit(1);
  }
}

// Add command line argument support
function parseArguments(): {
  skipInvalid?: boolean;
  help?: boolean;
} {
  const args = process.argv.slice(2);
  const options: { skipInvalid?: boolean; help?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '--skip-invalid':
        options.skipInvalid = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

// Show help information
function showHelp(): void {
  console.log(`
Ask Eve Assist - Content Ingestion

Usage: npm run ingest [options]

Options:
  --skip-invalid        Continue ingestion skipping invalid content chunks
  --help, -h           Show this help message

Environment Variables Required:
  AZURE_SEARCH_ENDPOINT          - Azure AI Search service endpoint
  AZURE_SEARCH_API_KEY          - Azure AI Search API key (optional if using managed identity)
  AZURE_SEARCH_INDEX_NAME       - Name of the search index (default: askeve-content)

Content Requirements:
  - All content must have valid source URLs from eveappeal.org.uk
  - Content chunks must pass Zod schema validation
  - lastReviewed date must be valid
  - Content must be non-empty

Prerequisites:
  1. Search index must exist (run "npm run setup-index")
  2. Content must be processed (run "npm run process-pif")

Data Location:
  - Reads from: data/pif-chunks.json
  - Generated by: npm run process-pif

Examples:
  npm run ingest                    # Ingest all valid content
  npm run ingest -- --skip-invalid # Skip invalid chunks and continue
  npm run ingest -- --help         # Show this help
  `);
}

// Run ingestion if this script is executed directly
if (require.main === module) {
  const options = parseArguments();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  ingestContent();
}

export { ingestContent };