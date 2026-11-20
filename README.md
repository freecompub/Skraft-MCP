# Skraft-MCP

Serveur MCP qui exécute **skraft** sur le projet de l'appelant, depuis un client MCP (Claude Code,
Copilot CLI). Une user story passe par quatre phases : RESEARCH, DESIGN (avec ADR), DISTILL
(scénarios d'acceptance), DELIVER (TDD). Chaque phase est revue par des lentilles, et le code vérifie
les portes entre les phases : le LLM propose, le code décide et vérifie. Le travail est commité sur la
branche `skraft/<slug>` du projet.

Le mode d'emploi complet du serveur (outils MCP, configuration, `admin.json`, déploiement) est dans
[`serveur/README.md`](serveur/README.md).

## Démarrer

```bash
pnpm install
pnpm build          # serveur/dist : serveur, processus des workflows, workflow skraft
pnpm deployer       # construit, inscrit le serveur dans Copilot CLI et Claude Code, pose les commandes /skraft-…
```

Prérequis : Node.js 22.13 ou plus, `git`, et le runtime des agents (Copilot avec `gh`, ou Claude Code).

## Développer

```bash
pnpm typecheck
pnpm test                                   # toute la suite Vitest
pnpm vitest run --project workflow-skraft   # un projet : agents, taches, workflow, depot, pile, …
pnpm essai <projet> <story> <reponses.json> --runtime=claude --suivi=attendre   # essai réel, hors CI
```

| Dossier | Contenu |
| --- | --- |
| `serveur` | **le livrable** : la surface MCP, son assemblage, ses skills, son déploiement |
| `moteur/workflow` | ce qui exécute un workflow : journal rejouable, chargeur, accord par empreinte, `w.*` |
| `moteur/bac-a-sable` | le processus isolé, son RPC, le lancement des tests et le gel des fichiers |
| `capacites/*` | ce que `w.*` sait faire : `agents`, `pile`, `pile-du-projet`, `depot`, `taches`, `github`, `runtime-claude`, `runtime-copilot` |
| `workflows/skraft` | **la charge utile** : le workflow skraft — script, agents, skills, portes (GPL, copié dans `dist/` au build) |
| `workflows/skraft-light` | l'alternative légère : ARCHI remplace RESEARCH et DESIGN, DISTILL et DELIVER repris de skraft (ADR 0098, copié dans `dist/` au build) |
| `tests/workflow-skraft` | les tests du workflow, de bout en bout avec des agents simulés |
| `tests/architecture` | les invariants de structure, tenus par le code (ADR 0091) |
| `profiles` | des profils de pile d'exemple |
| `scripts` | l'essai réel du serveur et le banc de comparaison |
| `docs` | les ADR, les spécifications, les études héritées d'agent-studio (ADR 0093), les runs d'essai |

## Provenance

Ce dépôt est issu d'[agent-studio](https://github.com/freecompub/AgentStudio), dont il a été séparé le
2026-11-14 avec l'historique de ses fichiers (commit d'origine `0277ef6`). Les deux dépôts évoluent
désormais séparément : une correction dans l'un ne se reporte pas d'elle-même dans l'autre.

Le workflow skraft reprend des skills et des agents de
[skraft-plugin](https://github.com/SebastienDegodez/skraft-plugin), avec l'autorisation de son auteur
(`docs/licences/autorisation-skraft.md`). Chaque fichier repris porte sa provenance en commentaire.

## Licence

**GPL-3.0-or-later** : voir [`LICENSE`](LICENSE). Copyright (c) 2026 Samir Alili.
