/*
 * RUBICON adapters — interchangeable connectors behind one contract.
 *
 * Three modes, enforced here and not by convention:
 *   mock    → deterministic fake results from local fixtures. No network, no spend, no external write.
 *   dry-run → returns the exact operation plan that WOULD run. No network, no spend, no external write.
 *   live    → real operation. Requires (1) mode=live, (2) an approved quote / write authorisation
 *             ID present in config.approvals, (3) an implemented provider adapter.
 *             The open-source edition ships NO live provider adapter on purpose.
 *
 * Provider endpoints, auth headers, billing semantics and rate limits must be verified against
 * each provider's current documentation before a live adapter is written (see docs/MCP_SETUP.md).
 */
'use strict';

class GuardError extends Error { constructor(code, msg) { super(`${code}: ${msg}`); this.code = code; } }

const LIVE_PROVIDERS = {}; // e.g. { 'icypeas': require('../private/adapters/icypeas.cjs') } — kept out of the public repo

function assertLiveAllowed(config, operation) {
  if (config.mode !== 'live') return false;
  const approved = new Set([...(config.approvals?.approvedQuoteIds || []), ...(config.approvals?.approvedWriteIds || [])]);
  if (!approved.has(operation.id)) throw new GuardError('NOT_APPROVED', `operation ${operation.id} has no explicit approval`);
  if (!LIVE_PROVIDERS[operation.provider]) throw new GuardError('LIVE_ADAPTER_NOT_IMPLEMENTED', `no live adapter for "${operation.provider}" in this edition`);
  return true;
}

// Deterministic pseudo-random from a string (mock data only).
const seeded = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h / 4294967296; };

function executeQuote(config, quote) {
  if (quote.state !== 'approved' && config.mode === 'live') throw new GuardError('NOT_APPROVED', `quote ${quote.id} is ${quote.state}`);
  if (config.mode === 'dry-run') {
    return { mode: 'dry-run', quoteId: quote.id, wouldCall: quote.provider, targets: quote.targetIds, maxCostCents: quote.maxCostCents, spentCents: 0, externalCalls: 0 };
  }
  if (assertLiveAllowed(config, quote)) return LIVE_PROVIDERS[quote.provider].execute(quote);
  // mock
  const hit = config.budget.providers[quote.kind].expectedHitRate ?? 0.5;
  const results = quote.targetIds.map((id) => {
    const found = seeded(id + quote.kind) < hit;
    return quote.kind === 'mobile_enrichment'
      ? { targetId: id, result: found ? 'found' : 'not_found', phone: found ? `DEMO-+33-6-99-${String(Math.floor(seeded(id) * 1e6)).padStart(6, '0')}` : null, phoneCountry: found ? 'FR' : null, costCents: 0, simulated: true }
      : { targetId: id, result: found ? 'found' : 'not_found', contacts: found ? 1 : 0, costCents: 0, simulated: true };
  });
  return { mode: 'mock', quoteId: quote.id, results, enrichmentLogEntries: results.map((r) => ({ kind: quote.kind, targetId: r.targetId, provider: quote.provider, at: config.runAt.slice(0, 10), result: r.result, costCents: 0 })), spentCents: 0, externalCalls: 0 };
}

function applyCrmOps(config, postCall) {
  const op = { id: `W-${postCall.sessionId}`, provider: config.crm?.provider || 'none' };
  if (config.mode === 'dry-run' || config.mode === 'mock') {
    return { mode: config.mode, writeId: op.id, wouldWrite: postCall.crmOps.length + postCall.patches.length, writesPerformed: 0,
      note: 'Approve by adding this writeId to approvals.approvedWriteIds and running in live mode with an implemented CRM adapter.' };
  }
  assertLiveAllowed(config, op);
  return LIVE_PROVIDERS[op.provider].write(postCall);
}

module.exports = { executeQuote, applyCrmOps, GuardError, LIVE_PROVIDERS };
