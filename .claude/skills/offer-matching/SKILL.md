---
name: offer-matching
description: Associe chaque prospect qualifié à l'offre la plus pertinente du catalogue (Ideal Offer Profile) à partir de problématiques vérifiées, du secteur et du rôle d'achat, justifie le choix, et propose des pistes de cross-sell soumises à validation. Use when the user asks "quelle offre pour ce prospect", "/offer-matching", "matching des offres", "opportunités de cross-sell", or adds a new offer to a workspace.
---

# offer-matching · la bonne offre, avec sa justification

Implémenté dans `RUBICON.runStage('matchOffers')` (testé).

## Calcul (hypothèse configurable)
`Offer Fit = 100 × (0,5 × problem_fit + 0,3 × sector_fit + 0,2 × persona_fit)`. Les poids sont dans `config.weights.offerFit`.
- `problem_fit` : part des problèmes de l'offre retrouvés **avec preuve** (`evidenceId`) sur le compte. Sans problème vérifié, la valeur est `null` : elle contribue 0 et apparaît dans `missing`. Ce n'est pas un signal négatif.
- `sector_fit` : le secteur du compte figure dans `offer.icpSectors`.
- `persona_fit` : le rôle d'achat du contact figure dans `offer.personas`.
- Continuité : une relance promise conserve l'offre promise.
- Seuil : `thresholds.minOfferFit`. En dessous, l'action devient `qualify`.

## Procédure
1. Lance `node engine/cli.cjs daily …` et lis `offerMatches` : `fits[].parts` donne chaque contribution.
2. Pour chaque prospect prioritaire, présente l'offre retenue, les trois facteurs chiffrés, les problèmes appariés et les données manquantes.
3. Cross-sell : réservé à un client existant (`ownedOfferIds`) ou à une offre complémentaire appuyée par un problème vérifié. Le statut est toujours `suggestion_requires_validation` et la piste n'est jamais routée automatiquement.
4. Si l'utilisateur conteste un appariement, corrige la **donnée** (problème, secteur, persona) ou propose de tester un changement de poids. Ne modifie pas les poids sans son accord.

## Garde-fous
- N'invente jamais une problématique : une hypothèse reste `hypothesis_to_validate_in_call` dans la fiche d'appel.
- Ne fusionne jamais les catalogues de deux workspaces sans règle explicite.
