# Roadmap

## Done — v1.0.0 (2026-11-19)
Decision engine (qualification, contacts, waterfall quotes, offer matching, scoring, ITW, NBA, allocation, briefs, roadmap, post-call), CLI, mock/dry-run/live adapters, two n8n workflows executed on n8n 1.123.99, SQLite schema + KPIs + Python analytics, 11 skills (7 implemented), registry sourcing by sector × zone, 500-account synthetic dataset, 31 automated tests.

## Week plan (owner's target, not a commitment)
| Day | Goal | Exit criterion |
|---|---|---|
| 1 | Publish RUBICON Open Source | repo public, README checked, demo reproducible from a fresh clone, LinkedIn post scheduled with the link |
| 2 | Connect operational tools, configure Proper Group | `claude mcp list` green for Sheets/Notion; workspace `proper-group` validated; real CVA chosen |
| 3 | Configure DOERZ, first qualification batches | 50-account review batches for both pilots; first quote approved or rejected |
| 4 | Use results, improve the engine | first real post-call sync; dictionary corrections; issues logged |
| 5 | Landing page, demo, pilot offer | pilot offer page + 90 s video + 3 conversations booked |

## Next engineering steps (priority order)
1. Calendar-aware slots (read-only Google Calendar) and business-hours/timezone per contact.
2. Private live adapters for the chosen providers, behind quotes, after verifying docs and billing.
3. CRM reconciliation (read-only first), then approved writes for Notion/HubSpot.
4. Persisted approvals (quote ID, expiry, budget lock, audit), scheduled 07:00 run, approval webhook in n8n.
5. LLM-assisted note classification with structured output, using the rule-based classifier as a fallback and the test oracle.
6. Assignment solver (ILP) checked against the greedy heuristic on the same fixtures.
7. Platform: Next.js/TypeScript/Tailwind + PostgreSQL/Supabase with RLS per workspace, reusing the engine unchanged.
