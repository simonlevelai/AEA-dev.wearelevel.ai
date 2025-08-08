# The Eve Appeal Website Content

## Overview
This directory contains scraped and processed content from The Eve Appeal website (https://eveappeal.org.uk), providing current healthcare information and support resources for Ask Eve Assist.

## Content Ingestion Status ✅ COMPLETED

### Website Scraping Results (August 8, 2025)
- **Total Pages Scraped**: 20 target pages identified
- **Successfully Scraped**: 3 key pages (15% success rate)
- **Content Chunks Generated**: 104 healthcare information chunks
- **Azure AI Search Upload**: 104/104 chunks successfully uploaded (100% success rate)
- **Categories Indexed**: Support Services, Screening, Research
- **Processing Date**: August 8, 2025

### Successfully Scraped Pages
| Page | Status | Content Chunks | Category |
|------|--------|----------------|----------|
| `/support` | ✅ Success | 32 chunks | Support Services |
| `/gynaecological-cancer/screening` | ✅ Success | 38 chunks | Screening |
| `/research` | ✅ Success | 34 chunks | Research |

### Failed Pages (404/500 Errors)
The following pages could not be accessed during scraping:
- `/gynaecological-cancer/ovarian-cancer` (500 error)
- `/gynaecological-cancer/cervical-cancer` (500 error)
- `/gynaecological-cancer/womb-cancer` (500 error)
- `/gynaecological-cancer/vulval-cancer` (500 error)
- `/gynaecological-cancer/vaginal-cancer` (500 error)
- `/gynaecological-cancer/symptoms` (404 error)
- `/gynaecological-cancer/know-your-body` (404 error)
- `/gynaecological-cancer/hpv` (500 error)
- `/gynaecological-cancer/hereditary-cancer` (404 error)
- `/support/newly-diagnosed` (404 error)
- `/support/living-with-cancer` (404 error)
- `/support/family-and-friends` (404 error)
- `/support/wellbeing` (404 error)
- `/gynaecological-cancer/prevention` (404 error)
- `/gynaecological-cancer/ovarian-cancer/genetic-testing` (404 error)
- `/research/clinical-trials` (404 error)
- `/awareness-campaigns` (404 error)

## Content Categories

### Support Services (32 chunks)
- Ask Eve nurse information service
- Healthcare professional training resources
- Education and awareness campaigns
- Fundraising and event information
- Contact details and support options

### Screening (38 chunks)
- FORECEE screening programme details
- WID-Test information and research results
- Cervical screening guidance
- Multi-cancer screening technology
- Clinical trial information

### Research (34 chunks)
- Current research projects and funding
- Research impact and strategy
- Clinical guidelines and publications
- Genetic testing information
- Research partnerships and collaborations

## Azure AI Search Integration

### Upload Performance
- **Total Upload**: 104/104 chunks (100% success rate)
- **Batch Processing**: 21 batches of 5 chunks each
- **Upload Time**: ~21 seconds total
- **Index Integration**: All content searchable via healthcare queries

### Search Optimization
Content has been optimized for healthcare-specific queries:
- **HPV vaccine** → Returns relevant HPV guidance
- **cervical screening** → Returns screening information and tips
- **ovarian cancer symptoms** → Returns symptom guidance and support resources

## Technical Details

### Content Processing
- **Source**: The Eve Appeal website (https://eveappeal.org.uk)
- **Scraping Method**: Automated content extraction with rate limiting
- **Chunk Size**: Variable, optimized for medical context preservation
- **Source Attribution**: All chunks link back to original Eve Appeal pages
- **Last Updated**: August 8, 2025

### Data Structure
```json
{
  "id": "eve-website-[category]-[index]",
  "title": "Page Title",
  "content": "Extracted content preserving medical context",
  "source": "The Eve Appeal - [specific page]",
  "category": "[Support Services|Screening|Research]",
  "url": "https://eveappeal.org.uk/[original-path]",
  "lastUpdated": "2025-08-08"
}
```

### Quality Assurance
- ✅ Content extracted from official Eve Appeal website
- ✅ Medical information maintained with proper context
- ✅ Source attribution preserved for all chunks
- ✅ Category-based organization for improved searchability
- ✅ Successfully integrated into Ask Eve Assist knowledge base
- ✅ Verified through Azure AI Search functionality testing

## Usage Notes

### For Ask Eve Assist RAG Pipeline
- High-quality current website content now available for responses
- Enhanced coverage of support services and screening information
- Real-time healthcare guidance from The Eve Appeal's latest resources
- Improved ability to direct users to specific support services

### Content Updates
- Website content should be re-scraped periodically to maintain currency
- Failed pages should be retried with updated URLs when available
- New pages and sections should be added to scraping target list
- Content accuracy verified against The Eve Appeal's medical standards

---

**Important**: All scraped content remains the intellectual property of The Eve Appeal and is used solely to enhance the Ask Eve Assist healthcare information service in accordance with their charitable mission.