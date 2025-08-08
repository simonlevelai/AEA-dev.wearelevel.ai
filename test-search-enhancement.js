// Test Enhanced Search Functionality
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Enhanced search function (copy from local-azure-chat.js)
async function searchPiFContent(query) {
  try {
    console.log(`🔍 Searching Eve Appeal content for: "${query}"`);
    
    // Try multiple search strategies for better content matching
    let searchResults = [];

    // Strategy 1: Full-text search with all content types
    console.log('   📋 Strategy 1: Full-text search');
    const { data: allResults, error: allError } = await supabase
      .rpc('search_medical_content', {
        query_text: query.toLowerCase(),
        limit_results: 5,
        content_types: null,
        priority_filter: null
      });

    if (!allError && allResults?.length > 0) {
      console.log(`   ✅ Found ${allResults.length} results from full-text search`);
      searchResults = searchResults.concat(allResults);
    }

    // Strategy 2: Search specific content types based on query intent
    console.log('   📋 Strategy 2: Intent-based search');
    const contentTypeFilters = determineSearchFilters(query);
    console.log(`   🎯 Detected ${contentTypeFilters.length} search filters:`, contentTypeFilters);
    
    for (const filter of contentTypeFilters) {
      const { data: typeResults, error: typeError } = await supabase
        .rpc('search_medical_content', {
          query_text: query.toLowerCase(),
          limit_results: 3,
          content_types: filter.types,
          priority_filter: filter.priority
        });

      if (!typeError && typeResults?.length > 0) {
        console.log(`   ✅ Found ${typeResults.length} results from ${filter.types} filter`);
        searchResults = searchResults.concat(typeResults);
      }
    }

    if (searchResults.length > 0) {
      // Remove duplicates and sort by relevance score
      const uniqueResults = searchResults.filter((result, index, self) => 
        index === self.findIndex(r => r.chunk_id === result.chunk_id)
      );
      
      // Sort by relevance score (highest first)
      uniqueResults.sort((a, b) => b.relevance_score - a.relevance_score);
      
      console.log(`📄 Total unique results: ${uniqueResults.length}`);
      console.log('   🏆 Top 3 matches:');
      uniqueResults.slice(0, 3).forEach((result, i) => {
        console.log(`   ${i + 1}. "${result.title}" - ${(result.relevance_score * 100).toFixed(1)}% (${result.content_type})`);
      });
      
      const bestResult = uniqueResults[0];
      
      return {
        found: true,
        content: bestResult.content,
        source: bestResult.title,
        sourceUrl: bestResult.source_url,
        contentType: bestResult.content_type,
        relevanceScore: bestResult.relevance_score,
        priorityLevel: bestResult.priority_level,
        medicalCategories: bestResult.medical_categories
      };
    }

    console.log('🔍 No relevant Eve Appeal content found');
    return { found: false };
    
  } catch (error) {
    console.error('Eve Appeal content search failed:', error);
    return { found: false };
  }
}

// Helper function to determine search filters based on query intent
function determineSearchFilters(query) {
  const lowerQuery = query.toLowerCase();
  const filters = [];
  
  // Emergency content filter
  if (lowerQuery.includes('emergency') || lowerQuery.includes('urgent') || 
      lowerQuery.includes('999') || lowerQuery.includes('immediately')) {
    filters.push({ types: ['emergency'], priority: 'critical' });
  }
  
  // Symptoms content filter
  if (lowerQuery.includes('symptom') || lowerQuery.includes('signs') || 
      lowerQuery.includes('pain') || lowerQuery.includes('bleeding') ||
      lowerQuery.includes('discharge') || lowerQuery.includes('lump')) {
    filters.push({ types: ['symptoms', 'when_to_see_gp'], priority: 'high' });
  }
  
  // Screening content filter  
  if (lowerQuery.includes('screening') || lowerQuery.includes('test') ||
      lowerQuery.includes('examination') || lowerQuery.includes('smear')) {
    filters.push({ types: ['screening'], priority: 'medium' });
  }
  
  // Treatment content filter
  if (lowerQuery.includes('treatment') || lowerQuery.includes('therapy') ||
      lowerQuery.includes('surgery') || lowerQuery.includes('chemotherapy')) {
    filters.push({ types: ['treatment'], priority: null });
  }
  
  // Support content filter
  if (lowerQuery.includes('support') || lowerQuery.includes('help') ||
      lowerQuery.includes('counselling') || lowerQuery.includes('advice')) {
    filters.push({ types: ['support'], priority: null });
  }
  
  return filters;
}

// Test different queries
async function runSearchTests() {
  console.log('🧪 TESTING ENHANCED SEARCH FUNCTIONALITY');
  console.log('=' .repeat(60));

  const testQueries = [
    'What are the symptoms of cervical cancer?',
    'Tell me about ovarian cancer treatment options',
    'I need help and support for vulval cancer',
    'Emergency symptoms of womb cancer',
    'Cervical cancer screening information'
  ];

  for (const query of testQueries) {
    console.log('\n' + '─'.repeat(60));
    const result = await searchPiFContent(query);
    
    if (result.found) {
      console.log(`✅ FOUND: ${result.source}`);
      console.log(`📊 Relevance: ${(result.relevanceScore * 100).toFixed(1)}%`);
      console.log(`🔗 URL: ${result.sourceUrl}`);
      console.log(`📋 Type: ${result.contentType}`);
      console.log(`⚡ Priority: ${result.priorityLevel}`);
    } else {
      console.log('❌ NO CONTENT FOUND');
    }
  }
  
  console.log('\n' + '=' .repeat(60));
}

runSearchTests().then(() => {
  console.log('✅ Search tests completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Search tests failed:', error);
  process.exit(1);
});