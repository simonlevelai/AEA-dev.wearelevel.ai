const { dataRetentionCleanup } = require('../dist/functions/DataRetentionCleanupFunction');

module.exports = async function (context, myTimer) {
    try {
        await dataRetentionCleanup(myTimer, context);
        context.log('✅ Data retention cleanup completed successfully');
    } catch (error) {
        context.log.error('❌ Data retention cleanup failed:', error);
        throw error;
    }
};