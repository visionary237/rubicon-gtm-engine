---
name: outbound-batch
description: Constitue et qualifie un lot de prospection RUBICON pour une verticale (sélection, qualification ICP, validation humaine, réutilisation des contacts, déduplication, devis d'extraction et d'enrichissement, export) sans jamais dépenser sans accord explicite. Use when the user says "/outbound-batch", "fais-moi un lot sur X", "je veux prospecter les X", "nouveau lot", or asks to enrich prospects.
---

# outbound-batch · qualifier avant de payer

> Adapté de `outbound-batch` (Outbound Blueprint, © 2026 Valentin Morterol, MIT). RUBICON applique les règles de coût dans le moteur (`engine/rubicon.cjs`, étapes L1→L4) et non dans le prompt.

**À exécuter dans la conversation, pas en subagent** : cinq arrêts, dont trois engagent de l'argent.

## Avant tout
1. Lis `workspaces/<id>/config.json`. S'il est absent, arrête-toi et propose `/outbound-setup`. N'utilise jamais `config/demo` comme configuration réelle.
2. Vérifie `mode`. En `mock` et `dry-run`, ni dépense ni écriture externe n'est possible : les adaptateurs le garantissent (`engine/adapters.cjs`).
3. Annonce les soldes fournisseurs si un MCP les expose. Sinon, dis que le solde est inconnu.

## Phases
| # | Ce qu'on fait | Arrêt |
|---|---|---|
| 0 | Traduire la cible en types d'entreprises réellement présents (racines courtes sans accent : `carross`, `boulanger`) et retenir **un seul** libellé de lot | **valide les types** |
| 1 | `node engine/cli.cjs daily --config … --data …`, puis lecture de `accounts.validation` et `accounts.excluded` | **valide le périmètre** (afficher d'abord `non`, `indirect`, `partiel`) |
| 2 | Réutiliser gratuitement les contacts connus : filtre dictionnaire, dédoublonnage par URL normalisée **et** par prénom+nom+domaine | aucun |
| 3 | Devis d'extraction sur le reliquat uniquement (`quotes[kind=contact_extraction]`) | **valide la dépense** |
| 4 | Écriture dans l'onglet Contacts par ID, colonnes désignées par nom d'en-tête, résumé recopié sur chaque ligne | **relit le fichier** |
| 5 | Devis mobiles (`quotes[kind=mobile_enrichment]`), filtre pays, tri des numéros | **valide la dépense** |

## Présenter un devis (obligatoire avant tout achat)
Pour chaque `quote`, présente : entreprises, contacts, coût unitaire, **coût maximum**, solde, retour attendu (une hypothèse, pas un comptage fournisseur) et l'identifiant `Q-…`. Puis attends un « oui » explicite.
Après l'accord, l'utilisateur ajoute l'ID dans `approvals.approvedQuoteIds` et passe en `mode: live`. `node engine/cli.cjs enrich --quote <id>` refuse tout autre cas. L'édition open source n'a pas d'adaptateur live : passe alors par le MCP du fournisseur en suivant `docs/MCP_SETUP.md`, et toujours après l'accord.

## Règles non négociables
1. Rien ne part chez un outil payant sans résumé relu et sans verdict `oui` ou `oui, en partie`.
2. INCONNU, partiel et indirect vont en file de validation, jamais en enrichissement.
3. Un échec d'enrichissement est tracé (`enrichmentLog`, `result: not_found`) et n'est jamais repayé automatiquement.
4. Deux contacts par compte par défaut, un seul au-delà de 30 personnes dans l'équipe concernée (configurable).
5. Le filtre pays oriente la recherche mais ne filtre pas le résultat : vérifie le pays et le type de chaque numéro rendu. Étranger ou personnel → `phoneReview`.
6. Deux entreprises qui partagent un numéro : l'un des deux est faux, à vérifier.
7. Les oppositions sont exclues avant tout devis.
8. Premier lot de contrôle : 50 comptes revus avant d'augmenter les volumes.

## Rendre compte
Lignes écartées et pourquoi, devis en attente, dépense réelle (0 tant que rien n'est approuvé), prochaine commande : `/daily-roadmap`.
