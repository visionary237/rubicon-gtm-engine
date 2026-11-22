---
name: icp-builder
description: Construit pour RUBICON les ICP, buyer personas (Economic Buyer, Decision Maker, Champion, End User, Gatekeeper), critères de qualification et de disqualification, exclusions et dictionnaires de postes par verticale et par offre. Use when the user says "/icp-builder", "définis mon ICP", "qui sont mes décideurs", "dictionnaire de postes", "critères d'exclusion".
---

# icp-builder · statut : documenté, alimente la configuration lue par le moteur

## Sorties (écrites dans `workspaces/<id>/config.json` après validation)
- **ICP** par verticale × offre : secteur, taille (une fourchette, jamais un minimum seul), localisation, activité réelle, type de clientèle (B2B), modèle économique, maturité, problématiques (clés de `problemLabels`), signaux disponibles, exclusions. Le score `icpFit` (0-100) est attribué à chaque compte lors de la qualification, avec justification et sources.
- **Personas** : fonction, responsabilités, pouvoir de décision, problématiques, objectifs, rôle dans le comité d'achat → `personaScores` et `dictionary.ranks`.
- **Dictionnaire de postes** : intitulés exacts, synonymes, variantes FR/EN et féminin/masculin, familles, niveau, priorité, exclusions et **faux positifs** (les intitulés qui ressemblent aux bons sans en être), exclusions géographiques.
- **Disqualification** : concurrents, B2C, hors zone, opposition, taille hors fourchette.

## Procédure
Traite une famille à la fois et fais-la valider par l'utilisateur. Teste ensuite le dictionnaire avec `RUBICON.buyingRole(titre, dictionnaire)` sur ses 50 derniers intitulés réels et montre-lui les faux positifs. Un dictionnaire se corrige après les 50 premiers appels : c'est normal.

## Interdit
Reprendre comme contenu le dictionnaire d'exemple (`knowledge/upstream-dictionnaire-postes.FORMAT-EXAMPLE.json` ou `config/demo`).
