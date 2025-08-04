#!/usr/bin/env ts-node

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';

interface PiFDocument {
  filename: string;
  sourceUrl: string;
  title: string;
}

interface ContentChunk {
  id: string;
  content: string;
  title: string;
  source: string;
  sourceUrl: string;
  lastReviewed: string;
}

const DOCUMENTS: PiFDocument[] = [
  {
    filename: 'HPV-Guide-2025-brand-update-v1-min.pdf',
    sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/hpv',
    title: 'HPV Guide (2025 Brand Update)'
  },
  {
    filename: 'Lynch-Syndrome_Patient-guide_vs2_digital_FINAL_21.02.23.pdf',
    sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/hereditary-cancer',
    title: 'Lynch Syndrome Patient Guide'
  },
  {
    filename: 'Vaginal-cancer-ER_April-2024.pdf',
    sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/vaginal-cancer',
    title: 'Vaginal Cancer Early Recognition Guide'
  },
  {
    filename: 'Vulval-cancer-ER_April-2024.pdf',
    sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/vulval-cancer',
    title: 'Vulval Cancer Early Recognition Guide'
  },
  {
    filename: 'Womb-cancer-ER_April-2024.pdf',
    sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/womb-cancer',
    title: 'Womb Cancer Early Recognition Guide'
  },
  {
    filename: 'genetic testing in ovarian-A5_vs2_22.04.2024.pdf',
    sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/genetic-testing',
    title: 'Genetic Testing in Ovarian Cancer'
  }
];

async function processPiFDocuments(): Promise<void> {
  console.log('🏥 Processing PiF Documents...');
  
  const documentsPath = path.join(__dirname, '../content/pif-documents');
  const outputPath = path.join(__dirname, '../content/processed');
  
  // Ensure output directory exists
  await fs.mkdir(outputPath, { recursive: true });
  
  const allChunks: ContentChunk[] = [];
  let totalSize = 0;
  
  for (const doc of DOCUMENTS) {
    console.log(`\\n📖 Processing: ${doc.title}`);
    
    try {
      const filePath = path.join(documentsPath, doc.filename);
      const pdfBuffer = await fs.readFile(filePath);
      const pdfData = await pdf(pdfBuffer);
      
      console.log(`  📃 Extracted ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
      
      // Clean the text
      const cleanText = pdfData.text
        .replace(/\\s+/g, ' ')
        .replace(/\\n{3,}/g, '\\n\\n')
        .trim();
      
      // Simple chunking - split into paragraphs and group
      const paragraphs = cleanText.split('\\n\\n').filter(p => p.trim().length > 50);
      const chunks = createChunks(paragraphs, doc);
      
      allChunks.push(...chunks);
      
      const docSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
      totalSize += docSize;
      
      console.log(`  ✅ Generated ${chunks.length} chunks (${(docSize / 1024).toFixed(1)}KB)`);
      
    } catch (error) {
      console.error(`  ❌ Failed to process ${doc.filename}:`, error);
    }
  }
  
  // Save results
  const chunksFile = path.join(outputPath, 'pif-chunks.json');
  await fs.writeFile(chunksFile, JSON.stringify(allChunks, null, 2));
  
  // Display summary
  console.log('\\n' + '='.repeat(60));
  console.log('🏥 PiF DOCUMENT PROCESSING COMPLETE');
  console.log('='.repeat(60));
  console.log(`📄 Documents Processed: ${DOCUMENTS.length}`);
  console.log(`🧩 Total Chunks Generated: ${allChunks.length}`);
  console.log(`📏 Total Content Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📐 Average Chunk Size: ${Math.round(totalSize / allChunks.length)} characters`);
  console.log('\\n🎯 Azure AI Search Free Tier Status:');
  console.log(`   Used: ${(totalSize / 1024 / 1024).toFixed(2)} MB / 50 MB limit`);
  console.log(`   Remaining: ${(50 - (totalSize / 1024 / 1024)).toFixed(2)} MB for web content`);
  console.log('\\n✅ Content saved to:', chunksFile);
  console.log('='.repeat(60));
}

function createChunks(paragraphs: string[], doc: PiFDocument): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const maxChunkSize = 2000;
  
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed max size, save current chunk
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        id: `${generateDocId(doc.filename)}-chunk-${chunkIndex}`,
        content: currentChunk.trim(),
        title: `${doc.title} - Part ${chunkIndex + 1}`,
        source: doc.title,
        sourceUrl: doc.sourceUrl,
        lastReviewed: '2024-04-01'
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
      id: `${generateDocId(doc.filename)}-chunk-${chunkIndex}`,
      content: currentChunk.trim(),
      title: `${doc.title} - Part ${chunkIndex + 1}`,
      source: doc.title,
      sourceUrl: doc.sourceUrl,
      lastReviewed: '2024-04-01'
    });
  }
  
  return chunks;
}

function generateDocId(filename: string): string {
  return filename
    .replace(/\\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .toLowerCase();
}

// Run the processor
processPiFDocuments().catch(console.error);