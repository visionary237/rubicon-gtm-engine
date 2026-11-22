# CLAUDE.md — reprendre RUBICON sans perdre le contexte

## Ce qu'est le projet
RUBICON, « GTM Engineering & Revenue Operating System ». Signature : *Stop generating leads. Start engineering revenue.* Projet indépendant, sans référence aux anciens noms du projet. Trois couches :
- **Core** (ce dépôt) : moteur, skills, règles, modèles, workflows, connecteurs.
- **Open Source** (ce dépôt, public) : démo fictive, sans API payante, sans auth ni paiement.
- **Platform** (futur, privé) : Next.js/TS/Tailwind/PostgreSQL/Supabase, multi-tenant. **Ne pas la développer avant validation des pilotes.**

Priorités dans l'ordre : 1) publier l'open source, 2) prospecter pour Proper Group et DOERZ (workspaces privés), 3) commercialiser une offre pilote.

## Carte du dépôt
- `engine/rubicon.cjs` — **seul moteur de décision**. JS pur, sans dépendance ni I/O, compatible avec le sandbox n8n (pas de `structuredClone`, `require` ou `fetch` : un test le vérifie). Étapes : prepare → normalizeAccounts (L1) → qualifyAccounts (L2) → qualifyContacts (L3) → enrichmentPlan (L4) → matchOffers → nextBestActions → allocate → dailyRoadmap → finalize ; `postCallSync` est séparé.
- `engine/adapters.cjs` — modes mock / dry-run / live. Aucun adaptateur live dans l'édition publique.
- `engine/cli.cjs` — `daily`, `postcall`, `enrich --quote`.
- `engine/build-workflows.cjs` — génère `workflows/*.n8n.json` à partir du moteur. **Ne jamais éditer les JSON à la main** : modifier le moteur, puis `npm run build:workflows`.
- `config/demo/config.json` — poids, seuils, offres, dictionnaire, commerciaux **fictifs**.
- `data/synthetic/` — `demo-small.json` (un cas limite par enregistrement, voir `_case`), `scale-500.json` et `outcomes-500.json` (générés, résultats **simulés**).
- `sql/` + `analytics/` — SQLite et KPIs, Python stdlib. Analyse uniquement, jamais de scoring.
- `scripts/source-registry.cjs` + `knowledge/naf-sectors.json` — sourcing par secteur NAF × zone depuis l'annuaire officiel ; l'opposition commerciale du registre exclut le compte.
- `.claude/skills/` — 11 skills (dont market-sourcing). Six implémentées en priorité : outbound-setup, outbound-batch, post-call-sync, offer-matching, sales-matching, daily-roadmap.
- `knowledge/upstream-*` — fichiers Scalon (MIT) copiés tels quels.
- `workspaces/` — **privé, ignoré par git**. Un dossier par entreprise réelle.

## Commandes
`./install.sh` · `npm test` (26 tests Node + 5 tests Python) · `npm run demo` · `npm run postcall` · `npm run analytics` · `npm run build:workflows`.
Exécution n8n réelle vérifiée avec n8n 1.123.99 (`n8n import:workflow` puis `n8n execute --id`) : voir `outputs/n8n/EXECUTION_PROOF.md`. Les deux workflows ont aussi été importés par URL et exécutés avec succès sur n8n Cloud (22/11/2026).

## Règles non négociables
1. Aucune dépense, aucun envoi, aucun appel, aucune publication, aucune écriture CRM sans autorisation explicite (ID de devis ou d'écriture approuvé + `mode: live`).
2. Qualifier avant de payer. INCONNU, partiel et indirect vont en validation humaine. Les échecs d'enrichissement sont tracés et jamais repayés.
3. Écrire à un ID vérifié par nom, jamais à un numéro de ligne. Colonnes par nom d'en-tête.
4. Jamais d'étude, de chiffre, de client, de référence ou de partenariat inventés. CVA et preuves sociales uniquement si `verified`.
5. ISP : dimensions professionnelles déclarées uniquement. Pas d'inférence psychologique ou émotionnelle, pas de critère discriminatoire. Recommandations explicables, contestables, modifiables.
6. Une relance promise n'est jamais oubliée : en cas d'impossibilité, elle est escaladée.
7. Les données de Proper Group et de DOERZ ne sont jamais fusionnées (un workspace chacune, le moteur refuse le mélange).
8. Les changements de poids ou de seuils sont proposés, testés, puis validés, et versionnés via `ruleVersion`. Jamais appliqués automatiquement.
9. Les résultats Scalon ne sont pas des résultats RUBICON. Les données simulées sont étiquetées comme telles.
10. Ne pas modifier les autres projets de l'utilisateur ni ses configurations globales.

## État au 2026-11-19
Fait : moteur v1.0.0, CLI, adaptateurs, 2 workflows n8n exécutés, SQL et analytics, 10 skills, documentation, configs privées Proper Group et DOERZ à compléter (prix et références à vérifier).
Non fait : benchmark concurrentiel sourcé (`docs/MARKET_BENCHMARK.md` contient la grille), adaptateurs live, vérification d'agenda, vidéo, post LinkedIn.
Publié : https://github.com/visionary237/rubicon-gtm-engine (22/11/2026).
Décisions en attente : titulaire de la licence, visibilité du dépôt, premier lot réel (sources, coûts), choix du CRM pour DOERZ (Notion ou HubSpot).
