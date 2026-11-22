---
name: revenue-learning
description: Analyse la performance commerciale RUBICON en SQL (entonnoir à dénominateurs explicites, verticales, offres, sources, objections, pertes, coûts) avec intervalles de confiance et alertes petits échantillons, puis propose des expérimentations au lieu de modifier seul les règles. Use when the user says "/revenue-learning", "analyse mes résultats", "quels segments marchent", "bilan de campagne", "pourquoi on perd".
---

# revenue-learning · statut : implémenté sur données simulées, à brancher sur les résultats réels

## Exécution
```bash
python3 analytics/rubicon_analytics.py <outcomes.json> --db workspaces/<id>/outputs/analytics/rubicon.db
```
Produit `kpi-report.md` et `kpis.json` à partir de `sql/schema.sql` et `sql/kpis.sql`.

## Règles d'analyse
- Chaque taux annonce son numérateur et son dénominateur (par exemple rendez-vous / conversations, et non rendez-vous / appels).
- Pipeline ≠ chiffre d'affaires. Rendez-vous pris ≠ rendez-vous tenus.
- En dessous de 30 observations : on affiche, on n'interprète pas.
- Corrélation ≠ causalité : verticales, sources, commerciaux et timing restent confondus tant qu'on ne les tient pas constants.
- Les chiffres par commercial servent au coaching et à l'allocation, jamais à classer les personnes.
- Les résultats annoncés par Scalon ne sont pas des résultats RUBICON. Les données de démo sont **simulées**, et le rapport le dit.

## Boucle d'amélioration
Observation → hypothèse → expérimentation (A/B, lot, durée, métrique) → revue humaine → éventuel changement de règle versionné (`ruleVersion`). Le système **propose** ; il ne modifie jamais seul les poids ni les seuils.
