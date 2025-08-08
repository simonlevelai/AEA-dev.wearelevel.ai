#!/usr/bin/env node

import { BotServer } from './BotServer';

// Simple inline logger
class SimpleLogger {
  constructor(private component: string) {}
  
  info(message: string, context?: any) {
    console.log(`[INFO] ${this.component}: ${message}`, context || '');
  }
  
  error(message: string, context?: any) {
    console.error(`[ERROR] ${this.component}: ${message}`, context || '');
  }
  
  critical(message: string, context?: any) {
    console.error(`[CRITICAL] ${this.component}: ${message}`, context || '');
  }
  
  async shutdown() {
    // Placeholder for cleanup
  }
}

const logger = new SimpleLogger('bot-main');

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
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logger.error('Error during bot server shutdown', { error: errorObj });
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
export { AskEveAssistBot } from '../index-real-m365';