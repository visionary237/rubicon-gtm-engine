'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const R = require('../engine/rubicon.cjs');
const A = require('../engine/adapters.cjs');
const CONFIG = require('../config/demo/config.json');
const DATA = require('../data/synthetic/demo-small.json');

const make = () => ({ config: structuredClone(CONFIG), data: structuredClone(DATA) });
const run = (x = make()) => R.runDaily(x);
const action = (o, cid) => o.actions.find((a) => a.contactId === cid);
const assigned = (o, cid) => o.assignments.find((a) => a.contactId === cid);
const sum = (parts) => Math.round(parts.reduce((n, p) => n + p.points, 0) * 100) / 100;

// ── DISCOVER / UNDERSTAND ──
test('account lanes: duplicates, competitor, non, B2C, low fit are excluded; unknown and partial go to validation', () => {
  const o = run();
  assert.deepEqual(o.accounts.duplicates, [{ id: 'a12', duplicateOf: 'a01', key: 'domain' }]);
  const ex = Object.fromEntries(o.accounts.excluded.map((x) => [x.id, x.reason]));
  assert.equal(ex.a08, 'competitor'); assert.equal(ex.a11, 'verdict_non'); assert.equal(ex.a18, 'b2c_only'); assert.equal(ex.a17, 'icp_fit_below_threshold');
  const val = Object.fromEntries(o.accounts.validation.map((x) => [x.id, x.reason]));
  assert.equal(val.a09, 'verdict_inconnu', 'INCONNU is a question, not a negative fact');
  assert.equal(val.a10, 'verdict_indirect_separate_lane');
  assert.equal(val.a19, 'awaiting_human_review');
});

test('multi-site chain: same domain with different SIRET is kept as a distinct establishment', () => {
  const o = run();
  assert(!o.accounts.duplicates.some((d) => d.id === 'a14'));
  assert(o.accounts.validation.some((x) => x.id === 'a14'));
});

test('first-batch control: without human review nothing is routed and a review batch is produced', () => {
  const x = make(); x.config.approvals.accountReviewDone = false;
  const o = run(x);
  assert.equal(o.assignments.length, 0);
  assert(o.accounts.firstBatchReview.size > 0 && o.accounts.firstBatchReview.size <= 50);
});

test('contacts: excluded titles, encoding duplicates, per-account caps, opposition', () => {
  const o = run();
  const rej = Object.fromEntries(o.contacts.rejected.map((x) => [x.id, x.reason]));
  assert.equal(rej.c03, 'title_excluded'); assert.equal(rej.c06, 'duplicate_contact'); assert.equal(rej.c07, 'contact_cap_per_account');
  assert.deepEqual(o.contacts.suppressed.map((x) => x.id), ['c12']);
  assert(!o.assignments.some((a) => a.contactId === 'c12'));
  assert(!o.quotes.some((q) => q.targetIds.includes('a07')), 'opposed account is never sent to a paid provider');
});

// ── Cost control ──
test('enrichment: only missing data is quoted, failures are not repaid, nothing is spent', () => {
  const o = run();
  const [ext, mob] = o.quotes;
  assert.deepEqual(ext.targetIds, ['a15']); assert.deepEqual(mob.targetIds, ['c15']);
  assert(o.enrichmentSkipped.some((x) => x.id === 'a16' && x.reason === 'previous_failure_not_repaid'));
  assert(o.enrichmentSkipped.some((x) => x.id === 'c16'));
  assert(o.quotes.every((q) => q.state === 'approval_required' && !q.executionAllowed && !q.countVerifiedWithProvider));
  assert.equal(o.guarantees.spendCents, 0); assert.equal(o.metrics.actualSpendCents, 0);
});

test('phone checks: foreign numbers and numbers shared across companies go to review', () => {
  const x = make(); x.data.contacts.find((c) => c.id === 'c09').phone = x.data.contacts.find((c) => c.id === 'c02').phone;
  const o = run(x);
  assert(o.phoneReview.some((p) => p.id === 'c17' && p.reason === 'foreign_number_returned'));
  assert(o.phoneReview.some((p) => p.id === 'c09' && p.reason === 'shared_number_across_accounts'));
  assert(!assigned(o, 'c09'));
});

test('insufficient balance blocks the quote', () => {
  const x = make(); x.config.budget.providers.mobile_enrichment.balanceCents = 10;
  assert.equal(run(x).quotes[1].state, 'insufficient_balance');
});

// ── MATCH ──
test('offer matching is explainable and keeps continuity with promised follow-ups', () => {
  const o = run();
  const m = o.offerMatches.find((x) => x.contactId === 'c01');
  assert.equal(m.bestOfferId, 'robot-cleaning'); assert.equal(m.reason, 'continuity_with_promised_follow_up');
  for (const f of m.fits) assert.equal(f.score, sum(f.parts));
  const c10 = o.offerMatches.find((x) => x.contactId === 'c10');
  assert(c10.crossSell.every((s) => s.status === 'suggestion_requires_validation'));
  assert.equal(action(o, 'c10').type, 'propose_offer');
  assert(!assigned(o, 'c10'), 'cross-sell is a suggestion, never auto-routed');
});

test('scores equal the sum of their explained contributions; missing data is flagged, not invented', () => {
  const o = run();
  for (const a of o.assignments) { assert.equal(a.priority, sum(a.priorityParts)); assert.equal(a.opportunity.score, sum(a.opportunity.parts)); assert.equal(a.salesMatch.score, sum(a.salesMatch.parts)); }
  const marc = assigned(o, 'c09');
  assert(marc.opportunity.missing.includes('intent_timing'));
  assert.equal(marc.opportunity.parts.find((p) => p.factor === 'intent_timing').points, 0);
  const noe = assigned(o, 'c05');
  assert(noe.opportunity.parts[2].ignored.some((s) => s.reason === 'unverified'), 'unverified signal ignored');
});

test('weights come from configuration, not from code', () => {
  const x = make(); x.config.weights.opportunity = { icpFit: 1, personaFit: 0, intentTiming: 0 };
  const o = run(x);
  assert.equal(assigned(o, 'c09').opportunity.score, 88);
});

// ── Promises, capacity, allocation ──
test('promised follow-ups come first, future promises wait, overdue are flagged', () => {
  const o = run();
  assert.equal(action(o, 'c22').type, 'hold');
  assert.equal(assigned(o, 'c01').repId, 'r-alex', 'owner continuity');
  const sam = o.roadmaps.find((r) => r.repId === 'r-sam');
  assert.equal(sam.items[0].action, 'followup_email'); assert.equal(sam.items[0].time, '08:00'); assert.equal(sam.overdueFollowUps, 1);
});

test('a promise that cannot be placed is escalated, never silently dropped or reassigned', () => {
  const o = run();
  const e = o.escalations.find((x) => x.contactId === 'c23');
  assert.equal(e.severity, 'high');
  assert(e.constraints.some((c) => c.repId === 'r-jordan' && c.why === 'offer_expertise_below_min'));
  assert(!assigned(o, 'c23'));
});

test('capacity, uniqueness and zero-capacity behaviour', () => {
  let o = run();
  for (const r of o.repLoad) assert(r.usedMinutes <= r.capacityMinutes);
  assert.equal(new Set(o.assignments.map((a) => a.actionId)).size, o.assignments.length);
  const x = make(); x.config.reps.forEach((r) => { r.capacityMinutes = 0; });
  o = run(x);
  assert.equal(o.assignments.length, 0);
  assert(o.escalations.some((e) => e.contactId === 'c01'), 'promises escalate when nobody has capacity');
});

test('attempt cap: three attempts in seven days put the contact on hold', () => {
  assert.equal(action(run(), 'c04').reason, 'attempt_limit_reached');
});

test('new calls never start before outboundStart', () => {
  for (const r of run().roadmaps) for (const i of r.items.filter((i) => i.action === 'call')) assert(i.time >= '09:00');
});

// ── ACTIVATE ──
test('briefs never invent a study or a reference', () => {
  const o = run();
  for (const b of o.briefs) {
    const offer = CONFIG.offers.find((x) => x.id === b.offer.id);
    const hasAsset = (offer.assets || []).some((a) => a.verified && a.status === 'approved');
    assert.equal(b.script.blocks.some((x) => x.k === 'reason_to_call'), hasAsset && !['callback', 'followup_email', 'reactivate'].includes(b.type));
    if (!hasAsset) assert(b.warnings.some((w) => w.includes('No verified Commercial Value Asset')));
    assert.equal(b.requiresHumanReview, true);
  }
  const marc = o.briefs.find((b) => b.contact.id === 'c09');
  assert.equal(marc.script.blocks.map((x) => x.k).join(','), 'intro,identity_check,legitimacy,what_we_do,reason_to_call,social_proof,ask');
  assert(marc.script.estimatedSeconds <= 26);
});

test('declared interests only shape the opening, never scores or routing', () => {
  const a = run(); const x = make(); delete x.data.contacts.find((c) => c.id === 'c01').declaredInterests;
  const b = run(x);
  assert.deepEqual(assigned(a, 'c01').priorityParts, assigned(b, 'c01').priorityParts);
});

// ── Guards ──
test('ISP guard: non-professional rep attributes are dropped and change nothing', () => {
  const x = make(); x.config.reps[0].mood = 'tired'; x.config.reps[0].age = 52;
  const o = run(x);
  assert(o.warnings.some((w) => w.code === 'rep_field_ignored' && w.fields.includes('mood') && w.fields.includes('age')));
  assert.deepEqual(o.assignments, run().assignments);
});

test('workspace separation: data from another business is refused', () => {
  const x = make(); x.data.accounts[0].workspaceId = 'ws-other';
  assert.throws(() => run(x), /WORKSPACE_MISMATCH/);
});

test('determinism: same input, same output', () => {
  assert.deepEqual(run(), run());
});

// ── Post-call ──
test('post-call: idempotent, identity guard, evidence beats notes, no writes', () => {
  const x = make(); const p = R.postCallSync(x);
  const st = Object.fromEntries(p.patches.map((q) => [q.eventId, q]));
  assert.equal(p.patches.filter((q) => q.eventId === 'e01').length, 1);
  assert.equal(st.e01.status, 'Réponse positive');
  assert(p.crmOps.some((o) => o.entity === 'deal' && o.key === 'a01:robot-cleaning' && o.op === 'create'));
  assert.equal(st.e02.status, 'Qualifié', 'a sent email not mentioned in the note prevails');
  assert.equal(st.e06.status, 'Rappeler'); assert.equal(st.e06.nextAction.type, 'verify_meeting_with_rep');
  assert(!p.crmOps.some((o) => o.entity === 'deal' && o.key.startsWith('a06')), 'no deal without calendar evidence');
  assert(p.rejected.some((r) => r.eventId === 'e07' && r.reason === 'identity_mismatch'));
  assert.equal(st.e08.suppression.durable, true);
  assert.equal(st.e09.callsIncrement, 0, 'not-called rows never get an invented call');
  assert(p.validationQueue.some((v) => v.eventId === 'e11' && v.reason === 'ambiguous_note'));
  assert(p.contradictions.some((c) => c.eventId === 'e12' && c.type === 'email_claimed_not_in_sent_box'));
  assert.equal(p.writesPerformed, 0);
  x.data.postCall.processedEventIds = p.processedEventIds;
  assert.equal(R.postCallSync(x).patches.length, 0, 'rerun creates nothing');
});

test('note classifier covers the field vocabulary', () => {
  const cases = { 'Messagerie': 'Rappeler', 'mauvais interlocuteur': 'Réponse négative', 'Intéressé': 'Qualifié', 'Demande un email': 'Qualifié',
    'Rappel jeudi': 'Rappeler', 'Rendez-vous confirmé': 'Réponse positive', 'Ne plus contacter': 'Ne pas contacter', 'pas intéressé': 'Réponse négative', 'plus en poste': 'Ne pas contacter', 'bof': 'À valider' };
  for (const [note, status] of Object.entries(cases)) assert.equal(R.classifyNote(note).status, status, note);
});

// ── Adapters & modes ──
test('modes: mock and dry-run never spend or call out; live is refused without approval and adapter', () => {
  const o = run(); const q = o.quotes[1];
  const cfg = structuredClone(CONFIG);
  assert.equal(A.executeQuote({ ...cfg, mode: 'mock' }, q).spentCents, 0);
  assert.equal(A.executeQuote({ ...cfg, mode: 'dry-run' }, q).externalCalls, 0);
  assert.throws(() => A.executeQuote({ ...cfg, mode: 'live' }, q), /NOT_APPROVED/);
  assert.throws(() => A.executeQuote({ ...cfg, mode: 'live', approvals: { approvedQuoteIds: [q.id] } }, { ...q, state: 'approved' }), /LIVE_ADAPTER_NOT_IMPLEMENTED/);
  assert.equal(A.applyCrmOps({ ...cfg, mode: 'dry-run' }, R.postCallSync(make())).writesPerformed, 0);
});

// ── n8n parity ──
test('generated n8n workflows run the same engine (mocked $input)', () => {
  const runWf = (file) => {
    const w = require(file); let items = [];
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) items = new Function('$input', n.parameters.jsCode)({ first: () => items[0], all: () => items });
    return items;
  };
  const daily = runWf('../workflows/rubicon-daily.n8n.json');
  assert.equal(daily.length, CONFIG.reps.length);
  const expected = R.runDaily({ config: CONFIG, data: { ...DATA, postCall: undefined } });
  assert.deepEqual(JSON.parse(JSON.stringify(daily[0].json.items)), JSON.parse(JSON.stringify(expected.roadmaps[0].items)));
  const post = runWf('../workflows/rubicon-postcall.n8n.json');
  assert.equal(post.at(-1).json.lane, 'summary'); assert.equal(post.at(-1).json.writesPerformed, 0);
});

test('engine stays n8n-sandbox compatible (no structuredClone, no require, no I/O)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../engine/rubicon.cjs'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const banned of ['structuredClone(', 'require(', 'process.', 'fetch(']) assert(!src.includes(banned), banned);
});
