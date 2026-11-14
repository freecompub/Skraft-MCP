# ADR 0091 — Le dépôt s'organise autour du serveur MCP

## Statut

**Proposé** le 2026-11-14, à ratifier par le responsable du projet, qui en a demandé l'étude :
« propose moi une restructuration, où le serveur mcp c'est le but principal, pour faire fonctionner
le workflow ».

Exécute une supersession déjà décidée par l'ADR 0055 (point 9 et conséquences), restée non réalisée.
Concerne l'organisation du dépôt, pas le comportement d'un run.

## Contexte

Ce dépôt a été séparé d'agent-studio le 2026-11-14 (commit `8dc71a8`) avec l'historique de ses
fichiers. Il en a gardé une structure dimensionnée pour agent-studio : **deux hôtes** (l'application
de bureau Electron et le serveur MCP), un **système d'extensions**, et plusieurs workflows possibles.

Le code énonce lui-même cette hypothèse, en tête du paquet qui en dépend le plus
(`packages/project-services/src/index.ts`) :

> « Services d'un projet ouvert, **sans dépendance à l'application qui les héberge** : l'application
> de bureau (Electron) et le serveur MCP (ADR 0068) les assemblent de la même façon. »

Il n'en reste qu'un hôte, et c'est l'objet du dépôt. Ce qui subsiste de l'hypothèse est mesurable :

1. `apps/mcp-skraft/src/assemblage.ts:85` passe `extensions: []`. La boucle d'activation
   (`workspace-services.ts:410`) itère sur du vide : le sous-système d'extensions n'est **jamais**
   exercé en production.
2. `extensions/tdd` ne sert qu'aux tests (son propre projet Vitest, le validateur de manifeste, et
   l'unique activation non vide du dépôt, `workspace-services.test.ts:45`). La justification est
   circulaire : l'exemple existe pour tester le sous-système, le sous-système existe pour charger
   l'exemple.
3. `packages/extension-installer` n'a aucun importeur vivant.
4. `packages/extension-manifest` et `packages/project-services` dépendent de `@skraft-mcp/ext-tdd` :
   la plateforme dépend de son exemple.
5. `core` et `extension-api` se déclarent mutuellement en `dependencies` : cycle réel
   (`core/index.ts` → `turns/run-turn.ts` → `extension-api/index.ts` → `core/index.ts`).
   `extension-api` n'est pas une API mais un baril, qui ré-exporte `core`, `stack-adapters` et
   `task-engine` ; l'ADR 0001 le justifiait par « destiné aux tiers » — il n'y a plus de tiers.
6. `packages/workflow/src/hote/activer.ts:126` **fabrique un faux manifeste d'extension**
   (`validateManifest(manifesteDuWorkflow(w))`) pour faire valider un workflow par le validateur
   d'extensions, alors que l'ADR 0055 §5 prévoit une validation du `meta` par schéma et que
   `chargeur/schema.ts` l'implémente.
7. `project-services` dépend de 10 paquets internes sur 13, et son `workspace-services.ts` fait
   904 lignes : c'est une racine de composition écrite pour être partagée par deux hôtes.

L'ADR 0055 point 9 gardait le système d'extensions « pour ce qui n'est pas une orchestration » :
cette prémisse est tombée avec la séparation. Ses conséquences avaient déjà périmé le manifeste
signé — « la signature des paquets ne s'applique plus aux workflows ».

## Décision

1. **Quatre pairs de premier niveau qui disent le but** : `serveur/` (le livrable), `moteur/` (ce qui
   exécute un workflow), `capacites/` (ce que `w.*` sait faire), `workflow/skraft/` (la charge utile).
   À côté : `outils/` (ex-`scripts/`), `exemples/` (ex-`profiles/`), `tests/`, `docs/`.
2. **La racine de composition appartient au livrable.** `workspace-services.ts` se dissout :
   la composition rejoint `serveur/src/assemblage/` ; la découverte des workflows et la reprise des
   tâches rejoignent `moteur/journal/` ; l'activation d'extensions est supprimée.
3. **Le sous-système d'extensions est retiré** : `extension-api`, `extension-installer`,
   `extension-manifest`, `extension-packaging` et `extensions/tdd`. Les classes d'erreur rejoignent
   `capacites/agents`. Le cycle meurt **par suppression**, sans paquet feuille ajouté.
4. `validateManifest` est remplacé par le schéma du `meta` (ADR 0055 §5).
5. **Les noms disent ce que les paquets font** : `extension-host` devient `moteur/bac-a-sable`
   (le bac à sable qu'exige l'ADR 0055 §7) ; `core` devient `capacites/agents`.
6. **Conventions tenues par le code** : un paquet nommé `@skraft-mcp/tests-…` est un paquet de
   tests et peut dépendre de n'importe quoi ; un paquet qui expose une commande (`bin`) est un
   livrable et seul lui a le droit d'assembler ; **tout autre paquet dépend de 5 paquets internes
   au plus**, au-delà il est une racine de composition déguisée. Aucun cycle.
7. **Le workflow reste auto-suffisant** (ADR 0055 §7 : processus isolé, sans modules Node) : il ne
   dépend d'aucun paquet du workspace. La flèche inverse existe —
   `apps/mcp-skraft/src/us-github.ts:12` importe `parseStory`, `slugOf` et `extractLiterals` de
   `workflows/skraft/story.mjs` — et lie donc du code GPL dans `dist/main.mjs`. Un ADR distinct
   ratifie la licence du paquet ; `deployer.mjs:126` livre déjà la GPL comme `LICENSE` racine du
   paquet npm.
8. Ces invariants sont vérifiés par `tests/architecture`, pas par la vigilance.

## Conséquences

- **14 paquets → 9**, et environ **2 520 lignes** retirées (`extension-api` 453,
  `extension-installer` 222, `extension-manifest` 160, `extension-packaging` 218, `extensions/tdd`
  1 468). Le cycle, les deux dépendances inversées et le paquet-dieu disparaissent ensemble.
- **Plus de portabilité d'hôte.** Un second hôte redemanderait d'extraire une racine de composition.
  Assumé : il n'y en a plus, et c'est l'hypothèse que cet ADR retire.
- **Plus d'extensions tierces.** La voie d'extension du produit est le workflow (ADR 0055), avec son
  accord par empreinte et son dossier gelé.
- `activateInProcess` et `activateIsolated` perdent leur unique fixture : c'est du code déjà mort en
  production (point 1 du contexte).
- **Les déplacements ne touchent aucun import de production** : les paquets ne se parlent que par
  leur nom (`@skraft-mcp/…`). Le coût se limite à une dizaine de chemins relatifs, tous dans des
  tests, `vitest.config.ts`, `apps/mcp-skraft/scripts/build.mjs` et `scripts/banc`, plus trois globs
  de configuration (`pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`) et un `pnpm install`.
- Les tests du workflow rejoignent `workflow/skraft/test/`, exclus de la copie du build par un
  `filter` de plus, à côté de celui qui exclut déjà `node_modules`.
- Le seuil de 5 paquets du point 6 est la dent de la décision : un paquet qui le dépasse doit être
  découpé, ou devenir le livrable. Mesure après restructuration : `moteur/journal` est le plus gros,
  à 5.

## Alternatives

- **Tout fusionner en un seul paquet**, puisqu'il n'y a qu'un livrable. Écarté : les protocoles par
  paquet de l'ADR 0001 sont réellement utilisés — les tests substituent git, le disque et le runtime
  par des doubles. La restructuration réduit le nombre de paquets sans renoncer au principe.
- **Garder le sous-système d'extensions au cas où.** Écarté : l'ADR 0055 a déjà désigné le workflow
  comme voie d'extension ; le sous-système coûte 5 unités de workspace, un cycle et deux dépendances
  inversées, pour zéro extension chargée.
- **Garder `project-services` indépendant de son hôte.** Écarté : l'indirection n'a plus de second
  consommateur, et elle coûte un paquet qui dépend de 10 autres et un fichier de 904 lignes.
- **Renommer sans déplacer.** Écarté : `apps`, `packages`, `extensions`, `tests` ne disent rien du
  projet, et le déplacement est quasi gratuit (conséquences).
- **Extraire `story.mjs` dans un paquet partagé** pour supprimer la flèche serveur → workflow.
  Impossible : l'ADR 0055 §7 impose un workflow auto-suffisant, sans modules Node.
