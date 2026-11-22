-- RUBICON Revenue Learning KPIs. Every ratio states its numerator and denominator.
-- Run on campaign_outcomes (simulated in the demo). Small samples are flagged by the Python layer.

-- name: funnel
SELECT
  COUNT(*)                                   AS worked_accounts,          -- accounts with ≥1 real outbound call
  SUM(calls)                                 AS calls,
  SUM(connected)                             AS connected,
  ROUND(1.0 * SUM(connected) / COUNT(*), 4)  AS connect_rate,             -- connected accounts / worked accounts
  ROUND(1.0 * SUM(conversation) / NULLIF(SUM(connected),0), 4)    AS conversation_rate,   -- conversations / connected
  ROUND(1.0 * SUM(meeting_booked) / NULLIF(SUM(conversation),0), 4) AS meeting_rate,      -- meetings booked / conversations
  ROUND(1.0 * SUM(meeting_held) / NULLIF(SUM(meeting_booked),0), 4) AS show_rate,         -- meetings held / booked
  ROUND(1.0 * SUM(won) / NULLIF(SUM(meeting_held),0), 4)          AS win_rate,             -- won / meetings held
  SUM(won_amount_eur)                        AS won_revenue_eur,
  ROUND(SUM(enrichment_cost_cents) / 100.0, 2) AS enrichment_cost_eur,
  ROUND(SUM(enrichment_cost_cents) / 100.0 / NULLIF(SUM(meeting_booked),0), 2) AS cost_per_meeting_eur
FROM campaign_outcomes;

-- name: by_sector
SELECT sector, COUNT(*) AS n, SUM(meeting_booked) AS meetings,
  ROUND(1.0 * SUM(meeting_booked) / COUNT(*), 4) AS meetings_per_worked_account,
  SUM(won_amount_eur) AS won_revenue_eur
FROM campaign_outcomes GROUP BY sector ORDER BY meetings_per_worked_account DESC;

-- name: by_offer
SELECT offer_id, COUNT(*) AS n, SUM(meeting_booked) AS meetings,
  ROUND(1.0 * SUM(meeting_booked) / COUNT(*), 4) AS meetings_per_worked_account, SUM(won) AS won
FROM campaign_outcomes GROUP BY offer_id ORDER BY meetings_per_worked_account DESC;

-- name: by_source
SELECT source, COUNT(*) AS n, ROUND(1.0 * SUM(connected) / COUNT(*), 4) AS connect_rate,
  ROUND(SUM(enrichment_cost_cents) / 100.0 / NULLIF(SUM(meeting_booked),0), 2) AS cost_per_meeting_eur
FROM campaign_outcomes GROUP BY source ORDER BY connect_rate DESC;

-- name: by_rep
SELECT rep_id, COUNT(*) AS n, SUM(conversation) AS conversations, SUM(meeting_booked) AS meetings
FROM campaign_outcomes GROUP BY rep_id ORDER BY rep_id;  -- context only: allocation differs, never a ranking of people

-- name: objections
SELECT objection, COUNT(*) AS n FROM campaign_outcomes WHERE objection IS NOT NULL GROUP BY objection ORDER BY n DESC;

-- name: loss_reasons
SELECT loss_reason, COUNT(*) AS n FROM campaign_outcomes WHERE loss_reason IS NOT NULL GROUP BY loss_reason ORDER BY n DESC;
