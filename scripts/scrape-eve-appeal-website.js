// Eve Appeal Website Scraper - Enhanced Medical Content Collection
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const path = require('path');

class EveAppealWebScraper {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    this.scrapeStats = {
      pagesScraped: 0,
      documentsCreated: 0,
      chunksCreated: 0,
      errors: 0,
      startTime: Date.now()
    };

    // Key pages to scrape from The Eve Appeal website
    this.targetUrls = [
      'https://eveappeal.org.uk/about-gynaecological-cancer/cervical-cancer/',
      'https://eveappeal.org.uk/about-gynaecological-cancer/ovarian-cancer/',
      'https://eveappeal.org.uk/about-gynaecological-cancer/womb-cancer/',
      'https://eveappeal.org.uk/about-gynaecological-cancer/vulval-cancer/',
      'https://eveappeal.org.uk/about-gynaecological-cancer/vaginal-cancer/',
      'https://eveappeal.org.uk/about-gynaecological-cancer/hereditary-cancer/',
      'https://eveappeal.org.uk/gynae-health/symptoms-to-look-out-for/',
      'https://eveappeal.org.uk/gynae-health/prevention/',
      'https://eveappeal.org.uk/gynae-health/screening/',
      'https://eveappeal.org.uk/gynae-health/risk-factors/',
      'https://eveappeal.org.uk/support-services/',
      'https://eveappeal.org.uk/support-services/ask-eve-information-service/',
      'https://eveappeal.org.uk/support-services/support-groups/',
      'https://eveappeal.org.uk/support-services/online-support/',
    ];
  }

  async scrapeEveAppealWebsite() {
    console.log('🌸 Starting Eve Appeal Website Scraping');
    console.log('==========================================');
    console.log(`📄 Target pages: ${this.targetUrls.length}`);

    let browser;
    try {
      // Launch browser
      browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // Clear existing website data
      await this.clearWebsiteData();

      // Scrape each target URL
      for (const url of this.targetUrls) {
        await this.scrapeSinglePage(browser, url);
        // Add delay to be respectful to the website
        await this.sleep(2000);
      }

      // Display results
      this.displayScrapingSummary();

    } catch (error) {
      console.error('❌ Scraping failed:', error.message);
      this.scrapeStats.errors++;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async clearWebsiteData() {
    console.log('🧹 Clearing existing website data...');
    
    try {
      // Delete website-sourced content (not PiF documents)
      await this.supabase
        .from('pif_content_chunks')
        .delete()
        .like('chunk_id', 'website-%');
      
      await this.supabase
        .from('pif_documents')
        .delete()
        .eq('document_type', 'website_content');
      
      console.log('✅ Cleared existing website data');
    } catch (error) {
      console.log('⚠️ Clear data warning:', error.message);
    }
  }

  async scrapeSinglePage(browser, url) {
    try {
      console.log(`🔍 Scraping: ${url}`);
      
      const page = await browser.newPage();
      
      // Set user agent to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      
      // Navigate to page
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Extract content
      const pageData = await page.evaluate(() => {
        // Remove navigation, footer, and sidebar elements
        const elementsToRemove = [
          'nav', 'footer', '.navigation', '.sidebar', '.menu',
          '.breadcrumb', '.social-share', '.cookie-banner',
          'script', 'style', 'noscript'
        ];
        
        elementsToRemove.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Extract main content
        const title = document.querySelector('h1')?.textContent?.trim() || 
                     document.title?.replace(/\s*\|\s*The Eve Appeal.*$/, '').trim() || 
                     'Untitled Page';

        // Get main content from multiple possible containers
        const contentSelectors = [
          'main', '.main-content', '.content', '.post-content',
          '.entry-content', '[role="main"]', 'article'
        ];

        let content = '';
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            content = element.innerText?.trim();
            break;
          }
        }

        // Fallback to body content if no main content found
        if (!content) {
          content = document.body?.innerText?.trim() || '';
        }

        // Extract key medical information
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
          .map(h => h.textContent?.trim())
          .filter(Boolean);

        // Look for symptom lists, treatment info, etc.
        const lists = Array.from(document.querySelectorAll('ul, ol'))
          .map(list => list.innerText?.trim())
          .filter(Boolean);

        return {
          title,
          content,
          headings,
          lists,
          url: window.location.href
        };
      });

      await page.close();

      if (pageData.content && pageData.content.length > 200) {
        await this.processPageContent(pageData);
        this.scrapeStats.pagesScraped++;
        console.log(`   ✅ Scraped: ${pageData.title} (${pageData.content.length} chars)`);
      } else {
        console.log(`   ⚠️ Skipped: ${url} (insufficient content)`);
      }

    } catch (error) {
      console.error(`❌ Failed to scrape ${url}:`, error.message);
      this.scrapeStats.errors++;
    }
  }

  async processPageContent(pageData) {
    try {
      // Create document entry
      const document = await this.createWebsiteDocument(pageData);
      
      // Split content into chunks for better search
      const chunks = this.splitContentIntoChunks(pageData.content, pageData.title);
      
      // Create content chunks
      for (let i = 0; i < chunks.length; i++) {
        await this.createContentChunk(document.id, chunks[i], i, pageData);
      }

      this.scrapeStats.documentsCreated++;
      this.scrapeStats.chunksCreated += chunks.length;

    } catch (error) {
      console.error('Failed to process page content:', error.message);
      this.scrapeStats.errors++;
    }
  }

  async createWebsiteDocument(pageData) {
    const { data: document, error } = await this.supabase
      .from('pif_documents')
      .insert({
        filename: this.urlToFilename(pageData.url),
        title: pageData.title,
        source_url: pageData.url,
        document_type: 'website_content',
        last_reviewed: new Date().toISOString().split('T')[0],
        pif_approved: true, // Eve Appeal content is authoritative
        metadata: {
          scrapedAt: new Date().toISOString(),
          headings: pageData.headings,
          contentLength: pageData.content.length
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create document: ${error.message}`);
    }

    return document;
  }

  async createContentChunk(documentId, chunkContent, index, pageData) {
    const chunkId = `website-${this.urlToSlug(pageData.url)}-chunk-${index}`;
    
    const { error } = await this.supabase
      .from('pif_content_chunks')
      .insert({
        document_id: documentId,
        chunk_id: chunkId,
        title: `${pageData.title} - Section ${index + 1}`,
        content: chunkContent,
        content_type: this.determineContentType(chunkContent, pageData.title),
        priority_level: this.determinePriorityLevel(chunkContent),
        source_url: pageData.url,
        relevance_keywords: this.extractKeywords(chunkContent),
        medical_categories: this.extractMedicalCategories(chunkContent, pageData.url),
        metadata: {
          originalUrl: pageData.url,
          chunkIndex: index,
          scrapedAt: new Date().toISOString()
        }
      });

    if (error) {
      throw new Error(`Failed to create chunk: ${error.message}`);
    }
  }

  splitContentIntoChunks(content, title) {
    // Split content into manageable chunks for better search relevance
    const maxChunkSize = 1500; // characters
    const chunks = [];
    
    // Try to split by paragraphs first
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length <= maxChunkSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = paragraph;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    // If no good splits found, just chunk by size
    if (chunks.length === 0) {
      for (let i = 0; i < content.length; i += maxChunkSize) {
        chunks.push(content.substring(i, i + maxChunkSize));
      }
    }
    
    return chunks;
  }

  determineContentType(content, title) {
    const lowerContent = content.toLowerCase();
    const lowerTitle = title.toLowerCase();
    
    if (lowerContent.includes('emergency') || lowerContent.includes('999') || 
        lowerContent.includes('urgent') || lowerContent.includes('immediately')) {
      return 'emergency';
    }
    
    if (lowerContent.includes('see your gp') || lowerContent.includes('see a doctor') ||
        lowerContent.includes('contact your doctor') || lowerContent.includes('seek medical advice')) {
      return 'when_to_see_gp';
    }
    
    if (lowerTitle.includes('symptom') || lowerContent.includes('signs of') ||
        lowerContent.includes('symptoms of') || lowerContent.includes('look out for')) {
      return 'symptoms';
    }
    
    if (lowerContent.includes('screening') || lowerContent.includes('test') ||
        lowerContent.includes('examination') || lowerTitle.includes('screening')) {
      return 'screening';
    }
    
    if (lowerContent.includes('treatment') || lowerContent.includes('therapy') ||
        lowerContent.includes('surgery') || lowerContent.includes('chemotherapy')) {
      return 'treatment';
    }
    
    if (lowerContent.includes('support') || lowerTitle.includes('support') ||
        lowerContent.includes('help') || lowerContent.includes('counselling')) {
      return 'support';
    }
    
    if (lowerContent.includes('prevent') || lowerTitle.includes('prevention') ||
        lowerContent.includes('reduce risk')) {
      return 'prevention';
    }
    
    return 'medical_information';
  }

  determinePriorityLevel(content) {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('emergency') || lowerContent.includes('999') ||
        lowerContent.includes('immediately') || lowerContent.includes('urgent') ||
        lowerContent.includes('life-threatening')) {
      return 'critical';
    }
    
    if (lowerContent.includes('see your gp') || lowerContent.includes('symptoms') ||
        lowerContent.includes('bleeding') || lowerContent.includes('pain') ||
        lowerContent.includes('lumps') || lowerContent.includes('changes')) {
      return 'high';
    }
    
    if (lowerContent.includes('screening') || lowerContent.includes('prevention') ||
        lowerContent.includes('testing') || lowerContent.includes('check-up')) {
      return 'medium';
    }
    
    return 'low';
  }

  extractKeywords(content) {
    const medicalKeywords = [
      'symptom', 'symptoms', 'cancer', 'screening', 'test', 'genetic', 'treatment',
      'gp', 'doctor', 'urgent', 'emergency', 'pain', 'bleeding', 'discharge',
      'lump', 'family history', 'brca', 'hpv', 'vaccination', 'cervical',
      'ovarian', 'vulval', 'vaginal', 'womb', 'uterine', 'lynch syndrome',
      'support', 'help', 'prevention', 'risk factors', 'examination', 'smear',
      'biopsy', 'ultrasound', 'chemotherapy', 'radiotherapy', 'surgery'
    ];
    
    const lowerContent = content.toLowerCase();
    return medicalKeywords.filter(keyword => lowerContent.includes(keyword));
  }

  extractMedicalCategories(content, url) {
    const categories = [];
    const lowerContent = content.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    // Extract categories from URL first (most reliable)
    if (lowerUrl.includes('cervical')) categories.push('cervical');
    if (lowerUrl.includes('ovarian')) categories.push('ovarian'); 
    if (lowerUrl.includes('vulval')) categories.push('vulval');
    if (lowerUrl.includes('vaginal')) categories.push('vaginal');
    if (lowerUrl.includes('womb')) categories.push('womb');
    if (lowerUrl.includes('hereditary')) categories.push('genetic');
    if (lowerUrl.includes('symptoms')) categories.push('symptoms');
    if (lowerUrl.includes('screening')) categories.push('screening');
    if (lowerUrl.includes('support')) categories.push('support');
    if (lowerUrl.includes('prevention')) categories.push('prevention');
    
    // Then extract from content
    if (lowerContent.includes('cervical cancer')) categories.push('cervical');
    if (lowerContent.includes('ovarian cancer')) categories.push('ovarian'); 
    if (lowerContent.includes('vulval cancer')) categories.push('vulval');
    if (lowerContent.includes('vaginal cancer')) categories.push('vaginal');
    if (lowerContent.includes('womb cancer') || lowerContent.includes('uterine cancer')) categories.push('womb');
    if (lowerContent.includes('hpv') || lowerContent.includes('human papillomavirus')) categories.push('hpv');
    if (lowerContent.includes('genetic') || lowerContent.includes('brca') || lowerContent.includes('hereditary')) categories.push('genetic');
    if (lowerContent.includes('screening') || lowerContent.includes('smear test')) categories.push('screening');
    if (lowerContent.includes('lynch syndrome')) categories.push('lynch_syndrome');
    if (lowerContent.includes('support') || lowerContent.includes('counselling')) categories.push('support');
    
    return categories.length > 0 ? [...new Set(categories)] : ['general'];
  }

  urlToFilename(url) {
    return url.replace(/https?:\/\//, '')
              .replace(/[^a-zA-Z0-9]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '') + '.html';
  }

  urlToSlug(url) {
    return url.replace(/https?:\/\/eveappeal\.org\.uk\//, '')
              .replace(/\/$/, '')
              .replace(/\//g, '-')
              .replace(/[^a-zA-Z0-9-]/g, '');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  displayScrapingSummary() {
    const duration = Date.now() - this.scrapeStats.startTime;
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 EVE APPEAL WEBSITE SCRAPING SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Pages Scraped: ${this.scrapeStats.pagesScraped}`);
    console.log(`✅ Documents Created: ${this.scrapeStats.documentsCreated}`);
    console.log(`✅ Content Chunks Created: ${this.scrapeStats.chunksCreated}`);
    console.log(`❌ Errors: ${this.scrapeStats.errors}`);
    console.log(`⏱️ Scraping Duration: ${(duration / 1000).toFixed(1)} seconds`);
    
    if (this.scrapeStats.errors === 0) {
      console.log('\n🎉 WEBSITE SCRAPING COMPLETED SUCCESSFULLY!');
      console.log('🔍 Eve Appeal website content is now available for RAG searches');
      console.log('🤖 Azure OpenAI now has access to comprehensive gynaecological health information');
    } else {
      console.log('\n⚠️ Scraping completed with some errors. Please review the logs.');
    }
    
    console.log('\n📋 Content Now Available:');
    console.log('   • Cancer information (cervical, ovarian, womb, vulval, vaginal)');
    console.log('   • Symptoms and early recognition guides');
    console.log('   • Screening and prevention information'); 
    console.log('   • Support services and resources');
    console.log('   • Risk factors and hereditary cancer information');
    console.log('='.repeat(50));
  }
}

// Run scraper
async function main() {
  try {
    const scraper = new EveAppealWebScraper();
    await scraper.scrapeEveAppealWebsite();
    
    console.log('\n✅ Eve Appeal website scraping completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Website scraping failed:', error.message);
    process.exit(1);
  }
}

main();