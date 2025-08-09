const { dataRetentionHealthCheck } = require('../dist/functions/DataRetentionCleanupFunction');

module.exports = async function (context, req) {
    try {
        const healthStatus = await dataRetentionHealthCheck(context);
        context.res = {
            status: healthStatus.status === 'healthy' ? 200 : 500,
            body: healthStatus,
            headers: {
                'Content-Type': 'application/json'
            }
        };
    } catch (error) {
        context.log.error('Health check failed:', error);
        context.res = {
            status: 500,
            body: { 
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};
