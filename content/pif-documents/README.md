# PiF Ticked Approved Documents

## Overview
This directory contains The Eve Appeal's Patient Information Framework (PiF) Ticked Approved documents. These documents have undergone clinical review and approval, ensuring medical accuracy and regulatory compliance for use in Ask Eve Assist.

## Source Attribution
All documents are sourced from The Eve Appeal (https://eveappeal.org.uk)
- PiF approval ensures medical accuracy and MHRA compliance
- Each document represents clinically validated health information
- Content is approved for public health guidance

## Document Inventory
**6 PiF Ticked Approved Documents Added:**

1. **HPV Guide (2025 Brand Update)**
   - Filename: `HPV-Guide-2025-brand-update-v1-min.pdf`
   - Source URL: `https://eveappeal.org.uk/gynaecological-cancer/hpv`
   - Last Updated: `2025`
   - Coverage: `HPV information, prevention, vaccination, screening`

2. **Lynch Syndrome Patient Guide**
   - Filename: `Lynch-Syndrome_Patient-guide_vs2_digital_FINAL_21.02.23.pdf`
   - Source URL: `https://eveappeal.org.uk/gynaecological-cancer/hereditary-cancer`
   - Last Updated: `February 2023`
   - Coverage: `Hereditary cancer syndrome, genetic testing, family history`

3. **Vaginal Cancer Early Recognition Guide**
   - Filename: `Vaginal-cancer-ER_April-2024.pdf`
   - Source URL: `https://eveappeal.org.uk/gynaecological-cancer/vaginal-cancer`
   - Last Updated: `April 2024`
   - Coverage: `Vaginal cancer symptoms, early recognition, when to see GP`

4. **Vulval Cancer Early Recognition Guide**
   - Filename: `Vulval-cancer-ER_April-2024.pdf`
   - Source URL: `https://eveappeal.org.uk/gynaecological-cancer/vulval-cancer`
   - Last Updated: `April 2024`
   - Coverage: `Vulval cancer symptoms, early recognition, when to see GP`

5. **Womb Cancer Early Recognition Guide**
   - Filename: `Womb-cancer-ER_April-2024.pdf`
   - Source URL: `https://eveappeal.org.uk/gynaecological-cancer/womb-cancer`
   - Last Updated: `April 2024`
   - Coverage: `Womb cancer symptoms, early recognition, when to see GP`

6. **Genetic Testing in Ovarian Cancer**
   - Filename: `genetic testing in ovarian-A5_vs2_22.04.2024.pdf`
   - Source URL: `https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/genetic-testing`
   - Last Updated: `April 2024`
   - Coverage: `Ovarian cancer genetic testing, BRCA genes, family history`

## Processing Guidelines

### Content Chunking Strategy
- **Preserve Medical Context**: Never split critical health information across chunks
- **Maintain Source Attribution**: Every chunk must link back to original document
- **Symptom Completeness**: Keep symptom lists and "when to see GP" guidance intact
- **Emergency Information**: Crisis information must remain complete and accessible

### Source URL Mapping
Each processed chunk will be mapped to:
- Original PDF document URL on eveappeal.org.uk
- Specific page reference where applicable
- Section anchor links when available

### Quality Assurance
- ✅ All content pre-approved through PiF process
- ✅ Medical accuracy validated by clinical team
- ✅ Regulatory compliance ensured
- ✅ Source attribution maintained throughout processing

## Usage Notes

### For Content Pipeline Agent
- Process documents with medical-context-aware chunking
- Generate source URLs pointing to original document locations
- Validate content fits within Azure AI Search 50MB allocation
- Create semantic embeddings optimized for health queries

### For Bot Core Agent
- High-confidence responses for PiF-sourced content
- Clear attribution: "Based on The Eve Appeal's approved guidance..."
- Fallback to document URLs when specific information not indexed

## Compliance & Safety

### Medical Information Standards
- Content approved under Patient Information Framework
- Suitable for public health guidance
- Clinically reviewed and validated
- MHRA compliant information

### Emergency Content Priority
- Crisis response information gets priority processing
- "When to seek urgent help" content always preserved complete
- Contact details for emergency services maintained

---

**Important**: Only add documents that have received PiF Tick approval from The Eve Appeal. This ensures all content meets clinical accuracy and regulatory compliance standards required for health information chatbots.