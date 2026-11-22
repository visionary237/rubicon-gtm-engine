# MCP & connectors

**Audit first:** run `claude mcp list`, keep what already works, and add the missing connectors **one at a time**. Commands are typed by you in your terminal. Keys never go into a conversation or a repository file.

The commands below for Sheets, Drive, Notion, Allo, Pipecorn and Icypeas are reproduced from Outbound Blueprint's `mcp/README.md` (MIT, retrieved 2026-11-19). **Verify each one against the provider's current documentation before use**: endpoints and auth change.

| Tool | RUBICON role | Needed for the demo? | Command (to verify) |
|---|---|---|---|
| Google Sheets | prospect file (2 tabs) | no | `claude mcp add google-sheets --env CREDENTIALS_PATH=… --env TOKEN_PATH=… -- uvx --with "mcp<2" --from mcp-google-sheets@latest mcp-google-sheets` |
| Google Drive | find files | no | `claude mcp add google-drive --transport http https://drivemcp.googleapis.com/mcp/v1` |
| Notion | CRM (4 linked bases) | no | `claude mcp add notion --transport http https://mcp.notion.com/mcp` |
| Allo | telephony linked to CRM | no | `claude mcp add allo --transport http https://mcp.withallo.com/mcp --header "Authorization: <KEY>"` |
| Pipecorn | phone enrichment | no | `claude mcp add pipecorn --env API_KEY=… -- npx mcp-remote https://mcp.pipecorn.com/mcp --header "X-API-Key:\${API_KEY}"` |
| Icypeas | contact extraction | no | `claude mcp add icypeas --transport http https://mcp.icypeas.com/mcp` |
| Gmail / Google Calendar | post-call evidence (read-only) | no | via your Claude connectors settings or the official servers |
| HubSpot | CRM alternative | no | official HubSpot MCP server: check current docs |
| Perplexity | topic research for icebreakers | no | check current docs; topic queries only, no person profiling |
| OpenAI / Grok | optional drafting | no | API keys in env only; never required |
| Lemlist / La Growth Machine | multichannel (future) | no | out of scope for v1; their public docs only, no proprietary code |

## Provider precautions carried over from the field (Outbound Blueprint)
- **Icypeas**: header `Authorization: <key>` (no "Bearer"); `find-people/count` is free and exact, so count before extracting; a wrong request can return zero results without an error, so test on a known company first.
- **Pipecorn**: the MCP enrichment tools don't expose the country filter, and a foreign number is billed at full price. Bulk enrichment goes through the REST API with `phone_country_codes`, and the returned numbers are sorted yourself (national mobile > national landline > foreign never alone).
- **Allo**: direct API scheme is `Api-Key`, not `Bearer`.
These are reported practices, not verified by RUBICON. Re-check billing semantics (per result or per request) before the first live run.

## Mapping to RUBICON modes
Connectors are used by **skills** (Claude Code) after an approval. The engine never calls them. In `mock`/`dry-run`, skills present plans only. In `live`, the skill performs exactly the approved operation, re-reading the target ID before each write.
