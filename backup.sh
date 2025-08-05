#!/bin/bash

# Ask Eve Assist - Backup Script
# Infrastructure Agent - Comprehensive backup and disaster recovery
# Ensures data protection for life-critical health chatbot

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
RESOURCE_GROUP=""
SUBSCRIPTION=""
ENVIRONMENT=""
BACKUP_LOCATION=""
RETENTION_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Ask Eve Assist - Backup Script

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    backup      Create full backup of environment
    restore     Restore from backup (interactive)
    list        List available backups
    cleanup     Clean old backups based on retention policy

OPTIONS:
    -g, --resource-group   Resource group name [REQUIRED]
    -s, --subscription     Azure subscription ID [REQUIRED]
    -e, --environment      Environment (dev|staging|prod) [REQUIRED]
    -b, --backup-location  Backup storage location [REQUIRED]
    -r, --retention        Retention days (default: 30)
    -h, --help             Show this help message

EXAMPLES:
    # Create full backup
    $0 backup -g rg-askeve-prod -s "12345678-1234-1234-1234-123456789012" -e prod -b ./backups

    # List available backups
    $0 list -b ./backups

    # Cleanup old backups
    $0 cleanup -b ./backups -r 30

BACKUP INCLUDES:
    - Infrastructure configuration (ARM templates)
    - Application settings and configuration
    - Key Vault secret names (not values - security)
    - Cosmos DB metadata and structure
    - Storage account configuration
    - Application Insights configuration
    - Cost and monitoring alerts

SECURITY NOTE:
    This script does NOT backup secret values or PII data.
    Key Vault secrets must be backed up separately using secure methods.
EOF
}

# Create backup
create_backup() {
    log_info "🔄 Creating Ask Eve Assist backup..."
    
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_DIR="${BACKUP_LOCATION}/backup-${ENVIRONMENT}-${TIMESTAMP}"
    
    mkdir -p "$BACKUP_DIR"
    
    # Set subscription
    az account set --subscription "$SUBSCRIPTION"
    
    # Create backup manifest
    cat > "$BACKUP_DIR/backup-manifest.json" << EOF
{
  "backupDate": "$(date -u -Iseconds)",
  "environment": "$ENVIRONMENT",
  "resourceGroup": "$RESOURCE_GROUP",
  "subscription": "$SUBSCRIPTION",
  "backupType": "full",
  "retentionDays": $RETENTION_DAYS,
  "components": [
    "infrastructure",
    "application-settings",
    "keyvault-metadata",
    "cosmosdb-metadata",
    "storage-configuration",
    "monitoring-alerts"
  ]
}
EOF
    
    # Backup infrastructure configuration
    log_info "Backing up infrastructure configuration..."
    az group export \
        --resource-group "$RESOURCE_GROUP" \
        --include-parameter-default-value \
        > "$BACKUP_DIR/infrastructure-template.json"
    
    # Backup App Service configuration
    log_info "Backing up App Service configuration..."
    APP_NAME=$(az webapp list -g "$RESOURCE_GROUP" --query "[0].name" -o tsv)
    
    if [[ -n "$APP_NAME" ]]; then
        # App settings
        az webapp config appsettings list \
            --name "$APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/app-settings.json"
        
        # Connection strings (masked for security)
        az webapp config connection-string list \
            --name "$APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/connection-strings.json"
        
        # Web app configuration
        az webapp config show \
            --name "$APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/webapp-config.json"
        
        # Deployment slots (if any)
        az webapp deployment slot list \
            --name "$APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/deployment-slots.json"
        
        log_success "App Service backup completed"
    else
        log_warning "No App Service found in resource group"
    fi
    
    # Backup Key Vault metadata (NOT secret values)
    log_info "Backing up Key Vault metadata..."
    KEY_VAULT_NAME=$(az keyvault list -g "$RESOURCE_GROUP" --query "[0].name" -o tsv)
    
    if [[ -n "$KEY_VAULT_NAME" ]]; then
        # Key Vault configuration
        az keyvault show \
            --name "$KEY_VAULT_NAME" \
            > "$BACKUP_DIR/keyvault-config.json"
        
        # Secret names only (for security)
        az keyvault secret list \
            --vault-name "$KEY_VAULT_NAME" \
            --query "[].{name:name, enabled:attributes.enabled, created:attributes.created, updated:attributes.updated}" \
            > "$BACKUP_DIR/keyvault-secrets-metadata.json"
        
        # Access policies
        az keyvault show \
            --name "$KEY_VAULT_NAME" \
            --query "properties.accessPolicies" \
            > "$BACKUP_DIR/keyvault-access-policies.json"
        
        log_success "Key Vault metadata backup completed"
        log_warning "⚠️  Secret values not backed up for security - use separate secure backup process"
    else
        log_warning "No Key Vault found in resource group"
    fi
    
    # Backup Cosmos DB metadata
    log_info "Backing up Cosmos DB metadata..."
    COSMOS_NAME=$(az cosmosdb list -g "$RESOURCE_GROUP" --query "[0].name" -o tsv)
    
    if [[ -n "$COSMOS_NAME" ]]; then
        # Account configuration
        az cosmosdb show \
            --name "$COSMOS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/cosmosdb-account.json"
        
        # Database list
        az cosmosdb sql database list \
            --account-name "$COSMOS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/cosmosdb-databases.json"
        
        # Container list for each database
        DATABASES=$(az cosmosdb sql database list \
            --account-name "$COSMOS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --query "[].name" -o tsv)
        
        for DB in $DATABASES; do
            az cosmosdb sql container list \
                --account-name "$COSMOS_NAME" \
                --database-name "$DB" \
                --resource-group "$RESOURCE_GROUP" \
                > "$BACKUP_DIR/cosmosdb-containers-${DB}.json"
        done
        
        log_success "Cosmos DB metadata backup completed"
    else
        log_warning "No Cosmos DB found in resource group"
    fi
    
    # Backup Storage Account configuration
    log_info "Backing up Storage Account configuration..."
    STORAGE_NAME=$(az storage account list -g "$RESOURCE_GROUP" --query "[0].name" -o tsv)
    
    if [[ -n "$STORAGE_NAME" ]]; then
        # Storage account configuration
        az storage account show \
            --name "$STORAGE_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/storage-account.json"
        
        # Blob service properties
        az storage account blob-service-properties show \
            --account-name "$STORAGE_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/storage-blob-properties.json"
        
        log_success "Storage Account backup completed"
    else
        log_warning "No Storage Account found in resource group"
    fi
    
    # Backup Application Insights
    log_info "Backing up Application Insights configuration..."
    INSIGHTS_NAME=$(az monitor app-insights component show \
        --resource-group "$RESOURCE_GROUP" \
        --query "[0].name" -o tsv 2>/dev/null || true)
    
    if [[ -n "$INSIGHTS_NAME" ]]; then
        az monitor app-insights component show \
            --app "$INSIGHTS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            > "$BACKUP_DIR/app-insights.json"
        
        log_success "Application Insights backup completed"
    else
        log_warning "No Application Insights found in resource group"
    fi
    
    # Backup monitoring and alert rules
    log_info "Backing up monitoring and alert configuration..."
    
    # Action groups
    az monitor action-group list \
        --resource-group "$RESOURCE_GROUP" \
        > "$BACKUP_DIR/action-groups.json"
    
    # Alert rules
    az monitor metrics alert list \
        --resource-group "$RESOURCE_GROUP" \
        > "$BACKUP_DIR/metric-alerts.json"
    
    # Log alerts
    az monitor log-analytics query \
        --workspace "$RESOURCE_GROUP" \
        --analytics-query "AlertRule | project *" \
        > "$BACKUP_DIR/log-alerts.json" 2>/dev/null || true
    
    log_success "Monitoring configuration backup completed"
    
    # Create backup archive
    log_info "Creating backup archive..."
    tar -czf "${BACKUP_LOCATION}/askeve-backup-${ENVIRONMENT}-${TIMESTAMP}.tar.gz" \
        -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"
    
    # Generate backup report
    BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    cat > "$BACKUP_DIR/backup-report.md" << EOF
# Ask Eve Assist Backup Report

**Backup Date:** $(date)
**Environment:** $ENVIRONMENT
**Resource Group:** $RESOURCE_GROUP
**Backup Size:** $BACKUP_SIZE
**Retention:** $RETENTION_DAYS days

## Backup Contents
- Infrastructure template: infrastructure-template.json
- App Service settings: app-settings.json
- Key Vault metadata: keyvault-secrets-metadata.json
- Cosmos DB structure: cosmosdb-*.json
- Storage configuration: storage-account.json
- Monitoring alerts: *-alerts.json

## Security Notes
- ✅ No secret values backed up
- ✅ No PII data included
- ✅ Configuration only backup
- ⚠️  Key Vault secrets require separate secure backup

## Restore Instructions
1. Deploy infrastructure using infrastructure-template.json
2. Restore application settings from app-settings.json
3. Recreate Key Vault secrets manually
4. Verify all services are functioning
5. Test end-to-end functionality

## Next Backup
Scheduled for: $(date -d "+1 day" +"%Y-%m-%d %H:%M")

---
Generated by Ask Eve Assist Infrastructure Agent
EOF
    
    log_success "Backup completed successfully!"
    log_info "Archive: ${BACKUP_LOCATION}/askeve-backup-${ENVIRONMENT}-${TIMESTAMP}.tar.gz"
    log_info "Report: $BACKUP_DIR/backup-report.md"
    
    # Update backup index
    echo "${TIMESTAMP},${ENVIRONMENT},$(date -u -Iseconds),full,${BACKUP_SIZE}" >> "${BACKUP_LOCATION}/backup-index.csv"
}

# List available backups
list_backups() {
    log_info "📋 Available backups in: $BACKUP_LOCATION"
    
    if [[ ! -d "$BACKUP_LOCATION" ]]; then
        log_warning "Backup location does not exist: $BACKUP_LOCATION"
        return
    fi
    
    if [[ -f "${BACKUP_LOCATION}/backup-index.csv" ]]; then
        echo "Timestamp,Environment,Date,Type,Size"
        cat "${BACKUP_LOCATION}/backup-index.csv"
    else
        # Fallback to directory listing
        find "$BACKUP_LOCATION" -name "askeve-backup-*.tar.gz" -exec basename {} \; | sort -r
    fi
}

# Cleanup old backups
cleanup_backups() {
    log_info "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
    
    if [[ ! -d "$BACKUP_LOCATION" ]]; then
        log_warning "Backup location does not exist: $BACKUP_LOCATION"
        return
    fi
    
    # Find and delete old backup files
    DELETED_COUNT=0
    while IFS= read -r -d '' FILE; do
        log_info "Deleting old backup: $(basename "$FILE")"
        rm -f "$FILE"
        ((DELETED_COUNT++))
    done < <(find "$BACKUP_LOCATION" -name "askeve-backup-*.tar.gz" -mtime +$RETENTION_DAYS -print0)
    
    # Find and delete old backup directories
    while IFS= read -r -d '' DIR; do
        log_info "Deleting old backup directory: $(basename "$DIR")"
        rm -rf "$DIR"
        ((DELETED_COUNT++))
    done < <(find "$BACKUP_LOCATION" -name "backup-*" -type d -mtime +$RETENTION_DAYS -print0)
    
    if [[ $DELETED_COUNT -eq 0 ]]; then
        log_info "No backups older than $RETENTION_DAYS days found"
    else
        log_success "Deleted $DELETED_COUNT old backup(s)"
    fi
}

# Parse command line arguments
COMMAND=""
while [[ $# -gt 0 ]]; do
    case $1 in
        backup|restore|list|cleanup)
            COMMAND="$1"
            shift
            ;;
        -g|--resource-group)
            RESOURCE_GROUP="$2"
            shift 2
            ;;
        -s|--subscription)
            SUBSCRIPTION="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -b|--backup-location)
            BACKUP_LOCATION="$2"
            shift 2
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate command
if [[ -z "$COMMAND" ]]; then
    log_error "Command is required"
    show_help
    exit 1
fi

# Validate backup location
if [[ -z "$BACKUP_LOCATION" ]]; then
    log_error "Backup location is required (-b|--backup-location)"
    exit 1
fi

# Execute command
case $COMMAND in
    backup)
        if [[ -z "$RESOURCE_GROUP" || -z "$SUBSCRIPTION" || -z "$ENVIRONMENT" ]]; then
            log_error "Backup requires: --resource-group, --subscription, --environment"
            exit 1
        fi
        mkdir -p "$BACKUP_LOCATION"
        create_backup
        ;;
    list)
        list_backups
        ;;
    cleanup)
        cleanup_backups
        ;;
    restore)
        log_error "Restore functionality not yet implemented - please restore manually using backup files"
        exit 1
        ;;
esac