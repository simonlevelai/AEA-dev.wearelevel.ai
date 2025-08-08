#!/usr/bin/env ts-node

/**
 * Analyze Azure AI Search Free Tier Storage Requirements
 * Calculate if our PiF content + vector embeddings can fit in 50MB limit
 */

import * as fs from 'fs';
import * as path from 'path';

interface ContentChunk {
  id: string;
  content: string;
  title?: string;
  sourceUrl?: string;
  chunkIndex?: number;
  documentId?: string;
  keywords?: string[];
}

interface StorageAnalysis {
  textSizeBytes: number;
  textSizeMB: number;
  vectorCount: number;
  vectorSizeBytes: number;
  vectorSizeMB: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  fitsInFreeTier: boolean;
  fitsInBasicTier: boolean;
}

function analyzeStorageRequirements(): StorageAnalysis {
  console.log('📊 Analyzing Azure AI Search storage requirements...\n');

  // Load our PiF content
  const contentPath = path.join(__dirname, '../data/pif-chunks.json');
  if (!fs.existsSync(contentPath)) {
    throw new Error(`Content file not found: ${contentPath}`);
  }

  const rawContent = fs.readFileSync(contentPath, 'utf8');
  const chunks: ContentChunk[] = JSON.parse(rawContent);

  console.log(`📄 Content Analysis:`);
  console.log(`   Chunks: ${chunks.length}`);

  // Calculate text storage requirements
  const totalTextBytes = Buffer.byteLength(rawContent, 'utf8');
  const totalTextMB = totalTextBytes / (1024 * 1024);

  console.log(`   Text size: ${(totalTextBytes / 1024).toFixed(2)} KB`);
  console.log(`   Text size: ${totalTextMB.toFixed(2)} MB\n`);

  // Calculate vector embedding requirements
  // Using text-embedding-ada-002 standard: 1536 dimensions × 4 bytes per float
  const embeddingDimensions = 1536;
  const bytesPerFloat = 4;
  const bytesPerVector = embeddingDimensions * bytesPerFloat;
  
  // We'll have one vector per chunk
  const vectorCount = chunks.length;
  const totalVectorBytes = vectorCount * bytesPerVector;
  const totalVectorMB = totalVectorBytes / (1024 * 1024);

  console.log(`🧮 Vector Embedding Analysis:`);
  console.log(`   Embedding model: text-embedding-ada-002`);
  console.log(`   Dimensions: ${embeddingDimensions}`);
  console.log(`   Bytes per vector: ${bytesPerVector.toLocaleString()}`);
  console.log(`   Total vectors: ${vectorCount}`);
  console.log(`   Vector storage: ${(totalVectorBytes / 1024).toFixed(2)} KB`);
  console.log(`   Vector storage: ${totalVectorMB.toFixed(2)} MB\n`);

  // Total storage requirements
  const totalBytes = totalTextBytes + totalVectorBytes;
  const totalMB = totalBytes / (1024 * 1024);

  console.log(`📦 Total Storage Requirements:`);
  console.log(`   Text + Vectors: ${(totalBytes / 1024).toFixed(2)} KB`);
  console.log(`   Text + Vectors: ${totalMB.toFixed(2)} MB\n`);

  // Tier analysis
  const freeTierLimit = 50; // MB
  const basicTierLimit = 2048; // MB (2GB)

  const fitsInFreeTier = totalMB <= freeTierLimit;
  const fitsInBasicTier = totalMB <= basicTierLimit;

  console.log(`🎯 Azure AI Search Tier Analysis:`);
  console.log(`   Free Tier (50MB): ${fitsInFreeTier ? '✅ FITS!' : '❌ Too large'}`);
  console.log(`   Basic Tier (2GB): ${fitsInBasicTier ? '✅ FITS!' : '❌ Too large'}`);

  if (fitsInFreeTier) {
    const remainingMB = freeTierLimit - totalMB;
    console.log(`   Free tier remaining: ${remainingMB.toFixed(2)} MB`);
  }

  // Calculate cost implications
  console.log(`\n💰 Cost Analysis:`);
  if (fitsInFreeTier) {
    console.log(`   Free Tier: £0/month`);
    console.log(`   With Table Storage: £1-2/month`);
    console.log(`   With Blob Storage: £2-3/month`);
    console.log(`   TOTAL ULTRA-CHEAP: £3-5/month`);
  }
  console.log(`   Basic Tier: £20/month`);
  console.log(`   With Table Storage: £1-2/month`);
  console.log(`   With Blob Storage: £2-3/month`);
  console.log(`   TOTAL PRODUCTION: £23-25/month`);

  return {
    textSizeBytes: totalTextBytes,
    textSizeMB: totalTextMB,
    vectorCount,
    vectorSizeBytes: totalVectorBytes,
    vectorSizeMB: totalVectorMB,
    totalSizeBytes: totalBytes,
    totalSizeMB: totalMB,
    fitsInFreeTier,
    fitsInBasicTier
  };
}

async function main() {
  try {
    console.log('🚀 Azure AI Search Storage Requirements Analysis\n');
    console.log('=' .repeat(60) + '\n');
    
    const analysis = analyzeStorageRequirements();
    
    console.log('\n' + '=' .repeat(60));
    console.log('📋 SUMMARY');
    console.log('=' .repeat(60));
    
    if (analysis.fitsInFreeTier) {
      console.log('🎉 EXCELLENT! Our healthcare content fits in Azure AI Search FREE tier');
      console.log('💡 Ultra-cheap architecture possible: £3-5/month total');
    } else {
      console.log('📈 Content requires Basic tier for production use');
      console.log('💡 Production architecture: £23-25/month total');
    }
    
    console.log(`\n📊 Storage breakdown:`);
    console.log(`   Text content: ${analysis.textSizeMB.toFixed(2)} MB`);
    console.log(`   Vector embeddings: ${analysis.vectorSizeMB.toFixed(2)} MB`);
    console.log(`   Total required: ${analysis.totalSizeMB.toFixed(2)} MB`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { analyzeStorageRequirements };