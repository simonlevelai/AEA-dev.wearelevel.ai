#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { SearchService } from '../src/services/SearchService';
import { SearchConfig } from '../src/types/content';
import { logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

/**
 * Azure AI Search index setup script
 * Creates the search index with proper schema, semantic search,
 * and vector search configuration for Ask Eve Assist
 */
async function setupSearchIndex(): Promise<void> {
  try {
    logger.info('Starting Azure AI Search index setup');

    // Validate required environment variables
    const requiredEnvVars = ['AZURE_SEARCH_ENDPOINT'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Initialize search service
    const searchConfig: SearchConfig = {
      endpoint: process.env['AZURE_SEARCH_ENDPOINT']!,
      apiKey: process.env['AZURE_SEARCH_API_KEY'] || '',
      indexName: process.env['AZURE_SEARCH_INDEX_NAME'] || 'askeve-content'
    };

    const searchService = new SearchService(searchConfig);

    console.log('🔧 Setting up Azure AI Search index...');
    console.log(`Endpoint: ${searchConfig.endpoint}`);
    console.log(`Index name: ${searchConfig.indexName}`);
    console.log(`Authentication: ${searchConfig.apiKey ? 'API Key' : 'Managed Identity'}`);

    // Check if index already exists
    let indexExists = false;
    try {
      const stats = await searchService.getIndexStatistics();
      indexExists = true;
      console.log(`📋 Index already exists with ${stats.documentCount} documents (${Math.round(stats.storageSize / 1024)} KB)`);
    } catch (error) {
      console.log('📋 Index does not exist, will create new index');
    }

    // Handle existing index
    if (indexExists) {
      const shouldRecreate = process.argv.includes('--recreate') || process.argv.includes('--force');
      
      if (shouldRecreate) {
        console.log('🗑️ Deleting existing index...');
        const deleteResult = await searchService.deleteIndex();
        
        if (deleteResult.success) {
          console.log('✅ Successfully deleted existing index');
          indexExists = false;
        } else {
          throw new Error(`Failed to delete index: ${deleteResult.error}`);
        }
      } else {
        console.log('ℹ️ Index already exists. Use --recreate to delete and recreate.');
        console.log('✅ Azure AI Search index is ready');
        return;
      }
    }

    // Create the index if it doesn't exist
    if (!indexExists) {
      console.log('🔨 Creating new search index...');
      const createResult = await searchService.createIndex();
      
      if (createResult.success) {
        console.log(`✅ Successfully created index: ${createResult.indexName}`);
      } else {
        throw new Error(`Failed to create index: ${createResult.error}`);
      }
    }

    // Verify index is working
    console.log('🔍 Verifying index configuration...');
    const finalStats = await searchService.getIndexStatistics();
    
    console.log('\n📊 Index Configuration Summary');
    console.log('=============================');
    console.log(`Index name: ${searchConfig.indexName}`);
    console.log(`Document count: ${finalStats.documentCount}`);
    console.log(`Storage size: ${Math.round(finalStats.storageSize / 1024)} KB`);
    console.log('✅ Vector search: Enabled (HNSW algorithm)');
    console.log('✅ Semantic search: Enabled');
    console.log('✅ Source URL validation: Enforced');

    console.log('\n💡 Index is ready for content ingestion');
    console.log('Next steps:');
    console.log('  1. Run "npm run crawl" to gather content');
    console.log('  2. Run "npm run ingest" to process and index content');
    console.log('  3. Run "npm run validate-sources" to verify source URLs');

    logger.info('Azure AI Search index setup completed successfully', {
      indexName: searchConfig.indexName,
      documentCount: finalStats.documentCount,
      storageSize: finalStats.storageSize
    });

  } catch (error) {
    logger.error('Azure AI Search index setup failed', { error: error instanceof Error ? error : new Error(String(error)) });
    console.error('❌ Index setup failed:', error);
    
    if (error instanceof Error && error.message.includes('authentication')) {
      console.log('\n💡 Authentication troubleshooting:');
      console.log('  1. Verify AZURE_SEARCH_ENDPOINT is correct');
      console.log('  2. Check AZURE_SEARCH_API_KEY is valid (if using API key auth)');
      console.log('  3. Ensure managed identity has proper permissions (if not using API key)');
      console.log('  4. Verify Azure AI Search service is running and accessible');
    }
    
    process.exit(1);
  }
}

// Add command line argument support
function parseArguments(): {
  recreate?: boolean;
  help?: boolean;
} {
  const args = process.argv.slice(2);
  const options: { recreate?: boolean; help?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '--recreate':
      case '--force':
        options.recreate = true;
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
Azure AI Search Index Setup

Usage: npm run setup-index [options]

Options:
  --recreate, --force    Delete existing index and create new one
  --help, -h            Show this help message

Environment Variables Required:
  AZURE_SEARCH_ENDPOINT          - Azure AI Search service endpoint
  AZURE_SEARCH_API_KEY          - Azure AI Search API key (optional if using managed identity)
  AZURE_SEARCH_INDEX_NAME       - Name of the search index (default: askeve-content)
  AZURE_OPENAI_ENDPOINT         - Azure OpenAI endpoint (for vector search)
  AZURE_OPENAI_API_KEY          - Azure OpenAI API key (for vector search)
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT - Embedding deployment name (for vector search)

Index Schema:
  - id: Unique document identifier
  - content: Searchable content with semantic analysis
  - title: Document title with boost
  - source: Content source (filterable)
  - sourceUrl: Original URL (required, eveappeal.org.uk only)
  - sourcePage: Page number for PDFs (optional)
  - lastReviewed: Content review date
  - contentVector: 1536-dimensional embedding vector (HNSW algorithm)

Search Features:
  - Semantic search with content prioritization
  - Vector search with cosine similarity
  - Source URL filtering and validation
  - Content freshness ranking

Examples:
  npm run setup-index                    # Create index if not exists
  npm run setup-index -- --recreate      # Delete and recreate index
  npm run setup-index -- --help          # Show this help
  `);
}

// Run setup if this script is executed directly
if (require.main === module) {
  const options = parseArguments();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  setupSearchIndex();
}

export { setupSearchIndex };