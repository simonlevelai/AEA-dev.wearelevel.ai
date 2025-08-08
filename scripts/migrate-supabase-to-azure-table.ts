#!/usr/bin/env ts-node

/**
 * Migration Script: Supabase → Azure Table Storage
 * 
 * Migrates all data from Supabase to Azure Table Storage for ultra-cheap architecture
 * Cost reduction: £25-35/month → £3-5/month
 */

import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AzureTableStorageService } from '../src/services/AzureTableStorageService';
import { AzureAISearchService } from '../src/services/AzureAISearchService';
import { ConversationState, ConversationTopic, ConversationStage, ConsentStatus } from '../src/types/conversation';

dotenv.config();

interface MigrationStats {
  conversationStates: { total: number; migrated: number; failed: number };
  pifContent: { total: number; migrated: number; failed: number };
  searchLogs: { total: number; migrated: number; failed: number };
  totalDuration: number;
  errors: Array<{ type: string; message: string; record?: any }>;
}

interface SupabaseConversationState {
  conversation_id: string;
  user_id: string;
  session_id: string;
  current_topic: string;
  current_stage: string;
  consent_status: string;
  user_contact_info?: any;
  conversation_started: boolean;
  has_seen_opening_statement: boolean;
  last_activity: number;
  message_count: number;
  topics: string[];
  context?: any;
  escalation_required?: boolean;
  escalation_id?: string;
  escalated_to_nurse?: boolean;
  escalation_timestamp?: string;
  satisfaction_rating?: number;
  completion_reason?: string;
  created_at: string;
  updated_at: string;
}

interface SupabasePiFContent {
  id: string;
  document_id?: string;
  chunk_id: string;
  title?: string;
  content: string;
  content_type: string;
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  source_url: string;
  page_number?: number;
  relevance_keywords: string[];
  medical_categories: string[];
  created_at: string;
  metadata?: any;
}

interface SupabaseSearchLog {
  id: string;
  query: string;
  matched_chunks: string[];
  response_generated: boolean;
  search_method: string;
  response_time_ms?: number;
  user_satisfied?: boolean;
  created_at: string;
  metadata?: any;
}

class SupabaseToAzureMigrator {
  private supabase: SupabaseClient;
  private azureTableService: AzureTableStorageService;
  private azureSearchService: AzureAISearchService;
  private migrationStats: MigrationStats;

  constructor() {
    // Validate environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'AZURE_STORAGE_CONNECTION_STRING',
      'AZURE_SEARCH_ENDPOINT',
      'AZURE_SEARCH_API_KEY',
      'AZURE_OPENAI_API_KEY'
    ];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Initialize clients
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.azureTableService = new AzureTableStorageService({
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!
    });

    this.azureSearchService = new AzureAISearchService({
      searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      searchApiKey: process.env.AZURE_SEARCH_API_KEY!,
      openaiApiKey: process.env.AZURE_OPENAI_API_KEY!,
      openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT
    });

    // Initialize stats
    this.migrationStats = {
      conversationStates: { total: 0, migrated: 0, failed: 0 },
      pifContent: { total: 0, migrated: 0, failed: 0 },
      searchLogs: { total: 0, migrated: 0, failed: 0 },
      totalDuration: 0,
      errors: []
    };
  }

  /**
   * Run complete migration process
   */
  async runMigration(options: {
    skipConversationStates?: boolean;
    skipPiFContent?: boolean;
    skipSearchLogs?: boolean;
    dryRun?: boolean;
    batchSize?: number;
  } = {}): Promise<MigrationStats> {
    console.log('🚀 Starting Supabase → Azure Table Storage Migration');
    console.log('=' .repeat(80));
    
    const startTime = Date.now();

    try {
      // Initialize Azure infrastructure
      if (!options.dryRun) {
        console.log('\n🏗️ Initializing Azure infrastructure...');
        await this.azureTableService.initializeTables();
        await this.azureSearchService.initializeIndex();
        console.log('✅ Azure infrastructure initialized');
      }

      // Health checks
      console.log('\n🏥 Running health checks...');
      await this.runHealthChecks();

      // Migration phases
      if (!options.skipPiFContent) {
        console.log('\n📚 Phase 1: Migrating PiF Content...');
        await this.migratePiFContent(options.dryRun || false, options.batchSize || 50);
      }

      if (!options.skipConversationStates) {
        console.log('\n💬 Phase 2: Migrating Conversation States...');
        await this.migrateConversationStates(options.dryRun || false, options.batchSize || 100);
      }

      if (!options.skipSearchLogs) {
        console.log('\n📊 Phase 3: Migrating Search Logs...');
        await this.migrateSearchLogs(options.dryRun || false, options.batchSize || 200);
      }

      // Validation
      if (!options.dryRun) {
        console.log('\n✅ Phase 4: Validating Migration...');
        await this.validateMigration();
      }

      this.migrationStats.totalDuration = Date.now() - startTime;
      
      // Final report
      this.printMigrationReport();

      return this.migrationStats;

    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      this.migrationStats.errors.push({
        type: 'MIGRATION_FAILURE',
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Run health checks on both systems
   */
  private async runHealthChecks(): Promise<void> {
    // Test Supabase connectivity
    const { data: supabaseTest, error: supabaseError } = await this.supabase
      .from('pif_content_chunks')
      .select('count()')
      .limit(1);

    if (supabaseError) {
      throw new Error(`Supabase connectivity failed: ${supabaseError.message}`);
    }

    console.log('✅ Supabase connectivity confirmed');

    // Test Azure Table Storage
    const azureHealth = await this.azureTableService.healthCheck();
    if (!azureHealth.isHealthy) {
      throw new Error(`Azure Table Storage health check failed: ${azureHealth.issues.join(', ')}`);
    }

    console.log('✅ Azure Table Storage connectivity confirmed');

    // Test Azure AI Search
    const searchHealth = await this.azureSearchService.validateIndexHealth();
    console.log(`✅ Azure AI Search status: ${searchHealth.isHealthy ? 'HEALTHY' : 'NEEDS SETUP'}`);
  }

  /**
   * Migrate PiF content from Supabase to Azure Table Storage + AI Search
   */
  private async migratePiFContent(dryRun: boolean, batchSize: number): Promise<void> {
    console.log(`📚 Migrating PiF content (batch size: ${batchSize}, dry run: ${dryRun})`);

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: chunks, error } = await this.supabase
        .from('pif_content_chunks')
        .select('*')
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true });

      if (error) {
        this.migrationStats.errors.push({
          type: 'PIF_CONTENT_FETCH_ERROR',
          message: error.message
        });
        throw error;
      }

      if (!chunks || chunks.length === 0) {
        hasMore = false;
        break;
      }

      this.migrationStats.pifContent.total += chunks.length;

      for (const chunk of chunks as SupabasePiFContent[]) {
        try {
          if (!dryRun) {
            // Store in Azure Table Storage
            await this.azureTableService.storePiFContentMetadata({
              id: chunk.id,
              chunkId: chunk.chunk_id,
              title: chunk.title,
              content: chunk.content,
              contentType: chunk.content_type || 'medical_information',
              priorityLevel: chunk.priority_level,
              sourceUrl: chunk.source_url,
              pageNumber: chunk.page_number,
              relevanceKeywords: chunk.relevance_keywords || [],
              medicalCategories: chunk.medical_categories || [],
              metadata: chunk.metadata || {}
            });

            // Index in Azure AI Search (with vector embeddings)
            await this.azureSearchService.indexHealthcareContent([{
              id: chunk.id,
              chunkId: chunk.chunk_id,
              title: chunk.title || 'Untitled',
              content: chunk.content,
              contentType: chunk.content_type || 'medical_information',
              priorityLevel: chunk.priority_level,
              sourceUrl: chunk.source_url,
              pageNumber: chunk.page_number,
              relevanceKeywords: chunk.relevance_keywords || [],
              medicalCategories: chunk.medical_categories || [],
              createdAt: new Date(chunk.created_at),
              lastUpdated: new Date(chunk.created_at)
            }]);
          }

          this.migrationStats.pifContent.migrated++;
          
          if (this.migrationStats.pifContent.migrated % 10 === 0) {
            console.log(`   📄 Migrated ${this.migrationStats.pifContent.migrated} PiF content chunks...`);
          }

        } catch (error) {
          this.migrationStats.pifContent.failed++;
          this.migrationStats.errors.push({
            type: 'PIF_CONTENT_MIGRATION_ERROR',
            message: error.message,
            record: { id: chunk.id, chunk_id: chunk.chunk_id }
          });
          console.warn(`   ⚠️ Failed to migrate PiF content ${chunk.chunk_id}: ${error.message}`);
        }
      }

      offset += batchSize;
    }

    console.log(`✅ PiF content migration completed: ${this.migrationStats.pifContent.migrated}/${this.migrationStats.pifContent.total} successful`);
  }

  /**
   * Migrate conversation states from Supabase to Azure Table Storage
   */
  private async migrateConversationStates(dryRun: boolean, batchSize: number): Promise<void> {
    console.log(`💬 Migrating conversation states (batch size: ${batchSize}, dry run: ${dryRun})`);

    // Check if conversation_state table exists in Supabase
    const { data: tableExists } = await this.supabase.rpc('check_table_exists', { table_name: 'conversation_state' });
    
    if (!tableExists) {
      console.log('📄 No conversation_state table found in Supabase - skipping');
      return;
    }

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: states, error } = await this.supabase
        .from('conversation_state')
        .select('*')
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true });

      if (error) {
        this.migrationStats.errors.push({
          type: 'CONVERSATION_STATE_FETCH_ERROR',
          message: error.message
        });
        throw error;
      }

      if (!states || states.length === 0) {
        hasMore = false;
        break;
      }

      this.migrationStats.conversationStates.total += states.length;

      for (const state of states as SupabaseConversationState[]) {
        try {
          if (!dryRun) {
            // Transform Supabase format to our ConversationState type
            const conversationState: ConversationState = {
              conversationId: state.conversation_id,
              userId: state.user_id,
              sessionId: state.session_id,
              currentTopic: state.current_topic as ConversationTopic,
              currentStage: state.current_stage as ConversationStage,
              consentStatus: state.consent_status as ConsentStatus,
              userContactInfo: state.user_contact_info,
              conversationStarted: state.conversation_started,
              hasSeenOpeningStatement: state.has_seen_opening_statement,
              lastActivity: state.last_activity,
              messageCount: state.message_count,
              topics: state.topics,
              context: state.context,
              escalationRequired: state.escalation_required,
              escalationId: state.escalation_id,
              satisfactionRating: state.satisfaction_rating,
              completionReason: state.completion_reason
            };

            await this.azureTableService.saveConversationState(conversationState);
          }

          this.migrationStats.conversationStates.migrated++;

          if (this.migrationStats.conversationStates.migrated % 25 === 0) {
            console.log(`   💬 Migrated ${this.migrationStats.conversationStates.migrated} conversation states...`);
          }

        } catch (error) {
          this.migrationStats.conversationStates.failed++;
          this.migrationStats.errors.push({
            type: 'CONVERSATION_STATE_MIGRATION_ERROR',
            message: error.message,
            record: { id: state.conversation_id }
          });
          console.warn(`   ⚠️ Failed to migrate conversation ${state.conversation_id}: ${error.message}`);
        }
      }

      offset += batchSize;
    }

    console.log(`✅ Conversation state migration completed: ${this.migrationStats.conversationStates.migrated}/${this.migrationStats.conversationStates.total} successful`);
  }

  /**
   * Migrate search logs from Supabase to Azure Table Storage
   */
  private async migrateSearchLogs(dryRun: boolean, batchSize: number): Promise<void> {
    console.log(`📊 Migrating search logs (batch size: ${batchSize}, dry run: ${dryRun})`);

    // Check if content_search_logs table exists
    const { data: tableExists } = await this.supabase.rpc('check_table_exists', { table_name: 'content_search_logs' });
    
    if (!tableExists) {
      console.log('📄 No content_search_logs table found in Supabase - skipping');
      return;
    }

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: logs, error } = await this.supabase
        .from('content_search_logs')
        .select('*')
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true });

      if (error) {
        this.migrationStats.errors.push({
          type: 'SEARCH_LOGS_FETCH_ERROR',
          message: error.message
        });
        throw error;
      }

      if (!logs || logs.length === 0) {
        hasMore = false;
        break;
      }

      this.migrationStats.searchLogs.total += logs.length;

      for (const log of logs as SupabaseSearchLog[]) {
        try {
          if (!dryRun) {
            await this.azureTableService.logSearchOperation({
              id: log.id,
              query: log.query,
              matchedChunks: log.matched_chunks,
              responseGenerated: log.response_generated,
              searchMethod: log.search_method || 'keyword',
              responseTimeMs: log.response_time_ms,
              userSatisfied: log.user_satisfied,
              metadata: log.metadata || {}
            });
          }

          this.migrationStats.searchLogs.migrated++;

          if (this.migrationStats.searchLogs.migrated % 50 === 0) {
            console.log(`   📊 Migrated ${this.migrationStats.searchLogs.migrated} search logs...`);
          }

        } catch (error) {
          this.migrationStats.searchLogs.failed++;
          this.migrationStats.errors.push({
            type: 'SEARCH_LOGS_MIGRATION_ERROR',
            message: error.message,
            record: { id: log.id }
          });
          console.warn(`   ⚠️ Failed to migrate search log ${log.id}: ${error.message}`);
        }
      }

      offset += batchSize;
    }

    console.log(`✅ Search logs migration completed: ${this.migrationStats.searchLogs.migrated}/${this.migrationStats.searchLogs.total} successful`);
  }

  /**
   * Validate migration success
   */
  private async validateMigration(): Promise<void> {
    console.log('🔍 Validating migration results...');

    // Get Azure storage statistics
    const azureStats = await this.azureTableService.getStorageStatistics();
    console.log(`✅ Azure Table Storage: ${azureStats.conversationCount} conversations, ${azureStats.contentChunkCount} content chunks, ${azureStats.searchLogCount} search logs`);

    // Validate Azure AI Search index
    const searchStats = await this.azureSearchService.getIndexStatistics();
    console.log(`✅ Azure AI Search: ${searchStats.documentCount} indexed documents, ${searchStats.indexSizeMB} MB storage`);

    // Test search functionality
    console.log('🧪 Testing search functionality...');
    const searchTests = await this.azureSearchService.runSearchTests();
    
    if (!searchTests.textSearchWorks && !searchTests.vectorSearchWorks) {
      this.migrationStats.errors.push({
        type: 'SEARCH_VALIDATION_ERROR',
        message: 'Search functionality not working after migration'
      });
      throw new Error('Search validation failed - no search methods working');
    }

    console.log(`✅ Search validation: Text=${searchTests.textSearchWorks}, Vector=${searchTests.vectorSearchWorks}, Semantic=${searchTests.semanticSearchWorks}`);

    // Cost analysis
    const monthlyTableCost = azureStats.estimatedCostPerMonth;
    const monthlySearchCost = searchStats.indexSizeMB <= 50 ? 0 : 20; // Free tier vs Basic
    const totalMonthlyCost = monthlyTableCost + monthlySearchCost;

    console.log(`💰 Cost analysis: Table Storage £${monthlyTableCost.toFixed(2)}/month + AI Search £${monthlySearchCost}/month = £${totalMonthlyCost.toFixed(2)}/month total`);
    
    if (totalMonthlyCost <= 5) {
      console.log('🎉 Ultra-cheap architecture target achieved: ≤£5/month');
    } else if (totalMonthlyCost <= 25) {
      console.log('✅ Production-ready architecture: ≤£25/month');
    } else {
      console.warn('⚠️ Cost exceeds targets - consider optimization');
    }
  }

  /**
   * Print comprehensive migration report
   */
  private printMigrationReport(): void {
    console.log('\n' + '=' .repeat(80));
    console.log('📋 MIGRATION REPORT');
    console.log('=' .repeat(80));

    const totalMigrated = this.migrationStats.conversationStates.migrated + 
                         this.migrationStats.pifContent.migrated + 
                         this.migrationStats.searchLogs.migrated;
    const totalFailed = this.migrationStats.conversationStates.failed + 
                       this.migrationStats.pifContent.failed + 
                       this.migrationStats.searchLogs.failed;
    const totalRecords = this.migrationStats.conversationStates.total + 
                        this.migrationStats.pifContent.total + 
                        this.migrationStats.searchLogs.total;

    console.log(`\n🏁 Overall Results:`);
    console.log(`   Total records: ${totalRecords}`);
    console.log(`   Successfully migrated: ${totalMigrated}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Success rate: ${((totalMigrated / totalRecords) * 100).toFixed(1)}%`);
    console.log(`   Duration: ${(this.migrationStats.totalDuration / 1000).toFixed(1)}s`);

    console.log(`\n📊 Detailed Breakdown:`);
    console.log(`   PiF Content: ${this.migrationStats.pifContent.migrated}/${this.migrationStats.pifContent.total} (${this.migrationStats.pifContent.failed} failed)`);
    console.log(`   Conversation States: ${this.migrationStats.conversationStates.migrated}/${this.migrationStats.conversationStates.total} (${this.migrationStats.conversationStates.failed} failed)`);
    console.log(`   Search Logs: ${this.migrationStats.searchLogs.migrated}/${this.migrationStats.searchLogs.total} (${this.migrationStats.searchLogs.failed} failed)`);

    if (this.migrationStats.errors.length > 0) {
      console.log(`\n❌ Errors (${this.migrationStats.errors.length}):`);
      const errorCounts: Record<string, number> = {};
      this.migrationStats.errors.forEach(error => {
        errorCounts[error.type] = (errorCounts[error.type] || 0) + 1;
      });

      Object.entries(errorCounts).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });

      // Show first few errors for debugging
      console.log(`\n🔍 Sample errors:`);
      this.migrationStats.errors.slice(0, 5).forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.type}: ${error.message}`);
      });
    }

    console.log(`\n💰 Cost Reduction Analysis:`);
    console.log(`   Previous Supabase cost: £25-35/month`);
    console.log(`   New Azure architecture: £3-25/month (depending on tier)`);
    console.log(`   Potential savings: £10-30/month (40-85% reduction)`);

    if (totalMigrated === totalRecords && this.migrationStats.errors.length === 0) {
      console.log('\n🎉 Migration completed successfully! Ready to switch to Azure architecture.');
    } else if (totalFailed < totalRecords * 0.05) { // Less than 5% failure rate
      console.log('\n✅ Migration mostly successful. Review failed records and proceed with caution.');
    } else {
      console.log('\n⚠️ Migration had significant issues. Review errors before proceeding.');
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: any = {
    dryRun: args.includes('--dry-run'),
    skipConversationStates: args.includes('--skip-conversations'),
    skipPiFContent: args.includes('--skip-content'),
    skipSearchLogs: args.includes('--skip-logs'),
    batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '50')
  };

  console.log('🔧 Migration Configuration:');
  console.log(`   Dry run: ${options.dryRun}`);
  console.log(`   Batch size: ${options.batchSize}`);
  console.log(`   Skip conversations: ${options.skipConversationStates}`);
  console.log(`   Skip content: ${options.skipPiFContent}`);
  console.log(`   Skip logs: ${options.skipSearchLogs}\n`);

  try {
    const migrator = new SupabaseToAzureMigrator();
    const results = await migrator.runMigration(options);
    
    process.exit(results.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    console.error('\nUsage: npx ts-node scripts/migrate-supabase-to-azure-table.ts [options]');
    console.error('Options:');
    console.error('  --dry-run              Simulate migration without actually moving data');
    console.error('  --skip-conversations   Skip conversation state migration');
    console.error('  --skip-content         Skip PiF content migration');
    console.error('  --skip-logs            Skip search logs migration');
    console.error('  --batch-size=N         Set batch size (default: 50)');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { SupabaseToAzureMigrator, MigrationStats };