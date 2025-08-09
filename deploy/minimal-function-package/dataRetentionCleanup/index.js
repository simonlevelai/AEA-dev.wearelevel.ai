const { TableServiceClient, TableClient } = require('@azure/data-tables');

module.exports = async function (context, myTimer) {
    const startTime = Date.now();
    context.log('🧹 Starting scheduled data retention cleanup at', new Date().toISOString());

    // Validate environment configuration
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        context.log.error('❌ AZURE_STORAGE_CONNECTION_STRING not configured');
        throw new Error('Missing storage configuration');
    }

    const results = {
        conversationsDeleted: 0,
        searchLogsDeleted: 0,
        auditLogsDeleted: 0,
        totalDeleted: 0,
        errors: [],
        executionTimeMs: 0,
        timestamp: new Date().toISOString()
    };

    try {
        // Initialize table clients
        const conversationTable = new TableClient(connectionString, 'conversations');
        const searchLogsTable = new TableClient(connectionString, 'searchlogs');
        const auditLogsTable = new TableClient(connectionString, 'auditlogs');

        // Ensure tables exist
        try {
            await conversationTable.createTable();
            await searchLogsTable.createTable();
            await auditLogsTable.createTable();
        } catch (error) {
            // Tables might already exist, continue
            context.log('Tables already exist or created');
        }

        // Cleanup expired data (simple timestamp-based cleanup)
        const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
        const oneYearAgo = new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)).toISOString();

        // Cleanup conversation data (30 days)
        results.conversationsDeleted = await cleanupTable(conversationTable, thirtyDaysAgo, context);
        
        // Cleanup search logs (30 days)
        results.searchLogsDeleted = await cleanupTable(searchLogsTable, thirtyDaysAgo, context);
        
        // Cleanup audit logs (365 days)
        results.auditLogsDeleted = await cleanupTable(auditLogsTable, oneYearAgo, context);

        results.totalDeleted = results.conversationsDeleted + results.searchLogsDeleted + results.auditLogsDeleted;
        results.executionTimeMs = Date.now() - startTime;

        // Log comprehensive results
        context.log('✅ Data retention cleanup completed successfully:');
        context.log(`   📊 Execution Time: ${results.executionTimeMs}ms`);
        context.log(`   💬 Conversations Deleted: ${results.conversationsDeleted}`);
        context.log(`   🔍 Search Logs Deleted: ${results.searchLogsDeleted}`);
        context.log(`   📋 Audit Logs Deleted: ${results.auditLogsDeleted}`);
        context.log(`   📈 Total Records Deleted: ${results.totalDeleted}`);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push(errorMessage);
        results.executionTimeMs = Date.now() - startTime;
        
        context.log.error('❌ Data retention cleanup failed:', {
            error: errorMessage,
            executionTimeMs: results.executionTimeMs,
            timestamp: results.timestamp
        });
        
        throw error;
    }
};

async function cleanupTable(tableClient, cutoffDate, context) {
    let deletedCount = 0;
    
    try {
        // Find entities older than cutoff date
        const filter = `Timestamp lt datetime'${cutoffDate}'`;
        const entities = tableClient.listEntities({
            queryOptions: {
                filter: filter,
                select: ['partitionKey', 'rowKey']
            }
        });

        // Delete old entities
        for await (const entity of entities) {
            try {
                await tableClient.deleteEntity(entity.partitionKey, entity.rowKey);
                deletedCount++;
                
                // Log every 100 deletions
                if (deletedCount % 100 === 0) {
                    context.log(`   Deleted ${deletedCount} entities so far...`);
                }
            } catch (error) {
                // Continue with other entities
                context.log.warn(`Failed to delete entity ${entity.partitionKey}:${entity.rowKey}:`, error.message);
            }
        }
    } catch (error) {
        context.log.error('Cleanup error:', error.message);
    }

    return deletedCount;
}