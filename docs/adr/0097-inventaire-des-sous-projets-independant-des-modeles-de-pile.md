# ADR 0097 — L'inventaire des sous-projets est indépendant des modèles de pile

## Statut

**Accepté** le 2026-11-16 par le responsable du projet, après validation du test qui exige la
présence des backends Maven, du module imbriqué au cinquième niveau et du front dans les indices
transmis à l'agent. Remplace la limite de profondeur de l'ADR 0074 §1.5 et complète l'ADR 0076.

## Contexte

Un dépôt multicomposant expose des POM Maven et des applications front, mais son profil enregistré
ne contient que les agents Python. Découvrir un projet, faire vérifier son profil et enregistrer
ce profil sont trois étapes distinctes : un refus des canaris ou des rapports n'efface pas
l'existence du projet.

Les indices de découverte avaient deux limites :

- les dossiers transmis par les services du projet étaient bornés à quatre niveaux ; un module
  Maven sous un parent situé au quatrième niveau n'y figurait pas ;
- l'arborescence montrée à l'agent était limitée aux 400 premiers fichiers. Les racines apparaissaient
  dans les indices BDD, mais pas avec un inventaire explicite de leurs manifestes ; les projets
  non reconnus par les modèles TypeScript/Python pouvaient rester peu visibles.

Ajouter un adaptateur Java ou allonger simplement l'arborescence ne corrigerait pas cette confusion
entre inventaire des projets et modèles de profils.

## Décision

Les services du projet inventorient **tous les dossiers portant un manifeste connu**, sans limite
de profondeur, parmi les fichiers que le Workspace expose. Les exclusions existantes restent :
dossiers cachés, dépendances installées et répertoires de compilation.

La fonction pure qui compose les indices donne à l'agent une section dédiée aux racines et à
leurs manifestes. Cette section n'est pas tronquée avec l'arborescence et ne dépend pas de
`proposeProfile`. Le prompt demande d'examiner aussi les projets sans modèle reconnu.

Un parent Maven et ses modules sont des candidats à examiner, pas une obligation de créer des
composants dont les racines se chevauchent. Le choix de profil reste proposé par l'agent puis
vérifié par le code, avec les mêmes canaris et accords humains.

## Conséquences

- Les backends Maven et les modules profonds sont explicitement visibles, sans profil Java
  codé en dur.
- L'arborescence générale reste bornée pour limiter le contexte ; l'inventaire dépend du nombre
  de manifestes, et peut donc être plus long dans un grand monorepo.
- Les dossiers sans manifeste ne deviennent pas des sous-projets sur la seule présence de
  fichiers. L'agent peut toujours examiner le reste avec ses outils.
- Les fichiers ignorés par Git et non exposés par le Workspace ne sont pas inventoriés.
- Un profil existant n'est ni écrasé ni complété automatiquement. Les rapports Maven et les
  dépendances doivent encore permettre sa vérification avant tout enregistrement.

## Alternatives

- **Augmenter les 400 fichiers ou les quatre niveaux.** Rejeté : déplace la limite sans rendre
  explicites les manifestes des projets non reconnus.
- **Créer un modèle Java obligatoire.** Rejeté : la visibilité d'un projet ne doit pas dépendre
  d'un modèle de commande ; ses conventions viennent de ses manifestes.
- **Inventorier chaque dossier de code comme un composant.** Rejeté : ajoute des répertoires de
  documentation et de sources sans preuve qu'ils constituent un sous-projet.
