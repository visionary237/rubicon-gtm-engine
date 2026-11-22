---
name: market-intelligence
description: Cartographie un marché pour RUBICON (verticales, segments, taille adressable, sources de données, concurrence, signaux commerciaux) et produit des études documentées pouvant devenir des Commercial Value Assets vérifiés. Use when the user says "/market-intelligence", "cartographie le marché X", "quelle taille fait ce marché", "prépare une étude sectorielle", "quels signaux suivre".
---

# market-intelligence · statut : documenté, procédure manuelle assistée (pas de moteur dédié)

## Procédure
1. **Périmètre** : verticale, zone, taille, offre visée. Un seul périmètre par étude.
2. **Sources** : registres publics (SIRENE, annuaire des entreprises), exports autorisés de fournisseurs, sites des entreprises, presse sectorielle. Vérifie les conditions d'utilisation de chaque source avant de la réutiliser.
3. **Comptage** : chiffres exacts et datés, méthode décrite, doublons et établissements distingués (SIREN ≠ SIRET ≠ domaine).
4. **Signaux** : ouverture, recrutement, renouvellement de contrat, avis en baisse, événements sectoriels. Chaque signal porte une date, une source et un statut `verified`. N'ajoute son type à `config.signals.weights` qu'après validation.
5. **Livrable** : une étude en Markdown avec méthode, sources, limites et date. Elle ne devient un CVA (`assets[]`) que lorsque l'utilisateur la valide (`verified: true`, `status: approved`), avec la phrase `callReason` exacte qui sera dite au téléphone.

## Interdits
Inventer une étude, un chiffre, un client ou une source. Arrondir un chiffre pour le rendre plus vendeur. Présenter une estimation comme un comptage. Dissimuler la nature commerciale de la prise de contact.
