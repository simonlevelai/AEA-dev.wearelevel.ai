#!/usr/bin/env node

import { BotServer } from './BotServer';
import { Logger } from '../utils/logger';

const logger = new Logger('bot-main');

async function main(): Promise<void> {
  try {
    logger.info('🤖 Starting Ask Eve Assist Bot Server...');

    const botServer = new BotServer();
    const port = parseInt(process.env.BOT_PORT || '3000', 10);

    await botServer.start(port);

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`🛑 Received ${signal}, shutting down Ask Eve Bot Server...`);
      
      try {
        // Add any cleanup logic here
        await logger.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Error during bot server shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.critical('Uncaught exception in bot server', { error });
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.critical('Unhandled promise rejection in bot server', { reason, promise });
      shutdown('unhandledRejection');
    });

  } catch (error) {
    logger.critical('Failed to start Ask Eve Bot Server', { error });
    process.exit(1);
  }
}

// Start the bot server if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Critical bot server startup failure:', error);
    process.exit(1);
  });
}

export { main as startBotServer };
export { BotServer } from './BotServer';
export { AgentsSDKBot } from './AgentsSDKBot';