#!/bin/bash

# Deploy Azure Function for GDPR Data Retention Cleanup
# Schedule: Daily at 02:00 GMT
# Cost: £1-2/month (Consumption Plan Y1)

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="prod"
RESOURCE_GROUP="rg-askeve-prod"
LOCATION="uksouth"
SUBSCRIPTION="77a928d4-42c3-41f2-a481-2ad7602e108a"
FUNCTION_APP_NAME="askeve-data-retention-func"
STORAGE_ACCOUNT="askevestorageprod"
APP_INSIGHTS="askeve-prod-insights"

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
print_help() {
    cat << EOF
Azure Function Deployment for Data Retention Cleanup

Usage: $0 [OPTIONS]

Options:
    -e, --environment       Environment (dev|prod) [default: prod]
    -r, --resource-group    Resource group name [default: rg-askeve-prod]
    -l, --location         Azure region [default: uksouth]
    -s, --subscription     Azure subscription ID
    -f, --function-name    Function app name [default: askeve-data-retention-func]
    -h, --help             Show this help message

Examples:
    $0                                          # Deploy to production
    $0 -e dev -r askeve-dev-rg                 # Deploy to development
    $0 --function-name my-retention-func        # Custom function name

This deploys:
  - Azure Function App (Consumption Plan Y1 - £1-2/month)
  - Timer trigger for daily cleanup at 02:00 GMT
  - GDPR-compliant data retention automation
  - Application Insights integration
  - Health monitoring endpoint

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--resource-group)
            RESOURCE_GROUP="$2"
            shift 2
            ;;
        -l|--location)
            LOCATION="$2"
            shift 2
            ;;
        -s|--subscription)
            SUBSCRIPTION="$2"
            shift 2
            ;;
        -f|--function-name)
            FUNCTION_APP_NAME="$2"
            shift 2
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    log_error "Environment must be 'dev' or 'prod'"
    exit 1
fi

# Set environment-specific values
if [[ "$ENVIRONMENT" == "dev" ]]; then
    RESOURCE_GROUP="askeve-dev-rg"
    STORAGE_ACCOUNT="askevedevstg"
    APP_INSIGHTS="askeve-dev-insights"
    FUNCTION_APP_NAME="askeve-data-retention-dev"
fi

log_info "🚀 Starting Azure Function deployment for data retention cleanup"
log_info "Environment: $ENVIRONMENT"
log_info "Resource Group: $RESOURCE_GROUP"
log_info "Function App: $FUNCTION_APP_NAME"
log_info "Location: $LOCATION"

# Check if logged into Azure CLI
if ! az account show &> /dev/null; then
    log_error "Not logged into Azure CLI. Please run 'az login' first."
    exit 1
fi

# Set subscription
if [[ -n "$SUBSCRIPTION" ]]; then
    log_info "Setting subscription: $SUBSCRIPTION"
    az account set --subscription "$SUBSCRIPTION"
fi

# Check if resource group exists
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    log_error "Resource group $RESOURCE_GROUP does not exist"
    exit 1
fi

# Check if storage account exists
if ! az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    log_error "Storage account $STORAGE_ACCOUNT does not exist"
    exit 1
fi

# Check if Application Insights exists
if ! az monitor app-insights component show --app "$APP_INSIGHTS" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    log_error "Application Insights $APP_INSIGHTS does not exist"
    exit 1
fi

# Build TypeScript function
log_info "📦 Building Azure Function TypeScript code..."
cd "$(dirname "$0")/.."

if ! npm run build; then
    log_error "Failed to build TypeScript code"
    exit 1
fi

log_success "TypeScript build completed"

# Deploy Azure Function using ARM template
log_info "🏗️ Deploying Azure Function infrastructure..."

DEPLOYMENT_NAME="data-retention-func-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --template-file "deploy/data-retention-function-template.json" \
    --parameters \
        functionAppName="$FUNCTION_APP_NAME" \
        storageAccountName="$STORAGE_ACCOUNT" \
        applicationInsightsName="$APP_INSIGHTS" \
        environment="$ENVIRONMENT" \
        location="$LOCATION" \
    --output table

if [ $? -ne 0 ]; then
    log_error "Failed to deploy Azure Function infrastructure"
    exit 1
fi

log_success "Azure Function infrastructure deployed"

# Wait for function app to be ready
log_info "⏳ Waiting for Function App to be ready..."
sleep 30

# Deploy function code
log_info "📤 Deploying function code..."

# Create deployment package
cd src/functions
zip -r ../../function-deployment.zip . -x "*.ts" "node_modules/*"
cd ../..

# Deploy using Azure CLI
az functionapp deployment source config-zip \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --src "function-deployment.zip"

if [ $? -ne 0 ]; then
    log_error "Failed to deploy function code"
    exit 1
fi

# Clean up deployment package
rm -f function-deployment.zip

log_success "Function code deployed"

# Verify deployment
log_info "🔍 Verifying deployment..."

# Check function app status
FUNCTION_STATUS=$(az functionapp show --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "state" -o tsv)

if [[ "$FUNCTION_STATUS" != "Running" ]]; then
    log_warning "Function app is not running yet. Status: $FUNCTION_STATUS"
else
    log_success "Function app is running"
fi

# Get function app URL
FUNCTION_URL=$(az functionapp show --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "defaultHostName" -o tsv)
HEALTH_ENDPOINT="https://$FUNCTION_URL/api/dataRetentionHealth"

# Test health endpoint (with retry)
log_info "🏥 Testing health endpoint..."
for i in {1..3}; do
    if curl -s -f "$HEALTH_ENDPOINT" > /dev/null; then
        log_success "Health endpoint is responding"
        break
    else
        if [[ $i -eq 3 ]]; then
            log_warning "Health endpoint not responding yet (this is normal for new deployments)"
        else
            log_info "Retrying health check in 30 seconds... ($i/3)"
            sleep 30
        fi
    fi
done

# Display deployment information
log_success "🎉 Azure Function deployment completed successfully!"
echo
echo "📊 Deployment Summary:"
echo "  Function App Name: $FUNCTION_APP_NAME"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Function URL: https://$FUNCTION_URL"
echo "  Health Endpoint: $HEALTH_ENDPOINT"
echo "  Schedule: Daily at 02:00 GMT"
echo "  Environment: $ENVIRONMENT"
echo
echo "💰 Cost Information:"
echo "  Estimated Monthly Cost: £1-2/month (Consumption Plan Y1)"
echo "  Billing: Pay-per-execution + storage"
echo
echo "📋 Next Steps:"
echo "  1. Monitor the function via Azure Portal"
echo "  2. Check Application Insights for execution metrics"
echo "  3. Verify first scheduled run (next 02:00 GMT)"
echo "  4. Test health endpoint: curl $HEALTH_ENDPOINT"
echo
echo "🔗 Azure Portal Links:"
echo "  Function App: https://portal.azure.com/#@/resource/subscriptions/$SUBSCRIPTION/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Web/sites/$FUNCTION_APP_NAME"
echo "  Application Insights: https://portal.azure.com/#@/resource/subscriptions/$SUBSCRIPTION/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Insights/components/$APP_INSIGHTS"

log_success "Data retention automation is now active! 🧹📅"