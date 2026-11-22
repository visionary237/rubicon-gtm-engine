#!/usr/bin/env node
/*
 * RUBICON CLI
 *   node engine/cli.cjs daily    [--config f] [--data f] [--out dir] [--mode mock|dry-run|live]
 *   node engine/cli.cjs postcall [--config f] [--data f] [--out dir]
 *   node engine/cli.cjs enrich   --quote <quoteId> [--config f] [--data f]
 * Writes only to the local --out directory. Never calls a network in mock or dry-run.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const R = require('./rubicon.cjs');
const A = require('./adapters.cjs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));

const config = readJson(opt('config', 'config/demo/config.json'));
const data = readJson(opt('data', 'data/synthetic/demo-small.json'));
if (opt('mode')) config.mode = opt('mode');
const out = path.resolve(ROOT, opt('out', 'outputs/demo'));
fs.mkdirSync(out, { recursive: true });
const write = (f, c) => { fs.writeFileSync(path.join(out, f), typeof c === 'string' ? c : JSON.stringify(c, null, 2)); return path.relative(ROOT, path.join(out, f)); };

function briefsMarkdown(o) {
  const L = [`# RUBICON · Fiches d'appel · ${o.date}`, ''];
  for (const b of o.briefs) {
    L.push(`## ${b.contact.name} — ${b.account.name} (${b.type}, ${b.rep})`, '',
      `- **Fonction** : ${b.contact.title} · rôle d'achat : ${b.contact.buyingRole}`,
      `- **Activité** : ${b.account.summary}`,
      `- **Offre** : ${b.offer.name}`,
      `- **Problématiques à valider** : ${b.potentialProblems.map((p) => p.label).join(', ') || 'aucune vérifiée'}`,
      `- **Historique** : ${b.history ? `${b.history.at?.slice(0, 10)} · ${b.history.summary}` : 'premier contact'}`,
      `- **Icebreaker** (${b.icebreaker.basis}) : ${b.icebreaker.text}`,
      `- **Sources** : ${b.sources.map((s) => s.id).join(', ') || '—'}`, '',
      `> ${b.script.text}`, '', `_Durée estimée : ${b.script.estimatedSeconds} s — à lire à voix haute et chronométrer._`, '',
      '**Objections préparées**', ...b.objections.map((x) => `- ${x}`), '',
      `**Prochaine action** : ${b.nextAction}`, ...(b.warnings.length ? ['', ...b.warnings.map((w) => `> ⚠️ ${w}`)] : []), '');
  }
  return L.join('\n');
}

const files = [];
if (cmd === 'daily') {
  const o = R.runDaily({ config, data });
  files.push(write('daily-output.json', o), write('daily-roadmap.md', o.roadmapMarkdown), write('call-briefs.md', briefsMarkdown(o)));
  console.log(o.roadmapMarkdown.split('\n').slice(0, 3).join('\n'));
  console.log(`\nassigned ${o.assignments.length} · escalations ${o.escalations.length} · quotes pending ${o.quotes.filter((q) => q.state === 'approval_required').length} · spend ${o.guarantees.spendCents} cents`);
} else if (cmd === 'postcall') {
  const p = R.postCallSync({ config, data });
  const write_ = A.applyCrmOps(config, p);
  files.push(write('postcall-output.json', { ...p, crmWrite: write_ }));
  console.log(JSON.stringify(p.summary), '\n', JSON.stringify(write_));
} else if (cmd === 'enrich') {
  const o = R.runDaily({ config, data });
  const q = o.quotes.find((x) => x.id === opt('quote'));
  if (!q) { console.error('Unknown quote. Available:', o.quotes.map((x) => `${x.id} (${x.state})`).join(', ')); process.exit(2); }
  console.log(`Quote ${q.id}: ${q.targets} target(s), max ${(q.maxCostCents / 100).toFixed(2)} €, balance ${(q.balanceCents / 100).toFixed(2)} €, state ${q.state}`);
  try { files.push(write(`enrich-${q.id}.json`, A.executeQuote(config, q))); } catch (e) { console.error('REFUSED →', e.message); process.exit(3); }
} else {
  console.log('Usage: node engine/cli.cjs <daily|postcall|enrich> [--config f] [--data f] [--out dir] [--mode m] [--quote id]');
  process.exit(1);
}
console.log('\nwritten:', files.join(', '));
