# API Module Rules
# Applies to: src/api/**

## Response Format
All routes return:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Human-readable message" }
```
Never return raw error stack traces to the client.

## Error Messages
Write for non-engineers — the operator of this tool is not a developer.
Bad:  "TypeError: Cannot read properties of undefined (reading 'id')"
Good: "Could not find that opportunity. It may have been removed from SAM.gov."

## Rate Limiting
SAM.gov: max 10 requests/second — use the throttle utility in src/monitor/samGovClient.ts
Anthropic API: use exponential backoff on 529 (overloaded) responses

## Logging
Log format: [TIMESTAMP] [MODULE] [ACTION] [STATUS]
Example: [2025-03-20T14:32:00Z] [monitor] [sam.gov poll] [success — 12 new opportunities]
Never log: API keys, full proposal text, pricing figures
