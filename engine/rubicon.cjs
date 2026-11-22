/*
 * RUBICON — GTM Engineering & Revenue Operating System
 * Decision Engine (single source of truth).
 *
 * This file is pure JavaScript with no dependency and no I/O. The same code
 * runs in Node.js (CLI, tests) and inside n8n Code nodes (embedded by
 * engine/build-workflows.cjs). Never fork the business rules elsewhere.
 *
 * Methodology credit: company-first qualification, role dictionaries, cost
 * gates, identity guard and evidence-checked post-call sync are adapted from
 * Outbound Blueprint by Valentin Morterol / Scalon (MIT). See
 * THIRD_PARTY_NOTICE.md. Scoring, matching, allocation, NBA, roadmap and
 * briefs are RUBICON's own implementation. Weights are configurable
 * hypotheses, not validated results.
 */
const RUBICON = (() => {
  'use strict';

  const ENGINE_VERSION = '1.0.0';
  const DAY = 86400000;

  // ───────────────────────────── utilities ─────────────────────────────
  const norm = (v) => String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

  function normDomain(v) {
    if (!v) return '';
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v);
      return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch { return ''; }
  }

  function normProfile(v) {
    if (!v) return '';
    try {
      const u = new URL(v);
      return (u.hostname.replace(/^www\./, '') + decodeURIComponent(u.pathname)).toLowerCase().replace(/\/+$/, '');
    } catch { return ''; }
  }

  const clamp = (x, max = 100) => Math.max(0, Math.min(max, Number(x) || 0));
  const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const byId = (list) => new Map((list || []).map((x) => [x.id, x]));

  function hash(s) { // deterministic, non-cryptographic (IDs only)
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  // Time-zone helpers (no library: Intl is available in Node and n8n).
  function tzParts(ms, tz) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, weekday: p.weekday };
  }
  function tzOffsetMs(ms, tz) {
    const p = tzParts(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / 60000) * 60000;
  }
  function localDay(ms, tz) { // { date:'YYYY-MM-DD', startMs, endMs }
    const p = tzParts(ms, tz);
    const startMs = Date.UTC(p.y, p.m - 1, p.d) - tzOffsetMs(ms, tz);
    const date = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    return { date, startMs, endMs: startMs + DAY - 1, weekday: p.weekday };
  }
  const localHHMM = (ms, tz) => { const p = tzParts(ms, tz); return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`; };
  const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  function nextBusinessDays(ms, tz, n) {
    const out = []; let t = localDay(ms, tz).startMs + DAY / 2;
    while (out.length < n) {
      t += DAY;
      const dow = new Date(localDay(t, tz).date + 'T12:00:00Z').getUTCDay();
      if (dow !== 0 && dow !== 6) out.push({ date: localDay(t, tz).date, label: FR_DAYS[dow] });
    }
    return out;
  }

  // ───────────────────────────── input guards ─────────────────────────────
  // Ideal Sales Profile: professional dimensions only. Anything else
  // (age, mood, health, family, inferred personality...) is dropped.
  const REP_ALLOWED = new Set(['id', 'name', 'level', 'languages', 'offerExpertise', 'industryExpertise',
    'taskPreferences', 'capacityMinutes', 'available', 'objectives', 'maxComplexity', 'accountRelationships',
    'excludedAccountIds', 'prefersBlockMinutes', 'workspaceId']);

  const VERDICTS = { 'oui': 'oui', 'oui, en partie': 'oui_partiel', 'oui en partie': 'oui_partiel', 'oui partiel': 'oui_partiel',
    'oui_partiel': 'oui_partiel', 'partiel': 'partiel', 'indirect': 'indirect', 'non': 'non', 'inconnu': 'inconnu', '': 'inconnu' };

  function prepare(input) {
    const clone = (x) => JSON.parse(JSON.stringify(x)); // portable: n8n's Code sandbox has no structuredClone
    const cfg = clone(input.config);
    const data = clone(input.data);
    const ws = cfg.workspace?.id;
    if (!ws) throw new Error('CONFIG_ERROR: workspace.id is required');
    if (!['mock', 'dry-run', 'live'].includes(cfg.mode)) throw new Error('CONFIG_ERROR: mode must be mock, dry-run or live');
    const warnings = [];
    for (const kind of ['accounts', 'contacts']) {
      const foreign = (data[kind] || []).filter((x) => x.workspaceId && x.workspaceId !== ws);
      if (foreign.length) throw new Error(`WORKSPACE_MISMATCH: ${foreign.length} ${kind} belong to another workspace. Data from separate businesses is never merged without an explicit rule.`);
    }
    cfg.reps = (cfg.reps || []).map((r) => {
      const dropped = Object.keys(r).filter((k) => !REP_ALLOWED.has(k));
      if (dropped.length) warnings.push({ code: 'rep_field_ignored', repId: r.id, fields: dropped, why: 'Only declared professional dimensions are used. No psychological or sensitive attribute.' });
      return Object.fromEntries(Object.entries(r).filter(([k]) => REP_ALLOWED.has(k)));
    });
    const runAtMs = Date.parse(cfg.runAt);
    if (!isNum(runAtMs)) throw new Error('CONFIG_ERROR: runAt must be an ISO date');
    const tz = cfg.workspace.timezone || 'Europe/Paris';
    return { cfg, data, ctx: { runAtMs, tz, today: localDay(runAtMs, tz) }, warnings, trace: [] };
  }

  const stageLog = (s, stage, summary) => s.trace.push({ stage, ...summary });

  // ─────────────────── L1 · normalisation & deduplication ───────────────────
  function normalizeAccounts(s) {
    const seenDomain = new Map(), seenSiren = new Map(), accounts = [], duplicates = [];
    for (const raw of s.data.accounts || []) {
      const a = { ...raw, domain: normDomain(raw.domain || raw.website), verdict: VERDICTS[norm(raw.verdict)] ?? 'inconnu' };
      const sirenKey = a.siren ? String(a.siren).replace(/\s/g, '') : '';
      const prevBySiren = sirenKey && seenSiren.get(sirenKey);
      const prevByDomain = a.domain && seenDomain.get(a.domain);
      if (prevBySiren && (!a.siret || a.siret === prevBySiren.siret)) { duplicates.push({ id: a.id, duplicateOf: prevBySiren.id, key: 'siren' }); continue; }
      if (prevByDomain) {
        // Same domain is a merge hint, not proof: two establishments (SIRET) of a chain share a domain.
        if (a.siret && prevByDomain.siret && a.siret !== prevByDomain.siret) a.sameDomainAs = prevByDomain.id;
        else { duplicates.push({ id: a.id, duplicateOf: prevByDomain.id, key: 'domain' }); continue; }
      }
      if (a.domain) seenDomain.set(a.domain, a);
      if (sirenKey) seenSiren.set(sirenKey, a);
      accounts.push(a);
    }
    s.accounts = accounts; s.duplicateAccounts = duplicates;
    stageLog(s, 'L1_normalize', { imported: (s.data.accounts || []).length, kept: accounts.length, duplicates: duplicates.length });
    return s;
  }

  // ─────────────────── L2 · company qualification (ICP gate) ───────────────────
  function qualifyAccounts(s) {
    const t = s.cfg.thresholds, ap = s.cfg.approvals || {};
    const eligible = [], validation = [], excluded = [];
    for (const a of s.accounts) {
      let lane = 'eligible', reason = null;
      if (a.doNotContact) { lane = 'excluded'; reason = 'account_opposition'; }
      else if (a.competitor) { lane = 'excluded'; reason = 'competitor'; }
      else if (a.verdict === 'non') { lane = 'excluded'; reason = 'verdict_non'; }
      else if (a.customerType === 'b2c') { lane = 'excluded'; reason = 'b2c_only'; }
      else if (a.verdict === 'inconnu') { lane = 'validation'; reason = 'verdict_inconnu'; }
      else if (a.verdict === 'partiel' || a.verdict === 'indirect') { lane = 'validation'; reason = 'verdict_' + a.verdict + '_separate_lane'; }
      else if (!a.summary || norm(a.summary) === 'inconnu') { lane = 'validation'; reason = 'missing_summary'; }
      else if (!a.sources || !a.sources.length) { lane = 'validation'; reason = 'missing_source'; }
      else if (!isNum(a.icpFit)) { lane = 'validation'; reason = 'missing_icp_fit'; }
      else if (a.icpFit < t.minIcpFit) { lane = 'excluded'; reason = 'icp_fit_below_threshold'; }
      else if (!ap.accountReviewDone || !(ap.approvedAccountIds || []).includes(a.id)) { lane = 'validation'; reason = 'awaiting_human_review'; }
      const row = { id: a.id, name: a.name, reason, verdict: a.verdict };
      if (lane === 'eligible') eligible.push(a); else if (lane === 'validation') validation.push(row); else excluded.push(row);
    }
    s.eligibleAccounts = eligible; s.accountValidation = validation; s.excludedAccounts = excluded;
    // First-batch control: never scale a campaign before a human has reviewed a sample.
    s.firstBatchReview = ap.accountReviewDone ? null : {
      size: Math.min(t.firstBatchReviewSize, validation.length), ids: validation.slice(0, t.firstBatchReviewSize).map((x) => x.id),
      instruction: 'Review summaries and verdicts of this batch before any enrichment or larger import.' };
    stageLog(s, 'L2_account_qualification', { eligible: eligible.length, validation: validation.length, excluded: excluded.length });
    return s;
  }

  // ─────────────────── L3 · contact qualification ───────────────────
  function buyingRole(title, d) {
    const t = ' ' + norm(title) + ' ';
    const hit = (x) => t.includes(' ' + norm(x) + ' ');
    if ((d.exclude || []).some(hit)) return { role: null, reason: 'title_excluded' };
    if ((d.excludeGeo || []).some((x) => t.includes(norm(x)))) return { role: null, reason: 'geo_excluded' };
    for (const [role, titles] of Object.entries(d.ranks || {})) {
      if (titles.some(hit)) {
        if ((d.disabledRoles || []).includes(role)) return { role: null, reason: 'role_disabled_' + role };
        return { role, reason: null };
      }
    }
    return { role: null, reason: 'title_not_in_dictionary' };
  }

  function qualifyContacts(s) {
    const t = s.cfg.thresholds, d = s.cfg.dictionary, accounts = byId(s.eligibleAccounts);
    const seenP = new Set(), seenN = new Set(), valid = [], rejected = [], suppressed = [];
    for (const c of s.data.contacts || []) {
      const a = accounts.get(c.accountId);
      if (!c.accountId) { rejected.push({ id: c.id, reason: 'no_account' }); continue; }
      if (c.optOut) { suppressed.push({ id: c.id, accountId: c.accountId, reason: 'opt_out' }); continue; }
      if (!a) { rejected.push({ id: c.id, reason: 'account_not_eligible' }); continue; }
      const { role, reason } = buyingRole(c.title, d);
      if (!role) { rejected.push({ id: c.id, reason }); continue; }
      const p = normProfile(c.profileUrl), n = `${norm(c.firstName)}|${norm(c.lastName)}|${a.domain}`;
      if ((p && seenP.has(p)) || seenN.has(n)) { rejected.push({ id: c.id, reason: 'duplicate_contact' }); continue; }
      if (p) seenP.add(p); seenN.add(n);
      valid.push({ ...c, buyingRole: role });
    }
    const selected = [];
    for (const a of s.eligibleAccounts) {
      const team = a.relevantTeamSize ?? a.size ?? 0;
      const order = team < 10 ? ['economic_buyer', 'decision_maker', 'champion', 'end_user'] : ['decision_maker', 'economic_buyer', 'champion', 'end_user'];
      const cands = valid.filter((c) => c.accountId === a.id).sort((x, y) =>
        Number(!!y.ownerId || !!y.followUp) - Number(!!x.ownerId || !!x.followUp)
        || order.indexOf(x.buyingRole) - order.indexOf(y.buyingRole) || String(x.id).localeCompare(String(y.id)));
      const cap = team > t.largeTeamThreshold ? t.largeTeamContactCap : t.maxContactsPerAccount;
      selected.push(...cands.slice(0, cap));
      for (const c of cands.slice(cap)) rejected.push({ id: c.id, reason: 'contact_cap_per_account' });
    }
    s.selectedContacts = selected; s.rejectedContacts = rejected; s.suppressedContacts = suppressed;
    stageLog(s, 'L3_contact_qualification', { selected: selected.length, rejected: rejected.length, suppressed: suppressed.length });
    return s;
  }

  // ─────────────────── L4 · progressive (waterfall) enrichment plan ───────────────────
  function enrichmentPlan(s) {
    const cfg = s.cfg, log = s.data.enrichmentLog || [], ws = cfg.workspace;
    const failed = (kind, id) => log.some((e) => e.kind === kind && e.targetId === id && e.result === 'not_found');
    const withContact = new Set(s.selectedContacts.map((c) => c.accountId));
    const blocked = new Set(s.suppressedContacts.map((c) => c.accountId));
    const skipped = [], phoneReview = [];
    const extractIds = [];
    for (const a of s.eligibleAccounts) {
      if (withContact.has(a.id) || blocked.has(a.id)) continue;
      if (failed('contact_extraction', a.id)) skipped.push({ id: a.id, kind: 'contact_extraction', reason: 'previous_failure_not_repaid' });
      else extractIds.push(a.id);
    }
    const mobileIds = [];
    const phones = new Map();
    for (const c of s.selectedContacts) {
      if (c.phone) {
        if (c.phoneCountry && c.phoneCountry !== ws.country) phoneReview.push({ id: c.id, reason: 'foreign_number_returned' });
        else if (c.phoneType === 'personal') phoneReview.push({ id: c.id, reason: 'personal_number_review' });
        const key = String(c.phone).replace(/\D/g, '');
        if (phones.has(key) && phones.get(key).accountId !== c.accountId) {
          phoneReview.push({ id: c.id, reason: 'shared_number_across_accounts', with: phones.get(key).id });
          phoneReview.push({ id: phones.get(key).id, reason: 'shared_number_across_accounts', with: c.id });
        }
        phones.set(key, c);
        continue;
      }
      if (c.channel === 'email') continue;
      if (failed('mobile_enrichment', c.id)) skipped.push({ id: c.id, kind: 'mobile_enrichment', reason: 'previous_failure_not_repaid' });
      else mobileIds.push(c.id);
    }
    const quote = (kind, ids, units) => {
      const p = cfg.budget.providers[kind];
      const maxCostCents = units * p.unitCents;
      const id = `Q-${kind}-${hash(cfg.ruleVersion + ids.join(','))}`;
      const approved = (cfg.approvals?.approvedQuoteIds || []).includes(id);
      const state = !ids.length ? 'not_needed' : maxCostCents > p.balanceCents ? 'insufficient_balance' : approved ? 'approved' : 'approval_required';
      return { id, kind, provider: p.provider, billing: p.billing, targetIds: ids, targets: ids.length, units, unitCents: p.unitCents,
        maxCostCents, balanceCents: p.balanceCents, expectedReturn: { value: round(units * (p.expectedHitRate ?? 0), 0), basis: `hypothesis: ${p.expectedHitRate ?? 0} hit rate, not a provider count` },
        state, executionAllowed: s.cfg.mode === 'live' && state === 'approved', countVerifiedWithProvider: false };
    };
    s.quotes = [
      quote('contact_extraction', extractIds, extractIds.length * cfg.thresholds.maxContactsPerAccount),
      quote('mobile_enrichment', mobileIds, mobileIds.length),
    ];
    s.enrichmentSkipped = skipped; s.phoneReview = phoneReview;
    s.waterfall = s.selectedContacts.map((c) => ({ id: c.id, level: c.phone || c.channel === 'email' ? 'L4_reachable' : 'L3_qualified_contact', missing: c.phone || c.channel === 'email' ? [] : ['phone'] }));
    stageLog(s, 'L4_enrichment_plan', { extractionTargets: extractIds.length, mobileTargets: mobileIds.length, skipped: skipped.length, phoneReview: phoneReview.length, spendCents: 0 });
    return s;
  }

  // ─────────────────── MATCH · offer matching (IOP) ───────────────────
  function offerFit(offer, account, contact, w) {
    const accountProblems = (account.problems || []).filter((p) => p.evidenceId).map((p) => p.key);
    const matched = (offer.problemsSolved || []).filter((p) => accountProblems.includes(p));
    const problem = accountProblems.length ? Math.min(1, matched.length / Math.max(1, Math.min(2, offer.problemsSolved.length))) : null;
    const sector = (offer.icpSectors || []).includes(account.sector) ? 1 : 0;
    const persona = (offer.personas || []).includes(contact.buyingRole) ? 1 : 0;
    const parts = [
      { factor: 'problem_fit', value: problem, weight: w.problem, points: round(100 * w.problem * (problem ?? 0)), note: problem === null ? 'no verified problem on account (missing, not negative)' : `matched: ${matched.join(', ') || 'none'}` },
      { factor: 'sector_fit', value: sector, weight: w.sector, points: round(100 * w.sector * sector) },
      { factor: 'persona_fit', value: persona, weight: w.persona, points: round(100 * w.persona * persona), note: contact.buyingRole },
    ];
    return { offerId: offer.id, score: round(parts.reduce((x, p) => x + p.points, 0)), parts, matchedProblems: matched, missing: problem === null ? ['problem_evidence'] : [] };
  }

  function matchOffers(s) {
    const w = s.cfg.weights.offerFit, t = s.cfg.thresholds;
    const offers = (s.cfg.offers || []).filter((o) => o.active !== false), accounts = byId(s.eligibleAccounts);
    s.offerMatches = [];
    for (const c of s.selectedContacts) {
      const a = accounts.get(c.accountId);
      const fits = offers.map((o) => offerFit(o, a, c, w)).sort((x, y) => y.score - x.score || x.offerId.localeCompare(y.offerId));
      const locked = c.followUp?.offerId && offers.find((o) => o.id === c.followUp.offerId);
      const owned = new Set(a.ownedOfferIds || []);
      const best = locked ? fits.find((f) => f.offerId === locked.id) : fits.find((f) => f.score >= t.minOfferFit && !owned.has(f.offerId));
      const bestOffer = best && offers.find((o) => o.id === best.offerId);
      const crossSell = !bestOffer ? [] : fits.filter((f) => f.offerId !== best.offerId && f.score >= t.minOfferFit && !owned.has(f.offerId)
        && (owned.size > 0 || ((bestOffer.complementary || []).includes(f.offerId) && f.matchedProblems.length > 0)))
        .map((f) => ({ offerId: f.offerId, score: f.score, status: 'suggestion_requires_validation' }));
      s.offerMatches.push({ contactId: c.id, accountId: a.id, bestOfferId: best?.offerId ?? null, reason: locked ? 'continuity_with_promised_follow_up' : best ? 'highest_fit_above_threshold' : 'no_offer_above_threshold', fits, crossSell });
    }
    stageLog(s, 'MATCH_offers', { matched: s.offerMatches.filter((m) => m.bestOfferId).length, noFit: s.offerMatches.filter((m) => !m.bestOfferId).length, crossSellSuggestions: s.offerMatches.reduce((n, m) => n + m.crossSell.length, 0) });
    return s;
  }

  // ─────────────────── Opportunity score, ITW and Next Best Action ───────────────────
  function intentTiming(account, contact, s) {
    const cfg = s.cfg, now = s.ctx.runAtMs, maxAge = cfg.signals.maxAgeDays * DAY;
    const used = [], ignored = [];
    let pts = 0;
    for (const sig of [...(account.signals || []), ...(contact.signals || [])]) {
      const at = Date.parse(sig.date), wgt = cfg.signals.weights[sig.type];
      if (!sig.verified || !sig.sourceId) { ignored.push({ type: sig.type, reason: 'unverified' }); continue; }
      if (!isNum(at) || at > now || now - at > maxAge) { ignored.push({ type: sig.type, reason: 'expired_or_future' }); continue; }
      if (!wgt) { ignored.push({ type: sig.type, reason: 'unknown_signal_type' }); continue; }
      const decay = 1 - 0.5 * ((now - at) / maxAge);
      pts += wgt * decay; used.push({ type: sig.type, points: round(wgt * decay), sourceId: sig.sourceId });
    }
    if (contact.followUp?.dueAt && Date.parse(contact.followUp.dueAt) <= s.ctx.today.endMs) {
      pts += cfg.signals.weights.promised_follow_up; used.push({ type: 'promised_follow_up', points: cfg.signals.weights.promised_follow_up, sourceId: contact.followUp.sourceId || 'interaction' });
    }
    return { value: used.length ? round(clamp(pts)) : null, used, ignored };
  }

  function scoreOpportunity(a, c, s) {
    const w = s.cfg.weights.opportunity;
    const icp = isNum(a.icpFit) ? clamp(a.icpFit) : null;
    const persona = isNum(c.personaFit) ? clamp(c.personaFit) : s.cfg.personaScores[c.buyingRole] ?? null;
    const it = intentTiming(a, c, s);
    const parts = [
      { factor: 'icp_fit', value: icp, weight: w.icpFit, points: round(w.icpFit * (icp ?? 0)) },
      { factor: 'persona_fit', value: persona, weight: w.personaFit, points: round(w.personaFit * (persona ?? 0)) },
      { factor: 'intent_timing', value: it.value, weight: w.intentTiming, points: round(w.intentTiming * (it.value ?? 0)), signals: it.used, ignored: it.ignored },
    ];
    const missing = parts.filter((p) => p.value === null).map((p) => p.factor);
    return { score: round(parts.reduce((x, p) => x + p.points, 0)), parts, missing,
      dataCompleteness: round((3 - missing.length) / 3), note: missing.length ? 'Missing components contribute 0 and are flagged: absence of signal is not evidence of low intent.' : null };
  }

  function timingWindow(a, c, s) {
    const due = c.followUp?.dueAt ? Date.parse(c.followUp.dueAt) : null, today = s.ctx.today;
    const month = Number(today.date.slice(5, 7));
    const offer = (s.cfg.offers || []).find((o) => o.id === c._offerId);
    const inSeason = offer?.seasonalityMonths ? offer.seasonalityMonths.includes(month) : null;
    const renewal = a.contractRenewalDate ? Date.parse(a.contractRenewalDate) : null;
    return {
      promisedAt: due ? c.followUp.dueAt : null,
      status: due === null ? 'open' : due > today.endMs ? 'future_promise' : due < today.startMs ? 'overdue_promise' : 'due_today',
      inSeason, renewalWithin90Days: renewal ? renewal - s.ctx.runAtMs <= 90 * DAY && renewal >= s.ctx.runAtMs : null,
      businessHours: `${s.cfg.schedule.dayStart}-${s.cfg.schedule.dayEnd} ${s.ctx.tz}`,
    };
  }

  function nextBestActions(s) {
    const t = s.cfg.thresholds, now = s.ctx.runAtMs, accounts = byId(s.eligibleAccounts), offers = byId(s.cfg.offers);
    const matches = new Map(s.offerMatches.map((m) => [m.contactId, m]));
    const phoneIssue = new Map(s.phoneReview.map((p) => [p.id, p.reason]));
    const mobileQuote = s.quotes.find((q) => q.kind === 'mobile_enrichment');
    const failedMobile = new Set(s.enrichmentSkipped.filter((x) => x.kind === 'mobile_enrichment').map((x) => x.id));
    const meetings = s.data.meetings || [];
    s.actions = [];
    for (const c of s.selectedContacts) {
      const a = accounts.get(c.accountId), m = matches.get(c.id);
      c._offerId = m.bestOfferId;
      const opp = scoreOpportunity(a, c, s), itw = timingWindow(a, c, s);
      const recent = (c.attempts || []).filter((x) => { const at = Date.parse(x); return at <= now && at > now - t.attemptWindowDays * DAY; }).length;
      const lastAt = c.lastInteraction?.at ? Date.parse(c.lastInteraction.at) : null;
      const meeting = meetings.find((x) => x.contactId === c.id && x.confirmed && Date.parse(x.start) >= now && Date.parse(x.start) - now <= 2 * DAY);
      let type, reason;
      if (!m.bestOfferId) { type = 'qualify'; reason = 'no_offer_above_threshold'; }
      else if (meeting) { type = 'prepare_meeting'; reason = `meeting ${meeting.start}`; }
      else if (itw.status === 'future_promise') { type = 'hold'; reason = `promised for ${c.followUp.dueAt}`; }
      else if (itw.status === 'due_today' || itw.status === 'overdue_promise') { type = c.followUp.channel === 'email' ? 'followup_email' : 'callback'; reason = itw.status; }
      else if (phoneIssue.has(c.id)) { type = 'qualify'; reason = phoneIssue.get(c.id); }
      else if (!c.phone && c.channel !== 'email' && failedMobile.has(c.id)) { type = 'qualify'; reason = 'previous_enrichment_failed_manual_research'; }
      else if (!c.phone && c.channel !== 'email') { type = 'enrich'; reason = `awaiting quote ${mobileQuote.id} (${mobileQuote.state})`; }
      else if (recent >= t.maxAttempts) { type = 'hold'; reason = 'attempt_limit_reached'; }
      else if (lastAt && now - lastAt > t.reactivationDays * DAY && ['Qualifié', 'Réponse positive'].includes(c.lastInteraction.status)) { type = 'reactivate'; reason = 'dormant_qualified_contact'; }
      else if (a.isCustomer && m.crossSell.length) { type = 'propose_offer'; reason = 'cross_sell_suggestion_requires_validation'; }
      else if (opp.score >= t.minOpportunityScore) { type = c.channel === 'email' ? 'send_email' : 'call'; reason = 'opportunity_above_threshold'; }
      else { type = 'hold'; reason = 'opportunity_below_threshold'; }
      s.actions.push({ id: `A-${s.ctx.today.date}-${c.id}-${type}`, type, reason, contactId: c.id, accountId: a.id, offerId: m.bestOfferId,
        offerName: offers.get(m.bestOfferId)?.name ?? null, opportunity: opp, timing: itw, complexity: c.complexity ?? 1,
        dueAtMs: itw.promisedAt ? Date.parse(itw.promisedAt) : null, ownerId: c.ownerId ?? null, language: c.language ?? s.cfg.workspace.language });
    }
    for (const x of s.suppressedContacts) s.actions.push({ id: `A-${s.ctx.today.date}-${x.id}-do_not_contact`, type: 'do_not_contact', reason: x.reason, contactId: x.id, accountId: x.accountId });
    const counts = {}; for (const a of s.actions) counts[a.type] = (counts[a.type] || 0) + 1;
    stageLog(s, 'NBA', counts);
    return s;
  }

  // ─────────────────── MATCH · sales matching (ISP) & allocation ───────────────────
  const ROUTABLE = { callback: 'callback', followup_email: 'followup_email', call: 'new_call', send_email: 'followup_email', reactivate: 'callback', prepare_meeting: 'prepare_meeting' };

  function salesMatch(rep, action, account, s) {
    const w = s.cfg.weights.salesMatch;
    const offer = clamp(rep.offerExpertise?.[action.offerId]);
    const industry = clamp(rep.industryExpertise?.[account.sector]);
    const pref = clamp(rep.taskPreferences?.[ROUTABLE[action.type]] ?? 50);
    const parts = [
      { factor: 'offer_expertise', value: offer, weight: w.offerExpertise, points: round(w.offerExpertise * offer) },
      { factor: 'industry_expertise', value: industry, weight: w.industryExpertise, points: round(w.industryExpertise * industry) },
      { factor: 'declared_task_preference', value: pref, weight: w.taskPreference, points: round(w.taskPreference * pref), note: rep.taskPreferences?.[ROUTABLE[action.type]] === undefined ? 'not declared, neutral 50' : 'declared by rep' },
    ];
    return { score: round(parts.reduce((x, p) => x + p.points, 0)), parts };
  }

  function goalGap(rep) {
    const o = rep.objectives || {};
    if (!isNum(o.qualifiedConversationsTarget) || o.qualifiedConversationsTarget <= 0) return 0;
    return clamp((o.qualifiedConversationsTarget - (o.qualifiedConversationsDone || 0)) / o.qualifiedConversationsTarget, 1);
  }

  function allocate(s) {
    const cfg = s.cfg, t = cfg.thresholds, w = cfg.weights.priority, dur = cfg.schedule.durations, accounts = byId(s.eligibleAccounts);
    const reps = cfg.reps.filter((r) => r.available !== false).map((r) => ({ ...r, remaining: r.capacityMinutes }));
    const allReps = byId(cfg.reps);
    const tasks = s.actions.filter((a) => ROUTABLE[a.type]).map((a) => ({ ...a, minutes: dur[ROUTABLE[a.type]] ?? 15, promised: a.dueAtMs !== null }));
    // Promises first (oldest due first), then meetings, then value. Constraints are applied before priority.
    tasks.sort((x, y) => Number(y.promised) - Number(x.promised) || (x.promised && y.promised ? x.dueAtMs - y.dueAtMs : 0)
      || Number(y.type === 'prepare_meeting') - Number(x.type === 'prepare_meeting') || y.opportunity.score - x.opportunity.score || x.contactId.localeCompare(y.contactId));
    const assignments = [], escalations = [], unassigned = [];
    for (const task of tasks) {
      const a = accounts.get(task.accountId), rejected = [];
      const eligible = reps.filter((r) => {
        const why = r.remaining < task.minutes ? 'capacity' : (r.offerExpertise?.[task.offerId] ?? 0) < t.minOfferExpertise ? 'offer_expertise_below_min'
          : (r.maxComplexity ?? 3) < task.complexity ? 'complexity' : task.language && r.languages && !r.languages.includes(task.language) ? 'language'
          : (r.excludedAccountIds || []).includes(task.accountId) ? 'account_exclusion' : task.ownerId && task.ownerId !== r.id ? 'owned_by_other_rep' : null;
        if (why) rejected.push({ repId: r.id, why });
        return !why;
      });
      if (!eligible.length) {
        const owner = task.ownerId && allReps.get(task.ownerId);
        const row = { actionId: task.id, contactId: task.contactId, type: task.type, reason: task.ownerId && (!owner || owner.available === false) ? 'owner_unavailable' : 'no_eligible_rep', constraints: rejected };
        if (task.promised) escalations.push({ ...row, severity: 'high', message: 'Promised follow-up cannot be placed today. Manager decision required, never silently dropped.' });
        else unassigned.push(row);
        continue;
      }
      const ranked = eligible.map((r) => {
        const match = salesMatch(r, task, a, s);
        const gap = task.type === 'call' ? goalGap(r) : 0;
        const overdue = task.promised && task.dueAtMs < s.ctx.today.startMs;
        const parts = [
          { factor: 'opportunity', value: task.opportunity.score, weight: w.opportunity, points: round(w.opportunity * task.opportunity.score) },
          { factor: 'sales_match', value: match.score, weight: w.salesMatch, points: round(w.salesMatch * match.score) },
          { factor: 'promised_follow_up', value: Number(task.promised), weight: w.dueBonus, points: task.promised ? w.dueBonus : 0 },
          { factor: 'overdue', value: Number(overdue), weight: w.overdueBonus, points: overdue ? w.overdueBonus : 0 },
          { factor: 'goal_gap_new_calls', value: round(gap), weight: w.goalGapBonus, points: round(w.goalGapBonus * gap) },
        ];
        return { r, match, parts, priority: round(parts.reduce((x, p) => x + p.points, 0)) };
      }).sort((x, y) => y.priority - x.priority || y.r.remaining - x.r.remaining || x.r.id.localeCompare(y.r.id));
      const best = ranked[0];
      best.r.remaining -= task.minutes;
      assignments.push({ actionId: task.id, type: task.type, contactId: task.contactId, accountId: task.accountId, offerId: task.offerId, repId: best.r.id, repName: best.r.name,
        minutes: task.minutes, promised: task.promised, dueAtMs: task.dueAtMs, priority: best.priority, priorityParts: best.parts, salesMatch: best.match, opportunity: task.opportunity,
        alternatives: ranked.slice(1).map((x) => ({ repId: x.r.id, priority: x.priority })), constraintsRejected: rejected, overridable: true });
    }
    s.assignments = assignments; s.escalations = escalations; s.unassigned = unassigned;
    s.repLoad = cfg.reps.map((r) => { const x = reps.find((y) => y.id === r.id); return { id: r.id, name: r.name, available: r.available !== false, capacityMinutes: r.capacityMinutes, usedMinutes: x ? r.capacityMinutes - x.remaining : 0 }; });
    stageLog(s, 'ALLOCATE', { assigned: assignments.length, escalations: escalations.length, unassigned: unassigned.length, method: 'deterministic greedy heuristic (not a global optimum)' });
    return s;
  }

  // ─────────────────── ACTIVATE · call preparation ───────────────────
  const words = (x) => String(x).trim().split(/\s+/).filter(Boolean).length;

  function buildBrief(asg, s) {
    const cfg = s.cfg, c = (s.data.contacts || []).find((x) => x.id === asg.contactId), a = s.eligibleAccounts.find((x) => x.id === asg.accountId);
    const offer = cfg.offers.find((o) => o.id === asg.offerId), warnings = [];
    const asset = (offer.assets || []).find((x) => x.verified && x.status === 'approved');
    const proof = (offer.socialProof || []).find((p) => p.verified && p.citationAllowed && (!p.sectors || p.sectors.includes(a.sector)));
    if (!asset) warnings.push('No verified Commercial Value Asset: the non-commercial reason to call is omitted. Do not cite any study or figure.');
    if (!proof) warnings.push('No verified, citable reference in this sector: no "we already work with" sentence.');
    const [d1, d2] = nextBusinessDays(s.ctx.runAtMs, s.ctx.tz, 2);
    let blocks;
    if (asg.type === 'callback' || asg.type === 'followup_email' || asg.type === 'reactivate') {
      const last = c.lastInteraction || {};
      blocks = [
        { k: 'intro', t: `Bonjour ${c.firstName}, ${asg.repName} de ${cfg.workspace.companyName}.` },
        { k: 'continuity', t: `Comme convenu lors de notre échange du ${last.at ? last.at.slice(0, 10) : 'dernier contact'}, je reviens vers vous${c.followUp?.promise ? ' pour ' + c.followUp.promise : ''}.` },
        { k: 'ask', t: `Est-ce que ${d1.label} ou ${d2.label} vous conviendrait pour un échange de 20 minutes ?` },
      ];
    } else {
      blocks = [
        { k: 'intro', t: `Bonjour, je suis ${asg.repName} de ${cfg.workspace.companyName}.` },
        { k: 'identity_check', t: `Vous êtes bien ${c.firstName}, ${String(c.title).toLowerCase()} chez ${a.name} ?` },
        { k: 'legitimacy', t: 'Très bien, je m\'adresse à la bonne personne.' },
        { k: 'what_we_do', t: offer.oneLiner },
        asset ? { k: 'reason_to_call', t: asset.callReason } : null,
        proof ? { k: 'social_proof', t: `On travaille déjà avec ${proof.name}.` } : null,
        { k: 'ask', t: `Je souhaiterais prendre 20 minutes avec vous pour ${offer.meetingPurpose}. Vous êtes disponible ${d1.label} ou ${d2.label} ?` },
      ].filter(Boolean);
    }
    const script = blocks.map((b) => b.t).join(' ');
    const seconds = Math.round(words(script) / (cfg.schedule.speechWordsPerSecond || 3)); // estimate only: read it aloud and time it
    if (seconds > 25) warnings.push(`Script estimated at ${seconds}s (> 25s): shorten before calling.`);
    // Icebreaker priority: last exchange > verified company signal > declared non-sensitive interest > neutral.
    const sig = (a.signals || []).filter((x) => x.verified && x.sourceId).sort((x, y) => Date.parse(y.date) - Date.parse(x.date))[0];
    const interest = (c.declaredInterests || []).find((x) => x.consentToUse && x.source === 'conversation' && !x.sensitive);
    const icebreaker = c.lastInteraction?.summary ? { basis: 'previous_interaction', text: `Reprendre : ${c.lastInteraction.summary}` }
      : sig ? { basis: 'verified_company_signal', text: `Actualité vérifiée : ${sig.label}`, sourceId: sig.sourceId }
      : interest ? { basis: 'declared_interest', text: `Sujet évoqué par ${c.firstName} : ${interest.topic}`, research: { query: `${interest.topic} actualité`, status: cfg.mode === 'live' ? 'requires_human_approval' : 'not_executed_in_' + cfg.mode }, guard: 'Opening only. Never used for scoring or routing. Never present a hypothesis as fact.' }
      : { basis: 'neutral', text: 'Ouverture neutre : vérifier l\'identité puis présenter la raison de l\'appel.' };
    return {
      id: `B-${asg.actionId}`, actionId: asg.actionId, rep: asg.repName, type: asg.type,
      account: { id: a.id, name: a.name, domain: a.domain, sector: a.sector, location: a.location, summary: a.summary, verdict: a.verdict },
      contact: { id: c.id, name: `${c.firstName} ${c.lastName}`, title: c.title, buyingRole: (s.selectedContacts.find((x) => x.id === c.id) || {}).buyingRole },
      potentialProblems: (a.problems || []).filter((p) => p.evidenceId).map((p) => ({ key: p.key, label: cfg.problemLabels?.[p.key] ?? p.key, evidenceId: p.evidenceId, status: 'hypothesis_to_validate_in_call' })),
      offer: { id: offer.id, name: offer.name }, history: c.lastInteraction || null,
      sources: [...(a.sources || []), ...(c.sources || [])], reasonForCall: asset ? asset.title : null,
      script: { text: script, blocks, estimatedSeconds: seconds }, icebreaker,
      objections: (offer.objections || []).slice(0, 5), questions: offer.discoveryQuestions || [],
      nextAction: asg.type === 'followup_email' ? 'Envoyer le complément promis (brouillon à relire, jamais envoyé automatiquement)' : 'Noter le résultat en une phrase dans Notes, puis /post-call-sync',
      warnings, requiresHumanReview: true,
    };
  }

  // ─────────────────── ACTIVATE · daily roadmap (organisational aid) ───────────────────
  function dailyRoadmap(s) {
    const cfg = s.cfg, sch = cfg.schedule, contacts = byId(s.data.contacts), accounts = byId(s.eligibleAccounts);
    s.briefs = s.assignments.map((a) => buildBrief(a, s));
    const briefByAction = new Map(s.briefs.map((b) => [b.actionId, b]));
    s.roadmaps = cfg.reps.map((rep) => {
      const mine = s.assignments.filter((x) => x.repId === rep.id);
      const items = []; let cursor = hhmmToMin(sch.dayStart);
      const line = (x, block) => {
        const c = contacts.get(x.contactId), a = accounts.get(x.accountId);
        items.push({ time: minToHHMM(cursor), block, action: x.type, minutes: x.minutes, contact: `${c.firstName} ${c.lastName}`, company: a.name, offerId: x.offerId,
          why: x.promised ? `promis ${localDay(x.dueAtMs, s.ctx.tz).date === s.ctx.today.date ? "aujourd'hui" : 'le ' + localDay(x.dueAtMs, s.ctx.tz).date} à ${localHHMM(x.dueAtMs, s.ctx.tz)} · P ${x.priority}`
            : `O ${x.opportunity.score} · M ${x.salesMatch.score} · P ${x.priority}${x.opportunity.missing.length ? ' · manque ' + x.opportunity.missing.join(',') : ''}`,
          priority: x.priority, briefId: briefByAction.get(x.actionId)?.id });
        cursor += x.minutes;
      };
      for (const x of mine.filter((m) => m.promised)) line(x, '1 · Relances promises');
      for (const x of mine.filter((m) => m.type === 'prepare_meeting')) line(x, '2 · Préparation rendez-vous');
      const prospect = mine.filter((m) => !m.promised && m.type !== 'prepare_meeting').sort((x, y) => y.priority - x.priority);
      cursor = Math.max(cursor, hhmmToMin(sch.outboundStart));
      const blockMax = rep.prefersBlockMinutes || sch.prospectingBlockMinutes; let inBlock = 0, blockNo = 1;
      for (const x of prospect) {
        if (inBlock + x.minutes > blockMax) {
          items.push({ time: minToHHMM(cursor), block: 'Pause / mise à jour des notes', action: 'admin', minutes: sch.recoveryBlockMinutes, why: 'Alternance organisationnelle déclarée, sans inférence d\'état' });
          cursor += sch.recoveryBlockMinutes; inBlock = 0; blockNo += 1;
        }
        line(x, `3 · Bloc prospection ${blockNo}`); inBlock += x.minutes;
      }
      if (mine.length) items.push({ time: minToHHMM(cursor), block: '4 · Clôture', action: 'post_call_notes', minutes: 15, why: 'Notes courtes puis /post-call-sync' });
      const overdue = mine.filter((m) => m.promised && m.dueAtMs < s.ctx.today.startMs).length;
      const endMin = hhmmToMin(sch.dayEnd);
      return { repId: rep.id, repName: rep.name, date: s.ctx.today.date, items, overdueFollowUps: overdue, plannedMinutes: mine.reduce((n, m) => n + m.minutes, 0),
        capacityMinutes: rep.capacityMinutes, fitsBeforeDayEnd: cursor <= endMin, available: rep.available !== false };
    });
    stageLog(s, 'ROADMAP', { reps: s.roadmaps.length, briefs: s.briefs.length });
    return s;
  }

  function roadmapMarkdown(out) {
    const L = [`# RUBICON · Daily Roadmap · ${out.date}`, '', `Mode: **${out.mode}** · rules ${out.ruleVersion} · engine ${out.engineVersion}`, ''];
    for (const r of out.roadmaps) {
      L.push(`## ${r.repName} — ${r.plannedMinutes}/${r.capacityMinutes} min${r.available ? '' : ' (indisponible)'}${r.overdueFollowUps ? ` · ⚠️ ${r.overdueFollowUps} relance(s) en retard` : ''}`, '');
      if (!r.items.length) { L.push('_Aucune action assignée._', ''); continue; }
      L.push('| Heure | Bloc | Action | Contact | Entreprise | Pourquoi |', '|---|---|---|---|---|---|');
      for (const i of r.items) L.push(`| ${i.time} | ${i.block} | ${i.action} | ${i.contact ?? ''} | ${i.company ?? ''} | ${i.why ?? ''} |`);
      L.push('');
    }
    if (out.escalations.length) { L.push('## ⚠️ Escalades manager', ''); for (const e of out.escalations) L.push(`- ${e.contactId} · ${e.type} · ${e.reason}`); L.push(''); }
    const toValidate = out.actions.filter((a) => a.type === 'propose_offer' || a.type === 'qualify');
    if (toValidate.length || out.accounts.validation.length) {
      L.push('## 🔎 À valider par un responsable', '');
      for (const a of toValidate) L.push(`- ${a.contactId} · ${a.type} · ${a.reason}`);
      if (out.accounts.validation.length) L.push(`- ${out.accounts.validation.length} compte(s) en file de validation (inconnu, partiel, indirect, non revus)`);
      for (const q of out.quotes.filter((x) => x.state !== 'not_needed')) L.push(`- Devis ${q.id} · ${q.kind} · ${q.targets} cible(s) · max ${(q.maxCostCents / 100).toFixed(2)} € · ${q.state}`);
      L.push('');
    }
    L.push('_Recommandations explicables et modifiables par un responsable. Aucune action n\'est exécutée automatiquement._');
    return L.join('\n');
  }

  // ─────────────────── LEARN · process metrics with explicit denominators ───────────────────
  function processMetrics(s) {
    const imported = (s.data.accounts || []).length, qualifiedPool = s.eligibleAccounts.length;
    const cents = s.quotes.reduce((n, q) => n + (q.state === 'approval_required' || q.state === 'approved' ? q.maxCostCents : 0), 0);
    const ratio = (n, d) => (d ? round(n / d, 4) : null);
    return {
      importedAccounts: imported, duplicateAccounts: s.duplicateAccounts.length,
      icpFitRate: { value: ratio(qualifiedPool, imported - s.duplicateAccounts.length), numerator: 'eligible accounts', denominator: 'imported minus duplicates' },
      validationQueue: s.accountValidation.length,
      contactCoverage: { value: ratio(new Set(s.selectedContacts.map((c) => c.accountId)).size, qualifiedPool), numerator: 'eligible accounts with ≥1 selected contact', denominator: 'eligible accounts' },
      reachableContacts: s.selectedContacts.filter((c) => c.phone || c.channel === 'email').length,
      pendingQuoteMaxCents: cents, actualSpendCents: 0,
      plannedActions: s.assignments.length, promisedFollowUpsPlaced: s.assignments.filter((a) => a.promised).length, promisedFollowUpsEscalated: s.escalations.length,
      note: 'Process metrics only. Conversion metrics need real outcomes (see sql/kpis.sql). No RUBICON performance has been measured.',
    };
  }

  // ─────────────────── entrypoints ───────────────────
  const STAGES = { normalizeAccounts, qualifyAccounts, qualifyContacts, enrichmentPlan, matchOffers, nextBestActions, allocate, dailyRoadmap };

  function finalize(s) {
    const out = {
      engineVersion: ENGINE_VERSION, ruleVersion: s.cfg.ruleVersion, mode: s.cfg.mode, workspace: s.cfg.workspace.id, date: s.ctx.today.date, runAt: s.cfg.runAt,
      roadmaps: s.roadmaps, briefs: s.briefs, assignments: s.assignments, escalations: s.escalations, unassigned: s.unassigned, repLoad: s.repLoad,
      actions: s.actions.map(({ opportunity, timing, ...x }) => ({ ...x, opportunityScore: opportunity?.score ?? null, missing: opportunity?.missing ?? [], timing })),
      offerMatches: s.offerMatches, quotes: s.quotes, enrichmentSkipped: s.enrichmentSkipped, phoneReview: s.phoneReview, waterfall: s.waterfall,
      accounts: { eligible: s.eligibleAccounts.map((a) => a.id), validation: s.accountValidation, excluded: s.excludedAccounts, duplicates: s.duplicateAccounts, firstBatchReview: s.firstBatchReview },
      contacts: { selected: s.selectedContacts.map((c) => ({ id: c.id, accountId: c.accountId, buyingRole: c.buyingRole })), rejected: s.rejectedContacts, suppressed: s.suppressedContacts },
      metrics: processMetrics(s), trace: s.trace, warnings: s.warnings,
      guarantees: { externalCalls: 0, externalWrites: 0, spendCents: 0, messagesSent: 0, humanApprovalRequiredFor: ['spend', 'messages', 'calls', 'CRM writes', 'scoring rule changes'] },
    };
    out.roadmapMarkdown = roadmapMarkdown(out);
    return out;
  }

  function runDaily(input) {
    let s = prepare(input);
    for (const f of Object.values(STAGES)) s = f(s);
    return finalize(s);
  }

  // Stage-by-stage execution for n8n: each node passes the serialisable state.
  function runStage(name, state) {
    const s = state.cfg ? state : prepare(state);
    if (name === 'prepare') return s;
    if (name === 'finalize') return finalize(s);
    if (!STAGES[name]) throw new Error('UNKNOWN_STAGE: ' + name);
    return STAGES[name](s);
  }

  // ─────────────────── post-call sync (separate workflow) ───────────────────
  const NOTE_RULES = [
    { status: 'Ne pas contacter', intent: 'opt_out', re: /(ne (plus|jamais) (me |le |la )?(contacter|appeler|rappeler)|ne plus contacter|opposition|rgpd|retirez|supprimez (mes|ses) (donnees|coordonnees)|stop)/ },
    { status: 'Ne pas contacter', intent: 'out_of_target', re: /(hors cible|plus en poste|a quitte|ligne perso|numero perso|n'est plus (dans|chez))/ },
    { status: 'Réponse négative', intent: 'wrong_person', re: /(mauvais interlocuteur|pas la bonne personne|pas le bon contact)/ },
    { status: 'Réponse négative', intent: 'negative', re: /(pas interesse|non merci|pas besoin|aucun besoin|deja equipe|pas pour nous|refus)/ },
    { status: 'Réponse positive', intent: 'meeting', re: /(rdv|rendez[- ]vous|rendezvous|reunion) ?(confirme|pris|cale|fixe|ok|le |pour |lundi|mardi|mercredi|jeudi|vendredi|demain|\d)/ },
    { status: 'Réponse positive', intent: 'asks_email_to_book', re: /(demande|veut|souhaite) (un |le )?(e-?mail|mail).{0,30}(caler|fixer|rdv|rendez)/ },
    { status: 'Qualifié', intent: 'asks_email', re: /(demande|veut|souhaite|envoyer) (un |une |le |la )?(e-?mail|mail|doc|plaquette|presentation)/ },
    { status: 'Qualifié', intent: 'interested', re: /(interesse|interessee|curieux|a voir|ouvert)/ },
    { status: 'Rappeler', intent: 'callback_requested', re: /(rappel(er|le|ez)?|recontacter) ?(le |la )?(lundi|mardi|mercredi|jeudi|vendredi|demain|semaine prochaine|plus tard|dans)/ },
    { status: 'Rappeler', intent: 'no_answer', re: /(messagerie|repondeur|pas de reponse|sans reponse|sonne dans le vide|injoignable|ligne morte|nrp|occupe|absent)/ },
  ];
  const OBJECTIONS = [
    ['price', /(cher|prix|tarif|cout|budget)/], ['incumbent', /(deja (un )?(prestataire|fournisseur|equipe|outil)|contrat en cours)/],
    ['timing', /(pas le moment|plus tard|rappeler (en|dans)|l'an prochain|apres les fetes)/], ['send_doc', /(envoyez|envoyer) (une |la )?(doc|plaquette|presentation)/],
    ['decision_elsewhere', /(siege|la direction|pas moi qui decide|groupe decide)/],
  ];

  function classifyNote(note) {
    const n = norm(note);
    const hit = NOTE_RULES.find((r) => r.re.test(n));
    const objections = OBJECTIONS.filter(([, re]) => re.test(n)).map(([k]) => k);
    const mentionsEmailSent = /(mail envoye|envoye (un |le )?mail|j'ai envoye|email envoye)/.test(n);
    return hit ? { status: hit.status, intent: hit.intent, objections, mentionsEmailSent, confidence: 'rule' } : { status: 'À valider', intent: 'ambiguous', objections, mentionsEmailSent, confidence: 'none' };
  }

  function callbackDate(note, fromMs, tz) {
    const n = norm(note), idx = FR_DAYS.findIndex((d) => n.includes(d));
    if (n.includes('demain')) return nextBusinessDays(fromMs, tz, 1)[0].date;
    if (idx < 0) return null;
    for (let i = 1; i <= 7; i++) { const d = localDay(fromMs + i * DAY, tz); if (new Date(d.date + 'T12:00:00Z').getUTCDay() === idx) return d.date; }
    return null;
  }

  function postCallSync(input) {
    const cfg = input.config, pc = input.data.postCall, tz = cfg.workspace.timezone || 'Europe/Paris';
    const contacts = byId(input.data.contacts), accounts = byId(input.data.accounts);
    const processed = new Set(pc.processedEventIds || []);
    const ev = pc.evidence || { sentEmails: [], calendarEvents: [] };
    const crm = pc.crm || { accounts: [], contacts: [], deals: [] };
    const patches = [], crmOps = [], validationQueue = [], contradictions = [], rejected = [], objections = [], skipped = [];
    const calledIds = new Set(pc.session.calledEventIds || []), dncIds = new Set(pc.session.notCalledDoNotContactEventIds || []);
    for (const e of pc.notes) {
      if (processed.has(e.eventId)) { skipped.push({ eventId: e.eventId, reason: 'already_processed' }); continue; }
      const c = contacts.get(e.contactId);
      if (!c) { rejected.push({ eventId: e.eventId, reason: 'unknown_contact_id' }); continue; }
      // Identity guard: write to a verified person, never to a row number.
      if (norm(c.firstName) !== norm(e.rowFirstName) || norm(c.lastName) !== norm(e.rowLastName)) { rejected.push({ eventId: e.eventId, contactId: c.id, reason: 'identity_mismatch', expected: `${c.firstName} ${c.lastName}`, found: `${e.rowFirstName} ${e.rowLastName}` }); continue; }
      if (!calledIds.has(e.eventId) && !dncIds.has(e.eventId)) { validationQueue.push({ eventId: e.eventId, contactId: c.id, reason: 'group_not_declared_by_user' }); continue; }
      processed.add(e.eventId);
      const a = accounts.get(c.accountId);
      if (dncIds.has(e.eventId)) { patches.push({ eventId: e.eventId, contactId: c.id, status: 'Ne pas contacter', callsIncrement: 0, lastCallAt: null, appendNote: e.note || null, suppression: { scope: 'contact', reason: 'user_marked_not_to_contact' } }); continue; }
      if (c.optOut) { skipped.push({ eventId: e.eventId, contactId: c.id, reason: 'already_suppressed_opt_out_prevails' }); continue; }
      const k = classifyNote(e.note);
      let status = k.status; const notes = [];
      if (k.objections.length) objections.push({ contactId: c.id, offerId: c.followUp?.offerId ?? e.offerId ?? null, objections: k.objections });
      const sameDay = (iso) => iso && iso.slice(0, 10) === e.calledAt.slice(0, 10);
      const email = (ev.sentEmails || []).find((m) => (m.contactId ? m.contactId === c.id : normDomain(m.toDomain) === normDomain(a?.domain)) && sameDay(m.at));
      const meeting = (ev.calendarEvents || []).find((m) => m.contactId === c.id && Date.parse(m.start) >= Date.parse(e.calledAt));
      if (k.intent === 'meeting' || k.intent === 'asks_email_to_book') {
        if (k.intent === 'meeting' && !meeting) { contradictions.push({ eventId: e.eventId, contactId: c.id, type: 'meeting_claimed_no_calendar_event' }); status = 'Rappeler'; notes.push('RDV annoncé sans événement agenda : pas de deal'); }
      }
      if (k.mentionsEmailSent && !email) { contradictions.push({ eventId: e.eventId, contactId: c.id, type: 'email_claimed_not_in_sent_box' }); validationQueue.push({ eventId: e.eventId, contactId: c.id, reason: 'confirm_email_sent' }); }
      let meetingContradiction = false;
      if (contradictions.some((x) => x.eventId === e.eventId && x.type === 'meeting_claimed_no_calendar_event')) meetingContradiction = true;
      if (k.mentionsEmailSent && email && status === 'À valider') status = 'Qualifié';
      if (k.mentionsEmailSent && !email) continue;
      if (email && !k.mentionsEmailSent && ['Rappeler', 'À valider'].includes(status)) { contradictions.push({ eventId: e.eventId, contactId: c.id, type: 'email_sent_not_in_note', resolution: 'sent email prevails' }); status = 'Qualifié'; }
      if (status === 'À valider') { validationQueue.push({ eventId: e.eventId, contactId: c.id, reason: 'ambiguous_note', note: e.note }); continue; }
      const cbDate = status === 'Rappeler' ? callbackDate(e.note, Date.parse(e.calledAt), tz) : null;
      const nextAction = meetingContradiction ? { type: 'verify_meeting_with_rep', dueDate: nextBusinessDays(Date.parse(e.calledAt), tz, 1)[0].date, promised: false }
        : status === 'Rappeler' ? { type: 'callback', dueDate: cbDate ?? nextBusinessDays(Date.parse(e.calledAt), tz, 2)[1].date, promised: !!cbDate }
        : status === 'Réponse positive' ? { type: meeting ? 'prepare_meeting' : 'book_meeting', dueDate: meeting ? meeting.start.slice(0, 10) : nextBusinessDays(Date.parse(e.calledAt), tz, 1)[0].date }
        : status === 'Qualifié' ? { type: k.intent === 'asks_email' ? 'send_requested_email' : 'follow_up', dueDate: nextBusinessDays(Date.parse(e.calledAt), tz, 1)[0].date }
        : status === 'Réponse négative' && k.intent === 'wrong_person' ? { type: 'identify_right_contact', dueDate: null } : null;
      patches.push({ eventId: e.eventId, contactId: c.id, status, intent: k.intent, callsIncrement: 1, lastCallAt: e.calledAt, lastContactAt: email && email.at > e.calledAt ? email.at : e.calledAt,
        appendNote: [e.note, ...notes].filter(Boolean).join(' | '), nextAction, suppression: k.intent === 'opt_out' ? { scope: 'contact', reason: 'prospect_opposition', durable: true } : null });
      if (k.intent === 'out_of_target') validationQueue.push({ eventId: e.eventId, contactId: c.id, reason: 'propose_extend_do_not_contact_to_account', accountId: c.accountId });
      if (['Réponse positive', 'Qualifié'].includes(status)) {
        const accKey = normDomain(a?.domain), conKey = normProfile(c.profileUrl) || `${norm(c.firstName)}|${norm(c.lastName)}|${accKey}`;
        const accCrm = crm.accounts.find((x) => x.key === accKey), conCrm = crm.contacts.find((x) => x.key === conKey);
        crmOps.push({ order: 1, entity: 'account', key: accKey, op: accCrm ? 'link_existing' : 'create', crmId: accCrm?.crmId ?? null });
        crmOps.push({ order: 2, entity: 'contact', key: conKey, op: conCrm ? 'update' : 'create', crmId: conCrm?.crmId ?? null, fields: { state: 'Qualifié', lastContact: e.calledAt.slice(0, 10), comment: e.note } });
        if (status === 'Réponse positive' && meeting) {
          const offerId = e.offerId ?? c.followUp?.offerId ?? null;
          if (!offerId) { validationQueue.push({ eventId: e.eventId, contactId: c.id, reason: 'deal_offer_unknown' }); continue; }
          const dealKey = `${c.accountId}:${offerId}`;
          const exists = crm.deals.find((x) => x.key === dealKey);
          crmOps.push({ order: 3, entity: 'deal', key: dealKey, op: exists ? 'skip_existing' : 'create', fields: { stage: '1. Prise de besoin prévue', meetingId: meeting.id } });
        }
      }
    }
    return { mode: cfg.mode, sessionId: pc.session.id, patches, crmOps, validationQueue, contradictions, rejected, skipped, objections,
      processedEventIds: [...processed], writesPerformed: 0, requiresAuthorization: true,
      summary: { notes: pc.notes.length, patched: patches.length, toValidate: validationQueue.length, contradictions: contradictions.length, rejectedByIdentityGuard: rejected.filter((r) => r.reason === 'identity_mismatch').length, dealsProposed: crmOps.filter((o) => o.entity === 'deal' && o.op === 'create').length } };
  }

  return { ENGINE_VERSION, runDaily, runStage, postCallSync, roadmapMarkdown, classifyNote, buyingRole, util: { norm, normDomain, normProfile, localDay, nextBusinessDays, hash } };
})();
/* n8n-strip-start */
if (typeof module !== 'undefined' && module.exports) module.exports = RUBICON;
/* n8n-strip-end */
