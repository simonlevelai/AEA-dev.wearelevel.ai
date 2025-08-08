#!/usr/bin/env ts-node

/**
 * Upload processed PiF content to Azure AI Search
 */

import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import * as fs from 'fs';
import * as path from 'path';

interface ContentChunk {
  id: string;
  content: string;
  title: string;
  sourceUrl: string;
  chunkIndex: number;
  documentId: string;
  keywords?: string[];
}

async function main() {
  // Configuration
  const searchEndpoint = 'https://askeve-search-prod.search.windows.net';
  const searchKey = process.env.AZURE_SEARCH_API_KEY;
  const indexName = 'ask-eve-content';
  
  if (!searchKey) {
    console.error('❌ AZURE_SEARCH_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('🚀 Starting Azure AI Search content upload...');
  console.log(`📍 Endpoint: ${searchEndpoint}`);
  console.log(`📋 Index: ${indexName}`);

  // Initialize search client
  const searchClient = new SearchClient<ContentChunk>(
    searchEndpoint,
    indexName,
    new AzureKeyCredential(searchKey)
  );

  // Load processed content
  const contentPath = path.join(__dirname, '../data/pif-chunks.json');
  if (!fs.existsSync(contentPath)) {
    console.error(`❌ Content file not found: ${contentPath}`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(contentPath, 'utf8');
  const contentData = JSON.parse(rawContent);
  
  console.log(`📄 Loaded ${contentData.length} content chunks`);

  // Transform data for search index
  const searchDocuments: ContentChunk[] = contentData.map((chunk: any, index: number) => ({
    id: chunk.id || `chunk-${index}`,
    content: chunk.content || chunk.text || '',
    title: chunk.title || chunk.source || `Content Chunk ${index + 1}`,
    sourceUrl: chunk.sourceUrl || chunk.url || 'https://eveappeal.org.uk',
    chunkIndex: index,
    documentId: chunk.documentId || chunk.id || `doc-${index}`,
    keywords: chunk.keywords || []
  }));

  console.log(`🔄 Transformed ${searchDocuments.length} documents for upload`);

  try {
    // Upload documents in batches
    const batchSize = 50;
    let uploaded = 0;

    for (let i = 0; i < searchDocuments.length; i += batchSize) {
      const batch = searchDocuments.slice(i, i + batchSize);
      
      console.log(`📤 Uploading batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(searchDocuments.length/batchSize)} (${batch.length} documents)...`);
      
      const result = await searchClient.uploadDocuments(batch);
      
      // Check for any errors
      const errors = result.results.filter(r => !r.succeeded);
      if (errors.length > 0) {
        console.warn(`⚠️  ${errors.length} documents failed to upload in this batch:`);
        errors.forEach(error => {
          console.warn(`   - ${error.key}: ${error.errorMessage}`);
        });
      }
      
      uploaded += result.results.filter(r => r.succeeded).length;
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ Successfully uploaded ${uploaded}/${searchDocuments.length} documents to Azure AI Search`);
    
    // Test search functionality
    console.log('🔍 Testing search functionality...');
    const testResults = await searchClient.search('cervical screening', {
      top: 3,
      select: ['id', 'title', 'sourceUrl']
    });

    console.log('📊 Test search results:');
    for await (const result of testResults.results) {
      console.log(`   - ${result.document.title} (${result.document.sourceUrl})`);
    }

    console.log('🎉 Azure AI Search content upload completed successfully!');

  } catch (error) {
    console.error('❌ Error uploading content:', error);
    process.exit(1);
  }
}

// Run the upload if this script is called directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as uploadToAzureSearch };