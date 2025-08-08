#!/usr/bin/env ts-node

/**
 * Upload website content to Azure AI Search
 */

import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import * as fs from 'fs';
import * as path from 'path';

interface ContentChunk {
  id: string;
  content: string;
  title: string;
  source: string;
  category: string;
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

  console.log('🚀 Starting Azure AI Search website content upload...');
  console.log(`📍 Endpoint: ${searchEndpoint}`);
  console.log(`📋 Index: ${indexName}`);

  // Initialize search client
  const searchClient = new SearchClient<ContentChunk>(
    searchEndpoint,
    indexName,
    new AzureKeyCredential(searchKey)
  );

  // Load website content
  const contentPath = path.join(__dirname, '../content/website-content/eve-appeal-website-content.json');
  if (!fs.existsSync(contentPath)) {
    console.error(`❌ Website content file not found: ${contentPath}`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(contentPath, 'utf8');
  const websiteData = JSON.parse(rawContent);
  
  console.log(`📄 Loaded website content with ${websiteData.totalChunks} chunks`);

  // Transform website content for search index
  const searchDocuments: ContentChunk[] = websiteData.content.map((chunk: any) => ({
    id: chunk.id,
    content: chunk.content,
    title: chunk.title,
    source: chunk.source,
    category: chunk.category
  }));

  console.log(`🔄 Transformed ${searchDocuments.length} website documents for upload`);

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

    console.log(`✅ Successfully uploaded ${uploaded}/${searchDocuments.length} website documents to Azure AI Search`);
    
    // Test search functionality with healthcare topics
    console.log('🔍 Testing search functionality with healthcare content...');
    const testQueries = ['HPV vaccine', 'cervical screening', 'ovarian cancer symptoms'];
    
    for (const query of testQueries) {
      const testResults = await searchClient.search(query, {
        top: 2,
        select: ['id', 'title', 'source']
      });

      console.log(`📊 Test results for "${query}":`);
      for await (const result of testResults.results) {
        console.log(`   - ${result.document.title} (${result.document.source})`);
      }
    }

    console.log('🎉 Azure AI Search website content upload completed successfully!');

  } catch (error) {
    console.error('❌ Error uploading website content:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}