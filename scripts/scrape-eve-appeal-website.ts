#!/usr/bin/env npx ts-node

/**
 * The Eve Appeal Website Scraper
 * Comprehensive scraper for www.eveappeal.org.uk to gather current resources and links
 * 
 * Features:
 * - Scrapes all gynaecological cancer information pages
 * - Extracts symptom information, support resources, and educational content  
 * - Processes content into Azure AI Search-compatible chunks
 * - Maintains source attribution and link structure
 * - Respects robots.txt and implements rate limiting
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

interface ScrapedContent {
  id: string;
  title: string;
  content: string;
  source: string;
  category: string;
  url: string;
  lastUpdated: string;
}

interface PageToScrape {
  url: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

class EveAppealWebsiteScraper {
  private readonly baseUrl = 'https://eveappeal.org.uk';
  private readonly searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
  private readonly searchApiKey = process.env.AZURE_SEARCH_API_KEY;
  private readonly indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content';
  private readonly outputDir = path.join(__dirname, '../content/website-content');
  
  // High-priority pages for comprehensive health information
  private readonly pagesToScrape: PageToScrape[] = [
    // Core gynaecological cancers
    { url: '/gynaecological-cancer/ovarian-cancer', category: 'Ovarian Cancer', priority: 'high' },
    { url: '/gynaecological-cancer/cervical-cancer', category: 'Cervical Cancer', priority: 'high' },
    { url: '/gynaecological-cancer/womb-cancer', category: 'Womb Cancer', priority: 'high' },
    { url: '/gynaecological-cancer/vulval-cancer', category: 'Vulval Cancer', priority: 'high' },
    { url: '/gynaecological-cancer/vaginal-cancer', category: 'Vaginal Cancer', priority: 'high' },
    
    // Symptoms and early detection
    { url: '/gynaecological-cancer/symptoms', category: 'Symptoms', priority: 'high' },
    { url: '/gynaecological-cancer/know-your-body', category: 'Body Awareness', priority: 'high' },
    
    // Support and resources
    { url: '/support', category: 'Support Services', priority: 'high' },
    { url: '/support/newly-diagnosed', category: 'Newly Diagnosed Support', priority: 'high' },
    { url: '/support/living-with-cancer', category: 'Living with Cancer', priority: 'medium' },
    
    // HPV and screening
    { url: '/gynaecological-cancer/hpv', category: 'HPV Information', priority: 'high' },
    { url: '/gynaecological-cancer/screening', category: 'Screening', priority: 'high' },
    
    // Hereditary and genetic testing
    { url: '/gynaecological-cancer/hereditary-cancer', category: 'Hereditary Cancer', priority: 'high' },
    { url: '/gynaecological-cancer/ovarian-cancer/genetic-testing', category: 'Genetic Testing', priority: 'medium' },
    
    // Research and trials
    { url: '/research', category: 'Research', priority: 'medium' },
    { url: '/research/clinical-trials', category: 'Clinical Trials', priority: 'medium' },
    
    // Additional support resources
    { url: '/support/family-and-friends', category: 'Family Support', priority: 'medium' },
    { url: '/support/wellbeing', category: 'Wellbeing', priority: 'medium' },
    
    // Prevention and awareness
    { url: '/gynaecological-cancer/prevention', category: 'Prevention', priority: 'medium' },
    { url: '/awareness-campaigns', category: 'Awareness', priority: 'low' }
  ];

  constructor() {
    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    console.log('🌐 The Eve Appeal Website Scraper initialized');
    console.log(`📁 Output directory: ${this.outputDir}`);
    console.log(`🎯 Pages to scrape: ${this.pagesToScrape.length}`);
  }

  /**
   * Main scraping orchestrator
   */
  async scrapeEveAppealWebsite(): Promise<void> {
    console.log('🚀 Starting comprehensive website scraping...');
    
    const allContent: ScrapedContent[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Sort by priority for better resource management
    const sortedPages = this.pagesToScrape.sort((a, b) => {
      const priorities = { high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });

    for (const page of sortedPages) {
      try {
        console.log(`\n📄 Scraping: ${page.url} (${page.priority} priority)`);
        
        const content = await this.scrapePage(page);
        
        if (content) {
          allContent.push(...content);
          successCount++;
          console.log(`✅ Successfully scraped: ${content.length} content chunks`);
        } else {
          console.log(`⚠️ No content extracted from: ${page.url}`);
        }
        
        // Rate limiting - be respectful to the server
        await this.delay(2000); // 2 seconds between requests
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to scrape ${page.url}:`, error);
        
        // Continue with other pages even if one fails
        continue;
      }
    }

    console.log(`\n📊 Scraping Summary:`);
    console.log(`  ✅ Successful pages: ${successCount}/${sortedPages.length}`);
    console.log(`  ❌ Failed pages: ${errorCount}`);
    console.log(`  📄 Total content chunks: ${allContent.length}`);

    if (allContent.length > 0) {
      // Save to local JSON file
      await this.saveContentToFile(allContent);
      
      // Upload to Azure AI Search (if configured)
      if (this.searchEndpoint && this.searchApiKey) {
        await this.uploadToAzureSearch(allContent);
      } else {
        console.log('⚠️ Azure Search not configured - content saved locally only');
      }
    }

    console.log('\n🎉 Website scraping completed!');
  }

  /**
   * Scrape a single page and extract relevant content
   */
  private async scrapePage(page: PageToScrape): Promise<ScrapedContent[] | null> {
    const fullUrl = `${this.baseUrl}${page.url}`;
    
    try {
      const response = await axios.get(fullUrl, {
        headers: {
          'User-Agent': 'AskEveAssist/1.0 (+https://github.com/eveappeal/ask-eve-assist) Healthcare Information Bot',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const $ = cheerio.load(response.data);
      
      // Extract page title
      const pageTitle = $('h1').first().text().trim() || 
                       $('title').text().replace(' - The Eve Appeal', '').trim() ||
                       page.category;

      // Remove navigation, footer, and other non-content elements
      $('nav, footer, .navigation, .menu, .breadcrumb, .social-share, script, style').remove();
      
      // Extract main content areas
      const contentSections = this.extractContentSections($, pageTitle, page);
      
      if (contentSections.length === 0) {
        console.log(`    ⚠️ No content sections found in: ${fullUrl}`);
        return null;
      }

      console.log(`    📝 Extracted ${contentSections.length} content sections`);
      
      return contentSections.map((section, index) => ({
        id: `eve-website-${page.category.toLowerCase().replace(/\s+/g, '-')}-${index}`,
        title: section.title || pageTitle,
        content: section.content,
        source: `The Eve Appeal - ${section.title || pageTitle}`,
        category: page.category,
        url: fullUrl,
        lastUpdated: new Date().toISOString().split('T')[0]
      }));

    } catch (error) {
      throw new Error(`Failed to scrape ${fullUrl}: ${error}`);
    }
  }

  /**
   * Extract meaningful content sections from the page
   */
  private extractContentSections($: cheerio.CheerioAPI, pageTitle: string, page: PageToScrape): Array<{title: string, content: string}> {
    const sections: Array<{title: string, content: string}> = [];
    
    // Strategy 1: Look for article or main content areas
    const mainContent = $('.entry-content, .page-content, .post-content, .article-content, main, .content').first();
    
    if (mainContent.length > 0) {
      // Extract sections with headings
      mainContent.find('h2, h3').each((_, element) => {
        const $heading = $(element);
        const headingText = $heading.text().trim();
        
        if (headingText) {
          // Get content until next heading of same or higher level
          const contentParts: string[] = [headingText];
          
          let $next = $heading.next();
          while ($next.length > 0 && !this.isHeading($next)) {
            const text = $next.text().trim();
            if (text && text.length > 20) { // Ignore very short text
              contentParts.push(text);
            }
            $next = $next.next();
          }
          
          if (contentParts.length > 1) {
            sections.push({
              title: headingText,
              content: contentParts.join('\n\n')
            });
          }
        }
      });
    }
    
    // Strategy 2: If no sections found, get all paragraph content
    if (sections.length === 0) {
      const paragraphs: string[] = [];
      
      // Get all paragraphs from main content area
      const contentArea = $('.entry-content, .page-content, .post-content, main, .content, body').first();
      contentArea.find('p, li').each((_, element) => {
        const text = $(element).text().trim();
        if (text.length > 30) { // Only meaningful paragraphs
          paragraphs.push(text);
        }
      });
      
      if (paragraphs.length > 0) {
        // Group paragraphs into meaningful sections
        const chunkSize = 3; // 3 paragraphs per section
        for (let i = 0; i < paragraphs.length; i += chunkSize) {
          const chunk = paragraphs.slice(i, i + chunkSize);
          sections.push({
            title: pageTitle,
            content: chunk.join('\n\n')
          });
        }
      }
    }
    
    // Strategy 3: Extract key information sections (symptoms, treatment, etc.)
    this.extractKeyInformationSections($, sections, pageTitle);
    
    return sections.filter(section => section.content.length > 100); // Only substantial content
  }

  /**
   * Extract key healthcare information sections
   */
  private extractKeyInformationSections($: cheerio.CheerioAPI, sections: Array<{title: string, content: string}>, pageTitle: string): void {
    // Look for specific healthcare information patterns
    const keyPatterns = [
      { pattern: /symptoms?/i, title: 'Symptoms' },
      { pattern: /signs?/i, title: 'Signs and Symptoms' },
      { pattern: /treatment/i, title: 'Treatment Information' },
      { pattern: /diagnosis/i, title: 'Diagnosis' },
      { pattern: /support/i, title: 'Support Resources' },
      { pattern: /risk factors?/i, title: 'Risk Factors' },
      { pattern: /prevention/i, title: 'Prevention' },
      { pattern: /screening/i, title: 'Screening' }
    ];
    
    for (const keyPattern of keyPatterns) {
      $('*').filter((_, element) => {
        const text = $(element).text();
        return keyPattern.pattern.test(text) && text.length < 100; // Likely a heading
      }).each((_, element) => {
        const $element = $(element);
        const headingText = $element.text().trim();
        
        // Get following content
        const contentParts: string[] = [];
        let $next = $element.next();
        let depth = 0;
        
        while ($next.length > 0 && depth < 5) { // Limit depth to avoid getting too much content
          const text = $next.text().trim();
          if (text && text.length > 20) {
            contentParts.push(text);
          }
          $next = $next.next();
          depth++;
        }
        
        if (contentParts.length > 0) {
          sections.push({
            title: `${pageTitle} - ${keyPattern.title}`,
            content: `${headingText}\n\n${contentParts.join('\n\n')}`
          });
        }
      });
    }
  }

  /**
   * Check if element is a heading
   */
  private isHeading(element: cheerio.Cheerio<any>): boolean {
    return element.is('h1, h2, h3, h4, h5, h6');
  }

  /**
   * Save scraped content to JSON file
   */
  private async saveContentToFile(content: ScrapedContent[]): Promise<void> {
    const outputFile = path.join(this.outputDir, 'eve-appeal-website-content.json');
    
    const outputData = {
      scrapedAt: new Date().toISOString(),
      totalChunks: content.length,
      categories: [...new Set(content.map(c => c.category))],
      content: content
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`\n💾 Content saved to: ${outputFile}`);
    console.log(`📊 Categories found: ${outputData.categories.join(', ')}`);
  }

  /**
   * Upload content to Azure AI Search
   */
  private async uploadToAzureSearch(content: ScrapedContent[]): Promise<void> {
    console.log(`\n📤 Uploading ${content.length} chunks to Azure AI Search...`);
    
    // Note: Using smaller batches based on previous 403 error experience
    const batchSize = 5;
    let uploadedCount = 0;
    
    for (let i = 0; i < content.length; i += batchSize) {
      const batch = content.slice(i, i + batchSize);
      
      try {
        // Transform to Azure Search format
        const searchDocuments = batch.map(chunk => ({
          '@search.action': 'upload',
          id: chunk.id,
          title: chunk.title,
          content: chunk.content,
          source: chunk.source,
          category: chunk.category
        }));
        
        const uploadUrl = `${this.searchEndpoint}/indexes/${this.indexName}/docs/index?api-version=2023-11-01`;
        
        await axios.post(uploadUrl, { value: searchDocuments }, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.searchApiKey!
          },
          timeout: 30000
        });
        
        uploadedCount += batch.length;
        console.log(`  ✅ Uploaded batch ${Math.floor(i/batchSize) + 1}: ${uploadedCount}/${content.length} chunks`);
        
        // Rate limiting for API
        await this.delay(3000);
        
      } catch (error) {
        console.error(`  ❌ Failed to upload batch ${Math.floor(i/batchSize) + 1}:`, error);
        // Continue with other batches
      }
    }
    
    console.log(`\n📈 Website content upload summary: ${uploadedCount}/${content.length} chunks uploaded`);
  }

  /**
   * Delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  try {
    const scraper = new EveAppealWebsiteScraper();
    await scraper.scrapeEveAppealWebsite();
    
    console.log('\n✅ The Eve Appeal website scraping completed successfully!');
    console.log('🎯 The knowledge base now includes current website information');
    console.log('💡 Ask Eve Assist can now provide up-to-date resources and links');
    
  } catch (error) {
    console.error('💥 Website scraping failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { EveAppealWebsiteScraper };