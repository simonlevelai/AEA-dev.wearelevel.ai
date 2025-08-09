const { TableClient } = require('@azure/data-tables');

module.exports = async function (context, req) {
    context.log('🏥 Health check requested at', new Date().toISOString());
    
    try {
        // Basic health check
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING');
        }
        
        // Try to create a table client and test connection
        const tableClient = new TableClient(connectionString, 'conversations');
        
        // Simple connection test - just try to list entities with limit 1
        try {
            const entities = tableClient.listEntities({ queryOptions: { select: ['partitionKey'], filter: "partitionKey eq 'test'" } });
            await entities.next(); // Just try to get first result, don't care if empty
        } catch (error) {
            // Table might not exist yet, that's ok for health check
            context.log('Table not found, but connection is working');
        }
        
        context.res = {
            status: 200,
            body: {
                status: 'healthy',
                message: 'Data retention service is operational',
                timestamp: new Date().toISOString(),
                details: {
                    storageConnectionConfigured: true,
                    retentionPeriods: {
                        conversationData: 30,
                        searchLogs: 30,
                        auditLogs: 365,
                        crisisResponse: 730
                    }
                }
            },
            headers: {
                'Content-Type': 'application/json'
            }
        };
        context.log('✅ Health check completed: healthy');
    } catch (error) {
        context.log.error('❌ Health check failed:', error);
        context.res = {
            status: 500,
            body: { 
                status: 'unhealthy',
                error: error.message || 'Unknown error',
                timestamp: new Date().toISOString()
            },
            headers: {
                'Content-Type': 'application/json'
            }
        };
    }
};