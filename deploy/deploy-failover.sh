#!/bin/bash

# Deploy Failover Infrastructure for Ask Eve Assist
# This script deploys the secondary Azure OpenAI region and monitoring infrastructure

set -e

# Configuration
RESOURCE_GROUP_NAME="ask-eve-failover-rg"
LOCATION="UK West"
TEMPLATE_FILE="deploy/azure-failover-template.json"
PARAMETERS_FILE="deploy/parameters/failover.parameters.json"
DEPLOYMENT_NAME="askeve-failover-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Azure CLI is installed
    if ! command -v az &> /dev/null; then
        error "Azure CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if logged into Azure
    if ! az account show &> /dev/null; then
        error "Not logged into Azure. Please run 'az login' first."
        exit 1
    fi
    
    # Check if template files exist
    if [[ ! -f "$TEMPLATE_FILE" ]]; then
        error "Template file not found: $TEMPLATE_FILE"
        exit 1
    fi
    
    if [[ ! -f "$PARAMETERS_FILE" ]]; then
        error "Parameters file not found: $PARAMETERS_FILE"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Create resource group
create_resource_group() {
    log "Creating resource group: $RESOURCE_GROUP_NAME"
    
    az group create \
        --name "$RESOURCE_GROUP_NAME" \
        --location "$LOCATION" \
        --tags \
            Environment="Production" \
            Project="AskEveAssist" \
            Purpose="Failover" \
            Owner="Level AI" \
            CostCenter="Infrastructure" \
            DataClassification="Sensitive" \
        --output table
    
    success "Resource group created successfully"
}

# Deploy infrastructure
deploy_infrastructure() {
    log "Deploying failover infrastructure..."
    log "Deployment name: $DEPLOYMENT_NAME"
    
    # Validate template first
    log "Validating ARM template..."
    az deployment group validate \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --template-file "$TEMPLATE_FILE" \
        --parameters "@$PARAMETERS_FILE" \
        --output table
    
    if [[ $? -eq 0 ]]; then
        success "Template validation passed"
    else
        error "Template validation failed"
        exit 1
    fi
    
    # Deploy the template
    log "Starting deployment (this may take 10-15 minutes)..."
    az deployment group create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "$DEPLOYMENT_NAME" \
        --template-file "$TEMPLATE_FILE" \
        --parameters "@$PARAMETERS_FILE" \
        --output table \
        --verbose
    
    if [[ $? -eq 0 ]]; then
        success "Infrastructure deployment completed successfully"
    else
        error "Infrastructure deployment failed"
        exit 1
    fi
}

# Get deployment outputs
get_deployment_outputs() {
    log "Retrieving deployment outputs..."
    
    # Get the deployment outputs
    OUTPUTS=$(az deployment group show \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "$DEPLOYMENT_NAME" \
        --query "properties.outputs" \
        --output json)
    
    # Parse outputs
    OPENAI_ENDPOINT=$(echo "$OUTPUTS" | jq -r '.openAIServiceEndpoint.value')
    OPENAI_SERVICE_NAME=$(echo "$OUTPUTS" | jq -r '.openAIServiceName.value')
    KEY_VAULT_NAME=$(echo "$OUTPUTS" | jq -r '.keyVaultName.value')
    DEPLOYMENT_NAME_OUTPUT=$(echo "$OUTPUTS" | jq -r '.deploymentName.value')
    LOG_WORKSPACE_ID=$(echo "$OUTPUTS" | jq -r '.logAnalyticsWorkspaceId.value')
    APP_INSIGHTS_KEY=$(echo "$OUTPUTS" | jq -r '.applicationInsightsInstrumentationKey.value')
    APP_INSIGHTS_CONNECTION=$(echo "$OUTPUTS" | jq -r '.applicationInsightsConnectionString.value')
    
    # Display outputs
    echo ""
    success "Deployment completed successfully!"
    echo ""
    echo "📋 Deployment Details:"
    echo "  Resource Group: $RESOURCE_GROUP_NAME"
    echo "  Location: $LOCATION"
    echo "  Deployment: $DEPLOYMENT_NAME"
    echo ""
    echo "🤖 Azure OpenAI Service:"
    echo "  Service Name: $OPENAI_SERVICE_NAME"
    echo "  Endpoint: $OPENAI_ENDPOINT"
    echo "  Model Deployment: $DEPLOYMENT_NAME_OUTPUT"
    echo ""
    echo "🔐 Key Vault:"
    echo "  Name: $KEY_VAULT_NAME"
    echo "  Secrets: openai-api-key, openai-endpoint"
    echo ""
    echo "📊 Monitoring:"
    echo "  Log Analytics Workspace ID: $LOG_WORKSPACE_ID"
    echo "  Application Insights Key: $APP_INSIGHTS_KEY"
    echo ""
    echo "⚙️  Next Steps:"
    echo "  1. Test the secondary OpenAI service endpoint"
    echo "  2. Update failover configuration with new endpoint"
    echo "  3. Configure monitoring dashboards"
    echo "  4. Run failover tests"
    echo ""
}

# Test the deployed service
test_service() {
    log "Testing deployed Azure OpenAI service..."
    
    # Get the API key from Key Vault
    API_KEY=$(az keyvault secret show \
        --vault-name "$KEY_VAULT_NAME" \
        --name "openai-api-key" \
        --query "value" \
        --output tsv 2>/dev/null)
    
    if [[ -z "$API_KEY" ]]; then
        warning "Could not retrieve API key from Key Vault. Manual testing required."
        return 0
    fi
    
    # Test the health endpoint
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "api-key: $API_KEY" \
        -H "Content-Type: application/json" \
        "$OPENAI_ENDPOINT/openai/deployments/$DEPLOYMENT_NAME_OUTPUT/chat/completions?api-version=2024-02-01" \
        -d '{
            "messages": [{"role": "user", "content": "Health check"}],
            "max_tokens": 10
        }')
    
    if [[ "$HTTP_STATUS" == "200" ]]; then
        success "Service health check passed (HTTP $HTTP_STATUS)"
    else
        warning "Service health check returned HTTP $HTTP_STATUS. Manual verification may be needed."
    fi
}

# Configure monitoring alerts
configure_alerts() {
    log "Configuring monitoring alerts..."
    
    # Create action group for notifications
    az monitor action-group create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "askeve-failover-alerts" \
        --short-name "failover" \
        --email-receiver \
            name="DevOps Team" \
            email="devops@wearelevel.ai" \
        --email-receiver \
            name="Eve Appeal Support" \
            email="support@eveappeal.org.uk" \
        --output table
    
    # Create alert rules
    az monitor metrics alert create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "OpenAI Service High Error Rate" \
        --description "Alert when OpenAI service error rate exceeds 5%" \
        --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP_NAME/providers/Microsoft.CognitiveServices/accounts/$OPENAI_SERVICE_NAME" \
        --condition "avg Errors > 5" \
        --window-size 5m \
        --evaluation-frequency 1m \
        --severity 2 \
        --action "askeve-failover-alerts" \
        --output table
    
    az monitor metrics alert create \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --name "OpenAI Service High Response Time" \
        --description "Alert when OpenAI service response time exceeds 5 seconds" \
        --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP_NAME/providers/Microsoft.CognitiveServices/accounts/$OPENAI_SERVICE_NAME" \
        --condition "avg ProcessingTime > 5000" \
        --window-size 5m \
        --evaluation-frequency 1m \
        --severity 3 \
        --action "askeve-failover-alerts" \
        --output table
    
    success "Monitoring alerts configured"
}

# Main execution
main() {
    echo ""
    echo "🚀 Ask Eve Assist - Failover Infrastructure Deployment"
    echo "=================================================="
    echo ""
    
    check_prerequisites
    create_resource_group
    deploy_infrastructure
    get_deployment_outputs
    test_service
    configure_alerts
    
    echo ""
    success "Failover infrastructure deployment completed successfully!"
    echo ""
    warning "Important: Update your application configuration with the new endpoint details."
    warning "Remember to test the failover functionality before going to production."
    echo ""
}

# Run the main function
main "$@"