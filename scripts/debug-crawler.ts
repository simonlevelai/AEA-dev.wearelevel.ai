#!/usr/bin/env ts-node

/**
 * Debug Crawler - Test single URL to understand content structure
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugCrawl(): Promise<void> {
  try {
    const url = 'https://eveappeal.org.uk/';
    console.log(`🔍 Debug crawling: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Ask Eve Assist Health Bot - Crawling for patient information'
      }
    });
    
    console.log(`✅ Response status: ${response.status}`);
    console.log(`📄 Content length: ${response.data.length} characters`);
    
    const $ = cheerio.load(response.data);
    
    // Check what elements exist
    console.log('\n🏗️  HTML Structure Analysis:');
    console.log(`- Title: "${$('title').text()}"`);
    console.log(`- H1 elements: ${$('h1').length}`);
    console.log(`- P elements: ${$('p').length}`);
    console.log(`- Div elements: ${$('div').length}`);
    console.log(`- Main element: ${$('main').length}`);
    console.log(`- Article elements: ${$('article').length}`);
    
    // Test different selectors
    const selectors = [
      'main',
      '.main-content',
      '.content', 
      'article',
      '.post-content',
      '.entry-content',
      '[role="main"]'
    ];
    
    console.log('\n🎯 Content Selector Analysis:');
    selectors.forEach(selector => {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        console.log(`- ${selector}: ${element.length} elements, ${text.length} chars`);
        if (text.length > 0 && text.length < 500) {
          console.log(`  Preview: "${text.substring(0, 200)}..."`);
        }
      } else {
        console.log(`- ${selector}: 0 elements`);
      }
    });
    
    // Check for common text elements
    console.log('\n📝 Text Elements:');
    ['h1', 'h2', 'h3', 'p', 'li'].forEach(tag => {
      const elements = $(tag);
      if (elements.length > 0) {
        console.log(`- ${tag}: ${elements.length} elements`);
        elements.slice(0, 3).each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 10 && text.length < 200) {
            console.log(`  "${text}"`);
          }
        });
      }
    });
    
    // Check for images that might be interfering
    console.log('\n🖼️  Media Elements:');
    console.log(`- Images: ${$('img').length}`);
    console.log(`- Scripts: ${$('script').length}`);
    console.log(`- Styles: ${$('style').length}`);
    
    // Try to get clean body text
    console.log('\n🧹 Clean Text Extraction:');
    $('script, style, img, svg, canvas, video, audio, iframe, embed, object, noscript').remove();
    $('nav, header, footer, aside, .nav, .header, .footer, .sidebar, .menu, .breadcrumb').remove();
    
    const bodyText = $('body').text().trim();
    console.log(`- Body text length: ${bodyText.length} characters`);
    
    if (bodyText.length > 0) {
      console.log(`- First 500 chars: "${bodyText.substring(0, 500)}"`);
    }
    
  } catch (error) {
    console.error('❌ Debug crawl failed:', error);
  }
}

// Run debug
debugCrawl();