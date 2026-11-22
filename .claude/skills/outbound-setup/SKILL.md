---
name: outbound-setup
description: Configure un workspace RUBICON à partir du contexte réel de l'entreprise (site, offres, clients, panier, décideurs, travail de terrain, objectifs, outils, CRM) et produit sa configuration, son dictionnaire de postes, son fichier de prospection et son script. Use when the user says "/outbound-setup", "configure RUBICON pour <entreprise>", "nouveau workspace", "installe ma machine de prospection", or when no workspaces/<id>/config.json exists yet.
---

# outbound-setup · construire SA machine, jamais celle d'un exemple

> Adapté de `outbound-setup` (Outbound Blueprint, © 2026 Valentin Morterol, MIT). Ajouts RUBICON : workspaces séparés, catalogue multi-offres (IOP), profils commerciaux (ISP), objectifs, modes mock/dry-run/live.

**Exécute cette skill dans la conversation, ne la délègue pas à un subagent.** Elle est faite d'allers-retours et d'arrêts de validation.

## La règle qui gouverne tout
Rien ne vient d'un exemple. `config/demo/config.json` et `knowledge/upstream-dictionnaire-postes.FORMAT-EXAMPLE.json` montrent un **format**, jamais un contenu. Tout sort de ce que l'utilisateur fournit en phase 1. Si une information manque, écris `null` et ajoute-la à `open_questions` : n'invente ni client, ni prix, ni étude, ni chiffre.

## Où écrire
- Configuration privée : `workspaces/<workspace-id>/config.json` (même schéma que `config/demo/config.json`), `context.md`, `data/`. Ce dossier est ignoré par git.
- Ne mélange jamais deux entreprises dans un workspace. Un workspace = une entité commerciale, avec son `workspace.id`. Le moteur refuse les données d'un autre workspace.
- `mode` démarre à `"mock"`. Passer en `"dry-run"` ou `"live"` est une décision de l'utilisateur.

## Les dix phases

| # | Phase | Arrêt |
|---|---|---|
| 1 | Comprendre l'activité | **valide la restitution** |
| 2 | Catalogue d'offres (IOP) | **valide chaque offre** |
| 3 | Verticale de la première campagne | **choisit** |
| 4 | Dictionnaire de postes par verticale × offre | **valide famille par famille** |
| 5 | Commerciaux (ISP) et objectifs | **valide les profils** |
| 6 | Outils et MCP | **lance les commandes lui-même** |
| 7 | Base d'entreprises et fichier | **valide critères et volume** |
| 8 | Qualification du premier lot de 50 | **valide le lot** |
| 9 | CRM | aucun |
| 10 | Script et objections | **le chronomètre** |

### 1 · Comprendre l'activité
Demande le plus rapide pour lui : URL du site (lis aussi offre, tarifs, cas clients), copier-coller de plaquette, ou trois phrases. Puis **une question à la fois** :
1. Clients actuels (nom, secteur, montant si possible) — et peut-on les citer ?
2. Panier moyen, fourchette basse et haute.
3. Qui souffre du problème au quotidien (décrit par ce qu'elle vit, pas par son titre) ?
4. Qui signe ? Même personne ?
5. Quel travail de terrain existe ou peut être produit cette semaine (étude, comptage, benchmark, audit) ? Si « rien » : dis-le franchement et propose trois actifs CVA réalisables en une semaine.
6. Objectifs commerciaux (CA, rendez-vous, période).

Restitue en dix lignes max. **ARRÊT 1.** Écris `workspaces/<id>/context.md`.

### 2 · Catalogue d'offres (Ideal Offer Profile)
Pour chaque offre : `id`, `name`, `oneLiner` (une phrase sans superlatif), `problemsSolved` (clés), `icpSectors`, `personas`, `priceEUR`, `marginPct`, `salesCycleDays`, `socialProof` (`verified` + `citationAllowed` obligatoires), `assets` (CVA, `verified` + `status: approved` obligatoires pour être cités), `objections`, `complementary`, `active`.
Tout prix ou condition non confirmé par l'utilisateur reste `null` avec une note. Une offre retirée du catalogue passe `active: false`. **ARRÊT 2.**

### 3 · Verticale
Propose quatre verticales. Classe-les sur un critère : peut-il dire « on travaille déjà avec X » à quelqu'un qui connaît X ? S'il n'a de client dans aucune : propose dix contacts réseau à appeler d'abord. **ARRÊT 3** : libellé exact.

### 4 · Dictionnaire de postes
Par verticale **et** par offre. Familles `ranks.economic_buyer`, `ranks.decision_maker`, `ranks.champion` (demande s'il veut appeler les prescripteurs ; sinon `disabledRoles`), `exclude` (pose la question : « quels intitulés ressemblent aux bons sans en être, qui as-tu déjà appelé pour rien ? »), `excludeGeo`. Variantes féminin/masculin, FR/EN, abréviations, titres cumulés. Tout en minuscules sans accent. **ARRÊT 4** famille par famille.

### 5 · Commerciaux (Ideal Sales Profile) et objectifs
Uniquement des dimensions professionnelles déclarées : `level`, `languages`, `offerExpertise` (0-100 par offre), `industryExpertise`, `taskPreferences` déclarées, `capacityMinutes`, `maxComplexity`, `objectives`, relations commerciales existantes. **Interdit** : âge, santé, humeur, personnalité inférée, situation familiale, tout critère discriminatoire. Le moteur supprime ces champs. Dis à l'utilisateur que chaque commercial doit pouvoir lire et contester son profil. **ARRÊT 5.**

### 6 · Outils
Lance `claude mcp list`. Présente ce qui manque avec rôle et coût, puis donne les commandes **une par une** depuis `docs/MCP_SETUP.md` (jamais de mémoire). Ne demande jamais de clé API dans la conversation ; elles vivent dans la config MCP et l'environnement shell. Les phases 7 à 9 fonctionnent sans téléphonie ni fournisseur de numéros.

### 7 · Base d'entreprises
Export **d'entreprises**, pas de contacts : pays, effectif en fourchette, volume max. Premier export de 500 à 1 000 lignes. Crée réellement le fichier à partir de `knowledge/upstream-schema-sheet-outbound.md` (deux onglets, jointure sur domaine, ID stables, en-têtes exacts). **ARRÊT 4 Scalon** : annonce le coût de l'export avant de le lancer.

### 8 · Premier lot de 50
Résumé `<Ce qu'elle fait>. Clients : <types B2B>.` et verdict parmi `oui`, `oui, en partie`, `partiel`, `indirect`, `non`, `INCONNU`. B2B uniquement, INCONNU plutôt qu'une invention. Montre le lot. **ARRÊT** : on corrige la description ICP et on relance sur le même lot jusqu'à ce que les verdicts soient justes. Puis `approvals.accountReviewDone: true`.

### 9 · CRM
Applique `knowledge/upstream-crm-notion-spec.md` tel quel (Entreprises, Contacts, Deals, Meetings). Adapte les phases 2-3 du pipeline à ce qu'il envoie réellement (pilote, audit, maquette…) et la liste des verticales. Modèle portable vers HubSpot/PostgreSQL : `sql/schema.sql`.

### 10 · Script
Six blocs, ~25 s : prénom et société · vérification d'identité fermée · ce qu'on fait en une phrase · raison d'appeler non commerciale avec chiffre précis issu d'un CVA vérifié · client référence vérifié · demande de 20 min à deux créneaux. Interdits : superlatifs, « leader », « solution », question ouverte, « est-ce que ça vous intéresse ». Cinq objections de **son** marché, deux phrases chacune. **ARRÊT 6** : lecture à voix haute.

## Pour finir
Lance `node engine/cli.cjs daily --config workspaces/<id>/config.json --data workspaces/<id>/data/accounts.json --out workspaces/<id>/outputs` en mode mock et montre la roadmap. Rends : liens Sheet/CRM, script, `open_questions`, outils manquants, prochaine commande `/outbound-batch`. Rappelle que la machine fait le volume et la régularité ; c'est le produit qui transforme le rendez-vous.
