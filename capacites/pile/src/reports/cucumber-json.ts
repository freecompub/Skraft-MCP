import { z } from "zod";
import type { TestResult } from "../protocols.js";
import { classifyFailure } from "../typescript/vitest-report.js";
import { origineBdd } from "./origine-bdd.js";

const resultat = z.object({
  status: z.enum(["passed", "failed", "skipped", "pending", "undefined", "ambiguous", "unused", "unknown"]),
  error_message: z.string().optional(),
});
const etape = z.object({ result: resultat });
const schema = z.array(z.object({
  uri: z.string(), name: z.string(),
  elements: z.array(z.object({
    type: z.enum(["scenario", "background"]), id: z.string().optional(), name: z.string(),
    line: z.number().int().positive(),
    steps: z.array(etape).default([]),
    before: z.array(etape).default([]),
    after: z.array(etape).default([]),
  })).default([]),
}));

export interface CasCucumber {
  resultat: TestResult;
  /** Identifiants publiés par Cucumber-JVM et pytest-bdd, utilisés seulement pour dédoublonner le XML. */
  junitId: string;
  pytestId?: string;
}

function raison(message: string): string {
  const derniere = message.trim().split("\n").at(-1) ?? "";
  if (/(?:Error|Exception)(?::.*)?$/.test(derniere) && !/^\s*at\s/.test(derniere)) return derniere;
  const python = [...message.matchAll(/^E\s+(.*)$/gm)].at(-1)?.[1];
  return python ?? message.trim().split("\n")[0] ?? "";
}

/** JSON natif Cucumber : les tags du rapport ne font jamais autorité sur les critères. */
export function lireCucumberJson(brut: string, root: string, base = "."): CasCucumber[] {
  const features = schema.parse(JSON.parse(brut));
  return features.flatMap(feature => feature.elements.filter(e => e.type === "scenario").map(element => {
    const bdd = origineBdd(feature.uri, element.line, root, base);
    const hooks = [...element.before, ...element.after].map(e => e.result);
    const etapes = element.steps.map(e => e.result);
    const erreurs = [...hooks, ...etapes].filter(e => !["passed", "skipped"].includes(e.status));
    const mauvaiseRaison = hooks.some(e => e.status !== "passed")
      || erreurs.some(e => e.status !== "failed" || classifyFailure(raison(e.error_message ?? "")) !== "assertion");
    const status = erreurs.length ? "failed" : !etapes.length || [...hooks, ...etapes].some(e => e.status !== "passed") ? "skipped" : "passed";
    const message = erreurs.map(e => e.error_message || `Étape BDD ${e.status}`).join("\n");
    const resultat: TestResult = {
      id: `${bdd.file}:${bdd.line}`, file: bdd.file, bdd, status,
      ...(status === "failed" ? { failureKind: mauvaiseRaison ? "other_error" : "assertion", message } : {}),
    };
    return {
      resultat, junitId: `${feature.name}.${element.name}`,
      ...(element.id?.startsWith("test_") ? { pytestId: element.id } : {}),
    };
  }));
}

/** Le résultat natif garde le même identifiant de source à INIT, DISTILL et DELIVER. */
export function reunirRapportsBdd(tests: readonly TestResult[], cas: readonly CasCucumber[], temoinsDuMoteur?: readonly TestResult[]): TestResult[] {
  if (temoinsDuMoteur) {
    const bilan = (rs: readonly TestResult[]) => {
      const comptes = new Map<string, number>();
      for (const r of rs) {
        const cle = `${r.status}:${r.status === "failed" ? r.failureKind ?? "other_error" : ""}`;
        comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
      }
      return JSON.stringify([...comptes].sort(([a], [b]) => a.localeCompare(b)));
    };
    if (bilan(temoinsDuMoteur) !== bilan(cas.map(c => c.resultat)))
      throw new Error("Rapports JUnit du moteur Cucumber et JSON natif incohérents : nombre, statut ou nature des échecs différents. Vérifiez les sorties distinctes de chaque module ; aucun résultat n'est écarté.");
  }
  const origines = new Set<string>();
  const remplaces = new Set<TestResult>();
  for (const c of cas) {
    if (origines.has(c.resultat.id))
      throw new Error(`Plusieurs résultats BDD pour « ${c.resultat.id} » : sorties de modules en collision ou lignes d'exemples non distinguées.`);
    origines.add(c.resultat.id);
    const doublons = tests.filter(t => t.id === c.junitId || (c.pytestId && t.id.endsWith(`.${c.pytestId}`)));
    if (doublons.length > 1 || doublons.some(t => remplaces.has(t)))
      throw new Error(`Plusieurs correspondances JUnit pour le scénario « ${c.resultat.id} » : le rapport est ambigu.`);
    for (const t of doublons) {
      if (t.status === "failed" && (c.resultat.status !== "failed" || (t.failureKind === "other_error" && c.resultat.failureKind === "assertion")))
        throw new Error(`Rapports JUnit et Cucumber incohérents pour « ${c.resultat.id} » : un échec technique ne peut pas être effacé.`);
      remplaces.add(t);
    }

  }
  return [...tests.filter(t => !remplaces.has(t)), ...cas.map(c => c.resultat)];
}

/** Surefire isole ce moteur dans son propre rapport ; les noms « Example #1.1 » ne portent pas d'origine. */
export function estRapportDuMoteurCucumber(xml: string): boolean {
  const racine = /<testsuite\b([^>]*)>/.exec(xml)?.[1] ?? "";
  return !/<testsuites\b/.test(xml) && /\bname="io\.cucumber\.junit\.platform\.engine\.CucumberTestEngine"/.test(racine);
}
