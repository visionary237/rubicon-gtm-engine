# Architecture

## Four engines
| Engine | Role | Implementation |
|---|---|---|
| **Knowledge** | Methods, ICP, dictionaries, offers, CVA, field feedback | `.claude/skills/`, `knowledge/`, `workspaces/<id>/config.json` |
| **Intelligence** | Research, qualification help, contextualisation, conversation with the user | Claude Code + Skills + MCP |
| **Decision** | Qualification gates, scoring, matching, NBA, allocation, briefs, post-call logic | `engine/rubicon.cjs` (JS, pure) · `sql/` for analytics |
| **Execution** | Orchestration, CRM sync, follow-ups, human calls | n8n workflows · MCP connectors · humans |

## One decision core, three interfaces
```
                ┌──────────────── engine/rubicon.cjs ────────────────┐
                │ pure functions · no I/O · deterministic · tested    │
                └───────┬──────────────────┬─────────────────┬────────┘
            require()   │     embedded by build-workflows   │ CLI calls
        ┌───────────────▼───┐  ┌───────────▼──────────┐  ┌──▼──────────────┐
        │ engine/cli.cjs    │  │ workflows/*.n8n.json │  │ Claude Skills   │
        │ + adapters.cjs    │  │ (Code nodes)         │  │ (.claude/skills)│
        └───────────────────┘  └──────────────────────┘  └─────────────────┘
```
**Why JavaScript for the decision engine, and not Python?** n8n Code nodes run JavaScript natively and n8n cannot import local Python modules without extra deployment. A single JS engine avoids two diverging implementations. Python is used where it shines and where divergence cannot happen: analytics over SQL.

**Claude Code and n8n.** n8n does **not** call a Claude Code session or use a Claude subscription. Where n8n needs an LLM later, it will call an API with its own credentials through a dedicated adapter, behind the same approval rules.

## Data flow (daily run)
`prepare` (workspace check, ISP guard, mode) → L1 normalize/dedupe → L2 ICP gate → L3 contacts → L4 enrichment quotes → offer matching → opportunity + ITW + NBA → allocation → briefs + roadmap → finalize (metrics, guarantees, markdown).
The state is plain JSON between stages, which is how n8n passes it from node to node.

## Waterfall enrichment (L0 → L6)
L0 raw import · L1 normalized/deduped · L2 company qualified · L3 contact qualified · L4 reachable (phone/email) · L5 signals and context · L6 action prepared (brief). Each contact reports its level and what is missing (`waterfall[]`). Each paid step is a quote awaiting approval. Failures are logged in `enrichmentLog`.

## Modes and adapters
`engine/adapters.cjs`: `mock` (fake deterministic results), `dry-run` (exact plan), `live` (approved ID + implemented provider). Provider adapters are interchangeable behind `executeQuote(config, quote)` and `applyCrmOps(config, postCall)`. Private live adapters belong in a private repository or workspace, never in the public one.

## Workflows
- `rubicon-daily.n8n.json`: Manual Trigger → configuration & data → guards → L1 → L2 → L3 → L4 → offer matching → NBA → allocation → briefs & roadmap → export → one item per rep.
- `rubicon-postcall.n8n.json`: Manual Trigger → session notes & evidence → interpretation/verification → split by lane (patch, CRM op, validation, contradiction, rejection, summary) → **STOP, approval required**.
- Production split (target): setup · sourcing · qualification · enrichment · matching · daily roadmap · post-call · analytics, with Schedule Trigger at 07:00 and an approval webhook. Not built yet, on purpose.

## Data model (summary, details in `sql/schema.sql`)
Workspaces 1—n Accounts 1—n Contacts · Offers · Sales Reps (+ expertise) · Objectives · Campaigns · Signals (per account) · Activities (immutable event ledger) · Actions (recommendations, separate from what happened) · Opportunities (unique per account × offer) · Meetings · Enrichment Logs.
Keys: stable text IDs, `workspace_id` everywhere. Domain is indexed but not unique (multi-site). The schema is SQLite and portable to PostgreSQL (row-level security per workspace is the platform target).

## Public / private separation
| Public repo | Private (`workspaces/`, git-ignored, or a private repo) |
|---|---|
| engine, skills, demo config, synthetic data, docs | real configs, prospect data, client lists, prices under negotiation, live adapters, outputs on real data |
No key is ever stored in a file: MCP config and the shell environment only.
