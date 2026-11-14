# ADR 0092 — Tout le dépôt est sous GPL-3.0-or-later

## Statut

**Accepté** le 2026-11-14 par le responsable du projet : « on met la licence gpl ».

**Remplace l'ADR 0023** (« Licence du dépôt, et frontière avec l'extension skraft »), qui plaçait le
dépôt sous licence propriétaire — tous droits réservés — avec `extensions/skraft/` en seule exception
GPL. Les trois faits qui cadraient cette décision ont disparu.

## Contexte

L'ADR 0023 décidait une **frontière** : une application propriétaire, et une extension GPL distribuée
à part en `.asx`, exécutée dans son propre processus derrière l'API `ctx`. Cette frontière n'existe
plus :

1. `extensions/skraft/` a disparu : l'ADR 0055 en a fait un **workflow en dossier**, `workflows/skraft/`.
2. L'ADR 0091 a retiré le système d'extensions, l'empaquetage `.asx` et sa signature ; l'ADR 0021,
   qui organisait cette distribution séparée, est périmé.
3. Les quatorze paquets n'étaient plus `private: true` sans publication possible : le serveur **est**
   publié en paquet npm (`deployer --npm`).

Surtout, **la séparation d'agent-studio a déjà fait le dépôt GPL**, sans qu'un ADR l'enregistre
(commit `8dc71a8`, 2026-11-14) : le `LICENSE` de la racine porte le texte de la GPL — la même
empreinte que `workflows/skraft/LICENSE` —, les quatorze `package.json` déclarent
`GPL-3.0-or-later` là où l'ADR 0023 prescrivait `UNLICENSED`, et le README de la racine annonce
« **GPL-3.0-or-later** : voir `LICENSE` ». L'ADR 0023 était donc contredit par le dépôt lui-même.

Et ce n'est pas qu'une question de forme : **le serveur lie du code GPL**.
`serveur/src/us-github.ts` importe `parseStory`, `slugOf` et `extractLiterals` de
`workflows/skraft/story.mjs`, et esbuild les lie dans `dist/main.mjs`. Le détour habituel — extraire
le code partagé dans un paquet neutre — est **fermé** : l'ADR 0055 §7 impose au workflow de tourner
isolé, sans modules Node, donc auto-suffisant ; il ne peut pas dépendre d'un paquet du workspace.
Soit le serveur duplique l'analyseur de story, soit il assume la GPL.

## Décision

1. **Tout le dépôt est sous GPL-3.0-or-later**, sans exception ni frontière interne. `LICENSE` à la
   racine porte le texte de la GPL ; chaque `package.json` déclare `GPL-3.0-or-later`.
2. Le **paquet npm est licencié par le `LICENSE` du dépôt**, et non par celui que le workflow
   embarque : retirer la charge utile ne doit pas priver le paquet de sa licence. Le `LICENSE` du
   workflow reste dans ses sources, comme la GPL l'exige de qui reçoit l'œuvre.
3. La flèche `serveur → workflows/skraft/story.mjs` est **assumée**, pas contournée : elle est la
   conséquence du workflow auto-suffisant (ADR 0055 §7), et elle n'a plus de coût maintenant que la
   licence est la même des deux côtés.
4. Le README du serveur ne dit plus que « la licence du reste du paquet n'est pas encore fixée ».

## Conséquences

- Le paquet npm est **distribuable** : c'était la seule réserve que son README opposait.
- Qui distribue un binaire dérivé de ce dépôt doit en fournir les sources, le workflow compris.
  C'était déjà vrai du workflow ; ça l'est désormais de l'ensemble, et c'est dit.
- La décision n'est **réversible que dans un sens** : ce dépôt ne pourra pas être refermé. C'est le
  même raisonnement que l'ADR 0023 tenait pour choisir le propriétaire, appliqué à un dépôt dont la
  charge utile est GPL et le reste déjà aligné.
- L'autorisation de reprise de skraft-plugin (`docs/licences/autorisation-skraft.md`) voit sa
  condition 2 — « sous quelle licence redistribuer » — répondue sans réserve.

## Alternatives

- **Dupliquer l'analyseur de story côté serveur** pour couper la flèche vers le workflow, et garder
  le serveur sous une autre licence. Écarté : deux copies d'un parseur de story divergeraient, et le
  dépôt serait propriétaire autour d'une charge utile GPL qu'il ne peut pas livrer autrement.
- **Garder l'ADR 0023 et sa frontière.** Impossible : `extensions/skraft/` n'existe plus, et les
  quatorze paquets déclarent déjà la GPL.
- **Ne rien écrire**, puisque le dépôt est déjà GPL en fait. Écarté : un ADR accepté disait le
  contraire, et c'est lui qu'on lit pour savoir ce qui a été décidé.
