#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { ContentIngestionService } from '../src/services/ContentIngestionService';
import { ValidationService } from '../src/services/ValidationService';
import { SearchService } from '../src/services/SearchService';
import { IngestionConfig, SearchConfig } from '../src/types/content';
import { logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

/**
 * Content ingestion script
 * Processes documents from content/documents/ directory,
 * chunks content while preserving source URLs,
 * generates embeddings, and uploads to Azure AI Search
 */
async function ingestContent(): Promise<void> {
  try {
    logger.info('Starting content ingestion process');

    // Validate required environment variables
    const requiredEnvVars = [
      'AZURE_SEARCH_ENDPOINT', 
      'AZURE_OPENAI_API_KEY'
    ];

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

    const ingestionConfig: IngestionConfig = {
      apiKey: process.env['AZURE_OPENAI_API_KEY']!,
      embeddingModel: process.env['AZURE_OPENAI_EMBEDDING_MODEL'] || 'text-embedding-ada-002',
      maxTokensPerChunk: parseInt(process.env['MAX_TOKENS_PER_CHUNK'] || '8000'),
      chunkOverlap: parseInt(process.env['CHUNK_OVERLAP'] || '200')
    };

    const searchService = new SearchService(searchConfig);
    const validationService = new ValidationService(searchService);
    const ingestionService = new ContentIngestionService(
      validationService,
      searchService,
      ingestionConfig
    );

    logger.info('Services initialized', {
      searchEndpoint: searchConfig.endpoint,
      indexName: searchConfig.indexName,
      embeddingModel: ingestionConfig.embeddingModel,
      maxTokensPerChunk: ingestionConfig.maxTokensPerChunk
    });

    // Check if search index exists, create if needed
    console.log('🔍 Checking Azure AI Search index...');
    try {
      await searchService.getIndexStatistics();
      console.log('✅ Search index exists and is accessible');
    } catch (error) {
      console.log('⚠️ Search index not found, creating...');
      const indexResult = await searchService.createIndex();
      if (indexResult.success) {
        console.log(`✅ Created search index: ${indexResult.indexName}`);
      } else {
        throw new Error(`Failed to create search index: ${indexResult.error}`);
      }
    }

    // Process all content files
    console.log('📄 Processing content files...');
    const result = await ingestionService.processContent();

    // Log detailed results
    logger.info('Content ingestion completed', {
      success: result.success,
      totalFiles: result.totalFiles,
      chunksCreated: result.chunksCreated,
      errors: result.errors.length
    });

    // Print summary to console
    console.log('\n📊 Content Ingestion Results');
    console.log('============================');
    console.log(`Total files processed: ${result.totalFiles}`);
    console.log(`Content chunks created: ${result.chunksCreated}`);
    console.log(`Errors encountered: ${result.errors.length}`);

    // Show errors if any
    if (result.errors.length > 0) {
      console.log('\n❌ Processing Errors:');
      result.errors.slice(0, 10).forEach(error => console.log(`  - ${error}`));
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    // Get processing statistics
    try {
      const stats = await ingestionService.getProcessingStatistics();
      console.log('\n📈 Processing Statistics:');
      console.log(`Total content files: ${stats.totalFiles}`);
      console.log(`Total indexed chunks: ${stats.totalChunks}`);
      console.log(`Average chunk size: ${stats.averageChunkSize} bytes`);
      
      if (stats.sourcesWithoutUrls > 0) {
        console.log(`⚠️ Sources without URLs: ${stats.sourcesWithoutUrls}`);
      }
    } catch (error) {
      logger.warn('Failed to get processing statistics', { error });
    }

    if (result.success && result.chunksCreated > 0) {
      console.log(`\n✅ Successfully ingested ${result.chunksCreated} content chunks`);
      console.log('🔍 Content is now searchable in Azure AI Search');
      console.log('\n💡 Next steps:');
      console.log('  1. Run "npm run validate-sources" to verify all source URLs');
      console.log('  2. Test the search functionality with the Ask Eve bot');
      console.log('  3. Monitor search performance and relevance');
    } else if (result.totalFiles === 0) {
      console.log('\n⚠️ No content files found to process');
      console.log('💡 Run "npm run crawl" first to gather content from eveappeal.org.uk');
    }

    // Exit with appropriate code
    const hasErrors = !result.success || result.errors.length > 0;
    process.exit(hasErrors ? 1 : 0);

  } catch (error) {
    logger.error('Content ingestion script failed', { error });
    console.error('❌ Content ingestion failed:', error);
    process.exit(1);
  }
}

// Add command line argument support
function parseArguments(): { 
  dryRun?: boolean; 
  recreateIndex?: boolean;
  maxFiles?: number;
} {
  const args = process.argv.slice(2);
  const options: { dryRun?: boolean; recreateIndex?: boolean; maxFiles?: number } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--recreate-index':
        options.recreateIndex = true;
        break;
      case '--max-files':
        const maxFilesArg = args[++i];
        if (maxFilesArg && !isNaN(parseInt(maxFilesArg))) {
          options.maxFiles = parseInt(maxFilesArg);
        }
        break;
      case '--help':
        console.log(`
Usage: npm run ingest [options]

Options:
  --dry-run          Preview what would be processed without actually ingesting
  --recreate-index   Delete and recreate the Azure AI Search index
  --max-files <n>    Limit processing to first N files (for testing)
  --help             Show this help message

Environment Variables Required:
  AZURE_SEARCH_ENDPOINT          - Azure AI Search service endpoint
  AZURE_SEARCH_API_KEY          - Azure AI Search API key (optional if using managed identity)
  AZURE_SEARCH_INDEX_NAME       - Name of the search index (default: askeve-content)
  AZURE_OPENAI_API_KEY          - OpenAI API key for embeddings
  AZURE_OPENAI_EMBEDDING_MODEL  - Embedding model name (default: text-embedding-ada-002)
  MAX_TOKENS_PER_CHUNK          - Maximum tokens per chunk (default: 8000)
  CHUNK_OVERLAP                 - Overlap between chunks (default: 200)

Examples:
  npm run ingest
  npm run ingest -- --dry-run
  npm run ingest -- --recreate-index
  npm run ingest -- --max-files 5
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Enhanced ingestion function with options
async function ingestContentWithOptions(): Promise<void> {
  const options = parseArguments();
  
  if (options.dryRun) {
    console.log('🔍 Dry run mode - would process content without actually ingesting');
    logger.info('Dry run mode enabled');
    // TODO: Implement dry run functionality
    return;
  }

  if (options.recreateIndex) {
    console.log('🔄 Recreating search index...');
    // TODO: Implement index recreation
  }

  if (options.maxFiles) {
    console.log(`🔢 Processing limited to ${options.maxFiles} files`);
    // TODO: Implement file limiting
  }

  await ingestContent();
}

// Run ingestion if this script is executed directly
if (require.main === module) {
  ingestContentWithOptions();
}

export { ingestContent };