# ADR 0099 — Reprise sans rembobinage

## Statut

Proposé. Le responsable du projet a validé le comportement et le rouge le 2026-11-17.

Complète l'ADR 0089 sans modifier ses deux choix existants.

## Contexte

Une correction de pile et d'export des rapports Maven a été commitée après DESIGN.
Continuer la session rétablissait le dernier commit de DESIGN, supprimant les POM
corrigés. La pile déjà chargée par le serveur demandait encore un dossier de
rapports : Maven exécutait 518 tests avec succès sans produire le rapport attendu.

## Décision

Ajouter un choix humain explicite « Continuer depuis l'état actuel ». Le code
restaure les informations de la session sans réinitialiser la branche ni revenir
au commit de la dernière phase. Le précontrôle des tests est conservé.

« Continuer la session précédente » garde son retour au dernier commit de phase ;
« Nouvelle session » garde son écrasement depuis le point de départ.

## Conséquences

Les corrections commitées présentes sur la branche de la story ne sont plus
supprimées quand ce troisième choix est utilisé. Le choix reste journalisé par
l'interaction humaine et un message dit qu'aucun rembobinage n'a eu lieu.

Ce choix conserve aussi d'éventuels travaux non approuvés : la question le dit.
Il ne les approuve pas et ne rejoue pas les phases déjà approuvées. Le responsable
doit donc l'utiliser sur une branche dont les corrections à conserver sont connues.
Il ne récupère pas automatiquement les commits d'une autre branche.

## Alternatives

- Changer silencieusement le sens de « Continuer » : rupture de la garantie de
  rembobinage de l'ADR 0089.
- Réappliquer automatiquement des commits après chaque retour : résolution de
  conflits implicite et risque de réintroduire du travail refusé.
- Déduire une réussite du journal Maven quand le rapport manque : perte de la
  preuve structurée des tests ; le lecteur reste strict.
