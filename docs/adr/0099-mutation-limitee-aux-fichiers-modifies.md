# ADR 0099 — Mutation limitée aux fichiers modifiés, et demandée à l'utilisateur dans skraft-light

## Contexte

La mutation est la porte la plus lente de DELIVER. `muter` (`livraison-socle.mjs`) appelle
`w.mutation()` sans argument : la pile lance Stryker sur **tout le projet**, puis le workflow filtre le
rapport sur les fichiers et les lignes modifiés par la story (`restreindreAuChangement`). Le verdict
porte donc sur le changement, mais le coût porte sur tout le projet : sur un dépôt de taille réelle,
des dizaines de minutes pour juger quelques fichiers.

Elle n'est pas toujours voulue non plus. `qualite.mutation.active: false` la coupe pour toutes les
stories du projet ; rien ne permet de la passer pour une story, alors que l'utilisateur sait, en fin
de livraison, si le changement la mérite. skraft-light (ADR 0098) vise un parcours court : il doit
pouvoir s'en passer pour une story, sans décider à la place de l'utilisateur.

Deux obstacles techniques :

- La capacité `w.mutation` ne transmet aucun fichier à la pile, contrairement à `w.lint` et
  `w.format`.
- Les outils de mutation n'ont pas la même syntaxe. StrykerJS attend `--mutate a,b`, une liste
  séparée par des virgules, et une option répétée écrase la précédente. Stryker.NET attend
  `-m a -m b`, une option répétable. Le jeton `{fichiers}` existant développe un argument par
  fichier, ce qui ne convient à aucun des deux.

## Décision

1. **La capacité de mutation accepte des fichiers.** `w.mutation(fichiers?)`, puis
   `HostStack.mutation({ files })`, puis `StackAdapter.mutation({ files })`. Sans fichiers, rien ne
   change : skraft appelle toujours `w.mutation()` et mute tout le projet.
2. **Le profil de pile dit comment cibler : `mutation.cible`**, un gabarit ajouté après la commande
   quand des fichiers sont demandés. Il porte un seul des deux jetons :
   - `{liste}`, remplacé par les fichiers séparés par des virgules (`cible: [--mutate, "{liste}"]`,
     StrykerJS) ;
   - `{fichier}`, qui répète le gabarit une fois par fichier (`cible: [-m, "{fichier}"]`,
     Stryker.NET).
   Sans `cible`, la pile ignore les fichiers et mute tout le projet ; le verdict reste filtré au
   changement par le workflow.
3. **Une pile à plusieurs composants** ne lance que les composants touchés qui savent muter, chacun
   avec ses fichiers, en chemins relatifs à sa racine. Si aucun composant n'est touché, le rapport
   est vide (score 100, aucun fichier).
4. **Le workflow sait si la pile propose une mutation sans la lancer.** `HostStack.mutationDisponible`,
   exposé par `w.disposition()` sous la forme `mutation: true`. Cela évite de poser une question sans
   objet.
5. **skraft-light demande à l'utilisateur, en fin de DELIVER, s'il lance la mutation** (question
   `lancer-mutation`, ADR 0098, point 13). La question n'est posée que si les trois conditions sont
   réunies :
   - la barre de qualité l'active au moment `fin-de-phase` ;
   - au moins un fichier de production a été modifié ;
   - la pile sait muter.
   Elle cite les fichiers concernés. La réponse vaut pour **tout le run** : une correction ou un
   nouvel essai de la phase ne la repose pas. « Passer » ne lance rien, et le bilan le dit
   (`MUTATION_REFUSEE`). skraft-light passe les fichiers modifiés à `w.mutation`.
6. **skraft n'est pas modifié.** Ses fichiers de DELIVER restent tels quels. Les trois fichiers de
   livraison de skraft-light deviennent des écarts déclarés dans la garde de dérive.

## Conséquences

- Sur une pile dont le profil déclare `cible`, la mutation de skraft-light ne coûte que le changement.
  Les profils existants n'en déclarent pas : il faut les compléter, sinon rien ne s'accélère.
- Le gabarit transmet les chemins tels quels. Un nom de fichier qui contient des caractères de glob,
  comme `[id]` dans une route Next.js, n'est pas échappé pour Stryker : il peut viser d'autres
  fichiers, ou aucun. Non traité.
- Un utilisateur qui passe la mutation livre une story dont la solidité des tests n'est pas mesurée.
  C'est son choix, il est explicite et inscrit au bilan ; le code ne prétend pas l'avoir vérifiée.
- Le moment `scenario` (mutation après chaque scénario) n'est pas concerné : il ne pose pas de
  question, et reste piloté par la barre de qualité.
- Les trois fichiers de livraison existent désormais en deux versions qui divergent. Un correctif de
  skraft s'y reporte à la main ; la garde le signale.

## Alternatives

- **Réutiliser `{fichiers}`.** Écarté : un argument par fichier convient à `lint` et à `format`, pas à
  StrykerJS, qui veut une seule liste, ni à Stryker.NET, qui veut une option par fichier.
- **Deux commandes dans le profil**, une complète et une ciblée. Écarté : on duplique la commande, et
  les deux finissent par diverger.
- **Seulement poser la question**, sans cibler. Écarté par l'utilisateur : la question ne sert qu'à
  moitié si « lancer » coûte encore tout le projet.
- **Poser la question dans skraft aussi.** Écarté : la demande ne porte que sur skraft-light, et
  skraft n'est pas modifié (ADR 0098).
- **Une option de `skraft_demarrer_leger`** pour choisir au lancement. Écarté : c'est en fin de
  livraison, devant les fichiers modifiés, que l'utilisateur sait si la mutation vaut son coût.

## Statut

Proposé — 2026-11-24.
