# Workflow skraft-light

L'alternative courte à skraft (ADR 0098) : une user story, une **architecture** — conforme à
l'existant ou nouvelle —, puis les scénarios d'acceptance et la livraison en TDD de skraft, avec
leurs revues. Ni RESEARCH ni DESIGN, ni ADR : le document d'architecture est la seule décision du run.

```
INIT → CLASSIFY → (questions) → ARCHI ⟲ (questions de l'architecte) → DISTILL → DELIVER
```

## Lancer

**Rien à installer** : ce dossier est copié dans `serveur/dist/workflows/skraft-light/` au build, à
côté de `skraft`. Toute modification ici demande de reconstruire (`pnpm build`).

Un run part de l'outil MCP `skraft_demarrer_leger`, mêmes entrées que `skraft_demarrer` (`story`,
`auto`, `archi`, `accord`, `projet`). L'accord se rattache à l'empreinte de ce dossier, distincte de
celle de skraft.

La branche est celle de skraft, `skraft/<slug>` : `skraft_pr` publie un run de skraft-light
comme un autre. L'état de reprise est dans `.skraft/<slug>/etat-light.json`, pour qu'aucun des deux
workflows ne reprenne la session de l'autre. Ne lance pas les deux sur la même story.

## ARCHI

L'agent `skraft-architecte` lit la story et le code, puis écrit `.skraft/<slug>/archi/architecture.md`
(gabarit dans `agents/skraft-architecte.agent.md`). Le **mode** est `conforme` (suivre l'architecture
en place) ou `nouvelle` (en proposer une). La porte du code (`architecte.mjs`) vérifie les sections,
le mode, chaque fichier et plage cités, que chaque élément de l'existant réutilisable figure dans son
fichier, un plan de conception non vide, et que chaque choix de la section « Décisions » est sourcé
(code existant, story ou réponse de l'utilisateur) — un choix que rien ne dicte est une question ; l'agent la consulte pendant son tour avec
`verifier_architecture` (ADR 0082). En mode `conforme`, il faut citer au moins un élément existant ;
en mode `nouvelle`, une justification, et l'utilisateur **ratifie** : un refus renvoie l'architecte
avec son commentaire.

L'architecte analyse d'abord et lève **toutes** ses questions, métier ou techniques (« Questions
ouvertes ») ; le
code les pose toutes, puis le relance sur son brouillon avec les réponses. L'architecture n'est
figée qu'une fois aucune question ouverte ; au-delà de deux tours de questions, l'utilisateur relance
ou abandonne. Une question tranchée encore listée fait refuser le document.

Une fois la phase approuvée, le document est figé : DISTILL et DELIVER reçoivent l'architecture
retenue et son plan dans leur dossier de passation, et ne peuvent pas le réécrire.

## Mutation de fin de DELIVER

En fin de DELIVER, si la barre de qualité active la mutation en fin de phase et si la pile sait
muter, l'utilisateur **choisit de la lancer ou non** (question `lancer-mutation`, ADR 0099). La
question cite les fichiers de production modifiés et n'est posée qu'une fois par run. « Lancer » mute
ces seuls fichiers si le profil de la pile déclare `mutation.cible` ; sinon, tout le projet est muté
et le verdict ne porte que sur le changement. « Passer » ne lance rien, et le bilan le dit.

## Contenu

Copie de `workflows/skraft`, sans `research.mjs`, `design.mjs`, `conception.mjs`, `adr.mjs`, ni les
agents et skills de RESEARCH et DESIGN. Propres à skraft-light : `architecte.mjs` et
`agents/skraft-architecte.agent.md`. Modifiés, chacun avec sa provenance en tête : `workflow.mjs`,
`brief.mjs`, `support.mjs`, `reprise.mjs`, `registre.mjs`, `lecons.mjs`, `livraison.mjs`,
`livraison-socle.mjs`, `livraison-corrections.mjs`.

Tout autre fichier est **identique** à celui de skraft : `tests/architecture/test/workflow-leger.test.ts`
le vérifie. Un correctif de DISTILL ou de DELIVER se reporte donc ici, ou la garde échoue.

Les tests sont dans `tests/workflow-skraft/` : `leger-architecte.test.ts` (porte) et
`e2e-leger-workflow.test.ts` (runs complets).

## Provenance et licence

GPL-3.0-or-later (voir `LICENSE`). Repris de `workflows/skraft` le 2026-11-20 (ADR 0098), dont le
README dit la provenance des agents et des skills.
