---
name: sales-matching
description: Attribue les actions commerciales du jour aux commerciaux selon leur profil professionnel déclaré (Ideal Sales Profile), leurs compétences par offre et secteur, leur capacité, les relations existantes et les objectifs, avec une explication contestable pour chaque affectation et une escalade quand une promesse ne peut pas être tenue. Use when the user asks "qui appelle qui", "/sales-matching", "répartis les appels", "affecte les opportunités", or edits a rep profile.
---

# sales-matching · une recommandation explicable, jamais une décision cachée

Implémenté dans `RUBICON.runStage('allocate')` (testé). C'est une heuristique gloutonne déterministe, **pas un solveur optimal** : ne la présente jamais comme tel.

## 1 · Contraintes, appliquées AVANT la priorisation
Opposition · capacité restante (minutes) · `minOfferExpertise` · `maxComplexity` · langue · exclusions de comptes · **propriétaire existant** de la relation. Si personne n'est éligible pour une relance promise → **escalade manager** (`severity: high`). Jamais de réaffectation silencieuse, jamais d'oubli.

## 2 · Scores (hypothèses configurables)
- `Sales Match = 0,55 × offer_expertise + 0,30 × industry_expertise + 0,15 × declared_task_preference`
- `Opportunity = 0,45 × ICP + 0,25 × persona + 0,30 × intent/timing`
- `Priority = 0,55 × Opportunity + 0,30 × Sales Match + 15 × promesse due + 5 × retard + 5 × écart à l'objectif (nouveaux appels uniquement)`

Ordre de traitement : promesses (la plus ancienne d'abord), puis préparation de RDV, puis valeur. Une relance promise n'est jamais doublée par une nouvelle opportunité mieux notée.

## Procédure
1. Lance `node engine/cli.cjs daily …` et lis `assignments[]` : `priorityParts`, `salesMatch.parts`, `alternatives`, `constraintsRejected`.
2. Pour chaque affectation contestée, montre les contributions et l'alternative suivante. Le manager peut surcharger (`overridable: true`) ; consigne alors sa raison.
3. Lis `escalations` en premier.

## Ideal Sales Profile : ce qui est permis
Niveau, langues, expertise par offre et par secteur, préférences de tâches **déclarées**, capacité, complexité, objectifs, relations existantes. Le moteur supprime tout autre champ (`rep_field_ignored`).
Interdit : inférer la fatigue, l'émotion, la motivation ou la personnalité ; utiliser l'âge, la santé, l'origine ou tout critère discriminatoire ; classer les personnes. Les chiffres par commercial servent au coaching et à l'allocation, pas à la surveillance.

## Conformité
Avant tout usage en entreprise : information des salariés, possibilité de contester, revue humaine. L'allocation automatisée de tâches à des salariés peut relever de l'annexe III de l'AI Act : à analyser avant toute commercialisation (voir `docs/BUSINESS_RULES.md`).
