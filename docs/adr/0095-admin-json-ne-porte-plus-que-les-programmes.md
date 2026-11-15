# ADR 0095 — `admin.json` ne porte plus que les programmes

## Statut

**Accepté** le 2026-11-15 par le responsable du projet : « corrige le défaut de code », après le
relevé d'alignement de la documentation sur le code. Prolonge l'ADR 0087 (plus de profil) et
l'ADR 0091 §3 (retrait du sous-système d'extensions).

## Contexte

L'alignement de la documentation sur le code a trouvé deux clés que `admin.json` acceptait, que
`loadAdminConfig` calculait, que des tests vérifiaient — et que **rien ne lisait** :

- `permissionPolicy` (« prudente » / « souple ») ;
- `defaultMode` (« simple » / « advanced »).

`serveur/src/assemblage.ts` ne prend de la configuration administrateur que `allowedPrograms`,
`origineDesProgrammes` et `programConsent`. Les deux autres étaient produites et jetées.

Deux faits décident de la suite :

1. **Câbler `permissionPolicy` est impossible ici.** Elle est une option de
   `createPermissionArbiter` (`capacites/agents`), l'arbitre de la session principale d'agent-studio.
   Or **rien dans ce dépôt n'assemble d'arbitre** : ni `createPermissionArbiter` ni
   `createWorkspaceGuard` n'ont d'appelant hors de leurs propres tests. Le serveur MCP n'a pas de
   session principale où un humain tape des commandes ; ses agents tournent dans le bac à sable,
   derrière des gardes d'écriture et l'accord sur les programmes (ADR 0075).
2. **La câbler serait un relâchement, pas une correction.** Sans fichier d'administration,
   `loadAdminConfig` rendait `permissionPolicy: "souple"`, qui autorise les commandes de test *sans
   question*. Brancher la clé aurait donc desserré les permissions de tout poste sans `admin.json`
   — l'inverse de ce qu'on attend d'une correction.

`defaultMode` est un mode d'affichage. Le serveur n'a pas d'interface.

`profile`, enfin, n'était plus lu que pour retrouver la politique et le mode qu'un rôle donnait
(ADR 0087). Les deux partant, il ne servait plus à rien.

## Décision

`admin.json` ne porte plus que **les programmes qu'une pile peut lancer** (`allowedPrograms`) et
**s'ils peuvent être soumis à l'utilisateur** (`programConsent`). `permissionPolicy`, `defaultMode`,
`profile`, et les types `PermissionPolicy` et `UiMode` sont retirés du serveur.

Les clés retirées sont **ignorées, jamais refusées** — comme `trustedPublishers`, `revocation` et
`developerMode` l'ont été par l'ADR 0091 §3. Le schéma n'est pas `.strict()` : un poste administré
qui les porte encore continue de marcher. Un refus, lui, n'autoriserait plus **aucun** programme et
arrêterait un poste qui fonctionnait, pour des clés sans effet. Un test le tient.

L'option `permissionPolicy` de `createPermissionArbiter` **reste** : l'ADR 0087 en a fait un réglage,
elle est testée, et c'est à l'hôte qui assemble un arbitre de la poser. Ce dépôt n'en assemble pas.

## Conséquences

- Une valeur invalide sur une clé qui compte (`programConsent: "oui"`) fait toujours refuser le
  fichier, avec son erreur, et n'autorise aucun programme. En revanche `permissionPolicy: "laxiste"`,
  qui faisait refuser le fichier, est désormais ignorée : la clé n'existe plus, donc sa valeur n'est
  plus jugée. Un test qui pinçait ce refus est remplacé par un test sur `programConsent`.
- `serveur/README.md` décrit `admin.json` par ce qu'il fait : les programmes, et rien d'autre.
- Il reste dans `capacites/agents` un sous-système de gardes de session principale
  (`createWorkspaceGuard`, `createPermissionArbiter`, `mainSessionPolicy`) que **rien n'assemble**
  dans ce dépôt. Ce n'est pas tranché ici : c'est une capacité exportée, pas une clé de
  configuration qui promettait un effet. À reprendre si le serveur n'en a décidément pas l'usage.

## Alternatives

- **Câbler les deux clés.** Rejetée : impossible pour `permissionPolicy` faute d'arbitre assemblé,
  sans objet pour `defaultMode` faute d'interface, et un relâchement des permissions dans le cas le
  plus courant (pas de fichier d'administration).
- **Les garder au cas où.** Rejetée : c'est ce qui a permis à la promesse de survivre à son effet.
  Une clé documentée qui ne fait rien est pire qu'absente — l'administrateur croit avoir réglé
  quelque chose.
- **Refuser les clés retirées** (schéma `.strict()`). Rejetée pour la même raison que dans
  l'ADR 0091 §3 : le prix d'un refus est qu'aucun programme n'est plus autorisé, donc qu'un poste
  administré s'arrête — une peine disproportionnée pour une clé sans effet.
