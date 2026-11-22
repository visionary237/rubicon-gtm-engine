# LinkedIn — « Passer le Rubicon »

> À publier seulement une fois le dépôt public et le lien vérifié. Chaque phrase ci-dessous décrit une fonctionnalité réellement implémentée et testée dans la v1.0.0.

## Version courte

**Passer le Rubicon.**

Plus de leads. Plus d'outils. Plus de commerciaux.
Est-ce vraiment la réponse à un problème de croissance ?

On construit un ICP pour nos clients.
Pourquoi jamais pour nos propres commerciaux ? Ni pour nos offres ? Ni pour le bon moment ?

J'ai construit RUBICON, un prototype open source qui traite la performance commerciale comme un problème d'ingénierie :
→ qualifier les entreprises avant de payer leurs contacts,
→ associer chaque prospect à la bonne offre et au bon commercial, avec une explication chiffrée,
→ faire passer les relances promises avant les nouveaux leads,
→ et vérifier les notes d'appel contre l'agenda et les mails réellement envoyés.

L'objectif : qu'à 8 h, chaque commercial sache qui appeler, pourquoi, avec quelle offre et dans quel ordre.

Claude Skills pour capitaliser le savoir métier. MCP pour connecter les outils. Un moteur de décision unique, testé, exécuté dans n8n. SQL et Python pour apprendre.

Données fictives, aucune API payante, rien n'est dépensé ni envoyé sans validation humaine.

Merci à Valentin Morterol (Scalon) pour l'Outbound Blueprint, publié en MIT, dont la méthode est à la base de la qualification.

Stop generating leads. Start engineering revenue.
🔗 [lien du dépôt]

## Version longue

**Passer le Rubicon.**

Quand la croissance ralentit, le réflexe est presque toujours le même : plus de leads, plus d'outils, plus de commerciaux.

Recruter est la bonne réponse quand on manque de capacité. Mais un nouveau commercial hérite aussi de l'environnement dans lequel il arrive : un fichier mal qualifié, des relances oubliées, des appels attribués au hasard, une première heure de la journée passée à chercher qui appeler.

Et si, avant d'ajouter des commerciaux, on optimisait cet environnement ?

On sait construire un Ideal Customer Profile. RUBICON pousse la logique jusqu'au bout et modélise aussi :
• l'**Ideal Sales Profile** : les compétences déclarées de chaque commercial par offre et par secteur, sa capacité, ses relations existantes ;
• l'**Ideal Offer Profile** : quelle offre répond à quelle problématique vérifiée ;
• l'**Ideal Timing Window** : promesses dues, signaux récents, saisonnalité ;
• la **Next Best Action** : appeler, rappeler, enrichir, réactiver, proposer, attendre, ne pas contacter.
(Ce sont mes termes de travail, pas des standards.)

Six étapes : Discover, Understand, Match, Activate, Expand, Learn.

Ce que fait concrètement le prototype :
1. Il qualifie les entreprises avant d'acheter le moindre contact. « Inconnu » part en validation humaine, pas à la poubelle.
2. Il réutilise les données existantes, chiffre chaque enrichissement et attend un accord explicite. Un échec n'est jamais repayé.
3. Il associe offre, interlocuteur et commercial avec des scores dont chaque contribution est visible et contestable.
4. Il protège les relances promises : si personne ne peut les tenir, il escalade au manager au lieu de les laisser tomber.
5. Il prépare des fiches d'appel avec un script de 25 secondes, sans jamais inventer d'étude ni de référence.
6. Le soir, il confronte les notes d'appel à l'agenda et aux mails envoyés. Un rendez-vous sans événement agenda ne crée pas de deal.

Ce qu'il ne fait pas : prédire la conversion, appeler à votre place, envoyer des messages, ni surveiller les commerciaux. Il n'infère aucune émotion ni fatigue. Les poids sont des hypothèses configurables, pas une vérité scientifique.

Côté technique : un seul moteur de décision en JavaScript, exécuté à l'identique en ligne de commande et dans n8n (vérifié sur une vraie instance), 11 Claude Skills, des modes mock, dry-run et live, SQLite et Python pour l'analyse, 31 tests automatisés.

La méthode de qualification s'appuie sur l'Outbound Blueprint de Valentin Morterol (Scalon), publié sous licence MIT. Merci à lui d'avoir partagé un travail aussi concret.

Prochaine étape : l'utiliser pour de vrai sur mes deux entreprises, Proper Group et DOERZ, et partager les résultats mesurés, pas des projections.

Stop generating leads. Start engineering revenue.

🔗 [lien du dépôt] · 🎥 démo de 90 secondes en commentaire

#GTMEngineering #RevOps #SalesOps #GrowthEngineering #n8n #ClaudeCode
