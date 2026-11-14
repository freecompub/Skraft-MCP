# Skraft-MCP

Serveur MCP qui exécute **skraft** sur le projet de l'appelant, depuis un client MCP (Claude Code,
Copilot CLI). Une user story passe par quatre phases : RESEARCH, DESIGN (avec ADR), DISTILL
(scénarios d'acceptance), DELIVER (TDD). Chaque phase est revue par des lentilles, et le code vérifie
les portes entre les phases : le LLM propose, le code décide et vérifie. Le travail est commité sur la
branche `skraft/<slug>` du projet.

Le mode d'emploi complet du serveur (outils MCP, configuration, `admin.json`, déploiement) est dans
[`apps/mcp-skraft/README.md`](apps/mcp-skraft/README.md).

## Démarrer

```bash
pnpm install
pnpm build          # apps/mcp-skraft/dist : serveur, processus des workflows, workflow skraft
pnpm deployer       # construit, inscrit le serveur dans Copilot CLI et Claude Code, pose les commandes /skraft-…
```

Prérequis : Node.js 22.13 ou plus, `git`, et le runtime des agents (Copilot avec `gh`, ou Claude Code).

## Développer

```bash
pnpm typecheck
pnpm test                                   # toute la suite Vitest
pnpm vitest run --project workflow-skraft   # un projet : core, task-engine, workflow, workspace, …
pnpm essai <projet> <story> <reponses.json> --runtime=claude --suivi=attendre   # essai réel, hors CI
```

| Dossier | Contenu |
| --- | --- |
| `apps/mcp-skraft` | le serveur MCP |
| `workflows/skraft` | le workflow skraft : script, agents, skills, portes |
| `tests/workflow-skraft` | les tests du workflow, de bout en bout avec des agents simulés |
| `packages/*` | la plateforme : cœur, moteur de tâches et de workflows, Workspace, hôte, runtimes Claude et Copilot, adaptateurs de pile, services de projet |
| `extensions/tdd` | une extension d'exemple, utilisée par les tests de la plateforme |
| `profiles` | des profils de pile d'exemple |
| `scripts` | l'essai réel du serveur et le banc de comparaison |
| `docs` | les ADR, les spécifications, les workflows, les runs d'essai |

## Provenance

Ce dépôt est issu d'[agent-studio](https://github.com/freecompub/AgentStudio), dont il a été séparé le
2026-11-14 avec l'historique de ses fichiers (commit d'origine `0277ef6`). Les deux dépôts évoluent
désormais séparément : une correction dans l'un ne se reporte pas d'elle-même dans l'autre.

Le workflow skraft reprend des skills et des agents de
[skraft-plugin](https://github.com/SebastienDegodez/skraft-plugin), avec l'autorisation de son auteur
(`docs/licences/autorisation-skraft.md`). Chaque fichier repris porte sa provenance en commentaire.

## Licence

**GPL-3.0-or-later** : voir [`LICENSE`](LICENSE). Copyright (c) 2026 Samir Alili.
