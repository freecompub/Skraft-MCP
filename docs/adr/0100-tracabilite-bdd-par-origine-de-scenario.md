# ADR 0100 — Traçabilité BDD par origine de scénario

## Statut

Proposé. Le responsable a validé le contrat et les sept régressions rouges le
2026-11-17. Remplace la convention de nommage de l'ADR 0074 §2.4, pas la protection
de ses scénarios antérieurs.

## Contexte

La porte RED reconnaissait un critère dans le nom d'un test. En BDD, le critère
est déjà dans les tags `@ac-N` du Gherkin ; les lanceurs peuvent produire des
noms différents ou un test par étape. Imposer un préfixe au titre n'établit donc
ni la collecte du scénario, ni l'exécution de ses étapes. Un simple `.feature`
ne constitue pas davantage une preuve.

## Décision

Le code compile les sources complètes avec le parseur officiel Gherkin. Les
tags hérités de la fonctionnalité, de la règle et des exemples sont conservés.
Chaque exemple d'un plan de scénario est un cas distinct.

Un résultat BDD porte `bdd: { file, line }`, produit par le lecteur du rapport,
jamais attribué par un agent. `file` est relatif à la racine du composant ; `line`,
à partir de 1, désigne le scénario ordinaire ou la ligne d'exemple exécutée.
L'adaptateur composé ramène aussi cette origine à la racine du dépôt.

La porte relie cette origine à un cas compilé de la story, puis lit ses critères
dans les sources. Les titres métier et les noms des étapes restent libres :
aucun marqueur AC dans un test classique parallèle n'est nécessaire en BDD.
Une assertion rouge est acceptée ; scénario non collecté, ignoré, étape
indéfinie, ambiguë, en attente ou échec technique restent bloquants. Les tests
déjà verts nécessitent la justification de non-régression existante.

Le lecteur natif initial est le JSON Cucumber, activé par
`tests.bddReport: cucumber-json`. Il complète le rapport principal dans le même
dossier frais `{rapports}` : chaque module écrit son propre fichier
`*.cucumber.json`, sans écraser celui d'un autre module. Les XML et le JSON sont
dédoublonnés par les identifiants exacts publiés par les lanceurs, jamais par
similarité de titre. Une collision, une ambiguïté ou un échec technique que le
JSON effacerait est refusé. Les autres résultats, dont les erreurs de compilation,
sont conservés.

Surefire publie aussi un rapport appartenant au moteur Cucumber, dont les cas de
plans se nomment `Example #1.1`. Ce relevé est remplacé par le JSON natif seulement
si le nombre, les statuts et la nature des échecs concordent exactement ; ses noms
ne sont pas utilisés pour attribuer les critères.

L'identifiant du résultat natif est `chemin.feature:ligne`, stable entre les
exécutions d'une même source gelée. La liaison test–critères est conservée dans
l'état approuvé de DISTILL, transmise à DELIVER et restaurée à la reprise.
Le mode hors BDD garde sa reconnaissance des marqueurs dans les noms.

## Conséquences

Les rapports JUnit seuls sans origine de scénario ne suffisent plus à prouver
une exécution BDD, même si leurs noms contiennent AC-N. Le diagnostic indique
le scénario non collecté et l'origine attendue, sans masquer les erreurs de
compilation indépendantes.

La configuration doit effectivement produire le JSON natif et ses URI doivent
désigner les sources du dépôt. Une URI `classpath:` non résolue est refusée :
en Maven, utiliser une sélection de features par chemin de fichier plutôt que
deviner le module à partir de son titre. Les propriétés Maven de sortie doivent
être résolues par module, pas réutiliser un chemin JSON unique pour tout le reactor.
Pour les lanceurs qui publient des URI relatives à une autre base, notamment
pytest-bdd, `tests.bddReportBase` déclare cette base relativement au composant ;
la source résolue doit toujours rester dans celui-ci. Aucune base n'est déduite
du seul nom de fichier.

Un lanceur sans rapport d'origine exploitable reste bloqué. En particulier, le
rapport JSON standard de Vitest avec `@amiceli/vitest-cucumber` ne fournit pas
cette origine : déclarer le BDD ne la crée pas. Les versions de pytest-bdd qui
rapportent la ligne du plan pour tous ses exemples ne permettent pas de prouver
chaque ligne d'exemple ; ces cas restent explicitement non collectés.

Deux dépendances de parsing officielles sont ajoutées. Les politiques restent
pures, testables sans Git, disque ni LLM ; les lecteurs et l'exécution restent
dans la capacité pile.

## Alternatives

- Préfixer les titres ou les méthodes avec AC-N : conserve le couplage aux noms
  et ne prouve pas l'exécution du scénario.
- Accepter les tags sans résultat : permettrait des scénarios jamais collectés.
- Rapprocher les titres ou les étapes par similarité : attribution ambiguë,
  particulièrement avec les exemples et les composants multiples.
- Remplacer tous les rapports par le JSON Cucumber : ferait disparaître les tests
  unitaires et certaines erreurs de compilation.
- Construire un second parseur Gherkin par expressions régulières : perdrait les
  règles, les tags hérités et l'identité des exemples.
