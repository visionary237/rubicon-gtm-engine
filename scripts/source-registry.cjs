#!/usr/bin/env node
/*
 * RUBICON · market sourcing from the official French company registry
 * (API Recherche d'entreprises, recherche-entreprises.api.gouv.fr — free, no key).
 *
 *   node scripts/source-registry.cjs --sector fitness --departement 76 --workspace proper-group
 *   node scripts/source-registry.cjs --naf 10.71C --code-postal 76600 --workspace doerz
 *   node scripts/source-registry.cjs --sector local_shop --region 28 --max-pages 4
 *   node scripts/source-registry.cjs --from-file raw.json --sector fitness --departement 76   (offline)
 *
 * Output: RUBICON accounts (one per ACTIVE establishment inside the zone, keyed by SIRET),
 * verdict "inconnu" (qualification still required), plus legal-officer contact candidates.
 * Rules:
 *  - opposition_diffusion_commerciale = true → account excluded (registryCommercialOpposition)
 *  - establishments outside the requested zone are dropped (a Paris head office is not a local gym)
 *  - data minimisation: no birth dates, no nationality, no auditor ("commissaire aux comptes")
 *  - read-only, free source: no spend. Respect the API rate limit (pause between pages).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const NAF = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge/naf-sectors.json'), 'utf8'));
const API = 'https://recherche-entreprises.api.gouv.fr/search';

function query() {
  const sector = opt('sector');
  const nafList = opt('naf') ? opt('naf').split(',') : sector ? NAF.sectors[sector]?.naf : null;
  if (!nafList) throw new Error('Give --sector <key from knowledge/naf-sectors.json> or --naf <code[,code]>');
  const zone = { departement: opt('departement'), region: opt('region'), code_postal: opt('code-postal') };
  if (!zone.departement && !zone.region && !zone.code_postal) throw new Error('Give a zone: --departement, --region or --code-postal');
  return { sector: sector || 'unmapped', nafList, zone, maxPages: Number(opt('max-pages', 8)), workspace: opt('workspace', 'ws-demo') };
}

const inZone = (e, z) => (!z.departement || String(e.code_postal || '').startsWith(z.departement))
  && (!z.code_postal || e.code_postal === z.code_postal) && (!z.region || e.region === z.region);

const OFFICER_TITLE = { 'Gérant': 'Gérant', 'Président de SAS': 'Président', 'Président': 'Président', 'Directeur Général': 'Directeur général', 'Directeur général': 'Directeur général', 'Co-gérant': 'Cogérant' };
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

function toRubicon(results, q, today) {
  const accounts = [], contacts = [], dropped = [];
  for (const r of results) {
    const etabs = (r.matching_etablissements || []).filter((e) => e.etat_administratif === 'A' && q.nafList.includes(e.activite_principale) && inZone(e, q.zone));
    if (!etabs.length) { dropped.push({ siren: r.siren, name: r.nom_complet, reason: 'no_active_matching_establishment_in_zone' }); continue; }
    const officers = (r.dirigeants || []).filter((d) => d.type_dirigeant === 'personne physique' && OFFICER_TITLE[d.qualite]);
    for (const e of etabs) {
      const id = `reg-${e.siret}`;
      const brand = (e.liste_enseignes && e.liste_enseignes[0]) || e.nom_commercial;
      accounts.push({
        id, workspaceId: q.workspace, name: titleCase(brand || r.nom_complet), legalName: r.nom_complet, siren: r.siren, siret: e.siret,
        domain: null, sector: q.sector, naf: e.activite_principale, location: titleCase(e.libelle_commune), address: e.adresse, postalCode: e.code_postal,
        size: null, sizeBand: NAF.tranches_effectif[e.tranche_effectif_salarie] || 'non renseigné', relevantTeamSize: null,
        companyCategory: r.categorie_entreprise, establishmentsOpen: r.nombre_etablissements_ouverts, isChainEstablishment: (r.nombre_etablissements_ouverts || 1) > 3,
        customerType: null, summary: null, verdict: 'inconnu', icpFit: null,
        registryCommercialOpposition: r.opposition_diffusion_commerciale === true,
        sources: [{ id: `src-${id}`, url: `https://annuaire-entreprises.data.gouv.fr/etablissement/${e.siret}`, checkedAt: today, kind: 'registry' }],
        verifiedAt: today, _qualify: 'Write "<what it does>. Clients : <B2B types>." from the website, then set verdict + icpFit.',
      });
      officers.forEach((d, i) => contacts.push({
        id: `${id}-o${i + 1}`, workspaceId: q.workspace, accountId: id, firstName: titleCase(String(d.prenoms || '').split(' ')[0]), lastName: titleCase(d.nom),
        title: OFFICER_TITLE[d.qualite], profileUrl: null, phone: null, source: 'registry_legal_officer',
        note: 'Legal officer of the legal entity; may not run this establishment day to day (check for chains).',
      }));
    }
  }
  return { accounts, contacts, dropped };
}

async function fetchAll(q) {
  const all = [];
  for (const naf of q.nafList) {
    for (let page = 1; page <= q.maxPages; page++) {
      const p = new URLSearchParams({ activite_principale: naf, etat_administratif: 'A', per_page: '25', page: String(page) });
      for (const [k, v] of Object.entries(q.zone)) if (v) p.set(k, v);
      const res = await fetch(`${API}?${p}`);
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); page--; continue; }
      if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
      const body = await res.json();
      all.push(...body.results);
      if (page >= body.total_pages) break;
      await new Promise((r) => setTimeout(r, 250)); // stay well under the public rate limit
    }
  }
  return all;
}

(async () => {
  const q = query();
  const today = new Date().toISOString().slice(0, 10);
  const raw = opt('from-file') ? JSON.parse(fs.readFileSync(path.resolve(opt('from-file')), 'utf8')).results : await fetchAll(q);
  const seen = new Set(), unique = raw.filter((r) => !seen.has(r.siren) && seen.add(r.siren));
  const out = toRubicon(unique, q, today);
  const opposed = out.accounts.filter((a) => a.registryCommercialOpposition).length;
  const dir = path.resolve(ROOT, opt('out', `workspaces/${q.workspace}/data`));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sourcing-${q.sector}-${Object.values(q.zone).filter(Boolean).join('-')}-${today}.json`);
  fs.writeFileSync(file, JSON.stringify({ $comment: `Registry sourcing ${today}. Verdicts are "inconnu" until qualified.`, query: q, accounts: out.accounts, contacts: out.contacts, droppedLegalUnits: out.dropped, enrichmentLog: [] }, null, 2));
  console.log(`legal units ${unique.length} · establishments in zone ${out.accounts.length} · registry opposition ${opposed} · officer candidates ${out.contacts.length} · dropped ${out.dropped.length}`);
  console.log('written:', path.relative(ROOT, file));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
