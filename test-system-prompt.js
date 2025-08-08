// Test System Prompt Enhancement
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Copy search function from local-azure-chat.js
async function searchPiFContent(query) {
  const { data, error } = await supabase
    .rpc('search_medical_content', {
      query_text: query.toLowerCase(),
      limit_results: 3
    });

  if (!error && data?.length > 0) {
    const bestResult = data[0];
    return {
      found: true,
      content: bestResult.content.substring(0, 500) + '...',
      source: bestResult.title,
      sourceUrl: bestResult.source_url,
      contentType: bestResult.content_type,
      relevanceScore: bestResult.relevance_score,
      priorityLevel: bestResult.priority_level,
      medicalCategories: bestResult.medical_categories
    };
  }
  return { found: false };
}

// Copy enhanced system prompt function
const baseSystemPrompt = `You are Ask Eve Assist, a helpful and empathetic AI assistant providing gynaecological health information from The Eve Appeal charity.`;

function createEnhancedSystemPrompt(pifContent = null) {
  let prompt = baseSystemPrompt;
  
  if (pifContent && pifContent.found) {
    prompt += `\n\n🎯 PRIORITY MEDICAL INFORMATION from The Eve Appeal (USE THIS FIRST):\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `📄 Source Document: ${pifContent.source}\n`;
    prompt += `🔗 Reference URL: ${pifContent.sourceUrl}\n`;
    prompt += `📊 Relevance Score: ${(pifContent.relevanceScore * 100).toFixed(1)}%\n`;
    prompt += `🏥 Content Type: ${pifContent.contentType}\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `AUTHORITATIVE CONTENT:\n${pifContent.content}\n\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `🚨 CRITICAL INSTRUCTIONS:\n`;
    prompt += `1. PRIORITIZE the above Eve Appeal content over your general knowledge\n`;
    prompt += `2. Base your response PRIMARILY on this authoritative medical information\n`;
    prompt += `3. ALWAYS cite the source document and include the reference URL\n`;
    prompt += `4. Only supplement with general knowledge if the Eve Appeal content doesn't cover the question\n`;
    prompt += `5. Make it clear when information comes from The Eve Appeal vs general medical knowledge\n`;
    prompt += `6. Never contradict The Eve Appeal content - it is the authoritative source\n\n`;
  } else {
    prompt += `\n\n⚠️ No specific Eve Appeal content found for this query.\n`;
    prompt += `Please provide general gynaecological health information while encouraging the user to:\n`;
    prompt += `• Consult healthcare professionals for personalized advice\n`;
    prompt += `• Visit The Eve Appeal website: https://eveappeal.org.uk/\n`;
    prompt += `• Use their Ask Eve information service: 0808 802 0019\n\n`;
  }
  
  return prompt;
}

async function demonstrateSystemPrompt() {
  console.log('🧪 DEMONSTRATING ENHANCED SYSTEM PROMPT');
  console.log('=' .repeat(80));

  const query = 'What are cervical cancer symptoms?';
  console.log(`Query: "${query}"\n`);

  // Search for content
  const pifContent = await searchPiFContent(query);
  
  // Generate enhanced system prompt
  const systemPrompt = createEnhancedSystemPrompt(pifContent);
  
  console.log('📋 ENHANCED SYSTEM PROMPT (sent to Azure OpenAI):');
  console.log('─'.repeat(80));
  console.log(systemPrompt);
  console.log('─'.repeat(80));
  
  if (pifContent.found) {
    console.log('\n✅ PRIORITY CONTENT DETAILS:');
    console.log(`📄 Source: ${pifContent.source}`);
    console.log(`📊 Relevance: ${(pifContent.relevanceScore * 100).toFixed(1)}%`);
    console.log(`🔗 URL: ${pifContent.sourceUrl}`);
    console.log(`📋 Type: ${pifContent.contentType}`);
    console.log(`⚡ Priority: ${pifContent.priorityLevel}`);
  }
}

demonstrateSystemPrompt().then(() => {
  console.log('\n✅ System prompt demonstration completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ System prompt test failed:', error);
  process.exit(1);
});