# CLAUDE.md

Ce dépôt contient le serveur MCP skraft et la plateforme qu'il utilise (voir `README.md`). Il est issu
d'agent-studio : les ADR de `docs/adr/` et les spécifications de `docs/specs/` en viennent, et leurs
décisions s'appliquent ici. Les mentions de l'application de bureau (Electron) et des extensions —
`tdd` comprise, retirée avec le sous-système par l'ADR 0091 — ne concernent plus ce dépôt.

Toute la documentation est en français ; écrire les ADR, messages et libellés en français.

## Règles de travail

- TDD strict : montrer le test rouge avant la correction. Réducteurs et politiques : fonctions pures,
  testées sans LLM, sans Git, sans disque.
- Toute nouvelle décision technique → ADR dans `docs/adr/NNNN-titre.md` (contexte, décision,
  conséquences, alternatives, statut).
- Le workflow est **copié** dans `serveur/dist/` au build : après une modification de
  `workflows/skraft/`, reconstruire (`pnpm build`).
- Le dépôt s'organise autour du serveur MCP (ADR 0091) : `serveur/` est le livrable, `moteur/` ce qui
  exécute un workflow, `capacites/` ce que `w.*` sait faire, `workflows/skraft/` la charge utile.
  `tests/architecture` tient ces invariants ; ne pas les contourner, les faire évoluer par un ADR.
  Un chemin de fichier écrit en dur doit exister et ne jamais nommer l'ancienne arborescence
  (ADR 0094) : ni compilateur ni test ne le vérifie autrement.
- Le produit s'appelle **skraft** dans tout texte lu par un agent ou par l'utilisateur (ADR 0096).
  « agent-studio » ne subsiste qu'en identifiant — chemin, variable d'environnement, nom de protocole,
  déclaré avec sa raison dans la garde — et en provenance ; renommer un identifiant demande un ADR qui
  porte sa migration.
- Un fichier repris de skraft-plugin porte sa provenance en commentaire. Une reprise ne déplace jamais
  vers le LLM une décision que le code prend.
- Commits conventionnels (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`).
- Tout le dépôt est sous **GPL-3.0-or-later** (ADR 0092), sans frontière interne : un fichier ajouté
  l'est aussi, et chaque `package.json` le déclare.

## Principe

**Le LLM propose, le code décide et vérifie.** Sorties des agents par outils terminaux à schéma ; les
preuves (tests) sont produites par le code ; les portes entre phases sont exécutées par le code ; une
session neuve par phase et par rôle.
