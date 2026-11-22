---
name: post-call-sync
description: Traite une session d'appels RUBICON. Interprète les notes courtes, vérifie l'identité de chaque ligne, croise avec les emails réellement envoyés et l'agenda, signale les contradictions, propose statuts, relances, objections et opérations CRM idempotentes, puis synchronise seulement après autorisation. Use when the user says "/post-call-sync", "traite mes appels du jour", "j'ai fini ma session", "mets à jour le CRM après les appels".
---

# post-call-sync · la note dit l'intention, les preuves disent ce qui existe

> Adapté de `post-call-sync` (Outbound Blueprint, © 2026 Valentin Morterol, MIT). RUBICON implémente la classification, la garde nominale, l'idempotence et la gestion des conflits dans `RUBICON.postCallSync` (testé).

## Entrées
1. `workspaces/<id>/config.json` (s'il est absent → `/outbound-setup`).
2. Les notes de la session : une ligne par appel, avec l'**ID** du contact, le prénom et le nom **lus sur la ligne au moment de l'export**, l'heure et la note.
3. Les groupes, **donnés par l'utilisateur à chaque session**, jamais devinés ni repris d'une session précédente : `calledEventIds` (« je viens de les appeler ») et `notCalledDoNotContactEventIds` (« pas appelés, ne plus contacter »). Pour une couleur inconnue, demande.
4. Les preuves accessibles, en lecture seule : emails envoyés (MCP Gmail) et événements (MCP Google Calendar).

## Exécution
`node engine/cli.cjs postcall --config workspaces/<id>/config.json --data <session.json> --out workspaces/<id>/outputs`

## Statuts (cinq, et seulement cinq, plus une file de validation)
| La note dit | Statut |
|---|---|
| messagerie, répondeur, pas de réponse, « rappel jeudi » | `Rappeler` |
| non, pas intéressé, mauvais interlocuteur | `Réponse négative` |
| hors cible, plus en poste, ligne perso, **ne plus contacter** | `Ne pas contacter` (une opposition entraîne une suppression durable) |
| RDV confirmé, demande un mail **pour caler** le RDV | `Réponse positive` |
| demande un mail ou une doc, intéressé sans RDV, mail parti sans « oui » | `Qualifié` |
| rien de reconnaissable | file `À valider` |

N'écris jamais `À appeler` ni `À enrichir`. Une ligne du groupe « non appelé » ne reçoit **ni** incrément d'appel **ni** date.

## Conflits
- RDV annoncé mais agenda vide → `Rappeler`, **pas de deal**, action `verify_meeting_with_rep`.
- Mail annoncé mais boîte d'envoi vide → demande confirmation avant de classer.
- Mail parti mais note muette → **le mail fait foi** (`Qualifié`).
- Hors cible au niveau de la société → **propose** d'étendre `Ne pas contacter` au compte, sans le faire seul.
- Opposition antérieure → elle prévaut sur tout statut ultérieur.

## La règle qui prime
N'écris jamais à un numéro de ligne. Écris à un **ID**, après avoir comparé le prénom et le nom (accents normalisés). En cas de différence → `identity_mismatch`, rien n'est écrit.

## CRM (après autorisation uniquement)
Ordre : entreprise → contact → deal. Clés : domaine normalisé, URL de profil normalisée. Un deal n'est créé qu'avec un événement agenda confirmé, sous une clé `compte:offre` unique. `Notes` s'ajoute avec ` | `, sans jamais écraser. `Dernier contact` est toujours mis à jour. Les `processedEventIds` rendent une relance du traitement idempotente.
Présente `patches`, `crmOps`, `contradictions`, `validationQueue` et `rejected`, puis demande l'accord. L'écriture passe par le MCP du CRM (Notion ou HubSpot), opération par opération, en relisant l'ID cible juste avant chaque écriture.

## Rendre compte
Arbitrages pris seul, lignes laissées de côté, conflits entre note et preuve, rejets de la garde nominale, objections capturées (pour `/revenue-learning`) et relances promises (elles passent en priorité dans `/daily-roadmap`).
