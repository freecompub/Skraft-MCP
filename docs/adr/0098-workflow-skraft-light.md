# ADR 0098 — skraft-light : un second workflow, de la story à la livraison sans RESEARCH ni DESIGN

## Contexte

On demande une variante plus légère de skraft : une user story en entrée ; un agent qui lit la
story et le code, **se conforme à l'architecture existante ou en propose une** ; DISTILL reçoit cette
architecture avec la story et prépare tout ce qu'il faut à DELIVER. Le workflow skraft existant ne doit
pas changer.

Ce qui est vérifié dans le code avant de décider :

| Constat | Où |
| --- | --- |
| Un workflow n'importe que les fichiers de son dossier et `@skraft-mcp/workflow` ; tout autre import est refusé avant exécution, pour que l'empreinte du dossier couvre tout le code exécuté. | `moteur/workflow/src/hote/compiler.ts` |
| Le serveur MCP ne lance qu'un workflow, nommé en dur. | `serveur/src/assemblage.ts` (`WORKFLOW_SKRAFT`) |
| DELIVER dépend de ce que DISTILL laisse : tests d'acceptance gelés (`acceptanceHash`), matrice du plan de test (ADR 0067), tests de la story, régressions. | `workflows/skraft/livraison*.mjs` |
| DISTILL ne reçoit de DESIGN que les chemins des ADR décidés ; le modèle (`event-model.md`, `domain-model.md`…) n'est jamais nommé dans son dossier de passation. | `workflows/skraft/workflow.mjs`, `brief.mjs` |

Le premier constat interdit à un second workflow de **réutiliser** DISTILL et DELIVER : il ne peut
que les **copier**. Le deuxième impose de toucher au serveur pour offrir un point d'entrée.

## Décision

1. **Un second workflow, `workflows/skraft-light/`** (`meta.name` et commande `skraft-light`), livré
   avec le serveur à côté de `workflows/skraft/`, qui ne change pas.
2. **Phases : INIT, difficulté, questions ouvertes, ARCHI, DISTILL, DELIVER.** ARCHI remplace
   RESEARCH et DESIGN. Un agent, `skraft-architecte`, lit la story et le code, choisit un mode et
   écrit `.skraft/<slug>/archi/architecture.md` :
   - `conforme` : la story s'inscrit dans l'architecture existante, qu'il décrit et cite ;
   - `nouvelle` : il propose une architecture, justifiée.
3. **La porte d'ARCHI est du code** (`architecte.mjs`, fonctions pures) : sections du gabarit, un seul
   mode reconnu, fichiers cités existants et plages de lignes dans les limites, chaque élément de
   l'« Existant réutilisable » présent dans le fichier qu'il cite. En mode `conforme`, au moins un
   élément existant est exigé : se conformer à rien n'est pas se conformer. En mode `nouvelle`, la
   justification est exigée, puis **l'humain ratifie** l'architecture proposée ; un refus relance
   l'architecte avec le motif. L'agent dispose de l'outil `verifier_architecture`, qui rejoue la même
   porte pendant son tour (ADR 0082).
4. **DISTILL et DELIVER reçoivent l'architecture recopiée par le code** dans leur dossier de passation
   (mode, conventions, existant réutilisable, plan de conception), et le chemin du document. Le
   document est en lecture seule pour eux : DELIVER ne peut pas réécrire l'architecture qu'il
   implémente.
5. **Une garde de dérive.** Les modules repris de skraft doivent rester identiques, octet pour octet, à
   ceux de `workflows/skraft/`, sauf une liste déclarée de fichiers divergents, chacun avec sa raison
   (`tests/architecture/test/workflow-leger.test.ts`). Une correction de skraft fait échouer la garde
   tant qu'elle n'est pas reportée.
6. **skraft-light n'écrit pas d'ADR dans le projet** (`docs/adr/**` hors de ses permissions).
   L'architecture retenue vit dans `.skraft/<slug>/archi/`. Une décision qui mérite un ADR relève de
   skraft.
7. **Point d'entrée MCP : `skraft_demarrer_leger`**, mêmes arguments que `skraft_demarrer`, qui lance
   `skraft-light`. L'accord de l'utilisateur est propre à chaque workflow. Le build copie les deux
   workflows dans `serveur/dist/workflows/`.
8. **ARCHI n'est jamais sautée**, quelle que soit la difficulté : c'est la seule phase qui lit le code
   avant DISTILL. La présélection des fichiers (`preselect.mjs`) est reprise de skraft pour la nourrir.
9. **L'architecture est gelée après ARCHI** (`.skraft/*/archi/**` ajouté aux fichiers gelés), sauf pour
   l'architecte lui-même. Un refus à la ratification compte comme un essai de la phase ; au-delà, la
   phase escalade comme les autres.
10. **L'architecture n'est figée qu'une fois toutes ses questions tranchées.** Le premier tour de
    l'architecte est une analyse : il lève toutes les questions, métier ou techniques, qui conditionnent
    l'architecture (« Questions ouvertes »). Le code les pose toutes à la fois, puis relance le même
    agent sur son brouillon et les réponses. Une question tranchée encore listée fait refuser le
    document (`trierLesQuestions`). Au-delà de deux tours de questions (`TOURS_DE_QUESTIONS`),
    l'humain relance ou abandonne. La ratification du mode `nouvelle` vient après.
    Le second tour **reprend la session** du premier (clé de continuité tâche/workflow/rôle, ADR 0030
    et 0039) : l'architecte garde ce qu'il a lu du dépôt. Les sessions reprenables vivent en mémoire
    du serveur ; après un redémarrage, il repart dans une session neuve, et le brouillon, nommé dans
    sa consigne, tient lieu de mémoire. Ce sont le code et le journal qui relaient la question, pas
    l'agent : son tour se termine, une réponse peut arriver des heures plus tard.
11. **Même branche, état séparé.** La branche reste `skraft/<slug>`, que le serveur suppose pour la PR
    et la préparation d'issue ; l'état de reprise est écrit dans `etat-light.json`, pour qu'aucun des
    deux workflows ne reprenne la session de l'autre.
12. **L'architecte ne tranche rien seul.** Un test réel (issue #481 de prime-souscription-dab-poc) l'a
    vu différer l'adaptateur HTTP et servir l'écran par une doublure en mémoire, faute de producteur,
    sans rien demander : sa consigne lui laissait trancher les questions « techniques », et le mode
    `conforme` n'est pas ratifié. Le document porte désormais une section obligatoire `## Décisions`,
    une puce par choix, chacune sourcée par `chemin:lignes` — code existant, story ou réponse de
    l'utilisateur (`passation.md`). La porte refuse une décision sans source et une section vide ; la
    consigne dit qu'un choix que rien ne dicte est une question, métier ou technique, qu'une réponse
    ambiguë appelle une relance et qu'une question reportée reste ouverte. Le code ne juge que les
    décisions **déclarées** : une décision tue dans « Architecture retenue » lui échappe.
13. **L'utilisateur décide de lancer la mutation de fin de DELIVER** (ADR 0099). La question
    `lancer-mutation` cite les fichiers de production modifiés. Elle n'est posée que si la barre de
    qualité active la mutation en fin de phase et si la pile sait muter, et une seule fois par run.
    « Lancer » mute ces seuls fichiers quand le profil de la pile sait cibler. « Passer » ne lance
    rien, et le bilan le dit.

## Conséquences

- skraft-light épargne, par story, le chercheur, le modélisateur, l'architecte qui décide et la revue
  à lentilles de DESIGN. DISTILL et DELIVER, et donc la garantie TDD (gel, porte RED, mutation,
  revues), sont les mêmes que dans skraft.
- **Le code de DISTILL et DELIVER existe deux fois.** La garde rend la dérive visible, pas gratuite :
  chaque correction de skraft se reporte à la main.
- L'architecte n'a pas de revue à lentilles : comme RESEARCH dans skraft, il est tenu par une porte de
  code, et en mode `nouvelle` par la ratification humaine. Une architecture conforme mais mal choisie
  n'est rattrapée qu'en aval, par la lentille architecture de DISTILL et DELIVER.
- Un tour d'agent de plus par tour de questions. En contrepartie, DISTILL ne reçoit jamais une
  architecture que les réponses de l'utilisateur contredisent.
- **Ne pas lancer skraft et skraft-light sur la même story** : ils écriraient sur la même branche.
  Rien ne l'empêche dans le code ; c'est documenté, pas garanti.
- L'architecte pose plus de questions, techniques comprises ; l'utilisateur en reçoit davantage, et
  les reports restent visibles dans l'architecture au lieu d'être comblés par une supposition.
- Une story de skraft-light peut être livrée sans mutation, si l'utilisateur la passe ; le bilan le
  dit. skraft garde la mutation imposée par la barre de qualité.
- Le défaut relevé au contexte (DISTILL ne reçoit pas le modèle de DESIGN) n'est pas corrigé dans
  skraft par cet ADR.

## Alternatives

- **Un mode `light` dans `workflows/skraft/`** (ajouts seulement, sans copie). Écarté : la demande est
  de ne pas modifier skraft. C'est pourtant l'option sans duplication ; si la dérive coûte, c'est
  celle-ci qu'il faudra reprendre.
- **Permettre à un workflow d'importer les modules d'un autre.** Écarté : il faudrait changer la règle
  d'imports du compilateur et la portée de l'empreinte d'accord, qui garantit que l'utilisateur
  accepte exactement le code exécuté.
- **Un agent critique qui traque les décisions non déclarées** (point 12). Écarté pour l'instant : un
  tour d'agent de plus par tour de questions. À reprendre si des décisions tues passent la porte.
- **Ratifier aussi le mode `conforme`.** Écarté : l'utilisateur valide un document entier plutôt que
  chaque choix, et le mode conforme redeviendrait aussi lent que `nouvelle`.
- **Un seul agent jusqu'au Gherkin, transmis directement à DELIVER.** Écarté : il se validerait
  lui-même, et DELIVER perdrait les portes de DISTILL (valeurs, plan de test, RED, gel) qui donnent
  au TDD sa garantie.

## Statut

Proposé — 2026-11-20.
