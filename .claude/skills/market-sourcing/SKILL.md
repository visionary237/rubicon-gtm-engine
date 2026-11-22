---
name: market-sourcing
description: Source des entreprises RUBICON par secteur d'activité (code NAF), région, département, code postal ou taille, depuis l'annuaire officiel gratuit des entreprises, puis les prépare pour la qualification. Use when the user says "/market-sourcing", "trouve-moi les salles de sport du 76", "liste les boulangeries du Havre", "sourcing par région", "combien de X à Y", or wants a first batch for a vertical and a zone.
---

# market-sourcing · secteur × zone → comptes prêts à qualifier

Implémenté dans `scripts/source-registry.cjs` (testé sur un échantillon fictif au format de l'API).

## Ce qu'on peut demander
| Filtre | Option | Exemple |
|---|---|---|
| Secteur RUBICON | `--sector` | `fitness`, `local_shop`, `restaurant`, `beauty_salon`, `garage`, `hospitality`, `offices`, `property_management`, `health_practice` (voir `knowledge/naf-sectors.json`) |
| Code NAF exact | `--naf` | `93.13Z` ou `10.71C,10.71D` |
| Région | `--region` | `28` (Normandie) |
| Département | `--departement` | `76` |
| Localité | `--code-postal` | `76600` |
| Volume | `--max-pages` | 25 établissements par page |

```bash
node scripts/source-registry.cjs --sector fitness --departement 76 --workspace proper-group
node scripts/source-registry.cjs --sector local_shop --code-postal 76600 --workspace doerz
```

## Ce que fait le script
1. Interroge l'annuaire officiel (recherche-entreprises.api.gouv.fr) : gratuit, sans clé, lecture seule.
2. Garde **un compte par établissement actif situé dans la zone** (SIRET). Un siège à Paris n'est pas une salle du Havre ; un établissement fermé est ignoré.
3. Marque l'**opposition à la prospection commerciale** inscrite au registre (`registryCommercialOpposition`) : le moteur exclut ces comptes, sans exception.
4. Propose les dirigeants **personnes physiques** comme contacts candidats (gérant, président), sans date de naissance ni nationalité. Pour une chaîne, le dirigeant légal ne gère souvent pas l'établissement : à vérifier.
5. Écrit `workspaces/<id>/data/sourcing-<secteur>-<zone>-<date>.json`, dans le dossier privé ignoré par git.

## Après le sourcing (toujours)
- Les comptes sortent en verdict `inconnu`. Ils passent par la qualification de `/outbound-batch` : résumé `<Ce qu'elle fait>. Clients : <types B2B>.`, puis verdict et `icpFit`, sur un premier lot de 50 revu par l'utilisateur.
- Annonce les chiffres : unités légales, établissements dans la zone, oppositions, comptes écartés.
- Un code NAF décrit une déclaration administrative, pas l'activité réelle : la qualification vérifie toujours le site.
- `health_practice` : ne prospecte pas avant une vérification déontologique.

## Limites
- L'API publique limite le débit : le script fait une pause entre les pages.
- Pas de téléphone ni d'email dans le registre : l'enrichissement suit la règle des devis approuvés.
- Accès réseau : le domaine `recherche-entreprises.api.gouv.fr` doit être autorisé dans l'environnement. À défaut, enregistre la réponse JSON de l'API dans un fichier et utilise `--from-file`.
