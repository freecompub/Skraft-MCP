/**
 * Phase ARCHI de skraft-light (ADR 0098) : porte du document de l'architecte, en fonctions pures. Les
 * citations sont jugées comme dans la porte de RESEARCH de skraft (`research.mjs`), dont ce module
 * reprend la lecture des sections ; s'y ajoute le mode, `conforme` ou `nouvelle`, et ce qu'il exige.
 */
import { parseCitations } from "./text-analysis.mjs";

/** Gabarit du document d'architecture ; « Questions ouvertes » est facultative. */
export const ARCHI_SECTIONS = [
  "Périmètre",
  "Fichiers analysés",
  "Conventions du projet",
  "Mode",
  "Architecture retenue",
  "Justification",
  "Plan de conception",
  "Existant réutilisable",
];

export const MODES = ["conforme", "nouvelle"];

/** Le document d'architecture d'une story. */
export const cheminArchitecture = (slug) => `.skraft/${slug}/archi/architecture.md`;

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function sections(md) {
  const out = new Map();
  for (const p of md.split(/^##\s+(?!#)/m).slice(1)) {
    const [title = "", ...rest] = p.split("\n");
    out.set(norm(title), rest.join("\n").trim());
  }
  return out;
}

/** Le mode écrit dans sa section : `conforme`, `nouvelle`, ou `null` s'il n'y en a pas un seul. */
function modeDe(secs) {
  const texte = norm(secs.get(norm("Mode")) ?? "");
  const trouves = MODES.filter((m) => new RegExp(`\\b${m}\\b`).test(texte));
  return trouves.length === 1 ? trouves[0] : null;
}

/** Les éléments « `Nom` → `chemin` » de l'existant réutilisable. */
function elementsExistants(texte) {
  return [...texte.matchAll(/`([A-Za-z_]\w*)`\s*(?:→|->)\s*`([^`]+)`/g)].map((m) => ({ nom: m[1], chemin: m[2] }));
}

/** Les chemins que cite le document, tels que la porte les cherche. */
export function citesDansLArchitecture(md) {
  return [...new Set([...md.matchAll(/[\w./-]+\.[A-Za-z][A-Za-z0-9]{0,9}/g)].map((m) => m[0]))];
}

/**
 * La porte : `index.lineCount(chemin)` rend le nombre de lignes d'un fichier du dépôt, ou `null` s'il
 * n'existe pas ; `index.contains(chemin, nom)` dit si le nom y apparaît.
 */
export function checkArchitecture(md, index) {
  const reasons = [];
  const secs = sections(md);
  for (const s of ARCHI_SECTIONS)
    if (!secs.has(norm(s)))
      reasons.push(`Section manquante : « ${s} ».`);
  const mode = modeDe(secs);
  if (secs.has(norm("Mode")) && mode === null)
    reasons.push("Mode : écris « conforme » (suivre l'architecture existante) ou « nouvelle » (en proposer une), un seul des deux.");
  const existant = secs.get(norm("Existant réutilisable"));
  const cheminsDeLExistant = new Set(elementsExistants(existant ?? "").map((e) => e.chemin));
  for (const c of parseCitations(md).paths) {
    if (!c.path.includes("/") || c.path.startsWith(".skraft/"))
      continue;
    const cite = `\`${c.path}${c.start !== undefined ? `:${c.start}${c.end !== c.start ? `-${c.end}` : ""}` : ""}\``;
    const lines = index.lineCount(c.path);
    if (lines === null) {
      // Le plan nomme les fichiers à créer ; un élément de l'existant a son propre motif, plus précis.
      if (!citeSeulementDansLePlan(secs, c.path) && !cheminsDeLExistant.has(c.path))
        reasons.push(`${cite} : fichier inexistant dans le dépôt.`);
      continue;
    }
    if (c.start === undefined || c.end === undefined)
      continue;
    if (c.end < c.start)
      reasons.push(`${cite} : plage inversée.`);
    else if (c.start < 1 || c.end > lines)
      reasons.push(`${cite} : plage hors du fichier, qui compte ${lines} lignes.`);
  }
  if (secs.has(norm("Plan de conception")) && !secs.get(norm("Plan de conception")))
    reasons.push("Plan de conception vide : dis où va chaque élément de la story.");
  if (existant !== undefined) {
    const elements = elementsExistants(existant);
    if (!elements.length && !/\baucun/i.test(existant))
      reasons.push("Existant réutilisable est vide : liste les éléments (« `Nom` → `chemin` »), ou écris « aucun ».");
    for (const { nom, chemin } of elements) {
      if (index.lineCount(chemin) === null)
        reasons.push(`Existant réutilisable : \`${nom}\` → \`${chemin}\` : fichier inexistant.`);
      else if (!index.contains(chemin, nom))
        reasons.push(`Existant réutilisable : \`${nom}\` n'apparaît pas dans \`${chemin}\`.`);
    }
    if (mode === "conforme" && !elements.length)
      reasons.push("Mode conforme : cite au moins un élément de l'existant réutilisable (« `Nom` → `chemin` ») ; se conformer à rien n'est pas se conformer.");
  }
  if (mode === "nouvelle" && secs.has(norm("Justification")) && !secs.get(norm("Justification")))
    reasons.push("Mode nouvelle : la justification est absente.");
  return { reasons, mode, openQuestions: questionsOuvertes(secs) };
}

/** Un fichier que seul le plan de conception nomme est un fichier à créer, pas une citation fausse. */
function citeSeulementDansLePlan(secs, chemin) {
  const ailleurs = [...secs.entries()].filter(([titre]) => titre !== norm("Plan de conception")).some(([, texte]) => texte.includes(chemin));
  return !ailleurs && (secs.get(norm("Plan de conception")) ?? "").includes(chemin);
}

function questionsOuvertes(secs) {
  const texte = secs.get(norm("Questions ouvertes")) ?? "";
  return [...texte.matchAll(/^\s*[-*]\s+(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
}

/** Tours de questions de l'architecte avant escalade : l'architecture n'est figée qu'une fois toutes tranchées. */
export const TOURS_DE_QUESTIONS = 2;

/**
 * Les questions ouvertes du document, au regard de celles déjà connues (`{ text, answer? }`) : les
 * nouvelles sont à poser ; une question tranchée encore listée est un motif, l'architecte n'a pas
 * intégré la réponse. Une question connue sans réponse sera posée avec les autres.
 */
export function trierLesQuestions(ouvertes, connues) {
  const parTexte = new Map(connues.map((q) => [q.text, q]));
  const nouvelles = [...new Set(ouvertes.filter((q) => !parTexte.has(q)))];
  const motifs = ouvertes
    .filter((q) => parTexte.get(q)?.answer !== undefined)
    .map((q) => `Question déjà tranchée, encore listée dans « Questions ouvertes » : « ${q} » → ${parTexte.get(q).answer}. Intègre la réponse à l'architecture et retire la question.`);
  return { nouvelles, motifs };
}

/** La porte sur des contenus déjà lus (chemin → contenu des fichiers cités qui existent). */
export function motifsDeLArchitecture(md, contenus) {
  return checkArchitecture(md, {
    lineCount: (p) => (contenus.has(p) ? contenus.get(p).replace(/\n$/, "").split("\n").length : null),
    contains: (p, nom) => contenus.get(p)?.includes(nom) ?? false,
  });
}

export function texteDeVerificationArchitecture(reasons) {
  if (!reasons.length)
    return "Aucun motif : la porte d'ARCHI accepterait ce document en l'état.";
  return ["La porte « architecture » refuserait ce document :", ...reasons.map((m) => `- ${m}`), "Corrige, puis vérifie de nouveau."].join("\n");
}

/** L'outil `verifier_architecture` de l'architecte (ADR 0082) : la même porte, pendant son tour. */
export async function verifierArchitecture({ fichiers, donnees, lire }) {
  const md = fichiers[donnees.chemin];
  if (md === undefined)
    return texteDeVerificationArchitecture([`Document d'architecture absent : ${donnees.chemin}`]);
  const contenus = new Map();
  for (const cite of citesDansLArchitecture(md)) {
    const c = await lire(cite);
    if (c !== null)
      contenus.set(cite, c);
  }
  return texteDeVerificationArchitecture(motifsDeLArchitecture(md, contenus).reasons);
}

/** Ce que DISTILL et DELIVER reçoivent de l'architecture retenue. */
export function extraireArchitecture(md) {
  const secs = sections(md);
  const s = (titre) => secs.get(norm(titre)) ?? "";
  return { mode: modeDe(secs), architecture: s("Architecture retenue"), plan: s("Plan de conception"), conventions: s("Conventions du projet"), existant: s("Existant réutilisable") };
}
