// Check Detailed Search Logs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showDetailedLogs() {
  console.log('📊 DETAILED CONVERSATION LOGS');
  console.log('=' .repeat(70));

  try {
    const { data: logs, error } = await supabase
      .from('content_search_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    if (logs.length === 0) {
      console.log('❌ No logs found');
      return;
    }

    console.log(`✅ Found ${logs.length} conversation logs:\n`);

    logs.forEach((log, i) => {
      console.log(`${i + 1}. 🗣️ USER QUERY: "${log.query}"`);
      console.log(`   ⏱️ Search Time: ${log.response_time_ms}ms`);
      console.log(`   🔍 Search Method: ${log.search_method}`);
      console.log(`   ✅ Response Generated: ${log.response_generated ? 'Yes' : 'No'}`);
      console.log(`   📄 Matched Chunks: ${log.matched_chunks?.length || 0}`);
      console.log(`   📅 Timestamp: ${log.created_at}`);
      
      if (log.metadata) {
        console.log(`   📊 METADATA:`);
        console.log(`      • Content Found: ${log.metadata.contentFound}`);
        console.log(`      • Best Match: ${log.metadata.bestMatchSource}`);
        console.log(`      • Relevance Score: ${(log.metadata.relevanceScore * 100).toFixed(1)}%`);
        console.log(`      • Content Type: ${log.metadata.contentType}`);
        console.log(`      • Result Count: ${log.metadata.resultCount}`);
      }
      
      if (log.matched_chunks?.length > 0) {
        console.log(`   🔗 Matched Chunk IDs:`);
        log.matched_chunks.forEach((chunkId, j) => {
          console.log(`      ${j + 1}. ${chunkId}`);
        });
      }
      
      console.log('   ' + '─'.repeat(60));
    });

    console.log('\n🎯 ANALYTICS SUMMARY:');
    const totalQueries = logs.length;
    const successfulSearches = logs.filter(log => log.metadata?.contentFound).length;
    const avgResponseTime = logs.reduce((sum, log) => sum + log.response_time_ms, 0) / logs.length;
    
    console.log(`📈 Success Rate: ${successfulSearches}/${totalQueries} (${((successfulSearches/totalQueries)*100).toFixed(1)}%)`);
    console.log(`⚡ Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`🔍 Search Method: ${logs[0]?.search_method || 'N/A'}`);

  } catch (error) {
    console.error('❌ Failed to fetch logs:', error);
  }
}

showDetailedLogs().then(() => {
  console.log('\n✅ Detailed log analysis completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Log analysis failed:', error);
  process.exit(1);
});