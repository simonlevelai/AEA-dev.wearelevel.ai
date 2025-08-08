#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { SearchService } from '../src/services/SearchService';
import { ValidationService } from '../src/services/ValidationService';
import { SearchConfig } from '../src/types/content';
import { logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

/**
 * Source URL validation script
 * Validates all content in the Azure AI Search index to ensure
 * every piece of content has a valid source URL from eveappeal.org.uk
 */
async function validateAllSources(): Promise<void> {
  try {
    logger.info('Starting source URL validation process');

    // Initialize services
    const searchConfig: SearchConfig = {
      endpoint: process.env['AZURE_SEARCH_ENDPOINT']!,
      apiKey: process.env['AZURE_SEARCH_API_KEY'] || '',
      indexName: process.env['AZURE_SEARCH_INDEX_NAME'] || 'askeve-content'
    };

    const searchService = new SearchService(searchConfig);
    const validationService = new ValidationService(searchService);

    // Perform comprehensive validation
    const report = await validationService.validateAllSources();

    // Log detailed results
    logger.info('Source validation completed', {
      totalContent: report.totalContent,
      withValidUrls: report.withSourceUrls,
      missingUrls: report.missingUrls.length,
      invalidUrls: report.invalidUrls.length,
      brokenLinks: report.brokenLinks.length
    });

    // Print summary to console
    console.log('\n🔍 Source URL Validation Report');
    console.log('================================');
    console.log(`Total content items: ${report.totalContent}`);
    console.log(`With valid source URLs: ${report.withSourceUrls}`);
    console.log(`Missing URLs: ${report.missingUrls.length}`);
    console.log(`Invalid URLs: ${report.invalidUrls.length}`);
    console.log(`Broken links: ${report.brokenLinks.length}`);

    // Show violations if any
    if (report.missingUrls.length > 0) {
      console.log('\n❌ Content without source URLs:');
      report.missingUrls.slice(0, 10).forEach(id => console.log(`  - ${id}`));
      if (report.missingUrls.length > 10) {
        console.log(`  ... and ${report.missingUrls.length - 10} more`);
      }
    }

    if (report.invalidUrls.length > 0) {
      console.log('\n⚠️ Content with invalid URLs:');
      report.invalidUrls.slice(0, 5).forEach(item => 
        console.log(`  - ${item.id}: ${item.url}`)
      );
      if (report.invalidUrls.length > 5) {
        console.log(`  ... and ${report.invalidUrls.length - 5} more`);
      }
    }

    if (report.brokenLinks.length > 0) {
      console.log('\n🔗 Content with broken links:');
      report.brokenLinks.slice(0, 5).forEach(item => 
        console.log(`  - ${item.id}: ${item.url}`)
      );
      if (report.brokenLinks.length > 5) {
        console.log(`  ... and ${report.brokenLinks.length - 5} more`);
      }
    }

    // Exit with appropriate code
    const hasViolations = report.missingUrls.length > 0 || 
                         report.invalidUrls.length > 0;
    
    if (hasViolations) {
      console.log('\n❌ Validation failed - source URL violations found');
      process.exit(1);
    } else {
      console.log('\n✅ All content has valid source URLs');
      process.exit(0);
    }

  } catch (error) {
    logger.error('Validation script failed', { error: error instanceof Error ? error : new Error(String(error)) });
    console.error('❌ Validation script failed:', error);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validateAllSources();
}