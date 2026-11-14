# CLAUDE.md

Ce dépôt contient le serveur MCP skraft et la plateforme qu'il utilise (voir `README.md`). Il est issu
d'agent-studio : les ADR de `docs/adr/` et les spécifications de `docs/specs/` en viennent, et leurs
décisions s'appliquent ici. Les mentions de l'application de bureau (Electron) et des extensions autres
que `tdd` ne concernent plus ce dépôt.

Toute la documentation est en français ; écrire les ADR, messages et libellés en français.

## Règles de travail

- TDD strict : montrer le test rouge avant la correction. Réducteurs et politiques : fonctions pures,
  testées sans LLM, sans Git, sans disque.
- Toute nouvelle décision technique → ADR dans `docs/adr/NNNN-titre.md` (contexte, décision,
  conséquences, alternatives, statut).
- Le workflow est **copié** dans `apps/mcp-skraft/dist/` au build : après une modification de
  `workflows/skraft/`, reconstruire (`pnpm build`).
- Un fichier repris de skraft-plugin porte sa provenance en commentaire. Une reprise ne déplace jamais
  vers le LLM une décision que le code prend.
- Commits conventionnels (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`).

## Principe

**Le LLM propose, le code décide et vérifie.** Sorties des agents par outils terminaux à schéma ; les
preuves (tests) sont produites par le code ; les portes entre phases sont exécutées par le code ; une
session neuve par phase et par rôle.
