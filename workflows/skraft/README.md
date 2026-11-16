# Workflow skraft

Le pipeline skraft — recherche, conception avec ADR, scénarios d'acceptance, livraison en TDD,
revues — écrit en **workflow dynamique** (ADR 0055, `docs/11-workflows-dynamiques.md`). C'est la
charge utile du serveur MCP (`serveur/README.md`).

## Lancer

**Rien à installer** : ce dossier est copié dans `serveur/dist/workflows/skraft/` au build, et le
serveur MCP l'y trouve. Toute modification ici demande de reconstruire (`pnpm build`).

Un run part de `skraft_demarrer`, ou de la commande `/skraft-demarrer <story>` chez le client :

- `auto` retient la difficulté proposée sans la faire confirmer ;
- `archi` désigne la skill d'architecture du projet, par son nom ou son langage (`dotnet`, `java`,
  `python`, `react`). Sans elle, ou si la skill est inconnue (avec un avertissement) : la clean
  architecture par défaut (`architecture-patterns`).

À la première exécution, et après chaque modification du dossier, le serveur rend le résumé de ce
que le workflow peut faire sans rien démarrer ; le client le fait accepter, puis rappelle avec
`accord`. L'accord se rattache à l'**empreinte du dossier** : il tombe dès qu'un fichier change.

Un projet peut **remplacer** ce workflow par le sien : un dossier de même `meta.name` dans
`<projet>/.skraft/workflows/`, **commité** — un fichier non suivi serait effacé par un
rembobinage (`git clean`). À nom égal, celui du projet l'emporte, et le serveur le dit. Ce sont les
deux seuls emplacements cherchés : il n'y en a pas dans le dossier personnel.

## Contenu

- `workflow.mjs` : le `meta` (lu sans exécuter le fichier) et le script.
- `conception.mjs`, `distillation.mjs`, `livraison.mjs`, `revue.mjs` : les phases et la revue.
- DELIVER tient en six modules (découpée le 2026-11-14) : `livraison.mjs` enchaîne,
  `livraison-socle.mjs` porte ce dont les autres ont besoin et qui n'appelle rien au-dessus de lui,
  `livraison-portes.mjs` les portes exécutées par le code, `livraison-scenario.mjs` un scénario et
  ses pas, `livraison-corrections.mjs` les corrections ciblées de fin (ADR 0062),
  `livraison-arbitrages.mjs` les mutants et les lignes contestés.
- `reprise.mjs` : la reprise d'une story arrêtée (ADR 0089).
- `registre.mjs`, `lecons.mjs`, `catalogues.mjs` : le registre des erreurs du projet (LEC-1) et les
  leçons qu'on en tire, rattachées aux catalogues d'anti-patrons des skills (LEC-2).
- `sha256.mjs` : SHA-256 sans dépendance — le processus isolé n'importe que son dossier.
- les contrôles et leurs données : `story.mjs`, `difficulty.mjs`, `research.mjs`, `design.mjs`,
  `adr.mjs`, `distill.mjs`, `gherkin.mjs`, `deliver.mjs`, `review.mjs`, `review-thread.mjs`,
  `review-brief.mjs`, `brief.mjs`, `preselect.mjs`, `text-analysis.mjs`, `support.mjs`,
  `architecture.mjs` (skill d'architecture choisie à l'appel).
- `agents/` : le contenu des rôles, partageable avec Copilot CLI et Claude Code (ADR 0024).
- `skills/` : les skills reprises de skraft-plugin, du tag `v1.6.1` ; `architecture-patterns`,
  `clean-architecture-testing` et les `clean-architecture-<langage>` viennent du tag `v1.15.1`.

Les tests de ce workflow sont dans `tests/workflow-skraft/` (ils ne sont pas copiés avec lui).

## Provenance et licence

GPL-3.0-or-later (voir `LICENSE`). Converti en JavaScript le 2026-10-10 depuis
`extensions/skraft-workflow/src/` (chaque fichier le dit en tête ; extension retirée le même jour,
lisible dans l'historique Git), lui-même repris de
`extensions/skraft` ; agents et skills repris de skraft-plugin (`docs/licences/autorisation-skraft.md`).

Différences avec l'extension skraft-workflow : plus d'outil `render_adr` — l'architecte écrit les
ADR au gabarit, le code y inscrit `Story : <slug>` et refuse toute modification d'un ADR d'une
autre story ou déjà décidé. Le code lui donne le numéro de son prochain ADR ; il n'écrit que
`docs/adr/adr-???-*.md` et `supersessions.md`, jamais un numéro déjà pris, et un titre hors
convention est refusé dès la fin de son tour (ADR 0079) ; l'agent d'acceptance vérifie ses scénarios avec `verifier_scenarios`, outil apporté par le workflow (`meta.outils`, `export const outils`), qui appelle le même calcul que la porte (ADR 0082) ; entrées `story` et `auto` au lieu de `storyPath` et
`confirmDifficulty`.
