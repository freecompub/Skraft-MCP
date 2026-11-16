# ADR 0097 — Tout le produit s'appelle skraft, identifiants compris

## Contexte

L'ADR 0096 (hier) a corrigé les textes que le produit émet et **gardé les identifiants** — chemins,
variables d'environnement, noms de protocole — sur cet argument :

> `.agent-studio/projet.yaml` vit dans le dépôt **des projets utilisateurs**, commités par eux : les
> renommer rend muets les projets déjà configurés. `~/.agent-studio/mcp-skraft/` porte les tâches et
> les verrous. `/etc/agent-studio/admin.json` est posé par un administrateur.

**Cette raison était fausse, et rien ne l'avait vérifiée.** Mesure faite ensuite :

| Ce qui a été vérifié | Résultat |
| --- | --- |
| Le paquet sur npm | 404 sur `skraft-mcp`, `@skraft-mcp/serveur`, `mcp-skraft` |
| Tags Git, releases GitHub | aucun |
| `serveur/package.json` | `private: true`, version 0.1.0 |
| Dossiers `.agent-studio` existants | **2**, tous deux sur la seule machine de développement |
| Postes administrés (`/etc/agent-studio/admin.json`) | **0** |
| Refs `refs/agent-studio/**` dans les dépôts | **0** |

Il n'y a pas de projets utilisateurs, parce qu'il n'y a pas d'utilisateurs : rien n'a jamais été
publié. L'ADR 0096 a donc protégé un parc contre un renommage, sans jamais compter le parc. C'est
exactement le défaut que la garde instituée par ce même ADR 0096 existe pour empêcher — une
affirmation qui sonne juste et que rien ne vérifie — commise dans l'ADR qui l'institue.

Et c'est le **dernier moment où le renommage est gratuit** : chaque jour après la publication,
l'argument de l'ADR 0096 devient vrai.

## Décision

1. **Tous les identifiants prennent le nom du produit.**

   | Avant | Après |
   | --- | --- |
   | `~/.agent-studio/mcp-skraft/` | `~/.skraft/` |
   | `~/.agent-studio/mcp-skraft.json` | `~/.skraft.json` |
   | `.agent-studio/projet.yaml` | `.skraft/projet.yaml` |
   | `.agent-studio/lecons/`, `.agent-studio/workflows/` | `.skraft/lecons/`, `.skraft/workflows/` |
   | `AGENT_STUDIO_ADMIN_CONFIG` | `SKRAFT_ADMIN_CONFIG` |
   | `/etc/agent-studio/admin.json` (et macOS, Windows) | `/etc/skraft/admin.json` (idem) |
   | `refs/agent-studio/checkpoints` | `refs/skraft/checkpoints` |
   | serveur MCP `agent-studio` → `mcp__agent-studio__*` | `skraft` → `mcp__skraft__*` |
   | `Editor-Version: agent-studio` | `Editor-Version: skraft` |
   | identité Git `agent-studio@localhost` | `skraft@localhost` |
   | préfixes de fichiers temporaires `agent-studio-*` | `skraft-*` |
   | rôle `agent-studio/decouvreur-de-pile` | `skraft/decouvreur-de-pile` |

   Le dossier de données est **aplati** : `~/.skraft/` au lieu de `~/.agent-studio/mcp-skraft/`. Le
   deuxième niveau n'avait de sens que sous un produit qui hébergeait plusieurs choses. La
   configuration reste un fichier **voisin** du dossier, et non dedans : `--desinstaller --donnees`
   efface le dossier, et ne doit pas emporter un réglage que l'utilisateur a écrit à la main.

2. **Trois emplacements sont encore lus**, parce que des données y sont vraiment, sur la machine de
   développement et sur toute machine où quelqu'un aurait suivi le README :

   - `~/.agent-studio/mcp-skraft.json` : rendu par `cheminConfiguration` si le nouveau n'existe pas.
   - `~/.agent-studio/mcp-skraft/` : repris par `dossierDesDonnees` si le nouveau n'existe pas, et le
     journal **le dit**, avec le `mv` à faire. Un repli qui ne se signale pas devient un domicile
     permanent : la machine qui a besoin du renommage est précisément celle qui ne l'aurait jamais.
     Rien n'est déplacé au démarrage — un assemblage n'est pas le lieu d'une migration de 45 Mo.
     La fonction vit dans `serveur/src/emplacements.ts`, pure et testée aux quatre cas, plutôt que
     dans l'assemblage : décider où sont les données n'est pas assembler.
   - `.agent-studio/projet.yaml` : échelon de la chaîne de lecture du fichier de projet, avec un
     avertissement qui dit où le déplacer. Le workflow lit la même chaîne, sinon un projet non migré
     garderait sa pile et perdrait sa barre de qualité. Les deux emplacements sont **gelés** pendant
     un run : un agent ne doit pas pouvoir abaisser sa propre barre, pas même à l'ancien nom.

   `AGENT_STUDIO_ADMIN_CONFIG` reste lue, la nouvelle variable l'emportant : même raisonnement qu'à
   l'ADR 0095 pour les clés retirées — refuser n'autoriserait plus aucun programme.

   `.agent-studio/stack.yaml` et `.agent-studio/quality.yaml` étaient **déjà** dépréciés avant ce
   renommage (ADR 0071) ; ils gardent leur nom, qui est précisément celui d'un emplacement abandonné.

3. **La garde du nom se referme.** L'ADR 0096 autorisait quatre identifiants ; l'ADR 0097 n'autorise
   plus que les replis ci-dessus, chacun déclaré avec sa raison, et ajoute deux tests : le nom employé
   **comme mot** ne doit plus exister nulle part, et chaque repli déclaré doit encore être lu par le
   fichier qui le déclare. Une déclaration autorise un **chemin dans un fichier**, non une chaîne
   exacte : un avertissement cite le chemin au milieu d'une phrase, et c'est son usage légitime.

4. Le renommage ne touche pas `docs/` : les ADR, les études héritées et les 3 025 mentions des traces
   de `docs/runs/` disent d'où vient ce dépôt. Les effacer serait perdre l'information.

## Conséquences

- Les 441 occurrences hors archives tombent à un reliquat déclaré : onze replis dans six fichiers,
  plus la provenance en commentaires et dans `docs/`.
- `~/.skraft/` est le seul dossier du produit sur une machine. La migration des 45 Mo existants est
  un `mv` à faire une fois ; le serveur continue de fonctionner sans lui, en reprenant l'ancien
  dossier et en le disant.
- **Un test qui ne vérifiait rien a été trouvé en chemin.** `tests/workflow-skraft/bibliotheque.test.ts`
  contrôlait que tout nom importé de `@agent-studio/workflow` par le workflow est bien exporté ;
  le paquet s'appelle `@skraft-mcp/workflow` depuis le découpage, donc l'expression ne correspondait
  plus à aucun import et le test passait à vide. Remis en prise, il est vert — la bibliothèque était
  complète, mais on ne le savait pas. Même classe de défaut que le chemin mort de l'ADR 0094 : vert,
  silencieux, inutile.
- La chaîne de lecture du fichier de projet avait **zéro test direct** ; elle en a six maintenant.
  Un échelon de repli non testé ne se distingue pas d'un échelon absent.

## Alternatives

- **Garder les identifiants (ADR 0096).** Écarté par la mesure : le parc qu'il protégeait n'existe pas.
- **Renommer sans aucun repli.** Écarté : les 45 Mo de runs et le fichier de projet de l'exemple sont
  réels. Un repli lu et signalé coûte onze lignes déclarées ; une donnée devenue invisible en silence
  coûte la confiance dans le reste.
- **Déplacer les données au démarrage du serveur.** Écarté : un assemblage n'est pas le lieu d'une
  migration de 45 Mo, et un déplacement qui échoue à moitié est pire que deux dossiers.
- **Attendre la publication pour décider.** Écarté : c'est l'inverse de la fenêtre. Après publication,
  le même renommage demande une période de compatibilité annoncée, donc un coût qui n'existe pas
  aujourd'hui.

## Statut

Accepté — 2026-11-16. Remplace le point 2 de l'[ADR 0096](0096-le-nom-du-produit-dans-les-textes-est-skraft.md),
dont le point 1 (les textes nomment skraft) reste en vigueur.
