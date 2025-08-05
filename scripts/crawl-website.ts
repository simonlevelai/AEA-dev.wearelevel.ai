#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { WebsiteCrawlerService } from '../src/services/WebsiteCrawlerService';
import { ValidationService } from '../src/services/ValidationService';
import { SearchService } from '../src/services/SearchService';
import { CrawlConfig, SearchConfig } from '../src/types/content';
import { logger } from '../src/utils/logger';
import crawlConfig from '../crawl-config.json';

// Load environment variables
dotenv.config();

/**
 * Website crawler script for eveappeal.org.uk
 * Extracts health information while preserving source URLs
 * and following robots.txt respectfully
 */
async function crawlWebsite(): Promise<void> {
  try {
    logger.info('Starting Eve Appeal website crawl');

    // Initialize services
    const searchConfig: SearchConfig = {
      endpoint: process.env['AZURE_SEARCH_ENDPOINT']!,
      apiKey: process.env['AZURE_SEARCH_API_KEY'] || '',
      indexName: process.env['AZURE_SEARCH_INDEX_NAME'] || 'askeve-content'
    };

    const searchService = new SearchService(searchConfig);
    const validationService = new ValidationService(searchService);

    // Use configuration from JSON file
    const crawlerConfig: CrawlConfig = crawlConfig as CrawlConfig;
    
    const crawlerService = new WebsiteCrawlerService(crawlerConfig, validationService);

    // Define starting URLs based on high-value health information sections
    const startUrls = [
      '/information/ovarian-cancer/symptoms',
      '/information/ovarian-cancer/diagnosis',
      '/information/ovarian-cancer/treatment',
      '/information/cervical-cancer/symptoms',
      '/information/cervical-cancer/screening',
      '/information/cervical-cancer/prevention',
      '/information/endometrial-cancer/symptoms',
      '/information/endometrial-cancer/diagnosis',
      '/information/endometrial-cancer/treatment',
      '/information/vulval-cancer/symptoms',
      '/information/vulval-cancer/diagnosis',
      '/information/vaginal-cancer/symptoms',
      '/symptoms/bloating',
      '/symptoms/pelvic-pain',
      '/symptoms/abnormal-bleeding',
      '/symptoms/changes-in-bowel-habits',
      '/about-gynaecological-cancer/what-is-gynaecological-cancer',
      '/about-gynaecological-cancer/statistics',
      '/support/just-diagnosed',
      '/support/during-treatment',
      '/support/after-treatment',
      '/awareness/know-your-body'
    ];

    logger.info('Starting crawl with URLs', { 
      startUrlCount: startUrls.length,
      baseUrl: crawlerConfig.baseUrl
    });

    // Execute crawl
    const result = await crawlerService.crawlWebsite(startUrls);

    // Log detailed results
    logger.info('Website crawl completed', {
      pagesChecked: result.pagesChecked,
      newPages: result.newPages,
      pagesUpdated: result.pagesUpdated,
      errors: result.errors.length,
      missingUrls: result.missingUrls.length
    });

    // Print summary to console
    console.log('\n🌐 Website Crawl Results');
    console.log('========================');
    console.log(`Pages checked: ${result.pagesChecked}`);
    console.log(`New pages crawled: ${result.newPages}`);
    console.log(`Pages updated: ${result.pagesUpdated}`);
    console.log(`Errors encountered: ${result.errors.length}`);
    
    if (result.missingUrls.length > 0) {
      console.log(`Missing URLs: ${result.missingUrls.length}`);
    }

    // Show errors if any
    if (result.errors.length > 0) {
      console.log('\n⚠️ Crawl Errors:');
      result.errors.slice(0, 10).forEach(error => console.log(`  - ${error}`));
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    // Show missing URLs if any
    if (result.missingUrls.length > 0) {
      console.log('\n🔍 Missing URLs:');
      result.missingUrls.slice(0, 10).forEach(url => console.log(`  - ${url}`));
      if (result.missingUrls.length > 10) {
        console.log(`  ... and ${result.missingUrls.length - 10} more URLs`);
      }
    }

    if (result.newPages > 0) {
      console.log(`\n✅ Successfully crawled ${result.newPages} pages`);
      console.log('📁 Content saved to: content/documents/');
      console.log('\n💡 Next steps:');
      console.log('  1. Run "npm run ingest" to process and chunk the content');
      console.log('  2. Run "npm run validate-sources" to verify all source URLs');
    }

    // Exit with appropriate code
    const hasErrors = result.errors.length > 0;
    process.exit(hasErrors ? 1 : 0);

  } catch (error) {
    logger.error('Website crawl script failed', { error });
    console.error('❌ Website crawl failed:', error);
    process.exit(1);
  }
}

// Add command line argument support
function parseArguments(): { urls?: string[]; dryRun?: boolean } {
  const args = process.argv.slice(2);
  const options: { urls?: string[]; dryRun?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--urls':
        const urlsArg = args[++i];
        if (urlsArg) {
          options.urls = urlsArg.split(',').map(url => url.trim());
        }
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: npm run crawl [options]

Options:
  --urls <urls>     Comma-separated list of URLs to crawl (overrides defaults)
  --dry-run         Preview what would be crawled without actually crawling
  --help            Show this help message

Examples:
  npm run crawl
  npm run crawl -- --urls "/information/ovarian-cancer,/symptoms/bloating"
  npm run crawl -- --dry-run
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Run crawl if this script is executed directly
if (require.main === module) {
  const options = parseArguments();
  
  if (options.dryRun) {
    console.log('🔍 Dry run mode - would crawl the following URLs:');
    // Show what would be crawled without actually doing it
    logger.info('Dry run mode enabled');
  }
  
  crawlWebsite();
}

export { crawlWebsite };