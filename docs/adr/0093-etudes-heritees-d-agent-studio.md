# ADR 0093 — Les études héritées d'agent-studio reviennent dans le dépôt

## Statut

**Accepté** le 2026-11-14 par le responsable du projet : « go pour le 2ème point », après le constat
porté au bilan de l'ADR 0091.

## Contexte

La séparation d'agent-studio (commit `8dc71a8`, 2026-11-14) a emporté `docs/09-workflows-rejouables.md`
et `docs/11-workflows-dynamiques.md`, mais pas les autres études numérotées. Le code, les ADR et le
dossier de licence d'ici continuaient d'y renvoyer : **175 renvois, dans une centaine de fichiers**,
vers dix études absentes.

Ce ne sont pas des renvois décoratifs. `docs/12-audit-portes-lentilles-skraft.md` porte des décisions
numérotées **D1 à D23**, et le code les cite comme la raison de son comportement :

- « Commit impossible, continué par l'humain : le bilan le dit (D19 de `docs/12`) » — `workflow.mjs` ;
- « ROUTE n'existe que s'il reste des questions (D11 de `docs/12`) » ;
- « La porte du nettoyage refuse qu'il fasse repasser l'acceptance du scénario au rouge (D16 de `docs/12`) » ;
- « Une panne à la création d'une demande (D17 de `docs/12`) escalade » ;

et ainsi de dix-neuf décisions, dont la justification n'était plus lisible dans ce dépôt. De même,
`docs/14-skraft-en-serveur-mcp.md` est l'étude derrière l'ADR 0068 — c'est-à-dire derrière l'existence
même de ce dépôt — et `serveur/README.md` la cite en une ligne (« étude : `docs/14` »).

Un renvoi qui ne résout pas **n'échoue nulle part**. Il ne casse aucun test, ne gêne aucun build : il
se dégrade en connaissance perdue, à mesure que la mémoire de la séparation s'efface. C'est le pire
mode de défaillance d'une documentation, parce que rien ne le signale.

## Décision

1. **Les dix études citées reviennent dans `docs/`**, sous leur nom et leur numéro d'origine, pour que
   les 175 renvois résolvent tels qu'ils sont écrits — y compris les renvois de section (« `docs/10` §3 »)
   et de décision (« D19 de `docs/12` »). Aucun renvoi n'est réécrit.
2. Chacune porte un **en-tête de provenance** : héritée d'agent-studio, reprise telle quelle à la
   séparation, **non tenue à jour**, et ce qu'elle dit de l'application de bureau (Electron) ou de
   l'extension `skraft` ne concerne plus ce dépôt. L'en-tête donne l'URL de la source.
3. **Rien n'est réécrit dans leur corps.** Ce sont des documents datés : les corriger pour qu'ils
   décrivent le dépôt d'aujourd'hui en ferait des faux. Leur valeur est d'expliquer pourquoi le code
   est ce qu'il est, au moment où on l'a décidé.
4. Les études **non citées** (01, 03, 04, 13) restent à agent-studio : rien ici n'en dépend.
   `docs/06` revient, bien que seules les études importées le citent, parce que sa fermeture est
   atteinte en un pas et que cela évite une exemption dans la garde.
5. **La garde est tenue par le code** : `tests/architecture` vérifie que chaque `docs/NN` cité dans le
   dépôt résout vers une étude présente. Sans exemption : la règle tient en une phrase.

## Conséquences

- Les 175 renvois résolvent **hors ligne**, sans quitter le dépôt ni dépendre de l'accès à un autre.
- `docs/` gagne environ 190 ko de prose héritée. C'est le prix de la raison d'être de dix-neuf
  décisions que le code applique.
- Les deux dépôts peuvent **diverger** sur ces fichiers : ils sont datés et figés ici, et l'en-tête le
  dit. Une étude corrigée à agent-studio ne se reporte pas d'elle-même, comme le README l'annonce déjà
  pour le code.
- Ajouter un renvoi vers une étude absente fait désormais **échouer un test**, au lieu de passer
  inaperçu.

## Alternatives

- **Réécrire les 175 renvois en URL vers agent-studio.** Écarté : il faudrait un accès réseau pour
  lire la raison d'une ligne de code, et 175 modifications dans une centaine de fichiers — pour un
  résultat plus fragile qu'un fichier présent.
- **Un seul index de provenance** qui dise ce qu'étaient `docs/02` à `docs/16` et où les lire.
  Écarté : moins cher, mais « D19 de `docs/12` » resterait irrésolvable sur place, et c'est
  précisément ce qu'on cherche à réparer.
- **Rapatrier les dix-neuf études**, pour ne plus avoir à choisir. Écarté : neuf d'entre elles ne sont
  citées par rien ici, et une documentation qu'aucun renvoi n'atteint est du poids sans lecteur.
- **Réécrire les études pour qu'elles décrivent le dépôt d'aujourd'hui.** Écarté : une étude datée
  qu'on met à jour cesse d'expliquer la décision qu'elle a servi à prendre.
