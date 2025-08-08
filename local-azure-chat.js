const express = require('express');
const { AzureOpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const port = 3002;

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: '2024-12-01-preview'
});

// Initialize Supabase client for content retrieval
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(express.json());
app.use(express.static('.'));

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Enhanced content search function using Supabase
async function searchPiFContent(query) {
  try {
    console.log(`🔍 Searching Eve Appeal content for: "${query}"`);
    
    // Try multiple search strategies for better content matching
    let bestResult = null;
    let searchResults = [];

    // Strategy 1: Full-text search with all content types
    const { data: allResults, error: allError } = await supabase
      .rpc('search_medical_content', {
        query_text: query.toLowerCase(),
        limit_results: 5,
        content_types: null,
        priority_filter: null
      });

    if (!allError && allResults?.length > 0) {
      searchResults = searchResults.concat(allResults);
    }

    // Strategy 2: Search specific content types based on query intent
    const contentTypeFilters = determineSearchFilters(query);
    for (const filter of contentTypeFilters) {
      const { data: typeResults, error: typeError } = await supabase
        .rpc('search_medical_content', {
          query_text: query.toLowerCase(),
          limit_results: 3,
          content_types: filter.types,
          priority_filter: filter.priority
        });

      if (!typeError && typeResults?.length > 0) {
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
      
      bestResult = uniqueResults[0];
      console.log(`📄 Found ${uniqueResults.length} relevant content chunks, using best match:`);
      console.log(`   🎯 "${bestResult.title}" (${(bestResult.relevance_score * 100).toFixed(1)}% relevance)`);
      
      return {
        found: true,
        content: bestResult.content,
        source: bestResult.title,
        sourceUrl: bestResult.source_url,
        contentType: bestResult.content_type,
        relevanceScore: bestResult.relevance_score,
        priorityLevel: bestResult.priority_level,
        medicalCategories: bestResult.medical_categories,
        allResults: uniqueResults // Include all results for logging
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

// Search analytics logging function
async function logSearchAnalytics(query, searchResult, responseTimeMs, responseGenerated = false) {
  try {
    const matchedChunkIds = searchResult?.allResults ? 
      searchResult.allResults.map(r => r.chunk_id) : [];
    
    await supabase
      .from('content_search_logs')
      .insert({
        query: query.substring(0, 500), // Limit query length
        matched_chunks: matchedChunkIds,
        response_generated: responseGenerated,
        search_method: 'enhanced_multi_strategy',
        response_time_ms: responseTimeMs,
        metadata: {
          contentFound: searchResult?.found || false,
          bestMatchSource: searchResult?.source || null,
          relevanceScore: searchResult?.relevanceScore || 0,
          contentType: searchResult?.contentType || null,
          resultCount: searchResult?.allResults?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    
    console.log(`📊 Search logged: "${query.substring(0, 50)}..." (${matchedChunkIds.length} matches)`);
  } catch (error) {
    console.error('⚠️ Failed to log search analytics:', error.message);
  }
}

// Enhanced system prompt with PiF content integration
const baseSystemPrompt = `You are Ask Eve Assist, a helpful and empathetic AI assistant providing gynaecological health information from The Eve Appeal charity.

Key Guidelines:
- Provide accurate, evidence-based health information
- Always recommend consulting healthcare professionals for personal medical concerns
- Be empathetic and supportive, especially for sensitive topics
- Include appropriate disclaimers about not replacing professional medical advice
- For crisis situations involving self-harm, immediately provide emergency contact information:
  - Emergency Services: 999
  - Samaritans: 116 123 (free 24/7)
  - Crisis Text Line: Text SHOUT to 85258
  - NHS 111: For urgent mental health support
- Focus on gynaecological health topics: cervical, ovarian, womb, vulval, and vaginal cancers
- Encourage regular screening and early detection

IMPORTANT: If someone expresses thoughts of self-harm, distress, or mental health crisis, immediately provide the emergency contacts above and encourage them to seek immediate professional help.`;

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

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`🗣️ User: ${message}`);
    const startTime = Date.now();

    // Search for relevant PiF content first
    const pifContent = await searchPiFContent(message);
    
    // Create enhanced system prompt with PiF content if found
    const systemPrompt = createEnhancedSystemPrompt(pifContent);

    // Call Azure OpenAI with enhanced context
    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_completion_tokens: 500,
      temperature: 0.7
    });

    const responseTime = Date.now() - startTime;
    const response = completion.choices[0].message.content;
    
    console.log(`🤖 Response (${responseTime}ms): ${response.substring(0, 100)}...`);
    console.log(`🎯 Tokens used: ${completion.usage.total_tokens}`);

    // Check if this might be a crisis situation
    const isCrisis = message.toLowerCase().includes('hopeless') || 
                    message.toLowerCase().includes('end my life') ||
                    message.toLowerCase().includes('dark thoughts') ||
                    message.toLowerCase().includes('giving up') ||
                    message.toLowerCase().includes('suicide') ||
                    response.toLowerCase().includes('999') ||
                    response.toLowerCase().includes('samaritans');

    // Log search analytics for conversation tracking
    await logSearchAnalytics(message, pifContent, responseTime, true);

    res.json({
      response: response,
      responseTime: responseTime,
      tokenUsage: completion.usage.total_tokens,
      isCrisis: isCrisis,
      timestamp: new Date().toISOString(),
      pifContentUsed: pifContent ? {
        found: pifContent.found,
        source: pifContent.source,
        contentType: pifContent.contentType,
        relevanceScore: pifContent.relevanceScore,
        sourceUrl: pifContent.sourceUrl
      } : null
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    // Handle content filtering
    if (error.message.includes('content management policy')) {
      res.json({
        response: `I understand you may be going through a difficult time. For your safety and wellbeing, please reach out for support:

**Emergency Contacts:**
• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7)
• Crisis Text Line: Text SHOUT to 85258
• NHS 111: For urgent mental health support

Your safety matters, and there are people who want to help. Please speak to someone who can provide the care and support you need.`,
        isCrisis: true,
        contentFiltered: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        error: 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.',
        emergencyContacts: {
          emergency: '999',
          samaritans: '116 123',
          nhs: '111',
          eveAppeal: 'https://eveappeal.org.uk'
        }
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ask-eve-local-chat',
    timestamp: new Date().toISOString(),
    azureOpenAI: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
    }
  });
});

// Serve the chat interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'azure-chat.html'));
});

// Start server
app.listen(port, () => {
  console.log('🌸 Ask Eve Assist - Local Azure OpenAI Chat Server');
  console.log('=' .repeat(50));
  console.log(`🚀 Server running at: http://localhost:${port}`);
  console.log(`🌐 Chat interface: http://localhost:${port}`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
  console.log('');
  console.log('🔧 Azure OpenAI Configuration:');
  console.log(`   Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
  console.log(`   Model: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`);
  console.log('');
  console.log('✅ Ready to provide gynaecological health information');
  console.log('🛡️ Crisis detection and emergency contacts active');
  console.log('💚 Supporting The Eve Appeal\'s mission');
});