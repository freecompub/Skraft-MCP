# ADR 0094 — Les chemins écrits en dur sont tenus par le code

## Statut

**Accepté** le 2026-11-15 par le responsable du projet, qui a demandé la PR après l'essai réel du
2026-11-15. Fait évoluer les invariants de l'ADR 0091 §6, comme `CLAUDE.md` l'exige.

## Contexte

L'ADR 0091 a renommé `apps/mcp-skraft` en `serveur` et dissous `packages/`. Les gardes de
`tests/architecture` ont été écrites pour tenir cette arborescence — mais elles lisent le **graphe des
paquets**, par les `package.json`. Un chemin de fichier écrit dans une chaîne de caractères leur est
invisible.

Un essai réel du serveur sur le dépôt d'exemple, le 2026-11-15, l'a montré du dehors :
`scripts/essai-mcp-skraft.ts` lançait encore `apps/mcp-skraft/dist/main.mjs`. Le script ne démarrait
plus depuis le 2026-11-14. Entre-temps : `pnpm typecheck` vert, `pnpm build` vert, 1 791 tests verts,
six gardes de structure vertes, une PR relue et mergée. **Rien n'avait rien signalé** — un chemin dans
une chaîne n'est vérifié par aucun compilateur et par aucun test qui ne l'exécute pas.

Le même relevé en a trouvé un second, qu'aucun essai n'aurait révélé : `serveur/scripts/deployer.mjs`
déclarait les métadonnées npm du paquet comme `AgentStudio`, sous-dossier `apps/mcp-skraft`. Il ne se
serait vu qu'après publication, sur le registre.

C'est la famille de défaillance que l'ADR 0091 a déjà rencontrée deux fois : quatre ADR acceptés que
le code contredisait sans le dire, et 175 renvois documentaires qui ne résolvaient plus (ADR 0093).
À chaque fois, le défaut n'était pas la faute — il était que **rien ne la rendait visible**.

## Décision

Une garde, `tests/architecture/test/chemins-du-depot.test.ts`, tient deux invariants sur le code qui
tourne en production :

1. **Aucun chemin ne mène à un dossier retiré par l'ADR 0091 §3** : `apps/`, `packages/`,
   `extensions/`.
2. **Tout chemin de fichier écrit en dur existe**, résolu depuis le paquet où il est écrit — c'est
   depuis lui qu'il est lu — à défaut depuis la racine.

Trois points la rendent juste plutôt qu'approximative :

- **Les chaînes sont relevées par le parseur TypeScript**, jamais par une expression régulière. Un
  commentaire n'est pas un nœud de chaîne : la provenance héritée d'agent-studio
  (`apps/desktop/src/main/index.ts` dans `serveur/src/assemblage.ts`) passe d'elle-même, comme elle le
  doit — elle raconte le passé, elle ne l'adresse pas. C'est aussi la leçon du découpage de
  `livraison.mjs`, où analyser du JavaScript à la regex a coûté quatre passes.
- **Le workflow est hors de la garde.** `workflows/skraft/` est la charge utile : ses chaînes parlent
  du dépôt de l'utilisateur. `packages/` y est un dossier de modules qu'il doit savoir reconnaître
  ailleurs.
- **Les tests sont hors de la garde.** Ce sont des simulations : `apps/web`, `src/ancien.ts`,
  `stories/us-12.md` y sont des fixtures de projets imaginaires.

Ces trois exclusions ne sont pas des concessions : c'est la mesure qui les a dictées. La première
version de la garde relevait neuf cas ; sept étaient des faux positifs, et chacun disait la même
chose — un chemin n'est un défaut que s'il désigne **ce dépôt-ci**.

## Conséquences

- Les deux défauts sont corrigés par la garde, dans le même commit, après l'avoir vue rouge sur eux
  et sur rien d'autre.
- Les gardes de structure passent de six à **huit**.
- Un chemin de fichier déplacé sans mettre à jour ses appelants fait désormais échouer la suite, au
  lieu d'attendre une exécution.
- La garde ne couvre pas tout : un chemin **assemblé** (`join(dossier, nom)`), une chaîne construite,
  un chemin dans un `.md` ou un `.json` lui échappent. Elle tient les chemins littéraux, qui sont le
  cas courant et les deux cas réels trouvés ici.
- `tests/architecture` déclare désormais `typescript` : la garde a besoin d'un parseur. C'est la
  première dépendance de ce paquet, et elle ne pèse pas sur le graphe qu'il mesure, `typescript`
  n'étant pas un paquet du dépôt.

## Alternatives

- **Ne rien faire et corriger les deux chemins.** Rejetée : la correction sans la garde laisse
  intacte la raison pour laquelle le défaut a survécu à une PR relue. C'est la vigilance qui avait
  déjà échoué.
- **Résoudre tout chemin à l'exécution plutôt qu'à l'écriture** (un helper qui vérifie et lève).
  Rejetée : il faudrait exécuter le chemin pour le découvrir, et c'est exactement ce qui n'a pas eu
  lieu pendant un jour.
- **Interdire les chemins écrits en dur** et tout passer en configuration. Rejetée : la configuration
  déplace le chemin sans le vérifier davantage, et coûte en lisibilité ce qu'elle ne rend pas en
  sûreté.
- **Étendre la garde aux `.md` et aux `.json`.** Écartée pour l'instant : les renvois documentaires
  ont déjà leur garde (ADR 0093), et le bruit des documents hérités, qui citent l'ancienne
  arborescence à bon droit, rendrait la garde inexploitable sans une liste d'exemptions à tenir à la
  main.
