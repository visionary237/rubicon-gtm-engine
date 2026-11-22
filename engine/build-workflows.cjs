#!/usr/bin/env node
/*
 * Generates the n8n workflows from engine/rubicon.cjs (single source of truth).
 * Each Code node embeds the engine and runs one stage, so every intermediate state
 * is inspectable in the n8n UI. No credential, no HTTP node, workflows inactive.
 *   node engine/build-workflows.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const engine = fs.readFileSync(path.join(__dirname, 'rubicon.cjs'), 'utf8').replace(/\/\* n8n-strip-start \*\/[\s\S]*?\/\* n8n-strip-end \*\//, '');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/demo/config.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/synthetic/demo-small.json'), 'utf8'));

const code = (body) => `${engine}\n// ── node logic ──\n${body}`;
const stage = (name) => code(`return [{ json: RUBICON.runStage('${name}', $input.first().json) }];`);

function workflow(name, defs) {
  const nodes = defs.map(([label, type, params], i) => ({
    parameters: params, id: `rubicon-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i + 1}`, name: label,
    type, typeVersion: type === 'n8n-nodes-base.code' ? 2 : 1, position: [260 * i, 0],
  }));
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++) connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  return { name, nodes, connections, active: false, settings: { executionOrder: 'v1' }, meta: { generatedBy: 'engine/build-workflows.cjs', engine: 'RUBICON', mode: config.mode } };
}

const CODE = 'n8n-nodes-base.code', TRIGGER = 'n8n-nodes-base.manualTrigger';
const inputNode = (label, payload) => [label, CODE, { jsCode: `// Replace this node with authorised sources (Sheets, Notion, CRM) in production.\n// Demo: fictional company, synthetic data, mode=${config.mode}.\nreturn [{ json: ${JSON.stringify(payload)} }];` }];

const daily = workflow('RUBICON · Daily Revenue Run (demo)', [
  ['Manual Trigger', TRIGGER, {}],
  inputNode('01 · Configuration & data (mock)', { config, data: { ...data, postCall: undefined } }),
  ['02 · Guards (workspace, ISP fields, mode)', CODE, { jsCode: stage('prepare') }],
  ['03 · L1 Normalize & dedupe accounts', CODE, { jsCode: stage('normalizeAccounts') }],
  ['04 · L2 Qualify accounts (ICP gate)', CODE, { jsCode: stage('qualifyAccounts') }],
  ['05 · L3 Qualify contacts (dictionary)', CODE, { jsCode: stage('qualifyContacts') }],
  ['06 · L4 Enrichment proposal (no spend)', CODE, { jsCode: stage('enrichmentPlan') }],
  ['07 · Offer matching (IOP)', CODE, { jsCode: stage('matchOffers') }],
  ['08 · Opportunity score & Next Best Action', CODE, { jsCode: stage('nextBestActions') }],
  ['09 · Sales matching & allocation (ISP)', CODE, { jsCode: stage('allocate') }],
  ['10 · Call briefs & Daily Roadmap', CODE, { jsCode: stage('dailyRoadmap') }],
  ['11 · Export', CODE, { jsCode: stage('finalize') }],
  ['12 · One item per rep (ready for Sheets/Notion/email draft)', CODE, { jsCode: `const o = $input.first().json;\nreturn o.roadmaps.map((r) => ({ json: { date: o.date, mode: o.mode, rep: r.repName, plannedMinutes: r.plannedMinutes, capacityMinutes: r.capacityMinutes, items: r.items, escalations: o.escalations, guarantees: o.guarantees, markdown: o.roadmapMarkdown } }));` }],
]);

const postcall = workflow('RUBICON · Post-call Sync (demo)', [
  ['Manual Trigger', TRIGGER, {}],
  inputNode('01 · Session notes & evidence (mock)', { config, data: { contacts: data.contacts, accounts: data.accounts, postCall: data.postCall } }),
  ['02 · Interpret notes, verify evidence, propose patches', CODE, { jsCode: code('return [{ json: RUBICON.postCallSync($input.first().json) }];') }],
  ['03 · Split for human review', CODE, { jsCode: `const p = $input.first().json;\nreturn [\n  ...p.patches.map((x) => ({ json: { lane: 'patch_proposal', ...x } })),\n  ...p.crmOps.map((x) => ({ json: { lane: 'crm_operation_proposal', ...x } })),\n  ...p.validationQueue.map((x) => ({ json: { lane: 'needs_human_validation', ...x } })),\n  ...p.contradictions.map((x) => ({ json: { lane: 'contradiction', ...x } })),\n  ...p.rejected.map((x) => ({ json: { lane: 'identity_guard_rejected', ...x } })),\n  { json: { lane: 'summary', ...p.summary, writesPerformed: p.writesPerformed, processedEventIds: p.processedEventIds } },\n];` }],
  ['04 · STOP — approval required before any write', 'n8n-nodes-base.noOp', {}],
]);

fs.mkdirSync(path.join(ROOT, 'workflows'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'workflows/rubicon-daily.n8n.json'), JSON.stringify(daily, null, 2));
fs.writeFileSync(path.join(ROOT, 'workflows/rubicon-postcall.n8n.json'), JSON.stringify(postcall, null, 2));
console.log('workflows/rubicon-daily.n8n.json', daily.nodes.length, 'nodes');
console.log('workflows/rubicon-postcall.n8n.json', postcall.nodes.length, 'nodes');
