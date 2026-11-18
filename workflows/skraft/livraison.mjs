// Converti en JavaScript le 2026-10-10 depuis extensions/skraft-workflow/src/livraison.ts (ADR 0055).
/**
* Phase DELIVER en workflow (SPEC-skraft §7.4) : pour chaque scénario, un test unitaire rouge, puis
* le code (un tour, `turn-per-scenario`) ou le vert puis le nettoyage (sessions séparées), jusqu'au
* vert du test d'acceptance ; porte de fin de scénario ; à la fin, mutation et revue, avec
* correction ciblée des défauts (ADR 0046, 0047). Reproduit `deliver-machine.ts` et
* `deliver-effects.ts` de skraft. Toutes les preuves viennent de `w.lancerTests` (D20).
*/
import { ecrireLeRegistre, releverLesDefauts } from "./registre.mjs";
import { disjoncte, memeRefus, problemesTestsExistants, couvertureDuDiff, correspond as matchesAny, Escalade, PanneEnvironnement, TourInterrompu } from "@skraft-mcp/workflow";
import { checkCoverage, lignesSousLeSeuil, planScenarios, sansLignesExemptees } from "./deliver.mjs";
import { levelEffects } from "./difficulty.mjs";
import { reviewFacts } from "./review-brief.mjs";
import { agentFeedback, isActive, minorThreads } from "./review-thread.mjs";
import { ecrireRapports, enregistrerLivrables, nouveauSuivi, oublierLeRun, reviser } from "./revue.mjs";
import { commitMessage, creerDossiers, sha256 } from "./support.mjs";
import { declaredIdentifiers } from "./text-analysis.mjs";
import { noterLEtat } from "./reprise.mjs";
import { rapportDEcarts, rapportDeDerogations } from "./livraison-arbitrages.mjs";
import { correctionDeFin, corriger, filsDeCouverture, filsDeMutation, mutationDeFin } from "./livraison-corrections.mjs";
import { texteDesSources } from "./livraison-portes.mjs";
import { scenario } from "./livraison-scenario.mjs";
import { barreDeQualite, elementDe, enAttente, gelIntact, lancerTests, lireOu, natures, present, uniq } from "./livraison-socle.mjs";
export async function livrer(w, d, lentilles, max) {
  const suivi = nouveauSuivi();
  const faite = await w.phase("DELIVER", async (cp, relance) => {
    const L = await phase(w, d, suivi, cp, lentilles, max, relance);
    d.livraison = { granularity: L.granularity, scenarios: L.scenarios.map((x) => [x.id, x.role, x.status]), notes: L.notes };
    releverLesDefauts(d.registre, suivi, "DELIVER");
    await ecrireRapports(w, d.slug, "DELIVER", suivi);
    // Dérogations de mutation commitées avec la livraison : elles restent dans l'historique du projet (ADR 0065).
    if (d.derogations.length || d.derogationsCouverture.length || d.testsObsoletes.length)
      await w.ecrireFichier(`.skraft/${d.slug}/deliver/derogations.md`, rapportDeDerogations(d));
    // Écarts au plan de test commités avec la livraison (ADR 0067).
    if (d.ecartsAuPlan.length)
      await w.ecrireFichier(`.skraft/${d.slug}/deliver/ecarts-au-plan.md`, rapportDEcarts(d));
    // L'état de la phase, commité avec elle : une relance de la story le retrouve (ADR 0089).
    await noterLEtat(w, d, "DELIVER");
    return true;
  }, {
    commit: commitMessage("DELIVER", d.slug),
    // Commit impossible, continué par l'humain : le bilan le dit (D19 de docs/12).
    commitManque: () => void d.nonCommitees.push("DELIVER"),
    apresRembobinage: async () => {
      // Les défauts retenus du run effacé sont des erreurs commises : relevés avant d'être oubliés (LEC-1).
      releverLesDefauts(d.registre, suivi, "DELIVER");
      await ecrireLeRegistre(w, d.registre, { apresRembobinage: true });
      // Livrables et rapports du run effacé : oubliés (D6, D8 de docs/12).
      oublierLeRun(suivi);
      // Le code effacé emporte les mutants qu'on avait exemptés (ADR 0065) ; la trace les garde.
      d.derogations = [];
      d.derogationsCouverture = [];
      d.ecartsAuPlan = [];
      d.testsObsoletes = [];
      return creerDossiers(w, d.slug);
    },
  });
  return faite === true;
}

/**
* Budget de la phase : partagé entre les réessais de phase et les corrections de revue, comme
* `attempts` dans le réducteur (une correction en consomme un).
*/
async function phase(w, d, s, cpPhase, lentilles, max, relance) {
  let tentatives = 0;
  // Relancée après une escalade : le premier pas reçoit son motif (D15 de docs/12).
  let motifs = relance;
  /** Dernier refus compté de la phase et son numéro d'essai, pour le disjoncteur (ADR 0073). */
  let precedent = null;
  for (;;) {
    let rejet;
    try {
      const L = await planifier(w, d);
      for (let i = L.scenarios.findIndex(enAttente); i !== -1; i = L.scenarios.findIndex(enAttente)) {
        await scenario(w, d, L, i, motifs, max);
        motifs = [];
      }
      rejet = await finDePhase(w, d, s, L, cpPhase, lentilles, max, () => tentatives, () => tentatives++);
      if (!rejet.motifs.length)
        return L;
    }
    catch (e) {
      if (!(e instanceof TourInterrompu))
        throw e;
      rejet = { motifs: [`Le tour précédent a été interrompu (${e.message}) : aucune porte n'a jugé ton travail.`], garanti: false, porte: "délai" };
    }
    // Réessai de toute la phase : tracé avec sa cause (docs/10 §4.3).
    await w.rejet(`DELIVER : ${rejet.porte ?? "phase"}`, rejet.motifs);
    // Disjoncteur (ADR 0073) : le même refus que l'essai précédent, sans rien entre les deux (une
    // correction consomme un essai). Un délai se réessaie, un essai garanti ne compte pas.
    const compte = rejet.porte !== "délai" && !rejet.garanti;
    const refus = { porte: rejet.porte ?? "phase", motifs: rejet.motifs };
    const disjoncteur = compte && precedent?.essai === tentatives && memeRefus(precedent.refus, refus);
    tentatives++;
    precedent = compte ? { refus, essai: tentatives } : null;
    if (disjoncteur)
      throw new Escalade(disjoncte(rejet.motifs));
    if (tentatives >= max && !rejet.garanti)
      throw new Escalade(rejet.motifs);
    motifs = rejet.motifs;
  }
}

/** Début de DELIVER : suite de référence (seuls les tests d'acceptance peuvent être rouges), puis plan des scénarios. */
/** DISTILL sautée : rien n'est gelé, et DELIVER le dit au lieu de vérifier en silence (D1 de docs/12). */
const SANS_GEL = "DISTILL a été sautée : les tests d'acceptance ne sont pas gelés. DELIVER ne peut pas vérifier qu'ils restent inchangés.";

async function planifier(w, d) {
  const sansGel = !d.acceptanceHash && d.phasesSautees.includes("DISTILL");
  if (sansGel)
    await w.informer(SANS_GEL);
  if (!(await gelIntact(w, d)))
    throw new PanneEnvironnement("Les tests d'acceptance ont changé depuis DISTILL alors qu'ils sont gelés : restaurez-les avant de relancer.");
  const disp = await w.disposition();
  const run = await lancerTests(w, d, { etiquette: "DELIVER_BASELINE" });
  if (run.timedOut)
    throw new PanneEnvironnement("Les tests ont dépassé le délai avant le début de DELIVER.");
  const k = natures(disp);
  const casses = run.results.filter((r) => r.status === "failed" && !k.resultatAcceptance(r));
  if (casses.length)
    throw new PanneEnvironnement(`La suite est rouge avant DELIVER : ${casses.map((r) => r.id).join(", ")}. Corrigez-la avant de relancer.`);
  const implPlan = (await lireOu(w, `.skraft/${d.slug}/distill/impl-plan.md`)) ?? "";
  return {
    disp,
    // Seuls les tests de la story : ceux d'une story précédente portent aussi `ac-n` (ADR 0074 §4).
    scenarios: planScenarios({ implPlan, acceptanceTestIds: run.results.filter((r) => k.resultatAcceptance(r) && (!d.testsDeLaStory || d.testsDeLaStory.includes(r.id))).map((r) => r.id), regressions: d.regressions, criteresParTest: d.criteresParTest }),
    granularity: levelEffects(d.niveau).granularity,
    baseline: { all: run.results.map((r) => r.id), passed: run.results.filter((r) => r.status === "passed").map((r) => r.id) },
    // Un test de cette liste devenu rouge est un candidat à l'obsolescence (ADR 0066).
    avantDeliver: run.results.filter((r) => r.status === "passed").map((r) => r.id),
    unitTestsHash: null,
    dernierVert: null,
    notes: sansGel ? [SANS_GEL] : [],
    faits: [],
    contrat: [],
  };
}

/**
* Fin de phase : porte (livrables, mutation), revue, et corrections ciblées tant que le budget le
* permet (une correction consomme un essai). Rend les motifs d'un réessai de phase, ou aucun.
*/
async function finDePhase(w, d, s, L, cpPhase, lentilles, max, tentatives, consommer) {
  for (;;) {
    const essai = tentatives() + 1;
    const changes = (await w.fichiersModifies(cpPhase)).filter((f) => f.status !== "deleted");
    // Rien produit : personne à qui adresser le motif, l'humain décide sans qu'un essai soit consommé (D5).
    if (changes.length === 0)
      throw new Escalade(["livrables : Aucun livrable produit pendant la phase DELIVER."]);
    if (!d.qualityCheckpoint)
      L.notes = uniq([...L.notes, "Référence de qualité initiale absente (ancienne tâche) : couverture du diff limitée à DELIVER."]);
    const sources = (await w.fichiersModifies(d.qualityCheckpoint ?? cpPhase))
      .filter((f) => f.status !== "deleted" && matchesAny(L.disp.sources, f.path) && natures(L.disp).production(f.path));
    if (sources.length) {
      const run = await lancerTests(w, d, { etiquette: "DELIVER_COVERAGE" });
      const problems = problemesTestsExistants(run);
      if (problems.length) {
        if (await correctionDeFin(w, d, L, s, max, tentatives, consommer, "suite finale", problems))
          continue;
        return { motifs: problems, garanti: false, porte: "suite finale" };
      }
      if (run.coverage) {
        const { barre } = await barreDeQualite(w, L.disp);
        // Lignes exemptées par l'humain : hors du calcul (arbitrage de la couverture contestée).
        const diff = couvertureDuDiff(run.coverage, sansLignesExemptees(sources, d.derogationsCouverture));
        const motifs = checkCoverage(diff.report, sources.map((f) => f.path), barre, true);
        if (motifs.length) {
          const lignes = lignesSousLeSeuil(diff.report, sources.map((f) => f.path), barre);
          // Un défaut par fichier, qui garde ses lignes : contesté, l'humain peut les exempter.
          const fils = lignes.length ? (tour) => filsDeCouverture(lignes, tour) : undefined;
          if (await correctionDeFin(w, d, L, s, max, tentatives, consommer, "couverture du diff", motifs, fils))
            continue;
          return { motifs, garanti: false, porte: "couverture du diff" };
        }
        L.notes = uniq([...L.notes, ...diff.notes]);
        L.faits = uniq([...L.faits, ...diff.report.files.map((f) => `Couverture du diff (tâche) : ${f.file} à ${Math.round(f.score * 10) / 10} %, ${f.covered} ligne(s) sur ${f.total}.`)]);
      } else L.notes = uniq([...L.notes, "Couverture non mesurée : la commande de test du projet n'en produit pas."]);
    }
    const m = await mutationDeFin(w, L, cpPhase, d.derogations);
    if (m.motifs.length) {
      // Un défaut par mutant survivant : chacun peut être tué, ou contesté puis arbitré (ADR 0065).
      if (await correctionDeFin(w, d, L, s, max, tentatives, consommer, "mutation", m.motifs, (tour) => filsDeMutation(m.mutants, tour)))
        continue;
      return { motifs: m.motifs, garanti: false, porte: "mutation" };
    }
    await enregistrerLivrables(w, s, changes.map((c) => c.path), essai, sha256);
    L.faits = uniq([...L.faits, ...m.faits]);
    L.notes = uniq([...L.notes, ...m.notes]);
    L.contrat = await contratPresent(w, d, L.disp);
    const derniere = (await w.preuves()).filter((e) => e.source === "gate" && e.phase?.startsWith("DELIVER")).at(-1);
    const execution = derniere
      ? `Dernière exécution des tests par le code (${derniere.phase}) : ${derniere.counts.passed} réussi(s), ${derniere.counts.failed} en échec, ${derniere.counts.skipped} ignoré(s)${derniere.timedOut ? ", délai dépassé" : ""}.`
      : null;
    const revue = await reviser(w, d, s, cpPhase, "DELIVER", lentilles, essai, faitsDeLivraison(d, s, L, execution));
    if (!revue)
      return { motifs: [], garanti: false };
    const motifs = Array.isArray(revue) ? [...revue] : [...revue.motifs];
    const garanti = !Array.isArray(revue) && revue.garanti === true;
    const parHumain = s.fils.some((t) => t.status === "humanMaintained");
    if (s.fils.some(isActive) && L.dernierVert && (tentatives() + 1 < max || parHumain)) {
      await w.rejet("revue (correction ciblée)", motifs);
      consommer();
      await corriger(w, d, L, s, max);
      continue;
    }
    // Sans défaut bloquant ni majeur (D5 de docs/12) : tout est vert, rejouer la phase ne ferait
    // travailler personne. Les mineurs sont corrigés comme des majeurs ; sans aucun défaut, personne
    // à qui adresser la revue : l'humain décide, sans qu'un essai soit consommé.
    if (!s.fils.some(isActive) && L.dernierVert) {
      const mineurs = minorThreads(s.revues.at(-1).lentilles, s.revues.length);
      if (!mineurs.length)
        throw new Escalade([`Revue sans défaut à corriger : ${motifs.join(" ; ")}`]);
      if (tentatives() + 1 < max || garanti || parHumain) {
        await w.rejet("revue (correction ciblée)", agentFeedback(mineurs, () => true));
        consommer();
        s.fils = [...s.fils, ...mineurs];
        await corriger(w, d, L, s, max);
        continue;
      }
    }
    return { motifs, garanti, porte: "revue" };
  }
}

/** Noms du contrat ratifié présents dans le code au moment de la revue (ADR 0047). */
async function contratPresent(w, d, disp) {
  const contrat = await lireOu(w, `.skraft/${d.slug}/design/contracts.md`);
  if (contrat === null)
    return [];
  const texte = await texteDesSources(w, disp);
  return declaredIdentifiers(contrat).filter((id) => present(texte, id));
}

/** Faits de la revue de DELIVER (§9.1), établis par le code. */
function faitsDeLivraison(d, s, L, execution) {
  const faits = reviewFacts(s.livrables, "DELIVER");
  if (d.acceptanceHash)
    faits.push(`Tests d'acceptance gelés, empreinte ${d.acceptanceHash.slice(0, 12)}, vérifiée inchangée à chaque pas de DELIVER.`);
  for (const r of d.regressions)
    faits.push(`Test d'acceptance requalifié en non-régression, avec justification dans test-plan.md : ${r}.`);
  if (execution)
    faits.push(execution);
  for (const x of d.derogations)
    faits.push(`Dérogation de mutation (${x.par}) : ${elementDe(x)} — ${x.raison}. Mutant exempté de la porte de mutation après arbitrage.`);
  for (const x of d.ecartsAuPlan)
    faits.push(`Écart au plan déclaré par ${x.par} (scénario ${x.scenario}, critère ${x.criterion}) : prévu ${x.planned} → ${x.actual} — règle : ${x.rule}. Vérifié contre la matrice du plan de test ; à juger sur sa règle.`);
  for (const x of d.derogationsCouverture)
    faits.push(`Ligne exemptée de la couverture du diff (humain) : ${x.file}:${x.line} — ${x.raison}.`);
  for (const sc of L.scenarios.filter((x) => x.status === "done")) {
    if (sc.role === "regression")
      faits.push(`Scénario ${sc.id} : non-régression, vert dès DISTILL (${sc.acceptanceTestId}).`);
    else
      faits.push(`Scénario ${sc.id} : test d'acceptance vert (${sc.acceptanceTestId}) ; tests unitaires ajoutés, chacun rouge puis vert dans les preuves : ${sc.unitTests?.length ? sc.unitTests.join(", ") : "aucun"}.`);
  }
  faits.push(...L.faits, ...L.notes.map((n) => `À noter : ${n}`));
  return faits;
}
