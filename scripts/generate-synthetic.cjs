#!/usr/bin/env node
/*
 * Generates a deterministic synthetic dataset (default 500 accounts) for scale demos
 * and analytics. Every name, domain and number is fictional. Outcomes are SIMULATED
 * from arbitrary hypotheses so the SQL/Python layer has something to analyse:
 * they say nothing about real conversion rates.
 *   node scripts/generate-synthetic.cjs [count] [seed]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const N = Number(process.argv[2] || 500), SEED = Number(process.argv[3] || 42);
let x = SEED;
const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const SECTORS = { fitness: ['high_cleaning_cost', 'large_floor_surface', 'night_cleaning_gaps', 'low_google_reviews'], retail: ['manual_follow_up', 'lead_leakage', 'high_cleaning_cost'],
  offices: ['cleaning_quality_complaints', 'high_cleaning_cost', 'no_crm'], hospitality: ['low_google_reviews', 'textile_hygiene', 'manual_follow_up'], local_shop: ['low_google_reviews', 'weak_local_visibility', 'no_crm'] };
const CITIES = ['Le Havre', 'Rouen', 'Caen', 'Évreux', 'Dieppe', 'Fécamp', 'Lisieux', 'Cherbourg'];
const VERDICTS = [['oui', 0.34], ['oui, en partie', 0.14], ['partiel', 0.12], ['indirect', 0.08], ['non', 0.24], ['INCONNU', 0.08]];
const FIRST = ['Camille', 'Louis', 'Manon', 'Jules', 'Chloé', 'Hugo', 'Inès', 'Léo', 'Sarah', 'Adam', 'Lucie', 'Nathan', 'Emma', 'Paul', 'Zoé', 'Yanis'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'Roux'];
const TITLES = [['Gérant', 0.3], ['Directrice des opérations', 0.15], ['Directeur commercial', 0.15], ['Fondatrice', 0.1], ['Facility Manager', 0.1], ['Stagiaire marketing', 0.08], ['Assistante administrative', 0.07], ['Responsable CRM', 0.05]];
const weighted = (pairs) => { let r = rnd(), acc = 0; for (const [v, w] of pairs) { acc += w; if (r <= acc) return v; } return pairs[pairs.length - 1][0]; };
const OFFER_BY_SECTOR = { fitness: 'robot-cleaning', retail: 'crm-automation', offices: 'facility-care', hospitality: 'review-cards', local_shop: 'review-cards' };

const accounts = [], contacts = [], outcomes = [];
for (let i = 1; i <= N; i++) {
  const sector = pick(Object.keys(SECTORS)), verdict = weighted(VERDICTS), id = `g${String(i).padStart(4, '0')}`;
  const icp = verdict === 'oui' ? 70 + Math.floor(rnd() * 30) : verdict === 'oui, en partie' ? 60 + Math.floor(rnd() * 25) : verdict === 'non' ? Math.floor(rnd() * 40) : verdict === 'INCONNU' ? null : 40 + Math.floor(rnd() * 30);
  const size = 3 + Math.floor(rnd() * 80);
  const problems = SECTORS[sector].filter(() => rnd() < 0.45).map((k, j) => ({ key: k, evidenceId: `ev-${id}-${j}` }));
  accounts.push({ id, workspaceId: 'ws-demo', name: `Entreprise Synthétique ${i}`, domain: `synth-${i}.example`, sector, location: pick(CITIES), size, relevantTeamSize: Math.max(1, Math.round(size / 3)), customerType: rnd() < 0.05 ? 'b2c' : 'b2b',
    summary: verdict === 'INCONNU' ? 'INCONNU' : `Activité synthétique (${sector}). Clients : professionnels fictifs.`, verdict, icpFit: icp, competitor: rnd() < 0.02, problems,
    signals: rnd() < 0.3 ? [{ type: pick(['new_site', 'hiring', 'contract_renewal', 'negative_review_trend']), label: 'Signal synthétique', date: `2026-${pick(['08', '09', '10', '11'])}-${String(1 + Math.floor(rnd() * 18)).padStart(2, '0')}`, verified: rnd() < 0.8, sourceId: `src-${id}-sig` }] : [],
    sources: verdict === 'INCONNU' ? [] : [{ id: `src-${id}`, url: `https://synth-${i}.example`, checkedAt: '2026-11-15' }] });
  const nContacts = rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < nContacts; k++) {
    const cid = `${id}-c${k + 1}`, hasPhone = rnd() < 0.7;
    contacts.push({ id: cid, workspaceId: 'ws-demo', accountId: id, firstName: pick(FIRST), lastName: pick(LAST), title: weighted(TITLES), profileUrl: `https://profiles.example/${cid}`,
      phone: hasPhone ? `DEMO-${cid}` : null, phoneCountry: hasPhone ? (rnd() < 0.04 ? 'BE' : 'FR') : null, optOut: rnd() < 0.02, complexity: 1 + Math.floor(rnd() * 3) });
  }
  // Simulated campaign history (for analytics only).
  if (['oui', 'oui, en partie'].includes(verdict) && nContacts) {
    const calls = 1 + Math.floor(rnd() * 3), connected = rnd() < 0.35, conversation = connected && rnd() < 0.7, meeting = conversation && rnd() < (problems.length ? 0.35 : 0.15);
    const held = meeting && rnd() < 0.8, won = held && rnd() < 0.3;
    outcomes.push({ accountId: id, contactId: `${id}-c1`, offerId: OFFER_BY_SECTOR[sector], sector, source: pick(['export-a', 'export-b', 'network']), repId: pick(['r-alex', 'r-sam', 'r-jordan']),
      calls, connected, conversation, meetingBooked: meeting, meetingHeld: held, won, wonAmountEUR: won ? 500 + Math.floor(rnd() * 4500) : 0,
      objection: conversation && !meeting ? pick(['price', 'incumbent', 'timing', 'send_doc', 'decision_elsewhere']) : null, lossReason: held && !won ? pick(['Trop cher', 'Pas le moment', 'Pas assez bien', 'Sans réponse']) : null,
      enrichmentCostCents: 2 * Math.min(2, nContacts) + 60, simulated: true });
  }
}
const outDir = path.join(__dirname, '..', 'data', 'synthetic');
fs.writeFileSync(path.join(outDir, `scale-${N}.json`), JSON.stringify({ $comment: `Synthetic, seed ${SEED}. Simulated outcomes are NOT real results.`, accounts, contacts, enrichmentLog: [] }));
fs.writeFileSync(path.join(outDir, `outcomes-${N}.json`), JSON.stringify({ $comment: 'SIMULATED outcomes for analytics demos only.', outcomes }, null, 1));
console.log(`accounts ${accounts.length} · contacts ${contacts.length} · simulated outcomes ${outcomes.length}`);
