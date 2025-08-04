#!/bin/bash

# Ask Eve Assist - Azure Deployment Script
# Infrastructure Agent - Reliable deployment under £50/month
# Ensures UK data residency and comprehensive cost monitoring

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

# Default values
ENVIRONMENT=""
RESOURCE_GROUP=""
LOCATION="uksouth"
SUBSCRIPTION=""
ALERT_EMAIL=""

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
Ask Eve Assist - Azure Deployment Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -e, --environment    Environment (dev|staging|prod) [REQUIRED]
    -g, --resource-group Resource group name [REQUIRED]
    -s, --subscription   Azure subscription ID [REQUIRED]
    -l, --location       Azure location (default: uksouth)
    -m, --email          Alert email address [REQUIRED]
    -h, --help           Show this help message

EXAMPLES:
    # Deploy to development
    $0 -e dev -g rg-askeve-dev -s "12345678-1234-1234-1234-123456789012" -m admin@example.com

    # Deploy to production with custom location
    $0 -e prod -g rg-askeve-prod -s "12345678-1234-1234-1234-123456789012" -l ukwest -m admin@example.com

COST MONITORING:
    Automatic budget alerts configured at:
    - £40 (80% of budget) - Warning
    - £45 (90% of budget) - Critical
    - £48 (96% of budget) - Emergency

UK COMPLIANCE:
    All resources deployed to UK regions only (uksouth/ukwest)
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -g|--resource-group)
            RESOURCE_GROUP="$2"
            shift 2
            ;;
        -s|--subscription)
            SUBSCRIPTION="$2"
            shift 2
            ;;
        -l|--location)
            LOCATION="$2"
            shift 2
            ;;
        -m|--email)
            ALERT_EMAIL="$2"
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

# Validate required parameters
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment is required (-e|--environment)"
    exit 1
fi

if [[ -z "$RESOURCE_GROUP" ]]; then
    log_error "Resource group is required (-g|--resource-group)"
    exit 1
fi

if [[ -z "$SUBSCRIPTION" ]]; then
    log_error "Subscription ID is required (-s|--subscription)"
    exit 1
fi

if [[ -z "$ALERT_EMAIL" ]]; then
    log_error "Alert email is required (-m|--email)"
    exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    log_error "Environment must be one of: dev, staging, prod"
    exit 1
fi

# Validate location (UK only for compliance)
if [[ ! "$LOCATION" =~ ^(uksouth|ukwest)$ ]]; then
    log_error "Location must be UK region only: uksouth or ukwest"
    exit 1
fi

# Check if files exist
TEMPLATE_FILE="$DEPLOY_DIR/arm-template.json"
PARAMS_FILE="$DEPLOY_DIR/parameters/${ENVIRONMENT}.parameters.json"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
    log_error "ARM template not found: $TEMPLATE_FILE"
    exit 1
fi

if [[ ! -f "$PARAMS_FILE" ]]; then
    log_error "Parameters file not found: $PARAMS_FILE"
    exit 1
fi

# Start deployment
log_info "🏗️  Starting Ask Eve Assist deployment..."
log_info "Environment: $ENVIRONMENT"
log_info "Resource Group: $RESOURCE_GROUP"
log_info "Location: $LOCATION (UK compliant)"
log_info "Subscription: $SUBSCRIPTION"
log_info "Alert Email: $ALERT_EMAIL"

# Login check
log_info "Checking Azure CLI authentication..."
if ! az account show > /dev/null 2>&1; then
    log_error "Please login to Azure CLI first: az login"
    exit 1
fi

# Set subscription
log_info "Setting subscription..."
az account set --subscription "$SUBSCRIPTION"

# Create resource group if it doesn't exist
log_info "Ensuring resource group exists..."
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output table

# Validate template
log_info "Validating ARM template..."
VALIDATION_RESULT=$(az deployment group validate \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters @"$PARAMS_FILE" \
    --parameters alertEmail="$ALERT_EMAIL" \
    --output json)

if [[ $? -ne 0 ]]; then
    log_error "Template validation failed"
    echo "$VALIDATION_RESULT" | jq '.error'
    exit 1
fi

log_success "Template validation passed"

# Deploy infrastructure
log_info "Deploying infrastructure..."
DEPLOYMENT_NAME="askeve-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --template-file "$TEMPLATE_FILE" \
    --parameters @"$PARAMS_FILE" \
    --parameters alertEmail="$ALERT_EMAIL" \
    --output table

if [[ $? -ne 0 ]]; then
    log_error "Deployment failed"
    exit 1
fi

# Get deployment outputs
log_info "Retrieving deployment outputs..."
OUTPUTS=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs \
    --output json)

APP_SERVICE_NAME=$(echo "$OUTPUTS" | jq -r '.appServiceName.value')
APP_SERVICE_URL=$(echo "$OUTPUTS" | jq -r '.appServiceUrl.value')
KEY_VAULT_NAME=$(echo "$OUTPUTS" | jq -r '.keyVaultName.value')

log_success "Deployment completed successfully!"
log_info "App Service: $APP_SERVICE_NAME"
log_info "URL: $APP_SERVICE_URL"
log_info "Key Vault: $KEY_VAULT_NAME"

# Configure cost monitoring
log_info "Setting up additional cost monitoring..."

# Create cost alert rules
COST_ALERTS_FILE="$PROJECT_ROOT/monitoring/cost-alerts.json"
if [[ -f "$COST_ALERTS_FILE" ]]; then
    log_info "Deploying cost monitoring alerts..."
    az deployment group create \
        --resource-group "$RESOURCE_GROUP" \
        --name "cost-alerts-$(date +%Y%m%d-%H%M%S)" \
        --template-file "$COST_ALERTS_FILE" \
        --parameters resourceGroupName="$RESOURCE_GROUP" \
        --parameters alertEmail="$ALERT_EMAIL" \
        --parameters environment="$ENVIRONMENT" \
        --output table
    
    log_success "Cost monitoring alerts configured"
else
    log_warning "Cost alerts template not found: $COST_ALERTS_FILE"
fi

# Health check
log_info "Performing health check..."
sleep 30  # Wait for services to start

HEALTH_URL="$APP_SERVICE_URL/health"
if curl -f -s "$HEALTH_URL" > /dev/null; then
    log_success "Health check passed: $HEALTH_URL"
else
    log_warning "Health check failed - service may still be starting up"
fi

# Cost summary
log_info "💰 Cost Summary:"
case $ENVIRONMENT in
    "prod")
        log_info "Budget Limit: £50/month"
        log_info "Alerts: £40 (80%), £45 (90%), £48 (96%)"
        ;;
    "staging")
        log_info "Budget Limit: £35/month" 
        log_info "Alerts configured for cost monitoring"
        ;;
    "dev")
        log_info "Budget Limit: £25/month"
        log_info "Alerts configured for cost monitoring"
        ;;
esac

# Final summary
echo ""
log_success "🎉 Ask Eve Assist deployment completed!"
echo ""
echo "NEXT STEPS:"
echo "1. Configure secrets in Key Vault: $KEY_VAULT_NAME"
echo "2. Deploy application code to: $APP_SERVICE_NAME"
echo "3. Monitor costs at: https://portal.azure.com/#blade/Microsoft_Azure_CostManagement/Menu/costanalysis"
echo "4. Check alerts: https://portal.azure.com/#blade/Microsoft_Azure_Monitoring/AzureMonitoringBrowseBlade/alertsV2"
echo ""
echo "COST MONITORING:"
echo "- Budget alerts configured at £40, £45, £48"
echo "- Email notifications sent to: $ALERT_EMAIL"
echo "- UK data residency enforced: $LOCATION"
echo ""
log_info "Deployment log available in Azure Portal under Resource Group: $RESOURCE_GROUP"