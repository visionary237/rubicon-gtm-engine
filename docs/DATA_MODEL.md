# Data model

Source of truth: `sql/schema.sql` (SQLite, PostgreSQL-portable). Input JSON shapes: `config/demo/config.json` and `data/synthetic/demo-small.json`.

| Entity | Key | Notable fields / rules |
|---|---|---|
| Workspace | `id` | country, timezone. Every row below carries `workspace_id` |
| Account | `id` (stable) | domain (merge hint, not unique), SIREN/SIRET (unique establishment), sector, size, relevant team size, customer type, summary `<what>. Clients : <B2B types>.`, verdict, icpFit, problems[{key, evidenceId}], signals[], sources[], verifiedAt, competitor, doNotContact |
| Contact | `id` (stable) | account (required), names (identity guard), title → buyingRole, normalized profile URL (dedupe key), phone + country + type, status, calls count (never "Rappeler" at 0), last call vs last contact, owner, opt-out, followUp{dueAt, channel, offerId, promise}, lastInteraction, declaredInterests[{topic, consentToUse, sensitive}] |
| Offer (IOP) | `id` | oneLiner, problemsSolved, icpSectors, personas, price, margin, cycle, socialProof[{verified, citationAllowed}], assets[CVA {verified, status, callReason}], objections, complementary, seasonality, active |
| Sales Rep (ISP) | `id` | level, languages, offer/industry expertise, declared task preferences, capacity, max complexity, objectives, excluded accounts. Nothing else |
| Objective | `id` | rep/offer, period, metric, target, achieved |
| Campaign | `id` | offer, vertical, zone, batch label |
| Signal | `id` | type, date, verified, sourceId |
| Activity | `id` | immutable event: call, email, meeting, opt-out, with evidence |
| Action | `id` = `A-<date>-<contact>-<type>` | recommendation with explanation and ruleVersion, separate from activities |
| Opportunity | unique (workspace, account, offer) | stage, amount, won, loss reason (required when lost) |
| Meeting | `id` | contact, start, held, evidence |
| Enrichment Log | auto | kind, target, provider, result found/not_found/error, cost, quote |

Sheets compatibility: the two-tab Outbound Blueprint file (`knowledge/upstream-schema-sheet-outbound.md`) maps onto Accounts and Contacts. Columns are addressed by header name, and writes go to the `ID` column after a name check.
