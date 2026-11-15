# Run réel US-2 après le découpage de `livraison.mjs` — 2026-11-15

**Fini : 13m10, 0 rejet, 3,84 $.**

But : vérifier du dehors que le découpage de `livraison.mjs` en six modules (PR #3) n'a rien cassé.
Les 1 791 tests du dépôt le disaient déjà ; un essai réel le dit autrement, sur un vrai projet .NET
avec de vrais agents.

Départ : `37d8132 init` d'`exemple-dotnet-tdd`, story `stories/US-2.md`, runtime Claude, pile
`../2026-11-09-us-2-bdd-claude-suivi/pile.yaml`, réponses humaines `../reponses-us-2.json`.
Script : `scripts/essai-mcp-skraft.ts --suivi=attendre` (`sortie-suivie.txt`, `rapport.json`).

Rien n'est sorti du poste : le run travaillait sur un clone d'un clone local dont `origin` avait été
retiré. Même un `git push` réussi n'aurait mené nulle part.

## Étapes

| Phase | Essais | Durée | Part | Coût | Rejets |
|---|---|---|---|---|---|
| Préparation (INIT→ROUTE) | 1 | 0m27 | 3 % | < 0,01 $ | — |
| RESEARCH | 1 | 0m48 | 6 % | 0,17 $ | **0** |
| DESIGN | 1 | 5m45 | 44 % | 1,81 $ | **0** |
| DISTILL | 1 | 1m19 | 10 % | 0,31 $ | **0** |
| DELIVER | 1 | 2m55 | 22 % | 0,21 $ | **0** |
| REVIEW (3) | 3 | 1m55 | 15 % | 1,33 $ | — |
| RATIFICATION, DONE | 1 | 0m01 | 0 % | 0,00 $ | — |

La somme des phases égale le temps au mur à 0,0 s près (790 s contre 790 s) : aucun temps mort entre
les phases. Les trois questions ouvertes de RESEARCH ont été posées et répondues dans la même
seconde, parce que le répondeur du banc joue l'humain sans latence — sur un run tenu par une
personne, c'est là que le temps s'ajouterait.

DESIGN prend 44 % du temps et la moitié du coût, en deux tours sur `claude-opus-5-5` : c'est la seule
phase sur Opus. DELIVER écrit tout le code pour 0,21 $, le TDD scénario par scénario donnant des
tours courts.

## Livraison

Branche `skraft/us02-bff44417`, six commits, 28 fichiers. ADR-003 proposé puis ratifié. Cinq
scénarios Gherkin en français, un par critère d'acceptation (`@ac-1`…`@ac-5`). Domaine étendu :
`PalierDeRemise`, `PaliersDeRemise`, `Pourcentage`, `Montant.Prend(taux)`,
`Panier.RemiseSelon(paliers)`.

**Vérification indépendante** : `dotnet test` lancé à la main dans le clone — **10 tests verts, 0
échec** (2 unitaires, 8 BDD). Le workflow n'est pas seul juge de son travail.

## Ce que le workflow a signalé de lui-même

- « Scénario ac-3 : déjà vert avant son premier pas ; le code d'un pas précédent l'a fait passer sans
  test rouge qui le demande. » — la discipline TDD rapportée en défaut, pas dissimulée.
- 5 mutants survivants dans `Montant.cs`, **hors des lignes de la story**, listés et « non jugés ».
- Deux remarques de lentille hors périmètre : le commentaire de `Facture` dit encore que la remise
  reste à zéro, ce qui est devenu faux.
- Qualité de forme et règle de dépendance **non mesurées** : ce projet n'a ni linter ni analyse
  d'imports déclarés.

## Comparaison avec le run du 2026-11-09

| | 09/11 | 15/11 |
|---|---|---|
| Durée | 22m39 | **13m10** |
| Rejets | 5 | **0** |
| Coût | 6,62 $ | **3,84 $** |
| Base | `19583a4 bdd` | `37d8132 init` |

Deux réserves, qui comptent plus que l'écart :

- **La base diffère.** `37d8132` retire `.agent-studio/stack.yaml` (d'où la pile passée en argument)
  et ajoute Stryker. Ce run a donc mesuré la mutation, ce que le précédent ne faisait pas : il a fait
  *plus* en deux fois moins de temps. Mais le code source du projet est le même, et une partie de
  l'écart est de la variance de LLM. **Cet essai atteste une non-régression, pas un gain.**
- **Un défaut du 09/11 ne s'est pas reproduit.** La revue de DELIVER avait alors rejeté la somme des
  remises placée dans le cas d'usage, contre l'ADR-003. Cette fois `RemiseSelon` est sur la racine
  d'agrégat `Panier` du premier coup. Un rejet de moins, sans rien changer au workflow.

## Couverture du découpage

Cinq des six modules ont tourné : `livraison-socle`, `livraison-portes`, `livraison-scenario`,
`livraison-arbitrages` (c'est lui qui a décidé de ne pas juger les mutants hors changement) et
`mutationDeFin` de `livraison-corrections`.

Le chemin de reprise après échec — `correctionDeFin`, `corriger` — **n'a pas été exercé** : zéro
rejet, donc rien à corriger. Il reste tenu par les tests e2e du dépôt, dont
`e2e-correction-reprise-workflow.test.ts`, mais pas par ce run.

## Ce que l'essai a trouvé et que les tests ne voyaient pas

Le script ne démarrait plus : il lançait `apps/mcp-skraft/dist/main.mjs`, chemin mort depuis l'ADR
0091. Typecheck, build, 1 791 tests, six gardes et une PR relue n'avaient rien dit. D'où l'ADR 0094
et la garde `chemins-du-depot`, écrite rouge sur ce défaut et sur un second, invisible à l'essai : les
métadonnées npm du paquet, restées sur `AgentStudio / apps/mcp-skraft`.
