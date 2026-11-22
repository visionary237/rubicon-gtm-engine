---
name: call-preparation
description: Prépare la fiche d'un prospect prioritaire RUBICON (activité, interlocuteur, problématiques à valider, offre, historique, sources, raison d'appeler, script de 25 secondes, icebreaker, cinq objections, prochaine action) sans jamais inventer d'étude, de chiffre ou de référence. Use when the user says "/call-preparation", "prépare mon appel avec X", "fiche prospect", "script pour X".
---

# call-preparation · statut : implémenté (fiches générées par le moteur), recherche live à venir

Le moteur produit une fiche par action affectée (`briefs[]`, rendue dans `call-briefs.md`).

## Contenu de la fiche
Entreprise, interlocuteur, fonction et rôle d'achat, activité (résumé vérifié), problématiques **à valider pendant l'appel**, offre, historique, sources, raison de l'appel, script, icebreaker, objections, questions de découverte, prochaine action, avertissements.

## Script (méthode Scalon, six blocs, ~25 s)
Présentation · vérification d'identité par question fermée · légitimité · ce qu'on fait en une phrase · raison d'appeler non commerciale (**uniquement** issue d'un CVA `verified` + `approved`) · preuve sociale (**uniquement** `verified` + `citationAllowed`) · demande de 20 minutes sur deux créneaux.
Sans CVA vérifié ou sans référence citable, le bloc correspondant est **retiré** et un avertissement l'explique. La durée est une estimation : lis le script à voix haute et chronomètre-le.
Pour les relances et les réactivations, le script de continuité repose sur le dernier échange réel.

## Icebreaker, par ordre de priorité
1. Le dernier échange commercial réel.
2. Un signal entreprise vérifié et sourcé.
3. Un centre d'intérêt **déclaré par le prospect en conversation**, non sensible, avec accord d'usage. Il donne lieu à une requête de recherche proposée (Perplexity ou équivalent), exécutée seulement en live et après accord ; le brouillon est relu par un humain.
4. Une ouverture neutre.

Un intérêt personnel n'entre jamais dans le scoring ni dans l'allocation. Pas de surveillance intrusive, pas de collecte de likes ou d'activité, pas d'affinité inventée, pas d'hypothèse présentée comme un fait, et jamais de dissimulation du caractère commercial de l'appel.

## À faire (prochaines itérations)
Adaptateur de recherche live avec citations, vérification des sources datées, export de la fiche vers le CRM.
