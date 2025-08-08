# Medical Entities Configuration

This directory contains medical entities and system prompts for Ask Eve Assist healthcare chatbot.

## File Structure

```
entities/
├── README.md                    # This file
├── system-prompt.txt           # Main MHRA-compliant system prompt
├── medical-entities.txt        # Core medical terminology
├── crisis-entities.txt         # Crisis detection keywords
├── safety-entities.txt         # Safety trigger words
├── cancer-entities.txt         # Cancer-specific terminology
├── symptom-entities.txt        # Symptom recognition entities
└── escalation-entities.txt     # Escalation trigger words
```

## Usage

These entity files are loaded by the application at startup and used for:

1. **Medical Term Recognition** - Identifying relevant medical terminology in user queries
2. **Crisis Detection** - Detecting potential crisis situations (<2 second response time)
3. **Safety Triggers** - Identifying when to escalate or provide additional resources
4. **MHRA Compliance** - Ensuring appropriate medical information handling

## File Format

Each `.txt` file should contain:
- One entity per line
- UTF-8 encoding
- No trailing whitespace
- Comments starting with `#` are ignored

## Integration

These entities are loaded by:
- `SafetyMiddleware.ts` - For crisis detection
- `ContentService.ts` - For medical term recognition
- `EscalationService.ts` - For escalation triggers