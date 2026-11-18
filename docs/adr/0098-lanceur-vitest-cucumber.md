# ADR 0098 — Nommer le lanceur Vitest Cucumber

## Statut

Accepté.

## Contexte

Un composant utilisant `@amiceli/vitest-cucumber` possède déjà ses liaisons
Gherkin/Vitest, mais le profil BDD ne peut pas nommer ce lanceur. Le déclarer
comme `jest-cucumber` décrirait un outil différent.

## Décision

Ajouter `vitest-cucumber` aux lanceurs du profil et détecter la dépendance
`@amiceli/vitest-cucumber` dans les manifestes. La commande de tests demeure celle
de Vitest configurée par le projet ; aucune liaison métier n'est générée.

## Conséquences

Le composant peut déclarer ses répertoires de fonctionnalités et de liaisons
existants sans changer de bibliothèque. Comme auparavant, un `.feature` seul
ne prouve pas son exécution : un canari non collecté reste signalé par le
diagnostic, sans être présenté comme réussi.

## Alternatives

Employer le nom d'un autre lanceur ou migrer des liaisons existantes uniquement
pour satisfaire le profil serait incorrect ou inutile.
