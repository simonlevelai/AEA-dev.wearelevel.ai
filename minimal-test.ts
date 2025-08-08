#!/usr/bin/env npx ts-node

console.log("Starting minimal test...");

try {
  console.log("Importing dotenv...");
  import('dotenv').then(dotenv => {
    dotenv.config();
    console.log("Dotenv imported and configured");
    
    console.log("Importing Logger...");
    return import('./src/utils/logger');
  }).then(loggerModule => {
    console.log("Logger imported successfully");
    const { Logger } = loggerModule;
    
    const logger = new Logger('test');
    logger.info('Logger test successful');
    console.log("✅ Test completed successfully");
    
  }).catch(error => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });

} catch (error) {
  console.error("❌ Sync test failed:", error);
  process.exit(1);
}