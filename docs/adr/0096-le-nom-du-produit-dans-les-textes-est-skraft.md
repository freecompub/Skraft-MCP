# ADR 0096 — Le nom du produit dans les textes est skraft, les identifiants restent agent-studio

## Contexte

Ce dépôt est issu d'agent-studio (ADR 0091). Le mot « agent-studio » y apparaît encore **441 fois hors
archives** — 299 dans le code et les tests, 142 dans les documents — plus 3 025 dans les traces de
`docs/runs/`. Le relevé montre qu'il ne désigne pas une seule chose :

| Ce que c'est | Exemples | Ce qu'un renommage ferait |
| --- | --- | --- |
| Un **identifiant** : chemin sur un disque, dans un dépôt, ou nom dans un protocole | `~/.agent-studio/mcp-skraft/`, `.agent-studio/projet.yaml`, `AGENT_STUDIO_ADMIN_CONFIG`, `/etc/agent-studio/admin.json`, `refs/agent-studio/checkpoints`, `mcp__agent-studio__*`, `Editor-Version: agent-studio`, `agent-studio@localhost` | casser l'existant |
| Un **texte** lu par un agent LLM ou par l'utilisateur | `## Fonctionnement dans agent-studio`, `Noms des outils d'agent-studio dans cette session`, `Décision de permission d'agent-studio`, `onPost("agent-studio", …)` | corriger un cadre faux |
| De la **provenance** : ADR, `docs/runs/`, `freecompub/AgentStudio#32` | les commentaires de reprise, les traces archivées | perdre l'information |

La garde posée par cet ADR chiffre la deuxième colonne sans ambiguïté, puisqu'elle énumère les
chaînes par le compilateur : **seize** chaînes du code de production nommaient le produit comme un
mot, et **quatre** sites sont des identifiants gardés. Le reste des 441 est collé à un séparateur ou
vit dans un commentaire.

Les trois classes ont été confondues sous un même constat — « il reste des références à agent-studio » —
alors qu'une seule est un défaut, et que traiter les autres de la même façon casserait l'existant.

Le défaut : `contractBlock` ajoute à **chaque prompt d'agent** un bloc intitulé « Fonctionnement dans
agent-studio », et ce bloc « prime sur toute consigne contraire ». Le code donnait donc au LLM, en
position d'autorité, le nom d'un produit qui n'est pas celui qui l'exécute. Même chose pour les noms
d'outils annoncés dans la session et pour la description de l'outil de permission lue par le CLI. Rien
ne le signalait : ni le compilateur, ni les 1 791 tests, ni les huit gardes de structure. C'est la
quatrième forme du même trou — le dépôt ne sait pas signaler ses propres contradictions — après les
ADR contredits (0091), les renvois morts (0093) et les chemins morts (0094), et la première qui se
manifeste dans la **sortie du produit** plutôt que dans ses sources.

Mesure faite avant de décider, sur les trois voies des identifiants :

- `.agent-studio/projet.yaml`, `stack.yaml`, `quality.yaml`, `lecons/`, `workflows/` vivent dans le
  dépôt **des projets utilisateurs**, commités par eux. Les renommer rend muets les projets déjà
  configurés, sauf à lire les deux noms pendant une période.
- `~/.agent-studio/mcp-skraft/` porte les tâches, les verrous et l'état : renommer orpheline les runs
  en cours.
- `AGENT_STUDIO_ADMIN_CONFIG` et `/etc/agent-studio/admin.json` sont posés par un administrateur.
  L'ADR 0095 vient d'établir qu'un poste administré garde ce qu'il porte ; le même raisonnement
  interdit de déplacer le fichier sous ses pieds.
- `refs/agent-studio/checkpoints` est déjà écrit dans les dépôts où skraft a tourné.
- `Editor-Version: agent-studio` est attendu tel quel par l'API Copilot ; `mcp__agent-studio__*` est
  régénéré à chaque run et ne persiste rien, mais c'est le nom que l'agent voit sur ses outils.

## Décision

1. **Un texte lu par un agent ou par l'utilisateur ne nomme plus agent-studio.** Il nomme skraft.
   Corrigés : l'en-tête du contrat d'exécution, l'annonce des noms d'outils, la description de l'outil
   de permission, les treize `onPost("agent-studio", …)` par lesquels le serveur poste en son propre
   nom, et les commentaires qui nommaient le produit.
2. **Un identifiant garde son nom**, et la garde le dit avec sa raison, pour chacun : nom du serveur
   MCP (deux sites), en-tête Copilot, identité Git des commits instantanés. Les chemins (`.agent-studio/…`,
   `/etc/…`, `refs/…`, `AGENT_STUDIO_*`, préfixes de fichiers temporaires) ne sont pas visés par la
   garde : le nom y est collé à un séparateur, ce qui le distingue mécaniquement d'un mot.
3. **La provenance reste.** Un commentaire de reprise, un ADR, une trace de `docs/runs/` disent d'où
   vient un fichier ; les effacer serait perdre l'information, pas la corriger.
4. Une **neuvième garde** (`tests/architecture/test/nom-du-produit.test.ts`) tient le point 1. Elle
   énumère les chaînes du code de production par le compilateur TypeScript et refuse le nom employé
   **comme mot** — `agent-studio` non précédé ni suivi de `.`, `/`, `\`, `@`, `-` ou d'un caractère de
   mot — sauf pour les quatre identifiants déclarés, chacun avec la raison qui le garde. Un commentaire
   n'étant pas un nœud de chaîne, la provenance passe d'elle-même (même propriété qu'à l'ADR 0094).

Renommer les identifiants reste possible, par un ADR qui porterait sa migration : lire les deux noms,
dire lequel a été lu, et donner une échéance. Ce n'est pas décidé ici, et la garde ne le présume pas.

## Conséquences

- Le prompt de chaque agent annonce désormais « Fonctionnement dans skraft ». Trois assertions de
  tests qui figeaient l'ancien en-tête ont été mises à jour avec lui.
- La garde refuse toute nouvelle occurrence du nom comme mot. Ajouter un identifiant demande de
  l'inscrire avec sa raison : la liste est la décision rendue exécutable, pas une dérogation.
- Son second test vérifie que chaque identifiant déclaré est encore dans le fichier qui le déclare :
  une dérogation qui ne sert plus se signale au lieu de rester.
- `onPost` garde son premier paramètre : aux lignes qui relaient un jalon ou une alerte, il porte
  l'identifiant réel de la session émettrice. Seuls les appels où le serveur parle de lui-même sont
  renommés. La seule assemblée de ce dépôt (`serveur/src/services.ts`) ignore ce paramètre ; la
  question de son utilité reste ouverte et n'est pas tranchée ici.

## Alternatives

- **Tout renommer, identifiants compris.** Écarté : casse les projets déjà configurés et les postes
  administrés, sans migration, pour une cohérence de surface.
- **Ne rien faire, le nom étant interne.** Écarté : le bloc qui « prime sur toute consigne contraire »
  n'est pas interne, c'est la sortie du produit vers le LLM qui décide ensuite.
- **Corriger les seize chaînes sans garde.** Écarté : c'est ce qui a été fait pour la prose des
  documents en PR #6, et la quatrième forme du trou est restée ouverte. Les trois formes déjà fermées
  l'ont été par du code.
- **Une garde par liste de fichiers autorisés.** Écartée : `relais.ts` porte à la fois un identifiant
  à garder et un texte à corriger. La dérogation porte donc sur le couple fichier + valeur exacte.

## Statut

Accepté — 2026-11-16.
