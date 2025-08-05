#!/bin/bash

# Ask Eve Assist - Migration Script
# Infrastructure Agent - Portable infrastructure migration tool
# Ensures zero-downtime migration between Azure instances

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
SOURCE_RG=""
TARGET_RG=""
SOURCE_SUBSCRIPTION=""
TARGET_SUBSCRIPTION=""
ENVIRONMENT=""
BACKUP_LOCATION=""

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
Ask Eve Assist - Migration Script

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    export      Export current infrastructure configuration
    migrate     Migrate to new Azure instance
    validate    Validate target environment

OPTIONS:
    -s, --source-rg         Source resource group [REQUIRED for migrate]
    -t, --target-rg         Target resource group [REQUIRED for migrate]
    --source-sub           Source subscription ID [REQUIRED for migrate]
    --target-sub           Target subscription ID [REQUIRED for migrate]
    -e, --environment      Environment (dev|staging|prod) [REQUIRED]
    -b, --backup-location  Backup storage location [REQUIRED for export]
    -h, --help             Show this help message

EXAMPLES:
    # Export current environment
    $0 export -s rg-askeve-prod --source-sub "12345678-1234-1234-1234-123456789012" -e prod -b ./migration-backup

    # Migrate to new instance
    $0 migrate -s rg-askeve-old -t rg-askeve-new --source-sub "old-sub-id" --target-sub "new-sub-id" -e prod

    # Validate target environment
    $0 validate -t rg-askeve-new --target-sub "new-sub-id" -e prod

MIGRATION PROCESS:
    1. Export source environment configuration
    2. Create backup of all critical data
    3. Deploy target infrastructure
    4. Migrate data and secrets
    5. Update DNS/routing
    6. Validate and cleanup
EOF
}

# Export infrastructure configuration
export_infrastructure() {
    log_info "🔄 Exporting Ask Eve infrastructure configuration..."
    
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    EXPORT_DIR="${BACKUP_LOCATION}/migration-${TIMESTAMP}"
    
    mkdir -p "$EXPORT_DIR"
    
    # Set source subscription
    az account set --subscription "$SOURCE_SUBSCRIPTION"
    
    # Export ARM template
    log_info "Exporting ARM template..."
    az group export \
        --resource-group "$SOURCE_RG" \
        --include-parameter-default-value \
        > "$EXPORT_DIR/exported-template.json"
    
    # Get app service details
    log_info "Exporting App Service configuration..."
    APP_NAME=$(az webapp list -g "$SOURCE_RG" --query "[0].name" -o tsv)
    
    if [[ -n "$APP_NAME" ]]; then
        # Export app settings
        az webapp config appsettings list \
            --name "$APP_NAME" \
            --resource-group "$SOURCE_RG" \
            > "$EXPORT_DIR/appsettings.json"
        
        # Export connection strings
        az webapp config connection-string list \
            --name "$APP_NAME" \
            --resource-group "$SOURCE_RG" \
            > "$EXPORT_DIR/connection-strings.json"
        
        # Export configuration
        az webapp config show \
            --name "$APP_NAME" \
            --resource-group "$SOURCE_RG" \
            > "$EXPORT_DIR/webapp-config.json"
    fi
    
    # Export Key Vault secrets (names only for security)
    log_info "Exporting Key Vault secret names..."
    KEY_VAULT_NAME=$(az keyvault list -g "$SOURCE_RG" --query "[0].name" -o tsv)
    
    if [[ -n "$KEY_VAULT_NAME" ]]; then
        az keyvault secret list \
            --vault-name "$KEY_VAULT_NAME" \
            --query "[].{name:name, enabled:attributes.enabled}" \
            > "$EXPORT_DIR/keyvault-secrets.json"
    fi
    
    # Export Cosmos DB configuration
    log_info "Exporting Cosmos DB configuration..."
    COSMOS_NAME=$(az cosmosdb list -g "$SOURCE_RG" --query "[0].name" -o tsv)
    
    if [[ -n "$COSMOS_NAME" ]]; then
        az cosmosdb show \
            --name "$COSMOS_NAME" \
            --resource-group "$SOURCE_RG" \
            > "$EXPORT_DIR/cosmosdb-config.json"
        
        # List databases
        az cosmosdb sql database list \
            --account-name "$COSMOS_NAME" \
            --resource-group "$SOURCE_RG" \
            > "$EXPORT_DIR/cosmosdb-databases.json"
    fi
    
    # Export storage account configuration
    log_info "Exporting Storage Account configuration..."
    STORAGE_NAME=$(az storage account list -g "$SOURCE_RG" --query "[0].name" -o tsv)
    
    if [[ -n "$STORAGE_NAME" ]]; then
        az storage account show \
            --name "$STORAGE_NAME" \
            --resource-group "$SOURCE_RG" \
            > "$EXPORT_DIR/storage-config.json"
    fi
    
    # Create migration plan
    log_info "Creating migration plan..."
    cat > "$EXPORT_DIR/migration-plan.md" << EOF
# Ask Eve Assist Migration Plan

**Export Date:** $(date)
**Source Environment:** $ENVIRONMENT
**Source Resource Group:** $SOURCE_RG
**Source Subscription:** $SOURCE_SUBSCRIPTION

## Resources Exported
- ARM Template: exported-template.json
- App Service Settings: appsettings.json
- Key Vault Secrets: keyvault-secrets.json (names only)
- Cosmos DB Configuration: cosmosdb-config.json
- Storage Account: storage-config.json

## Pre-Migration Checklist
- [ ] Verify all critical secrets are documented
- [ ] Backup application data
- [ ] Notify users of maintenance window
- [ ] Prepare rollback plan

## Migration Steps
1. Deploy target infrastructure using ARM template
2. Recreate Key Vault secrets
3. Migrate Cosmos DB data
4. Migrate storage account data
5. Deploy application code
6. Update DNS/traffic routing
7. Validate all services
8. Monitor for 24 hours

## Post-Migration Cleanup
- [ ] Verify cost alerts are configured
- [ ] Remove old resources after validation period
- [ ] Update documentation and runbooks
- [ ] Archive migration backup

## Emergency Contacts
- Infrastructure Team: infrastructure@wearelevel.ai
- On-call: Available via Azure alerts

**IMPORTANT:** This migration maintains UK data residency compliance.
All resources must be deployed to UK regions only (uksouth/ukwest).
EOF
    
    # Create archive
    log_info "Creating migration archive..."
    tar -czf "${BACKUP_LOCATION}/askeve-migration-${TIMESTAMP}.tar.gz" -C "$(dirname "$EXPORT_DIR")" "$(basename "$EXPORT_DIR")"
    
    log_success "Export completed: ${BACKUP_LOCATION}/askeve-migration-${TIMESTAMP}.tar.gz"
    log_warning "⚠️  Remember to backup Key Vault secrets separately using secure methods"
    log_info "Migration plan available: $EXPORT_DIR/migration-plan.md"
}

# Validate target environment
validate_target() {
    log_info "🔍 Validating target environment..."
    
    # Set target subscription
    az account set --subscription "$TARGET_SUBSCRIPTION"
    
    # Check if resource group exists
    if az group show --name "$TARGET_RG" > /dev/null 2>&1; then
        log_success "Target resource group exists: $TARGET_RG"
    else
        log_error "Target resource group not found: $TARGET_RG"
        return 1
    fi
    
    # Check regional compliance
    LOCATION=$(az group show --name "$TARGET_RG" --query location -o tsv)
    if [[ ! "$LOCATION" =~ ^(uksouth|ukwest)$ ]]; then
        log_error "Target location not UK compliant: $LOCATION"
        return 1
    fi
    
    log_success "Regional compliance validated: $LOCATION"
    
    # Validate template
    TEMPLATE_FILE="$PROJECT_ROOT/deploy/arm-template.json"
    PARAMS_FILE="$PROJECT_ROOT/deploy/parameters/${ENVIRONMENT}.parameters.json"
    
    if [[ -f "$TEMPLATE_FILE" && -f "$PARAMS_FILE" ]]; then
        log_info "Validating deployment template..."
        az deployment group validate \
            --resource-group "$TARGET_RG" \
            --template-file "$TEMPLATE_FILE" \
            --parameters @"$PARAMS_FILE" \
            --output table
        
        if [[ $? -eq 0 ]]; then
            log_success "Template validation passed"
        else
            log_error "Template validation failed"
            return 1
        fi
    else
        log_warning "Template files not found - skipping validation"
    fi
    
    log_success "Target environment validation completed"
}

# Perform migration
perform_migration() {
    log_info "🚀 Starting Ask Eve Assist migration..."
    
    # Validate prerequisites
    if [[ -z "$SOURCE_RG" || -z "$TARGET_RG" || -z "$SOURCE_SUBSCRIPTION" || -z "$TARGET_SUBSCRIPTION" ]]; then
        log_error "Missing required parameters for migration"
        exit 1
    fi
    
    # Export source environment first
    export_infrastructure
    
    # Validate target environment
    validate_target
    
    log_info "Migration preparation completed"
    log_warning "⚠️  Manual steps required:"
    echo "1. Deploy infrastructure to target using: ./deploy.sh"
    echo "2. Migrate Key Vault secrets manually"
    echo "3. Migrate application data"
    echo "4. Update DNS/routing configuration"
    echo "5. Run validation tests"
    
    log_info "Migration archive contains all necessary configuration files"
}

# Parse command line arguments
COMMAND=""
while [[ $# -gt 0 ]]; do
    case $1 in
        export|migrate|validate)
            COMMAND="$1"
            shift
            ;;
        -s|--source-rg)
            SOURCE_RG="$2"
            shift 2
            ;;
        -t|--target-rg)
            TARGET_RG="$2"
            shift 2
            ;;
        --source-sub)
            SOURCE_SUBSCRIPTION="$2"
            shift 2
            ;;
        --target-sub)
            TARGET_SUBSCRIPTION="$2"
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

# Execute command
case $COMMAND in
    export)
        if [[ -z "$SOURCE_RG" || -z "$SOURCE_SUBSCRIPTION" || -z "$ENVIRONMENT" || -z "$BACKUP_LOCATION" ]]; then
            log_error "Export requires: --source-rg, --source-sub, --environment, --backup-location"
            exit 1
        fi
        export_infrastructure
        ;;
    migrate)
        if [[ -z "$SOURCE_RG" || -z "$TARGET_RG" || -z "$SOURCE_SUBSCRIPTION" || -z "$TARGET_SUBSCRIPTION" || -z "$ENVIRONMENT" ]]; then
            log_error "Migration requires: --source-rg, --target-rg, --source-sub, --target-sub, --environment"
            exit 1
        fi
        BACKUP_LOCATION="${BACKUP_LOCATION:-./migration-backup}"
        mkdir -p "$BACKUP_LOCATION"
        perform_migration
        ;;
    validate)
        if [[ -z "$TARGET_RG" || -z "$TARGET_SUBSCRIPTION" || -z "$ENVIRONMENT" ]]; then
            log_error "Validation requires: --target-rg, --target-sub, --environment"
            exit 1
        fi
        validate_target
        ;;
esac