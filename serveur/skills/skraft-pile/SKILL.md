---
name: skraft-pile
description: "Fait découvrir la pile du projet par un agent (comment lancer ses tests, BDD compris), la fait vérifier en l'exécutant, puis l'écrit après accord ; ou la diagnostique. Usage : /skraft-pile [diagnostiquer] [sans bdd] [réponse à la question de l'agent]."
---

Appelle l'outil MCP `skraft_pile` du serveur `skraft`. Lis le texte qui suit la commande :

- « diagnostiquer » (ou « doctor ») : `action: "diagnostiquer"` ; sinon, ne donne pas d'action ;
- « sans bdd » : `sansBdd: true` ;
- un lanceur ou des dossiers BDD nommés : `lanceur`, `features`, `etapes` ;
- une réponse à la question que l'agent de découverte a posée : `reponse`, en une phrase complète
  (« les tests se lancent avec … »). L'agent ne revoit pas sa question.

L'appel lance le travail en arrière-plan et rend la main. Tant qu'il indique « en cours », rappelle
`skraft_pile` avec `action: "suivre"` et le même `projet`, sans redonner les options ni `reponse`.
Espace les rappels d'environ dix secondes ; ne relance pas `proposer` pour consulter le résultat.
Montre les messages et le résultat tels quels. Si l'agent pose une question, montre-la avec ses
réponses possibles et attends l'utilisateur ; il répondra par `/skraft-pile <sa réponse>`.
La réponse lance la suite : suis-la de la même façon. `skraft_etat` montre aussi la découverte,
même si aucune pile n'est encore déclarée.

Le suivi appartient au serveur courant : après un redémarrage, consulte d'abord l'état du projet.
Si aucun profil n'a été écrit, relance la découverte ; ne prétends pas que l'opération a repris.

Les questions de skraft, et celles que le client affiche (ouvrir un dépôt, autoriser un programme, écrire un profil), reviennent à l'utilisateur : tu ne réponds jamais à la place de l'utilisateur.
