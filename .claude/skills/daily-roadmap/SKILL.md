---
name: daily-roadmap
description: Génère la feuille de route de 8 h de chaque commercial RUBICON (relances promises d'abord, préparation des rendez-vous, blocs de prospection, alternance déclarée, tâches en retard, escalades et validations manager) avec les fiches d'appel associées. Use when the user says "/daily-roadmap", "prépare la journée", "qui j'appelle demain", "feuille de route", or every working morning.
---

# daily-roadmap · à 8 h, chacun sait qui appeler, pourquoi, avec quelle offre et dans quel ordre

Implémenté dans `RUBICON.runDaily` (étapes L1 → ROADMAP). Également disponible en workflow n8n : `workflows/rubicon-daily.n8n.json`.

## Exécution
```bash
node engine/cli.cjs daily --config workspaces/<id>/config.json --data workspaces/<id>/data/accounts.json --out workspaces/<id>/outputs
```
Sorties : `daily-roadmap.md` (par commercial), `call-briefs.md` (fiches d'appel), `daily-output.json` (tout, explications comprises).

## Ordre de la journée
1. **08:00 · Relances promises**, la plus ancienne d'abord, retards signalés ⚠️.
2. **Préparation des rendez-vous** confirmés dans les 48 h.
3. **À partir de `outboundStart` · Blocs de prospection** par priorité décroissante. Chaque bloc dure `prospectingBlockMinutes` (ou `prefersBlockMinutes` si le commercial l'a déclaré) et se termine par un court bloc de mise à jour des notes.
4. **Clôture** : notes courtes, puis `/post-call-sync`.

## À présenter
- Par commercial : minutes planifiées / capacité, relances en retard.
- **Escalades manager** en tête (promesses impossibles à placer).
- **À valider** : cross-sell, comptes en file de validation, devis en attente.
- Ce qui n'est pas fait : aucun appel lancé, aucun message envoyé, aucune écriture.

## Garde-fous
L'alternance des blocs est une aide d'organisation fondée sur des préférences déclarées. N'infère jamais la fatigue, l'humeur ou l'état émotionnel à partir de données comportementales : ce n'est pas un outil de surveillance.
Les créneaux sont indicatifs : ils ne sont pas encore vérifiés contre l'agenda réel (limite documentée).
