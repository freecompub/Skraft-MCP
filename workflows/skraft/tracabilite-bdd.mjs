import { lireScenariosBdd } from "@skraft-mcp/workflow";

const sous = (path, dir) => path.startsWith(`${dir.replace(/\/$/, "")}/`);

/** Les lignes viennent des sources complètes ; extraire du Gherkin déplacerait les scénarios. */
export function scenariosBdd(i) {
  const fichiers = (fs) => (fs ?? []).filter(f => (i.bdd ?? []).some(c => sous(f.path, c.features)));
  const anciens = new Set(lireScenariosBdd(fichiers(i.gherkinAvant)).map(s => `${s.file}\0${s.cle}`));
  return lireScenariosBdd(fichiers(i.features)).filter(s => !anciens.has(`${s.file}\0${s.cle}`));
}

export function liaisonsBdd(i) {
  return scenariosBdd(i).map(scenario => ({
    scenario,
    resultats: (i.results ?? []).filter(r => r.bdd?.file === scenario.file && r.bdd.line === scenario.line),
  }));
}

export function criteresDesTestsBdd(i) {
  return Object.fromEntries(liaisonsBdd(i).flatMap(l => l.resultats.map(r => [r.id, l.scenario.criteres])));
}

export function checkRedBdd(i) {
  const reasons = [];
  const regressions = [];
  const liaisons = liaisonsBdd(i);
  for (const { scenario, resultats } of liaisons) {
    const origine = `${scenario.file}:${scenario.line}`;
    if (!scenario.criteres.length)
      reasons.push(`Le scénario BDD « ${scenario.titre} » (${origine}) ne porte aucun tag @ac-N.`);
    for (const n of scenario.criteres)
      if (!i.criteria.some(c => c.n === n))
        reasons.push(`Le scénario BDD « ${scenario.titre} » (${origine}) porte @ac-${n}, absent des critères de la story.`);
    if (!resultats.length)
      reasons.push(`Scénario BDD non collecté : « ${scenario.titre} » (${origine}). Le rapport du lanceur doit fournir le fichier .feature et la ligne du scénario ou de son exemple ; un nom AC-N ne prouve pas son exécution. Pour un lanceur Cucumber, configurez tests.bddReport: cucumber-json et un fichier *.cucumber.json par module dans {rapports}, avec la bonne base d'URI (tests.bddReportBase si nécessaire).`);
    for (const r of resultats) {
      if (r.status === "failed") {
        if (r.failureKind !== "assertion")
          reasons.push(`Le scénario BDD « ${scenario.titre} » (${origine}) échoue pour une mauvaise raison : ${(r.message ?? r.failureKind ?? "raison non classée").split("\n")[0]}`);
      } else if (r.status === "skipped") {
        reasons.push(`Le scénario BDD « ${scenario.titre} » (${origine}) est ignoré.`);
      } else if (scenario.criteres.length && scenario.criteres.every(n => i.testPlan.split("\n").some(l =>
        new RegExp(`@ac-${n}(?![0-9])`).test(l) && /r[ée]gression/i.test(l) && /justification\s*:\s*\S/i.test(l)))) {
        regressions.push(r.id);
      } else {
        reasons.push(`Le scénario BDD « ${scenario.titre} » (${origine}) passe déjà : requalifiez-le en non-régression avec une justification dans test-plan.md, ou faites-le piloter un nouveau comportement.`);
      }
    }
  }
  if (!liaisons.length)
    reasons.push("Aucun nouveau scénario BDD à collecter dans les dossiers de features déclarés.");
  const lies = new Set(liaisons.flatMap(l => l.resultats.map(r => r.id)));
  const autres = new Set(i.autresAcceptances ?? []);
  for (const r of i.results.filter(r => r.status === "failed" && !lies.has(r.id) && !autres.has(r.id)))
    reasons.push(`Échec de la suite hors scénarios d'acceptance « ${r.id} » : ${(r.message ?? r.failureKind ?? "raison non classée").split("\n")[0]}`);
  return { reasons, regressions };
}
