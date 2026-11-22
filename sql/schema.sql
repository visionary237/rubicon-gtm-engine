-- RUBICON relational model (SQLite dialect, written to port to PostgreSQL).
-- Stable text IDs everywhere; never key on a spreadsheet row number.
-- Every business table carries workspace_id: businesses are never merged implicitly.

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, timezone TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL, domain TEXT, siren TEXT, siret TEXT, sector TEXT, location TEXT, size INTEGER,
  customer_type TEXT CHECK (customer_type IN ('b2b','b2c','mixed') OR customer_type IS NULL),
  summary TEXT, sells_to TEXT,
  icp_verdict TEXT CHECK (icp_verdict IN ('oui','oui_partiel','partiel','indirect','non','inconnu')),
  icp_fit REAL CHECK (icp_fit BETWEEN 0 AND 100 OR icp_fit IS NULL),
  icp_justification TEXT, competitor INTEGER DEFAULT 0, do_not_contact INTEGER DEFAULT 0,
  verified_at TEXT, source_ids TEXT,
  UNIQUE (workspace_id, siret)
);
CREATE INDEX IF NOT EXISTS ix_accounts_domain ON accounts(workspace_id, domain); -- merge hint, not unique (multi-site)

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),           -- no contact without a company
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, title TEXT, buying_role TEXT,
  profile_url_norm TEXT, email TEXT, phone TEXT, phone_country TEXT, phone_type TEXT,
  status TEXT CHECK (status IN ('À enrichir','À appeler','Rappeler','Réponse négative','Réponse positive','Qualifié','Ne pas contacter')),
  calls_count INTEGER NOT NULL DEFAULT 0, last_call_at TEXT, last_contact_at TEXT, owner_rep_id TEXT,
  opt_out INTEGER NOT NULL DEFAULT 0, opt_out_at TEXT,
  UNIQUE (workspace_id, profile_url_norm),
  CHECK (NOT (status = 'Rappeler' AND calls_count = 0))       -- never "Rappeler" on a row with zero real calls
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, category TEXT,
  price_eur REAL, margin_pct REAL, sales_cycle_days INTEGER, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sales_reps ( -- Ideal Sales Profile: declared professional dimensions only
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL,
  level TEXT CHECK (level IN ('junior','medium','senior')), languages TEXT, capacity_minutes INTEGER, max_complexity INTEGER
);
CREATE TABLE IF NOT EXISTS rep_offer_expertise (rep_id TEXT REFERENCES sales_reps(id), offer_id TEXT REFERENCES offers(id), score REAL, PRIMARY KEY (rep_id, offer_id));

CREATE TABLE IF NOT EXISTS objectives (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, rep_id TEXT, offer_id TEXT, period TEXT NOT NULL,
  metric TEXT NOT NULL, target REAL NOT NULL, achieved REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, offer_id TEXT, vertical TEXT, zone TEXT, batch_label TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id), type TEXT, label TEXT, observed_at TEXT, verified INTEGER, source_id TEXT
);

CREATE TABLE IF NOT EXISTS activities ( -- immutable event ledger (calls, emails, meetings)
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT REFERENCES contacts(id), rep_id TEXT, campaign_id TEXT,
  type TEXT CHECK (type IN ('outbound_call','email_sent','meeting_booked','meeting_held','opt_out','note')),
  occurred_at TEXT NOT NULL, outcome TEXT, note TEXT, evidence_id TEXT
);

CREATE TABLE IF NOT EXISTS actions ( -- recommendations, separate from what really happened
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, rep_id TEXT, offer_id TEXT, type TEXT, due_at TEXT,
  priority REAL, explanation_json TEXT, rule_version TEXT, status TEXT DEFAULT 'proposed', override_reason TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), offer_id TEXT NOT NULL,
  stage TEXT NOT NULL, amount_eur REAL, opened_at TEXT NOT NULL, closed_at TEXT, won INTEGER, loss_reason TEXT,
  UNIQUE (workspace_id, account_id, offer_id),
  CHECK (NOT (stage = '7. Perdu' AND loss_reason IS NULL))     -- no lost deal without a reason
);

CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, contact_id TEXT, opportunity_id TEXT, starts_at TEXT, held INTEGER, evidence_id TEXT);

CREATE TABLE IF NOT EXISTS enrichment_logs ( -- failures are logged so they are never paid twice
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL, kind TEXT, target_id TEXT, provider TEXT,
  attempted_at TEXT, result TEXT CHECK (result IN ('found','not_found','error')), cost_cents INTEGER NOT NULL DEFAULT 0, quote_id TEXT
);

-- Flat table used by the analytics demo (one row per worked account, SIMULATED in the open-source edition).
CREATE TABLE IF NOT EXISTS campaign_outcomes (
  account_id TEXT PRIMARY KEY, contact_id TEXT, offer_id TEXT, sector TEXT, source TEXT, rep_id TEXT,
  calls INTEGER, connected INTEGER, conversation INTEGER, meeting_booked INTEGER, meeting_held INTEGER, won INTEGER,
  won_amount_eur REAL, objection TEXT, loss_reason TEXT, enrichment_cost_cents INTEGER, simulated INTEGER NOT NULL
);
