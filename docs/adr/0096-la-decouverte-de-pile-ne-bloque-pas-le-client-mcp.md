# ADR 0096 — La découverte de pile ne bloque pas le client MCP

## Statut

**Accepté** le 2026-11-16 par le responsable du projet, après validation du démarrage immédiat,
du suivi sans doublon et du maintien des vérifications et accords. Complète les ADR 0068 et 0076.

## Contexte

`skraft_pile` attendait la découverte, jusqu'à trois propositions d'agent, les diagnostics et les
canaris de chaque composant dans un seul appel MCP. Le délai du client expirait alors que le
serveur continuait. Une relance pouvait démarrer une autre découverte ; les questions et les
motifs de refus du premier appel ne parvenaient plus au client.

Le cas signalé sur un dépôt multicomposant montre ces expirations, des découvertes concurrentes
et de vrais refus : dépendances absentes, canaris non découverts et rapports de tests manquants.
Augmenter le délai ne résout ni la concurrence ni l'accès au résultat.

## Décision

Le serveur MCP lance la découverte et le diagnostic en arrière-plan, avec **une seule opération
par projet et par serveur**. `skraft_pile` avec `action: "suivre"` rend immédiatement ses messages
ou son résultat terminal, sans lancer d'agent. Un rappel de démarrage pendant le travail retrouve
la même opération. La vérification de connexion ne permet pas à deux appels simultanés de lancer
deux opérations.

Une réponse utilisateur n'est transmise qu'après la fin d'une opération ayant rendu la consigne
de réponse à sa question. Le suivi reste disponible sans connexion au runtime. `skraft_etat`
montre l'opération même si le projet n'a pas encore de pile ; un refus d'ouverture après sa fin
reste explicite dans `erreurPile`.

Les règles de l'ADR 0076 restent inchangées : trois essais au plus, programmes autorisés, schéma,
BDD, diagnostic et canaris, puis accord humain avant toute écriture.

## Conséquences

- Les sessions et canaris peuvent durer plus longtemps que le délai d'un appel MCP, sans perdre
  le résultat tant que le serveur reste vivant.
- Le client doit suivre l'opération et espacer ses rappels ; les skills des deux clients portent
  cette consigne.
- Le résultat reste consultable jusqu'au prochain démarrage de pile de ce projet. Après la fin,
  un appel `proposer` ou `diagnostiquer` lance une nouvelle opération ; `suivre` n'en lance jamais.
- Le suivi est **en mémoire**, pas un run rejouable : un redémarrage perd l'opération inachevée.
  Les profils déjà écrits restent sur disque. Aucune reprise n'est annoncée sans preuve.
- Les refus de validation du dépôt restent des refus : corriger le transport ne rend pas ses
  dépendances disponibles et ne change pas la façon de lire ses rapports.
- Pendant l'opération, l'état rend son suivi plutôt que d'ouvrir des services susceptibles
  d'interférer avec son verrou. L'état normal du projet redevient disponible après sa fin.

## Alternatives

- **Allonger le délai MCP.** Rejeté : il appartient au client ; plusieurs composants et les
  réponses humaines peuvent dépasser n'importe quelle durée raisonnable.
- **Relancer après expiration.** Rejeté : duplique les agents et les canaris sans récupérer le
  résultat abandonné.
- **Transformer la découverte en workflow persistant.** Non retenu pour cette correction :
  exigerait un protocole de reprise des sessions, canaris et accords humains. Le suivi en mémoire
  corrige le défaut observé sans prétendre fournir cette reprise.
