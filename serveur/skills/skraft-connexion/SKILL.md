---
name: skraft-connexion
description: "Connecte skraft à son runtime (Copilot par GitHub, ou Claude) pour qu'il puisse faire travailler ses agents. Usage : /skraft-connexion."
---

Appelle l'outil MCP `skraft_connexion` du serveur `skraft`, sans argument.

Avec le runtime Copilot, le serveur demande à l'utilisateur de choisir GitHub.com ou GitHub
Enterprise. S'il choisit Enterprise, il lui demande le hostname de son instance, sans protocole ni
chemin. Laisse l'utilisateur choisir et saisir le hostname ; ne choisis jamais à sa place. Le choix
est conservé dans la configuration du serveur et utilisé pour les connexions suivantes.

- La réponse donne un code et une adresse à ouvrir (Copilot) ou une commande à lancer (Claude) :
  montre-les à l'utilisateur tels quels.
- Quand il dit avoir validé, rappelle `skraft_connexion` pour vérifier, et dis le résultat.

Les questions de skraft, et celles que le client affiche (ouvrir un dépôt, autoriser un programme, écrire un profil), reviennent à l'utilisateur : tu ne réponds jamais à la place de l'utilisateur.
