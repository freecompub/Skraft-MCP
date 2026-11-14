// Extrait de livraison.mjs le 2026-11-14 ; provenance : extensions/skraft-workflow/src/livraison.ts (ADR 0055).
/**
* Socle de la phase DELIVER : ce dont chaque étage a besoin et qui n'appelle rien au-dessus de lui
* — lancer les tests, classer les fichiers selon la disposition de la pile, vérifier le gel, lire la
* barre de qualité, lancer la mutation, et quelques aides.
*
* Extrait de `livraison.mjs` (2026-11-14) : il y tenait les quatre cycles entre ses étages, qui
* n'étaient que des appels à ces outils partagés. Aucune ligne de logique n'a changé.
*/
import { couchesManquantes as coreFilesMissing, correspond as matchesAny, lireBarreDeQualite as parseQualityBar, PanneEnvironnement } from "@skraft-mcp/workflow";
import { fichierDePassation } from "./brief.mjs";
import { sansTestsObsoletes, checkMutation, restreindreAuChangement, mutantsSousLeSeuil } from "./deliver.mjs";
import { acOf } from "./distill.mjs";
const QUALITY = ".agent-studio/quality.yaml";

const QUALITY_LEGACY = ".skraft/quality.json";

/** Fichier de projet (ADR 0071) : sa section `qualite` fait foi. */
const PROJET = ".agent-studio/projet.yaml";

export const MAX_CYCLES = 20;

export const GELES_TESTEUR = ["@stack:acceptanceTests"];

export const GELES_DEV = ["@stack:acceptanceTests", "@stack:unitTests"];
/** Un pas refusé par sa porte : le motif part au prochain essai du pas ; `rouges`, les tests en échec vus. */
export class PasRefuse extends Error {
  rouges;
  constructor(message, rouges = []) {
    super(message);
    this.rouges = rouges;
  }
}
/**
* Le scénario échoue (budget d'un pas épuisé, porte de fin de scénario, cycles) : il reprend à son début.
* `cause` : tests en échec et lignes non couvertes vus par le dernier refus (ADR 0066).
*/
export class ScenarioEchoue extends Error {
  motifs;
  cause;
  constructor(motifs, cause = {}) {
    super(motifs.join(" ; "));
    this.motifs = motifs;
    this.cause = { rouges: cause.rouges ?? [], lignes: cause.lignes ?? [] };
  }
}

/**
* Tests de DELIVER, sans ceux que l'humain a déclarés obsolètes (ADR 0066) : aucune porte ne les
* juge plus jusqu'à la fin du cycle. Les preuves, elles, gardent l'exécution complète.
*/
export async function lancerTests(w, d, o) {
  return sansTestsObsoletes(await w.lancerTests(o), d.testsObsoletes.map((x) => x.test));
}

/** `passation.md` est écrit par le code avant chaque tour (07/11) : jamais compté comme une modification de l'agent. */
export const horsPassation = (changes, slug) => changes.filter((f) => f.path !== fichierDePassation(slug));

export const premiereLigne = (msg) => (msg ?? "").split("\n").find((l) => l.trim())?.trim().slice(0, 300) ?? "";

export const uniq = (xs) => [...new Set(xs)];

/** Un défaut de revue revient à l'agent des tests (`test`) ou au développeur (`code`, `deliverable`). */
export const pourTests = (t) => t.target === "test";

export const pourDev = (t) => t.target !== "test";

export const autreAgent = (t) => (t.target === "test" ? "code" : "test");

export const enAttente = (x) => x.role === "driver" && x.status === "pending";

// ---------- plan --------------------------------------------------------------------------
export async function gelIntact(w, d) {
  return !d.acceptanceHash || (await w.empreinte(["@stack:acceptanceTests"])) === d.acceptanceHash;
}

export async function lireOu(w, chemin) {
  try {
    return await w.lireFichier(chemin);
  }
  catch (e) {
    if (e instanceof PanneEnvironnement)
      throw e;
    return null;
  }
}

/** Classement des fichiers et des résultats selon la disposition de la stack (ADR 0041). */
export function natures(disp) {
  const acceptance = (p) => matchesAny(disp.acceptanceTests, p);
  // `isTestFile` de l'adaptateur approché par les emplacements déclarés.
  const unit = (p) => !acceptance(p) && matchesAny(disp.unitTests, p);
  const resultatAcceptance = (r) => acOf(r.id) !== null || acceptance(r.file);
  return { acceptance, unit, resultatAcceptance, production: (p) => !acceptance(p) && !unit(p) };
}

/** Barre de qualité du projet (ADR 0049) ; invalide, c'est une panne : la juger à moitié serait attester à tort. */
export async function barreDeQualite(w, disp) {
  const q = parseQualityBar({ projet: await lireOu(w, PROJET), yaml: await lireOu(w, QUALITY), legacyJson: await lireOu(w, QUALITY_LEGACY) });
  if ("error" in q)
    throw new PanneEnvironnement(q.error);
  const sources = (await w.listerFichiers()).filter((f) => matchesAny(disp.sources, f));
  const vides = coreFilesMissing(q.bar, sources, q.declaredCore).map((c) => `Barre de qualité : la couche « ${c} » du cœur ne correspond à aucun fichier du projet ; ses seuils ne s'appliquent à rien (${q.source}).`);
  return { barre: q.bar, notes: [...q.warnings, ...vides] };
}

// ---------- un scénario ----------------------------------------------------------------------
/** Tests d'acceptance encore autorisés à échouer : scénarios moteurs non terminés. */
export const enCours = (L, i, avecCourant) => L.scenarios.filter((x, j) => x.role === "driver" && x.status !== "done" && (avecCourant || j !== i)).map((x) => x.acceptanceTestId);

export const present = (texte, id) => new RegExp(`\\b${id}\\b`).test(texte);

// ---------- fin de scénario et fin de phase ----------------------------------------------------
/**
* Mutation des fichiers de production modifiés, jugée contre la barre sur leurs seules lignes
* modifiées (décision du 08/11, comme la couverture) : `changes` vient de `fichiersModifies`.
*/
export async function muter(w, barre, changes, etiquette, derogations = []) {
  const sources = changes.map((f) => f.path);
  const brut = await w.mutation();
  if (!brut)
    return { motifs: [], mutants: [], faits: [], notes: ["Mutation non mesurée : la stack du projet ne propose pas d'outil de mutation."] };
  const { report: m, notes } = restreindreAuChangement(brut, changes);
  const faits = m.files.filter((x) => sources.some((p) => p === x.file || p.endsWith(`/${x.file}`))).map((f) => `Mutation (${etiquette}) : ${f.file} à ${f.score} %, ${f.survived.length} mutant(s) survivant(s).`);
  return { motifs: checkMutation(m, sources, barre, derogations), mutants: mutantsSousLeSeuil(m, sources, barre, derogations), faits, notes };
}

export const elementDe = (m) => `${m.file}:${m.line} (${m.operator})`;

export const memeMutant = (a, b) => a.file === b.file && a.line === b.line && a.operator === b.operator;
