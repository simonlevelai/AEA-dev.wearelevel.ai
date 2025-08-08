#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { SearchService } from '../src/services/SearchService';

dotenv.config();

async function testSearchService() {
  console.log('🔍 Testing Search Service only...');
  
  try {
    const searchService = new SearchService({
      endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      apiKey: process.env.AZURE_SEARCH_API_KEY!,
      indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content'
    });
    console.log('✅ Search Service initialized');
    
    const searchResults = await searchService.search('cervical cancer');
    console.log(`✅ Found ${searchResults.results.length} search results`);
    
    if (searchResults.results.length > 0) {
      const firstResult = searchResults.results[0];
      console.log(`   - First result: "${firstResult.document.title}"`);
      console.log(`   - Score: ${firstResult.score}`);
      console.log(`   - Content preview: "${firstResult.document.content.substring(0, 100)}..."`);
    }
    
    console.log('🎯 Search Service test complete');
    
  } catch (error) {
    console.error('❌ Search Service failed:', error);
    process.exit(1);
  }
}

testSearchService();