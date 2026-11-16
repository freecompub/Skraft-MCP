---
name: skraft-demarrer
description: "Démarre skraft sur une user story : recherche, conception, scénarios d'acceptance, TDD, revues. Usage : /skraft-demarrer <chemin de la story> [auto] [archi <skill>]."
---

Avant de déclarer un outil indisponible, résous-le dans cette session. Si le client charge les
outils MCP à la demande, utilise son outil de recherche ou de découverte pour trouver
`skraft_demarrer` sur le serveur `skraft` et charger son schéma. Fais de même pour les outils
de suivi quand tu en as besoin. Le nom affiché peut être préfixé par le client : utilise le nom
et les arguments réellement exposés, sans inventer de signature.

L'absence d'une définition dans ton contexte n'est pas une panne du serveur. Si la recherche ne
trouve pas l'outil, vérifie l'état du serveur dans la liste MCP du client et rapporte le diagnostic
observé (désactivé, déconnecté, outil non exposé, ou vérification impossible). Ne prétends ni qu'un
run a démarré, ni que le serveur est inaccessible sans preuve.

Appelle l'outil MCP `skraft_demarrer` du serveur `skraft`. Lis le texte qui suit la commande :

- la story : `story`, le chemin d'un fichier relatif au projet, ou une issue GitHub (son URL, ou
  `org/dépôt#n`). Une issue est lue avec ses commentaires et ses dépendances ; si une issue qui la
  bloque est encore ouverte, skraft refuse de démarrer, et tu le dis à l'utilisateur ;
- « auto » : `auto: true` (la difficulté proposée est retenue sans confirmation) ;
- « archi <nom> » : `archi`, le skill d'architecture.

Au premier lancement, la réponse est un résumé à faire accepter : montre-le, et demande à
l'utilisateur s'il accepte une fois ou toujours. S'il accepte, rappelle `skraft_demarrer` avec les
mêmes arguments et `accord: "une-fois"` ou `accord: "toujours"`. Ne choisis pas pour lui.

Le run lancé, suis-le comme le fait `/skraft-attendre` : appelle `skraft_attendre` avec la tâche,
dis à chaque retour ce qui a changé et la ligne de progression, et recommence tant que `termine` est
faux. Une question apparaît : montre-la avec ses options, et réponds par `skraft_repondre` avec le
choix de l'utilisateur. Le run fini, appelle `skraft_rapport` et montre le bilan.

Sans pile, le serveur refuse de démarrer : propose `/skraft-pile`.

Les questions de skraft, et celles que le client affiche (ouvrir un dépôt, autoriser un programme, écrire un profil), reviennent à l'utilisateur : tu ne réponds jamais à la place de l'utilisateur.
