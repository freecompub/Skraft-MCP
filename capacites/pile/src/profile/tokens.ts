/**
 * Les seuls jetons substitués dans les arguments d'une commande de profil : `{rapport}`, remplacé
 * par un fichier temporaire hors du projet, ou `{rapports}`, un dossier pour plusieurs rapports ; `{fichiers}`, développé en autant d'arguments que de
 * fichiers ; `{couverture}` et `{dossier}`, des dossiers temporaires hors du projet. Tout le reste
 * passe tel quel, sans shell — un profil vient du dépôt du projet et ne doit pas pouvoir fabriquer
 * une commande par interpolation.
 */
export const JETON_RAPPORT = "{rapport}";
export const JETON_FICHIERS = "{fichiers}";
/**
 * **Dossier** où la commande de test écrit un rapport par projet de test (ADR 0072, révisé le
 * 08/11) : tous les fichiers qu'il contient sont lus et réunis. Une commande qui lance plusieurs
 * projets (une solution .NET, un build multi-module) écraserait sinon chaque rapport par le suivant
 * dans `{rapport}`. Ce qui l'entoure passe tel quel : `{rapports}/{assembly}.xml` laisse au lanceur
 * son propre jeton.
 */
export const JETON_RAPPORTS = "{rapports}";
/**
 * **Dossier** où la commande de test doit déposer son rapport de couverture — et non un fichier,
 * délibérément : `dotnet test --collect` écrit sous un sous-dossier nommé par un GUID qu'il choisit
 * lui-même, et imposer un nom de fichier aurait exclu .NET. L'adaptateur cherche le rapport dans
 * l'arborescence. Produit par la MÊME exécution que les tests : mesurer la couverture ne doit pas
 * coûter un second passage de la suite.
 */
export const JETON_COUVERTURE = "{couverture}";
/**
 * **Dossier** de sortie, hors du projet, pour un outil qui range lui-même son rapport — Stryker.NET
 * écrit `<dossier>/reports/mutation-report.json`. L'adaptateur y cherche le rapport.
 */
export const JETON_DOSSIER = "{dossier}";

/**
 * Jetons du gabarit `mutation.cible` (ADR 0099), qui limite la mutation aux fichiers modifiés :
 * `{liste}` reçoit les fichiers séparés par des virgules, dans un seul argument (StrykerJS :
 * `--mutate a.ts,b.ts`) ; `{fichier}` répète le gabarit une fois par fichier (Stryker.NET :
 * `-m a.cs -m b.cs`). Un gabarit porte l'un des deux, jamais les deux.
 */
export const JETON_LISTE = "{liste}";
export const JETON_FICHIER = "{fichier}";

/** Arguments du gabarit `cible` pour ces fichiers ; aucun fichier, aucun argument. */
export function cibler(cible: readonly string[], fichiers: readonly string[]): string[] {
  if (!fichiers.length) return [];
  if (cible.some((a) => a.includes(JETON_FICHIER))) return fichiers.flatMap((f) => cible.map((a) => a.replaceAll(JETON_FICHIER, f)));
  return cible.map((a) => a.replaceAll(JETON_LISTE, fichiers.join(",")));
}

export function substituer(args: readonly string[], rapport: string, fichiers: readonly string[], couverture = "", dossier = "", rapports = ""): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (a === JETON_FICHIERS) out.push(...fichiers);
    else out.push(a.replaceAll(JETON_RAPPORTS, rapports).replaceAll(JETON_RAPPORT, rapport).replaceAll(JETON_COUVERTURE, couverture).replaceAll(JETON_DOSSIER, dossier));
  }
  return out;
}
