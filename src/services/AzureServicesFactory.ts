/**
 * Azure Services Factory for Ultra-Cheap Architecture
 * Provides centralized initialization and configuration of all Azure services
 * Cost: £3-5/month total for all services
 */

import { AzureAISearchService } from './AzureAISearchService';
import { AzureTableStorageService } from './AzureTableStorageService';
import { Logger } from '../utils/logger';

export interface AzureServicesConfig {
  // Azure AI Search configuration
  searchEndpoint: string;
  searchApiKey: string;
  
  // Azure Table Storage configuration  
  storageConnectionString: string;
  
  // Azure OpenAI configuration
  openaiApiKey: string;
  openaiEndpoint?: string;
  openaiDeploymentName?: string;
  
  // Optional Azure Blob Storage (future enhancement)
  blobStorageConnectionString?: string;
  blobStorageContainerName?: string;
}

export interface AzureServices {
  searchService: AzureAISearchService;
  storageService: AzureTableStorageService;
}

export class AzureServicesFactory {
  private static instance: AzureServicesFactory;
  private services: AzureServices | null = null;
  private initialized: boolean = false;
  
  private constructor(
    private config: AzureServicesConfig,
    private logger: Logger
  ) {}
  
  public static getInstance(config?: AzureServicesConfig, logger?: Logger): AzureServicesFactory {
    if (!AzureServicesFactory.instance) {
      if (!config || !logger) {
        throw new Error('AzureServicesFactory requires config and logger for first initialization');
      }
      AzureServicesFactory.instance = new AzureServicesFactory(config, logger);
    }
    return AzureServicesFactory.instance;
  }
  
  /**
   * Initialize all Azure services
   */
  public async initialize(): Promise<AzureServices> {
    if (this.services && this.initialized) {
      return this.services;
    }
    
    this.logger.info('🏗️ Initializing Azure Services Factory for ultra-cheap architecture');
    
    try {
      // Initialize Azure AI Search Service
      this.logger.info('🔍 Setting up Azure AI Search Service...');
      const searchService = new AzureAISearchService({
        searchEndpoint: this.config.searchEndpoint,
        searchApiKey: this.config.searchApiKey,
        openaiApiKey: this.config.openaiApiKey,
        openaiEndpoint: this.config.openaiEndpoint
      });
      
      // Initialize search index
      await searchService.initializeIndex();
      
      // Validate search health
      const searchHealth = await searchService.validateIndexHealth();
      if (!searchHealth.isHealthy) {
        this.logger.warn('⚠️ Azure AI Search health issues detected', { issues: searchHealth.issues });
      }
      
      // Initialize Azure Table Storage Service  
      this.logger.info('💾 Setting up Azure Table Storage Service...');
      const storageService = new AzureTableStorageService({
        connectionString: this.config.storageConnectionString
      });
      
      // Initialize tables
      await storageService.initializeTables();
      
      // Validate storage health
      const storageHealth = await storageService.healthCheck();
      if (!storageHealth.isHealthy) {
        this.logger.warn('⚠️ Azure Table Storage health issues detected', { issues: storageHealth.issues });
      }
      
      this.services = {
        searchService,
        storageService
      };
      
      this.initialized = true;
      
      // Log initialization success with cost analysis
      const searchStats = await searchService.getIndexStatistics();
      const storageStats = await storageService.getStorageStatistics();
      
      this.logger.info('✅ Azure Services Factory initialized successfully', {
        searchDocuments: searchStats.documentCount,
        searchStorageMB: searchStats.indexSizeMB,
        tableStorageCostEstimate: `£${storageStats.estimatedCostPerMonth.toFixed(2)}/month`,
        aiSearchTier: searchStats.indexSizeMB <= 50 ? 'FREE' : 'BASIC',
        totalEstimatedCost: this.calculateTotalCost(searchStats.indexSizeMB, storageStats.estimatedCostPerMonth),
        architecture: 'ultra_cheap_azure_native'
      });
      
      return this.services;
      
    } catch (error) {
      this.logger.error('❌ Azure Services Factory initialization failed', { error });
      throw new Error(`Failed to initialize Azure services: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get initialized Azure services
   */
  public getServices(): AzureServices {
    if (!this.services || !this.initialized) {
      throw new Error('Azure Services Factory not initialized. Call initialize() first.');
    }
    return this.services;
  }
  
  /**
   * Get Azure AI Search Service
   */
  public getSearchService(): AzureAISearchService {
    return this.getServices().searchService;
  }
  
  /**
   * Get Azure Table Storage Service
   */
  public getStorageService(): AzureTableStorageService {
    return this.getServices().storageService;
  }
  
  /**
   * Check health of all Azure services
   */
  public async checkServicesHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    search: { status: string; details: any };
    storage: { status: string; details: any };
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const services = this.getServices();
      
      // Check search service health
      const searchHealth = await services.searchService.validateIndexHealth();
      const searchStatus = searchHealth.isHealthy ? 'healthy' : 'unhealthy';
      
      if (!searchHealth.isHealthy) {
        issues.push(...searchHealth.issues);
      }
      
      // Check storage service health
      const storageHealth = await services.storageService.healthCheck();
      const storageStatus = storageHealth.isHealthy ? 'healthy' : 'unhealthy';
      
      if (!storageHealth.isHealthy) {
        issues.push(...storageHealth.issues);
      }
      
      // Determine overall health
      let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (searchStatus === 'unhealthy' || storageStatus === 'unhealthy') {
        overall = 'unhealthy';
      } else if (issues.length > 0) {
        overall = 'degraded';
      }
      
      return {
        overall,
        search: { status: searchStatus, details: searchHealth },
        storage: { status: storageStatus, details: storageHealth },
        issues
      };
      
    } catch (error) {
      issues.push(`Health check failed: ${error.message}`);
      return {
        overall: 'unhealthy',
        search: { status: 'unknown', details: null },
        storage: { status: 'unknown', details: null },
        issues
      };
    }
  }
  
  /**
   * Get cost analysis for Azure services
   */
  public async getCostAnalysis(): Promise<{
    searchTier: 'FREE' | 'BASIC';
    searchCostPerMonth: number;
    storageCostPerMonth: number;
    totalCostPerMonth: number;
    costCategory: 'ultra_cheap' | 'production';
    recommendations: string[];
  }> {
    try {
      const services = this.getServices();
      
      const searchStats = await services.searchService.getIndexStatistics();
      const storageStats = await services.storageService.getStorageStatistics();
      
      const searchTier = searchStats.indexSizeMB <= 50 ? 'FREE' : 'BASIC';
      const searchCostPerMonth = searchTier === 'FREE' ? 0 : 20;
      const storageCostPerMonth = storageStats.estimatedCostPerMonth;
      const totalCostPerMonth = searchCostPerMonth + storageCostPerMonth;
      
      const costCategory = totalCostPerMonth <= 5 ? 'ultra_cheap' : 'production';
      
      const recommendations: string[] = [];
      
      if (searchTier === 'FREE') {
        const remaining = 50 - searchStats.indexSizeMB;
        recommendations.push(`Azure AI Search FREE tier: ${remaining.toFixed(1)} MB remaining capacity`);
      }
      
      if (totalCostPerMonth <= 5) {
        recommendations.push('Ultra-cheap architecture active: Perfect for development and small production workloads');
      } else if (totalCostPerMonth <= 25) {
        recommendations.push('Production-ready architecture: Suitable for enterprise deployment');
      } else {
        recommendations.push('Consider optimizing content size or upgrading to dedicated tiers for better performance');
      }
      
      return {
        searchTier,
        searchCostPerMonth,
        storageCostPerMonth,
        totalCostPerMonth,
        costCategory,
        recommendations
      };
      
    } catch (error) {
      throw new Error(`Failed to get cost analysis: ${error.message}`);
    }
  }
  
  /**
   * Migrate data from Supabase (if available)
   */
  public async migrateFromSupabase(supabaseUrl: string, supabaseKey: string): Promise<{
    success: boolean;
    migratedContent: number;
    errors: string[];
  }> {
    try {
      const services = this.getServices();
      const errors: string[] = [];
      
      this.logger.info('🔄 Starting migration from Supabase to Azure services...');
      
      // Migrate PiF content to Azure AI Search
      let migratedContent = 0;
      try {
        await services.searchService.migrateFromSupabase(supabaseUrl, supabaseKey);
        
        // Check how many documents were migrated
        const stats = await services.searchService.getIndexStatistics();
        migratedContent = stats.documentCount;
        
        this.logger.info(`✅ Migrated ${migratedContent} content documents to Azure AI Search`);
      } catch (error) {
        const errorMsg = `Failed to migrate content: ${error.message}`;
        errors.push(errorMsg);
        this.logger.error('❌ Content migration failed', { error });
      }
      
      return {
        success: errors.length === 0,
        migratedContent,
        errors
      };
      
    } catch (error) {
      return {
        success: false,
        migratedContent: 0,
        errors: [`Migration failed: ${error.message}`]
      };
    }
  }
  
  /**
   * Reset factory instance (for testing)
   */
  public static reset(): void {
    AzureServicesFactory.instance = null as any;
  }
  
  private calculateTotalCost(searchSizeMB: number, storageCost: number): string {
    const searchCost = searchSizeMB <= 50 ? 0 : 20;
    const total = searchCost + storageCost;
    
    if (total <= 5) {
      return `£${total.toFixed(2)}/month (ULTRA-CHEAP)`;
    } else if (total <= 25) {
      return `£${total.toFixed(2)}/month (PRODUCTION)`;
    } else {
      return `£${total.toFixed(2)}/month (PREMIUM)`;
    }
  }
}

// Convenience function to create factory from environment variables
export function createAzureServicesFromEnv(logger: Logger): AzureServicesFactory {
  const config: AzureServicesConfig = {
    searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT || '',
    searchApiKey: process.env.AZURE_SEARCH_API_KEY || '',
    storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    openaiApiKey: process.env.AZURE_OPENAI_API_KEY || '',
    openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    openaiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
    blobStorageConnectionString: process.env.AZURE_BLOB_STORAGE_CONNECTION_STRING,
    blobStorageContainerName: process.env.AZURE_BLOB_STORAGE_CONTAINER || 'documents'
  };
  
  // Validate required environment variables
  const requiredVars = ['searchEndpoint', 'searchApiKey', 'storageConnectionString', 'openaiApiKey'];
  const missing = requiredVars.filter(key => !config[key as keyof AzureServicesConfig]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.map(key => 
      key.replace(/([A-Z])/g, '_$1').toUpperCase()
    ).join(', ')}`);
  }
  
  return AzureServicesFactory.getInstance(config, logger);
}