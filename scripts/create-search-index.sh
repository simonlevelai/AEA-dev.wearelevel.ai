#!/bin/bash

# Create Azure AI Search index using REST API

set -e

# Configuration
SEARCH_SERVICE="askeve-search-prod"
INDEX_NAME="ask-eve-content"
API_VERSION="2023-11-01"

if [ -z "$AZURE_SEARCH_API_KEY" ]; then
  echo "❌ AZURE_SEARCH_API_KEY environment variable is required"
  exit 1
fi

echo "🔨 Creating Azure AI Search index..."
echo "📍 Service: $SEARCH_SERVICE"
echo "📋 Index: $INDEX_NAME"

# Create index definition
cat > /tmp/search-index.json << 'EOF'
{
  "name": "ask-eve-content",
  "fields": [
    {
      "name": "id",
      "type": "Edm.String",
      "key": true,
      "searchable": false,
      "filterable": true,
      "retrievable": true,
      "sortable": false,
      "facetable": false
    },
    {
      "name": "content",
      "type": "Edm.String",
      "key": false,
      "searchable": true,
      "filterable": false,
      "retrievable": true,
      "sortable": false,
      "facetable": false,
      "analyzer": "en.microsoft"
    },
    {
      "name": "title",
      "type": "Edm.String",
      "key": false,
      "searchable": true,
      "filterable": true,
      "retrievable": true,
      "sortable": true,
      "facetable": false,
      "analyzer": "en.microsoft"
    },
    {
      "name": "sourceUrl",
      "type": "Edm.String",
      "key": false,
      "searchable": false,
      "filterable": true,
      "retrievable": true,
      "sortable": false,
      "facetable": false
    },
    {
      "name": "chunkIndex",
      "type": "Edm.Int32",
      "key": false,
      "searchable": false,
      "filterable": true,
      "retrievable": true,
      "sortable": true,
      "facetable": false
    },
    {
      "name": "documentId", 
      "type": "Edm.String",
      "key": false,
      "searchable": false,
      "filterable": true,
      "retrievable": true,
      "sortable": false,
      "facetable": true
    },
    {
      "name": "keywords",
      "type": "Collection(Edm.String)",
      "key": false,
      "searchable": true,
      "filterable": true,
      "retrievable": true,
      "sortable": false,
      "facetable": true
    }
  ],
  "suggesters": [
    {
      "name": "sg",
      "searchMode": "analyzingInfixMatching",
      "sourceFields": ["title", "content", "keywords"]
    }
  ]
}
EOF

# Create the index
RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/create-response.json \
  -X POST \
  -H "Content-Type: application/json" \
  -H "api-key: $AZURE_SEARCH_API_KEY" \
  -d @/tmp/search-index.json \
  "https://$SEARCH_SERVICE.search.windows.net/indexes?api-version=$API_VERSION")

HTTP_CODE=$(echo "$RESPONSE" | tail -c 4)

if [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Successfully created search index '$INDEX_NAME'"
elif [ "$HTTP_CODE" = "409" ]; then
  echo "ℹ️  Search index '$INDEX_NAME' already exists"
else
  echo "❌ Failed to create search index. HTTP status: $HTTP_CODE"
  cat /tmp/create-response.json
  exit 1
fi

# Clean up temp files
rm -f /tmp/search-index.json /tmp/create-response.json

echo "🎉 Search index setup completed!"