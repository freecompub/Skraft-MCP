// Extrait de livraison.mjs le 2026-11-14 ; provenance : extensions/skraft-workflow/src/livraison.ts (ADR 0055).
/**
* Les portes de DELIVER, exécutées par le code (le LLM propose, le code décide) : la porte d'un pas
* — RED, GREEN, REFACTOR, correction — et la porte de fin d'un scénario, avec la mutation, les
* dépendances et le lint.
*
* Extrait de `livraison.mjs` (2026-11-14), sans changement de logique.
*/
import { couvertureDuDiff, correspond as matchesAny } from "@skraft-mcp/workflow";
import { checkCoverage, checkDependencies, checkFormat, checkLint, checkRedGreenSequence, concerns, defaultDependencyRules, lignesSousLeSeuil, sansLignesExemptees } from "./deliver.mjs";
import { allDisputed, isActive } from "./review-thread.mjs";
import { PasRefuse, ScenarioEchoue, barreDeQualite, enCours, gelIntact, horsPassation, lancerTests, muter, natures, pourDev, pourTests, premiereLigne, present, uniq } from "./livraison-socle.mjs";
/** La porte du pas : RED, GREEN, REFACTOR, ou correction ; elle commite et pose le point sûr suivant. */
export async function porteDuPas(w, d, L, i, etape, depuis, sortie, nouveau, correction) {
  if (!(await gelIntact(w, d)))
    throw new PasRefuse("Les tests d'acceptance ont été modifiés : ils sont gelés depuis DISTILL. Le tour est annulé.");
  if (etape === "test")
    return porteRouge(w, d, L, i, depuis, sortie.coveredBy);
  if (etape === "fix-test")
    return porteCorrectionTests(w, d, L, i, depuis, sortie, correction);
  return porteVerte(w, d, L, i, etape, depuis, nouveau, sortie, correction);
}

/** Porte RED (SPEC.md §8.3) : un seul nouveau test unitaire, rouge pour une bonne raison. */
async function porteRouge(w, d, L, i, depuis, couvertPar) {
  const sc = L.scenarios[i];
  const k = natures(L.disp);
  const changes = horsPassation(await w.fichiersModifies(depuis), d.slug);
  if (couvertPar)
    return couvertParAcceptance(w, d, L, i, changes.length, couvertPar);
  if (changes.length === 0)
    throw new PasRefuse("Aucun fichier modifié : écris un nouveau test unitaire, ou, si le test d'acceptance du scénario vérifie déjà le comportement, désigne-le dans `coveredBy`.");
  const hors = changes.filter((f) => !k.unit(f.path));
  if (hors.length)
    throw new PasRefuse(`Seuls des tests unitaires peuvent être modifiés à ce pas. Fichiers hors tests unitaires : ${hors.map((f) => f.path).join(", ")}.`);
  const retouches = testsRetouches(changes, []);
  if (retouches.length)
    throw new PasRefuse(`À ce pas, un test unitaire existant ne peut recevoir que des ajouts : ${retouches.join(", ")}. Pour renforcer un test, ajoutes-en un plus strict ; ne modifie ni ne retire les tests existants.`);
  const run = await lancerTests(w, d, { etiquette: "DELIVER_RED", etape: sc.id });
  if (run.timedOut)
    throw new PasRefuse("Les tests ont dépassé le délai : le nouveau test boucle-t-il ?");
  const connus = new Set(L.baseline.all);
  const neufs = run.results.filter((r) => !connus.has(r.id) && !k.resultatAcceptance(r));
  if (neufs.length === 0)
    throw new PasRefuse("Aucun nouveau test unitaire détecté.");
  if (neufs.length > 1)
    throw new PasRefuse(`Un seul nouveau test unitaire par pas ; trouvés : ${neufs.map((r) => r.id).join(", ")}.`);
  const t = neufs[0];
  if (t.status === "passed")
    throw new PasRefuse(`Le nouveau test « ${t.id} » passe déjà : le comportement existe ou le test est trop faible.`);
  if (t.status === "skipped")
    throw new PasRefuse(`Le nouveau test « ${t.id} » est ignoré.`);
  if (t.failureKind === "other_error")
    throw new PasRefuse(`Le nouveau test échoue pour une mauvaise raison (ni assertion, ni symbole manquant) : ${premiereLigne(t.message)}`);
  const regressions = run.results.filter((r) => L.baseline.passed.includes(r.id) && r.status === "failed");
  if (regressions.length)
    throw new PasRefuse(`Des tests qui passaient ne passent plus : ${regressions.map((r) => r.id).join(", ")}.`, regressions.map((r) => r.id));
  L.unitTestsHash = await w.empreinte(["@stack:unitTests"]);
  await w.commiter(`test(${d.slug}): ${sc.id}, ${t.id}`);
  const cp = await w.checkpoint(`skraft ${d.slug} : rouge ${sc.id}`);
  L.baseline = { all: uniq([...L.baseline.all, t.id]), passed: L.baseline.passed };
  L.dernierVert = cp;
  return { cp, nouveau: t.id, viaAcceptance: false, acceptanceVerte: false };
}

/** Pas « test » sans test unitaire (ADR 0045) : le test d'acceptance du scénario tient lieu de rouge. */
async function couvertParAcceptance(w, d, L, i, nbChanges, couvertPar) {
  const sc = L.scenarios[i];
  if (nbChanges > 0)
    throw new PasRefuse("Tu as déclaré le comportement couvert par l'acceptance : aucun fichier ne doit alors être modifié. Écris un test unitaire, ou ne déclare rien.");
  if (!concerns(sc.acceptanceTestId, couvertPar))
    throw new PasRefuse(`« ${couvertPar} » n'est pas le test d'acceptance du scénario : seul ${sc.acceptanceTestId} peut tenir lieu de test rouge à ce pas.`);
  const run = await lancerTests(w, d, { etiquette: "DELIVER_RED", etape: sc.id });
  if (run.timedOut)
    throw new PasRefuse("Les tests ont dépassé le délai.");
  const lui = run.results.find((r) => concerns(r.id, sc.acceptanceTestId));
  if (!lui)
    throw new PasRefuse(`Le test d'acceptance ${sc.acceptanceTestId} est introuvable dans les résultats.`);
  if (lui.status === "passed")
    throw new PasRefuse(`Le test d'acceptance ${sc.acceptanceTestId} est déjà vert : il n'y a plus de comportement à faire passer.`);
  if (lui.status !== "failed" || lui.failureKind === "other_error")
    throw new PasRefuse(`Le test d'acceptance échoue pour une mauvaise raison (ni assertion, ni symbole manquant) : ${premiereLigne(lui.message)}`);
  const regressions = run.results.filter((r) => L.baseline.passed.includes(r.id) && r.status === "failed");
  if (regressions.length)
    throw new PasRefuse(`Des tests qui passaient ne passent plus : ${regressions.map((r) => r.id).join(", ")}.`, regressions.map((r) => r.id));
  L.unitTestsHash = await w.empreinte(["@stack:unitTests"]);
  const cp = await w.checkpoint(`skraft ${d.slug} : couvert par l'acceptance ${sc.id}`);
  L.dernierVert = cp;
  return { cp, nouveau: sc.acceptanceTestId, viaAcceptance: true, acceptanceVerte: false };
}

/**
* Fichiers de tests existants dont une ligne a été retirée ou remplacée, hors `permis` : un test
* affaibli passe toujours, seule la forme du diff le trahit (D10 de docs/12).
*/
function testsRetouches(changes, permis) {
  return changes.filter((f) => f.status !== "added" && (f.removed ?? 0) > 0 && !permis.includes(f.path)).map((f) => f.path);
}

/** Fichiers de production du projet, concaténés : de quoi chercher un nom du contrat. */
export async function texteDesSources(w, disp) {
  const parts = [];
  for (const f of (await w.listerFichiers()).filter((x) => matchesAny(disp.sources, x)))
    parts.push(await w.lireFichier(f));
  return parts.join("\n");
}

/** Porte GREEN, REFACTOR ou correction : tests gelés intacts, code de production seul, suite verte hors acceptance en attente. */
async function porteVerte(w, d, L, i, etape, depuis, nouveau, sortie, correction) {
  const sc = L.scenarios[i];
  if (L.unitTestsHash && (await w.empreinte(["@stack:unitTests"])) !== L.unitTestsHash)
    throw new PasRefuse("Les tests unitaires ont été modifiés pendant le pas de code : ils sont gelés depuis leur rouge. Le tour est annulé ; modifie uniquement le code de production.");
  const k = natures(L.disp);
  const changes = horsPassation(await w.fichiersModifies(depuis), d.slug);
  // Correction où tout est contesté ou renvoyé, sans test rouge à faire passer : rien à modifier,
  // la lentille arbitrera (D7 de docs/12).
  const rienAModifier = etape === "fix" && !correction.cibles.length && allDisputed(correction.fils, sortie.responses ?? [], pourDev);
  if (etape !== "refactor" && !rienAModifier && !changes.some((f) => k.production(f.path)))
    throw new PasRefuse("Aucun fichier de production modifié : écris le code qui fait passer le test.");
  // Garde du contrat ratifié (ADR 0047) : une correction ne retire pas ce que le contrat exige.
  if (etape === "fix" && L.contrat.length) {
    const texte = await texteDesSources(w, L.disp);
    const disparus = L.contrat.filter((id) => !present(texte, id));
    if (disparus.length)
      throw new PasRefuse(`Cette correction retire du code des éléments du contrat ratifié (design/contracts.md) : ${disparus.join(", ")}. ` +
        "Corrige sans retirer ce que le contrat exige ; si le défaut ne peut pas être corrigé autrement, conteste-le ou déclare-le hors de ton périmètre (`outOfScope`).");
  }
  const run = await lancerTests(w, d, { etiquette: etape === "refactor" ? "DELIVER_REFACTOR" : "DELIVER_GREEN", etape: sc.id });
  if (run.timedOut)
    throw new PasRefuse("Les tests ont dépassé le délai : le code boucle-t-il ?");
  // Correction : plus aucun test d'acceptance n'est attendu rouge.
  const attendus = etape === "fix" ? [] : enCours(L, i, true);
  const suite = problemesDeSuite(run.results, attendus, k.resultatAcceptance);
  if (suite.length)
    throw new PasRefuse(suite.join(" "), rougesDeLaSuite(run.results, attendus));
  // Un nettoyage ne change pas le comportement : l'acceptance du scénario, verte, le reste (D16 de docs/12).
  if (etape === "refactor" && L.acceptanceVerte && run.results.find((r) => r.id === sc.acceptanceTestId)?.status !== "passed")
    throw new PasRefuse(`Le nettoyage a fait passer le test d'acceptance du scénario au rouge (${sc.acceptanceTestId}) : un nettoyage ne change pas le comportement.`);
  if (nouveau && etape !== "fix") {
    const siens = run.results.filter((r) => concerns(r.id, nouveau) || r.file === nouveau);
    if (siens.length === 0)
      throw new PasRefuse(`Le test du pas est introuvable : ${nouveau}.`);
    if (siens.some((r) => r.status !== "passed"))
      throw new PasRefuse(`Le test du pas ne passe pas : ${nouveau}.`);
  }
  for (const t of correction?.cibles ?? []) {
    const siens = run.results.filter((r) => concerns(r.id, t));
    if (siens.length === 0)
      throw new PasRefuse(`Le test ajouté par la correction est introuvable : ${t}.`);
    if (siens.some((r) => r.status !== "passed"))
      throw new PasRefuse(`Le test ajouté par la correction ne passe pas : ${t}.`);
  }
  const genre = { dev: "feat", green: "feat", refactor: "refactor", fix: "fix", test: "test", "fix-test": "test" }[etape];
  await w.commiter(`${genre}(${d.slug}): ${etape === "fix" ? "correction de revue" : sc.id}`);
  const cp = await w.checkpoint(`skraft ${d.slug} : ${etape} ${sc.id}`);
  L.baseline = { all: uniq([...L.baseline.all, ...run.results.map((r) => r.id)]), passed: run.results.filter((r) => r.status === "passed").map((r) => r.id) };
  L.dernierVert = cp;
  if (correction)
    correction.reponses = sortie.responses ?? [];
  return { cp, nouveau: null, viaAcceptance: false, acceptanceVerte: run.results.some((r) => r.id === sc.acceptanceTestId && r.status === "passed") };
}

/** Tests en échec de la suite, hors acceptance des scénarios pas encore livrés : la cause d'un refus (ADR 0066). */
function rougesDeLaSuite(results, attente) {
  return results.filter((r) => r.status === "failed" && !attente.some((p) => concerns(r.id, p))).map((r) => r.id);
}

/** Suite complète : verte, sauf les tests d'acceptance des scénarios pas encore livrés ; aucun test ignoré. */
function problemesDeSuite(results, attente, estAcceptance) {
  const enAttenteDe = (r) => attente.some((p) => concerns(r.id, p));
  const echecs = results.filter((r) => r.status === "failed" && !enAttenteDe(r));
  const ignores = results.filter((r) => r.status === "skipped" && !(estAcceptance(r) && enAttenteDe(r)));
  const out = [];
  if (echecs.length)
    out.push(`Tests en échec : ${echecs.map((r) => `${r.id} (${premiereLigne(r.message)})`).join("; ")}.`);
  if (ignores.length)
    out.push(`Tests ignorés (interdit) : ${ignores.map((r) => r.id).join(", ")}.`);
  return out;
}

/** Porte de fin de scénario (§7.4) : acceptance verte, suite verte, séquence des preuves, mutation, dépendances, lint. */
export async function porteScenario(w, d, L, i, depuis, unitTests) {
  const sc = L.scenarios[i];
  const { barre, notes: notesBarre } = await barreDeQualite(w, L.disp);
  const motifs = [];
  const notes = [...notesBarre];
  const faits = [];
  if (!(await gelIntact(w, d)))
    motifs.push("Les tests d'acceptance ont été modifiés : ils sont gelés depuis DISTILL.");
  const k = natures(L.disp);
  const run = await lancerTests(w, d, { etiquette: "DELIVER_SCENARIO", etape: sc.id });
  if (run.timedOut)
    throw new ScenarioEchoue(["Les tests ont dépassé le délai à la fin du scénario."]);
  if (run.results.find((r) => r.id === sc.acceptanceTestId)?.status !== "passed")
    motifs.push(`Le test d'acceptance du scénario n'est pas vert : ${sc.acceptanceTestId}.`);
  motifs.push(...problemesDeSuite(run.results, enCours(L, i, false), k.resultatAcceptance));
  // Cause du refus, si refus il y a (ADR 0066) : tests rouges de la suite, lignes non couvertes.
  const rouges = rougesDeLaSuite(run.results, enCours(L, i, false));
  const lignes = [];
  motifs.push(...checkRedGreenSequence((await w.preuves()).filter((x) => x.stepId === sc.id), unitTests));
  const changes = (await w.fichiersModifies(depuis)).filter((f) => f.status !== "deleted" && k.production(f.path) && matchesAny(L.disp.sources, f.path));
  const sources = changes.map((f) => f.path);
  if (sources.length) {
    if (!barre.mutation.active)
      notes.push("Mutation désactivée par la barre de qualité du projet.");
    else if (barre.mutation.moment === "scenario") {
      // Les dérogations accordées comptent ici aussi, comme dans l'extension. Elles ne naissent qu'en
      // fin de DELIVER : ce cas suppose une barre passée « par scénario » pendant le run.
      const m = await muter(w, barre, changes, sc.id, d.derogations);
      motifs.push(...m.motifs);
      faits.push(...m.faits);
      notes.push(...m.notes);
    }
    if (run.coverage) {
      // Lignes exemptées par l'humain (ADR 0065, et à l'escalade d'un scénario, ADR 0066) : hors du calcul.
      const diff = couvertureDuDiff(run.coverage, sansLignesExemptees(changes, d.derogationsCouverture));
      notes.push(...diff.notes);
      const couverture = checkCoverage(diff.report, sources, barre, true);
      motifs.push(...couverture);
      if (couverture.length)
        lignes.push(...lignesSousLeSeuil(diff.report, sources, barre));
      for (const f of diff.report.files)
        faits.push(`Couverture du diff (${sc.id}) : ${f.file} à ${Math.round(f.score * 10) / 10} %, ${f.covered} ligne(s) sur ${f.total}.`);
    }
    else
      notes.push("Couverture non mesurée : la commande de test du projet n'en produit pas.");
    const lint = await w.lint(sources);
    if (!lint?.available)
      notes.push("Qualité de forme non mesurée : le projet n'a pas de linter configuré pour cette stack.");
    else {
      const m = checkLint(lint);
      motifs.push(...m);
      const examines = lint.analyzed ?? sources;
      const omis = sources.filter((p) => !examines.includes(p));
      if (m.length === 0 && examines.length > 0)
        faits.push(`Lint (${sc.id}) : ${lint.tool ?? "linter du projet"} sans erreur sur ${examines.join(", ")}.`);
      if (omis.length > 0)
        notes.push(`Qualité de forme non mesurée sur ${omis.join(", ")} : le linter du projet ne les examine pas.`);
    }
    // Format (ADR 0071) : la commande de la pile, à côté du lint ; un écart revient au développeur.
    const format = checkFormat(await w.format(sources), sc.id);
    motifs.push(...format.motifs);
    faits.push(...format.faits);
    notes.push(...format.notes);
  }
  const regles = barre.dependencyRules.length ? barre.dependencyRules : defaultDependencyRules(L.disp.infrastructureModules);
  if (regles.length === 0)
    notes.push("Règle de dépendance non vérifiée : aucune règle déclarée, et la stack du projet n'en propose pas.");
  else {
    const archi = await w.architecture(regles);
    if (archi) {
      const trouves = checkDependencies(archi);
      motifs.push(...trouves);
      if (!trouves.length)
        faits.push(`Règle de dépendance respectée : ${regles.map((r) => `${r.module} n'importe ni ${r.forbidden.join(", ni ")}`).join(" ; ")}.`);
    }
    else
      notes.push("Règle de dépendance non vérifiée : la stack du projet ne sait pas analyser les imports.");
  }
  if (motifs.length)
    throw new ScenarioEchoue(motifs, { rouges, lignes });
  L.notes = uniq([...L.notes, ...notes]);
  L.faits = uniq([...L.faits, ...faits]);
}

/**
* Porte de la correction côté tests (ADR 0046) : des tests unitaires seulement, aucun test existant
* disparu ni cassé, un rouge éventuel pour une bonne raison. Les rouges deviennent les cibles du
* développeur. Ne rien écrire est permis : tout a pu être contesté.
*/
async function porteCorrectionTests(w, d, L, i, depuis, sortie, c) {
  const sc = L.scenarios[i];
  const k = natures(L.disp);
  const changes = horsPassation(await w.fichiersModifies(depuis), d.slug);
  const hors = changes.filter((f) => !k.unit(f.path));
  if (hors.length)
    throw new PasRefuse(`À ce pas, seuls des tests unitaires peuvent être ajoutés. Fichiers hors tests unitaires : ${hors.map((f) => f.path).join(", ")}.`);
  // Renforcer un test existant est permis, s'il est cité par un défaut qui t'est adressé (D10 de docs/12).
  const cites = c.fils.filter((t) => isActive(t) && pourTests(t) && t.file).map((t) => t.file);
  const retouches = testsRetouches(changes, cites);
  if (retouches.length)
    throw new PasRefuse(`Un test unitaire existant ne peut recevoir que des ajouts, sauf s'il est cité par un défaut ci-dessus : ${retouches.join(", ")}. Ajoute plutôt un test plus strict.`);
  const run = await lancerTests(w, d, { etiquette: "DELIVER_FIX_TEST", etape: sc.id });
  if (run.timedOut)
    throw new PasRefuse("Les tests ont dépassé le délai : un test ajouté boucle-t-il ?");
  const ids = new Set(run.results.map((r) => r.id));
  const disparus = L.baseline.all.filter((id) => !ids.has(id) && !run.results.some((r) => concerns(r.id, id)));
  if (disparus.length)
    throw new PasRefuse(`Des tests existants ont disparu : ${disparus.join(", ")}. Ajoute des tests, ne retire ni ne renomme les existants.`);
  const casses = run.results.filter((r) => L.baseline.passed.includes(r.id) && r.status === "failed");
  if (casses.length)
    throw new PasRefuse(`Des tests qui passaient ne passent plus : ${casses.map((r) => r.id).join(", ")}. Ne modifie pas les tests existants.`, casses.map((r) => r.id));
  const neufs = run.results.filter((r) => !L.baseline.all.includes(r.id) && !k.resultatAcceptance(r));
  const ignores = neufs.filter((r) => r.status === "skipped");
  if (ignores.length)
    throw new PasRefuse(`Tests ajoutés ignorés (interdit) : ${ignores.map((r) => r.id).join(", ")}.`);
  const mauvais = neufs.filter((r) => r.status === "failed" && r.failureKind === "other_error");
  if (mauvais.length)
    throw new PasRefuse(`Un test ajouté échoue pour une mauvaise raison (ni assertion, ni symbole manquant) : ${mauvais.map((r) => `${r.id} (${premiereLigne(r.message)})`).join("; ")}.`);
  if (changes.length)
    await w.commiter(`test(${d.slug}): correction de revue`);
  const cp = await w.checkpoint(`skraft ${d.slug} : correction côté tests ${sc.id}`);
  L.baseline = { all: uniq([...L.baseline.all, ...run.results.map((r) => r.id)]), passed: run.results.filter((r) => r.status === "passed").map((r) => r.id) };
  L.unitTestsHash = await w.empreinte(["@stack:unitTests"]);
  L.dernierVert = cp;
  c.cibles = neufs.filter((r) => r.status === "failed").map((r) => r.id);
  c.reponses = sortie.responses ?? [];
  return { cp, nouveau: null, viaAcceptance: false, acceptanceVerte: false };
}
