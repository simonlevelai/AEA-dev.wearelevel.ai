#!/usr/bin/env ts-node

/**
 * Eve Appeal Website Crawler for Ask Eve Assist
 * 
 * Crawls The Eve Appeal website to create a comprehensive 
 * gynecological health knowledge base.
 * 
 * Target: Use remaining 49.89MB of Azure AI Search free tier optimally
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface CrawlTarget {
  baseUrl: string;
  name: string;
  priority: 'critical' | 'high' | 'medium';
  estimatedSize: string;
  paths: string[];
  allowedDomains?: string[];
}

interface CrawledContent {
  url: string;
  title: string;
  content: string;
  source: string;
  priority: 'critical' | 'high' | 'medium';
  lastCrawled: string;
  contentLength: number;
}

class ComprehensiveCrawler {
  private readonly outputPath = path.join(__dirname, '../content/processed');
  private readonly maxSize = 45 * 1024 * 1024; // 45MB limit (saving 5MB buffer)
  private currentSize = 0;
  
  private readonly crawlTargets: CrawlTarget[] = [
    {
      baseUrl: 'https://eveappeal.org.uk',
      name: 'The Eve Appeal',
      priority: 'critical',
      estimatedSize: '45MB',
      paths: [
        '/',
        '/gynaecological-cancer',
        '/gynaecological-cancer/ovarian-cancer',
        '/gynaecological-cancer/cervical-cancer', 
        '/gynaecological-cancer/womb-cancer',
        '/gynaecological-cancer/vulvar-cancer',
        '/gynaecological-cancer/vaginal-cancer',
        '/gynaecological-cancer/hereditary-cancer',
        '/gynaecological-cancer/hpv',
        '/screening',
        '/screening/cervical-screening',
        '/screening/hpv-testing',
        '/symptoms',
        '/symptoms/ovarian-cancer',
        '/symptoms/cervical-cancer',
        '/symptoms/womb-cancer',
        '/symptoms/vulvar-cancer',
        '/symptoms/vaginal-cancer',
        '/support',
        '/support/ask-eve',
        '/support/support-groups',
        '/support/helplines',
        '/information',
        '/information/research',
        '/information/news',
        '/awareness',
        '/awareness/campaigns',
        '/research',
        '/about',
        '/about/our-story',
        '/get-involved',
        '/get-involved/fundraising',
        '/get-involved/events'
      ]
    }
  ];

  async crawlComprehensively(): Promise<void> {
    console.log('🌐 Starting Eve Appeal Website Crawling...');
    console.log(`📊 Target: Use up to 45MB of remaining 49.89MB space`);
    
    const allContent: CrawledContent[] = [];
    
    // Process in priority order
    const sortedTargets = this.crawlTargets.sort((a, b) => {
      const priorities = { 'critical': 0, 'high': 1, 'medium': 2 };
      return priorities[a.priority] - priorities[b.priority];
    });
    
    for (const target of sortedTargets) {
      if (this.currentSize >= this.maxSize) {
        console.log(`⚠️  Size limit reached, skipping remaining targets`);
        break;
      }
      
      console.log(`\\n📖 Crawling: ${target.name} (${target.priority} priority)`);
      console.log(`   Estimated: ${target.estimatedSize}`);
      
      const targetContent = await this.crawlTarget(target);
      allContent.push(...targetContent);
      
      const targetSize = targetContent.reduce((sum, c) => sum + c.contentLength, 0);
      this.currentSize += targetSize;
      
      console.log(`   ✅ Crawled ${targetContent.length} pages (${(targetSize / 1024 / 1024).toFixed(2)}MB)`);
      console.log(`   📊 Total used: ${(this.currentSize / 1024 / 1024).toFixed(2)}MB / 45MB`);
    }
    
    // Save comprehensive content
    await this.saveComprehensiveContent(allContent);
    
    // Display final summary
    this.displayCrawlSummary(allContent);
  }
  
  private async crawlTarget(target: CrawlTarget): Promise<CrawledContent[]> {
    const content: CrawledContent[] = [];
    
    for (const path of target.paths) {
      if (this.currentSize >= this.maxSize) break;
      
      try {
        const url = `${target.baseUrl}${path}`;
        console.log(`    📄 Crawling: ${path}`);
        
        const pageContent = await this.crawlPage(url, target);
        if (pageContent) {
          content.push(pageContent);
        }
        
        // Be respectful - delay between requests
        await this.delay(1000);
        
      } catch (error) {
        console.log(`    ❌ Failed to crawl ${path}: ${error}`);
      }
    }
    
    return content;
  }
  
  private async crawlPage(url: string, target: CrawlTarget): Promise<CrawledContent | null> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Ask Eve Assist Health Bot - Crawling for patient information'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Health Information';
      
      // More aggressive content cleaning - remove everything non-textual
      $('script, style, img, svg, canvas, video, audio, iframe, embed, object, noscript').remove();
      $('nav, header, footer, aside, .nav, .header, .footer, .sidebar, .menu, .breadcrumb').remove();
      $('[style*="display:none"], [style*="visibility:hidden"]').remove();
      $('.cookie, .gdpr, .banner, .popup, .modal, .overlay').remove();
      
      // Extract text content by priority
      let content = '';
      
      // Try specific content areas first
      const contentSelectors = [
        'main',
        '.main-content', 
        '.content',
        '[role="main"]',
        '.entry-content',
        '.page-content',
        'article',
        '.post-content',
        '.text-content',
        '.body-content'
      ];
      
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          // Remove any remaining non-text elements within content
          element.find('img, svg, canvas, video, audio, iframe, embed, object').remove();
          const sectionContent = element.text();
          if (sectionContent.length > content.length) {
            content = sectionContent;
          }
        }
      }
      
      // If still no good content, try extracting from common text containers
      if (content.length < 500) {
        const textSelectors = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div'];
        let textContent = '';
        
        textSelectors.forEach(selector => {
          $(selector).each((_, element) => {
            const text = $(element).text().trim();
            if (text.length > 20 && !text.match(/^(menu|nav|footer|header|cookie|skip)/i)) {
              textContent += text + '\n\n';
            }
          });
        });
        
        if (textContent.length > content.length) {
          content = textContent;
        }
      }
      
      // Clean content
      content = this.cleanContent(content);
      
      // Skip if content too short or looks like navigation/error page (be more permissive)
      if (content.length < 200 || this.isLowQualityContent(content)) {
        return null;
      }
      
      // Check size limit
      if (this.currentSize + content.length > this.maxSize) {
        console.log(`    ⚠️  Skipping ${url} - would exceed size limit`);
        return null;
      }
      
      return {
        url,
        title,
        content,
        source: target.name,
        priority: target.priority,
        lastCrawled: new Date().toISOString(),
        contentLength: content.length
      };
      
    } catch (error) {
      return null;
    }
  }
  
  private cleanContent(content: string): string {
    // Only check for obvious binary file headers (be more permissive)
    const strictBinaryIndicators = [
      'PNG\r\n\x1a\n', 'JFIF', 'GIF89a', 'GIF87a', 
      'PDF-1.', '%PDF-', 'II*\x00', 'MM\x00*'
    ];
    
    for (const indicator of strictBinaryIndicators) {
      if (content.includes(indicator)) {
        return '';  // Return empty for obvious binary content
      }
    }
    
    return content
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      // Remove common navigation elements
      .replace(/Skip to content|Skip navigation|Cookie policy|Privacy policy/gi, '')
      // Remove social media text
      .replace(/Share on Facebook|Share on Twitter|Follow us/gi, '')
      // Remove only extreme binary/control characters (keep more content)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Clean up
      .trim();
  }
  
  private isLowQualityContent(content: string): boolean {
    const lowQualityIndicators = [
      'page not found',
      '404 error',
      'access denied',
      'javascript required',
      'cookies required',
      'under construction'
    ];
    
    const lowerContent = content.toLowerCase();
    
    // Check for obvious error pages
    if (lowQualityIndicators.some(indicator => lowerContent.includes(indicator))) {
      return true;
    }
    
    // Be more permissive - only reject if extremely short or mostly symbols
    if (content.length < 100) {
      return true;
    }
    
    // Check if content has reasonable amount of letters (be more permissive)
    const alphabeticCount = (content.match(/[a-zA-Z]/g) || []).length;
    const ratio = alphabeticCount / content.length;
    
    return ratio < 0.2; // Only reject if less than 20% alphabetic
  }
  
  private async saveComprehensiveContent(allContent: CrawledContent[]): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(this.outputPath, { recursive: true });
    
    // Save comprehensive web content
    const webContentFile = path.join(this.outputPath, 'comprehensive-web-content.json');
    await fs.writeFile(webContentFile, JSON.stringify(allContent, null, 2));
    
    // Create content chunks for search indexing
    const chunks = this.createSearchChunks(allContent);
    const chunksFile = path.join(this.outputPath, 'web-content-chunks.json');
    await fs.writeFile(chunksFile, JSON.stringify(chunks, null, 2));
    
    console.log(`\\n💾 Saved comprehensive content:`);
    console.log(`   📄 Raw content: ${webContentFile}`);
    console.log(`   🧩 Search chunks: ${chunksFile}`);
  }
  
  private createSearchChunks(content: CrawledContent[]): any[] {
    const chunks: any[] = [];
    let chunkIndex = 0;
    
    for (const page of content) {
      // Split long content into searchable chunks
      const maxChunkSize = 3000; // Larger chunks for comprehensive content
      const paragraphs = page.content.split('\\n\\n').filter(p => p.trim().length > 50);
      
      let currentChunk = '';
      
      for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
          // Save current chunk
          chunks.push({
            id: `web-chunk-${chunkIndex}`,
            content: currentChunk.trim(),
            title: `${page.title} - Section ${Math.floor(chunkIndex / 3) + 1}`,
            source: page.source,
            sourceUrl: page.url,
            priority: page.priority,
            lastCrawled: page.lastCrawled,
            keywords: this.extractKeywords(currentChunk)
          });
          
          currentChunk = paragraph;
          chunkIndex++;
        } else {
          currentChunk += (currentChunk ? '\\n\\n' : '') + paragraph;
        }
      }
      
      // Don't forget the last chunk
      if (currentChunk.trim()) {
        chunks.push({
          id: `web-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          title: `${page.title} - Section ${Math.floor(chunkIndex / 3) + 1}`,
          source: page.source,
          sourceUrl: page.url,
          priority: page.priority,
          lastCrawled: page.lastCrawled,
          keywords: this.extractKeywords(currentChunk)
        });
        chunkIndex++;
      }
    }
    
    return chunks;
  }
  
  private extractKeywords(content: string): string[] {
    // Enhanced medical keyword extraction
    const medicalTerms = content.toLowerCase().match(/\\b(cancer|symptom|screening|test|treatment|surgery|chemotherapy|radiotherapy|gp|doctor|nurse|hospital|urgent|emergency|pain|bleeding|discharge|lump|biopsy|scan|ultrasound|mri|ct|blood test|examination|specialist|oncology|gynaecology|cervical|ovarian|womb|uterine|vulval|vaginal|hpv|genetic|hereditary|brca|lynch|family history|risk factors|prevention|vaccine|support|helpline|contact)s?\\b/g);
    
    return [...new Set(medicalTerms || [])];
  }
  
  private displayCrawlSummary(allContent: CrawledContent[]): void {
    const totalSize = allContent.reduce((sum, c) => sum + c.contentLength, 0);
    const sourceBreakdown = allContent.reduce((acc, c) => {
      acc[c.source] = (acc[c.source] || 0) + c.contentLength;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\\n' + '='.repeat(70));
    console.log('🌐 EVE APPEAL WEBSITE CRAWLING COMPLETE'); 
    console.log('='.repeat(70));
    console.log(`📄 Total Pages Crawled: ${allContent.length}`);
    console.log(`📏 Total Content Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📐 Average Page Size: ${Math.round(totalSize / allContent.length)} characters`);
    
    console.log('\\n📊 Content by Source:');
    Object.entries(sourceBreakdown).forEach(([source, size]) => {
      console.log(`   ${source}: ${(size / 1024 / 1024).toFixed(2)} MB (${Math.round(size / totalSize * 100)}%)`);
    });
    
    console.log('\\n🎯 Azure AI Search Status:');
    console.log(`   PiF Documents: 0.11 MB`);
    console.log(`   Web Content: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total Used: ${((0.11 * 1024 * 1024 + totalSize) / 1024 / 1024).toFixed(2)} MB / 50 MB`);
    console.log(`   Remaining: ${(50 - (0.11 * 1024 * 1024 + totalSize) / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\\n✅ Ready for:');
    console.log('   1. Generate embeddings for semantic search');
    console.log('   2. Upload to Azure AI Search');
    console.log('   3. Test comprehensive RAG responses');
    console.log('='.repeat(70));
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const crawler = new ComprehensiveCrawler();
    await crawler.crawlComprehensively();
    
    console.log('\\n🎉 Eve Appeal website crawling completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Eve Appeal crawling failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { ComprehensiveCrawler };