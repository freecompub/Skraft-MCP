// Extrait de livraison.mjs le 2026-11-14 ; provenance : extensions/skraft-workflow/src/livraison.ts (ADR 0055).
/**
* Un scénario de DELIVER et ses pas (SPEC-skraft §7.4) : du checkpoint du scénario à sa porte de
* fin, un pas = l'agent puis la porte du pas, rembobiné et relancé sur refus ; l'escalade d'un
* scénario selon sa cause (ADR 0066).
*
* Extrait de `livraison.mjs` (2026-11-14), sans changement de logique.
*/
import { leconsPour } from "./lecons.mjs";
import { disjoncte, memeRefus, PanneEnvironnement, SauterPhase, TourInterrompu } from "@skraft-mcp/workflow";
import { buildBrief, ecrirePassation, lignePile } from "./brief.mjs";
import { causeDEchec, optionsSelonLaCause, texteDeLaCause } from "./deliver.mjs";
import { featureScenarios, verifierEcarts } from "./distill.mjs";
import { gherkinDeLaStory, gherkinDuDisque } from "./gherkin.mjs";
import { creerDossiers } from "./support.mjs";
import { porteDuPas, porteScenario } from "./livraison-portes.mjs";
import { GELES_DEV, GELES_TESTEUR, MAX_CYCLES, PasRefuse, ScenarioEchoue, uniq } from "./livraison-socle.mjs";
/**
* Un scénario, de son checkpoint à sa porte de fin. Un échec le reprend à son début : en sessions
* séparées après un premier échec en mode tour (D22), puis dans la limite du budget ; au-delà,
* escalade au niveau du scénario.
*/
export async function scenario(w, d, L, i, motifs, max) {
  const sc = L.scenarios[i];
  L.scenarios[i] = { ...sc, status: "in_progress" };
  const cpScenario = await w.checkpoint(`skraft ${d.slug} : scénario ${sc.id}`);
  const baseScenario = L.baseline;
  let echecs = 0;
  let retour = motifs;
  /** Motifs du dernier échec du scénario, pour le disjoncteur (ADR 0073). */
  let echecPrecedent = null;
  for (;;) {
    L.baseline = baseScenario;
    try {
      const unitTests = await derouler(w, d, L, i, cpScenario, retour, max);
      L.scenarios[i] = { ...L.scenarios[i], status: "done", unitTests };
      return;
    }
    catch (e) {
      if (!(e instanceof PanneEnvironnement) && !(e instanceof ScenarioEchoue))
        throw e;
      const panne = e instanceof PanneEnvironnement;
      // Scénario repris à son début : tracé avec sa cause (docs/10 §4.3).
      await w.rejet(panne ? `panne (${sc.id})` : `scénario ${sc.id}`, e instanceof ScenarioEchoue ? e.motifs : [e.message]);
      echecs++;
      // Le scénario repart de son début : ses tests sont effacés, et les écarts qu'ils portaient avec eux (ADR 0067).
      d.ecartsAuPlan = d.ecartsAuPlan.filter((x) => x.scenario !== sc.id);
      await w.rembobiner(cpScenario);
      await creerDossiers(w, d.slug);
      retour = e instanceof ScenarioEchoue ? e.motifs : [];
      // Disjoncteur (ADR 0073) : le scénario échoue comme à sa reprise précédente ; on escalade.
      const refus = panne ? null : { porte: "scénario", motifs: retour };
      const disjoncteur = echecs > 1 && memeRefus(echecPrecedent, refus ?? { porte: "", motifs: [] });
      echecPrecedent = refus;
      if (disjoncteur)
        retour = disjoncte(retour);
      if (!panne && L.granularity === "turn-per-scenario") {
        L.granularity = "session-per-step";
        L.notes = [...L.notes, `Scénario ${sc.id} : repris en sessions séparées après un échec.`];
        continue;
      }
      if (panne || echecs >= max || disjoncteur) {
        // La cause choisit ce qui peut réussir (ADR 0066) : déclarer un test obsolète, exempter des lignes.
        const cause = panne ? undefined : causeDEchec({ rouges: e.cause.rouges, avantDeliver: L.avantDeliver, lignes: e.cause.lignes });
        const avis = await escaladeScenario(w, panne ? e.message : `Scénario ${sc.id} : ${retour.join(" ; ")}`, { d, sc, cause });
        retour = [...retour, ...avis];
        echecs = 0;
        echecPrecedent = null;
      }
    }
  }
}

const OPTIONS_DE_CAUSE = {
  obsolete: { id: "obsolete", label: "Déclarer ces tests obsolètes et continuer" },
  exempt: { id: "exempter", label: "Exempter ces lignes et continuer" },
};

/**
* Escalade d'un scénario : relancer reprend CE scénario, sauter saute la phase (comme le réducteur).
* Selon la cause (ADR 0066), deux options de plus, après lesquelles le scénario reprend aussi :
* - « obsolete » : les tests nommés sortent des portes jusqu'à la fin du cycle ; le bilan rappellera
*   de les mettre à jour (comme les défauts hors du changement) ;
* - « exempter » : les lignes non couvertes sortent du calcul de la couverture du diff (ADR 0065).
* Chaque décision est tracée en arbitrage. Rend l'avis à ajouter au retour de l'agent.
*/
export async function escaladeScenario(w, motif, o = {}) {
  await w.etape("ESCALATED");
  const cause = o.cause;
  const rep = await w.humain("escalade", "Pipeline skraft bloqué (DELIVER)", [
    ...optionsSelonLaCause(cause).map((c) => OPTIONS_DE_CAUSE[c]),
    { id: "relancer", label: "Relancer la phase" },
    { id: "sauter", label: "Sauter la phase" },
    { id: "abandonner", label: "Abandonner" },
  ], { detail: [motif, ...texteDeLaCause(cause)].join("\n\n") });
  if (rep.decision === "sauter")
    throw new SauterPhase();
  if (rep.decision === "abandonner")
    w.echec(`Abandon : ${motif}`);
  const raison = rep.commentaire ?? "";
  if (rep.decision === "obsolete" && cause) {
    o.d.testsObsoletes = [...o.d.testsObsoletes, ...cause.testsObsoletes.map((test) => ({ test, scenario: o.sc.id, raison }))];
    for (const test of cause.testsObsoletes)
      await w.arbitrage({ porte: "tests existants", élément: test, contestation: "", décision: "obsolète", par: "humain", raison });
    return [`Tests déclarés obsolètes par l'humain : ${cause.testsObsoletes.join(", ")}. Ils ne comptent plus dans les portes ; ne les modifie pas.`];
  }
  if (rep.decision === "exempter" && cause) {
    o.d.derogationsCouverture = [...o.d.derogationsCouverture, ...cause.lignes.flatMap((l) => l.lines.map((line) => ({ file: l.file, line, raison, contestation: "", defaut: `scénario ${o.sc.id}` })))];
    for (const l of cause.lignes)
      await w.arbitrage({ porte: "couverture du diff", élément: `${l.file}:${l.lines.join(", ")}`, contestation: "", décision: "dérogation", par: "humain", raison });
  }
  return [];
}

/** Les pas d'un scénario jusqu'à sa porte de fin ; rend les tests unitaires ajoutés. */
async function derouler(w, d, L, i, cpScenario, motifs, max) {
  const sc = L.scenarios[i];
  const dejaVert = L.baseline.passed.includes(sc.acceptanceTestId);
  // Le code d'un pas précédent en a fait plus que demandé : noté, sans refus (décision du 08/11).
  if (dejaVert)
    L.notes = uniq([...L.notes, `Scénario ${sc.id} : déjà vert avant son premier pas ; le code d'un pas précédent l'a fait passer sans test rouge qui le demande.`]);
  let point = cpScenario;
  const unitTests = [];
  let retour = motifs;
  for (let cycles = 0; !dejaVert;) {
    const rouge = await pas(w, d, L, i, "test", point, retour, max, unitTests, null);
    retour = [];
    point = rouge.cp;
    if (rouge.nouveau && !rouge.viaAcceptance)
      unitTests.push(rouge.nouveau);
    let vert;
    if (L.granularity === "turn-per-scenario") {
      const r = await pas(w, d, L, i, "dev", point, [], max, unitTests, rouge.nouveau);
      point = r.cp;
      vert = r.acceptanceVerte;
    }
    else {
      const g = await pas(w, d, L, i, "green", point, [], max, unitTests, rouge.nouveau);
      point = g.cp;
      vert = g.acceptanceVerte;
      // La porte du nettoyage refuse qu'il fasse repasser l'acceptance du scénario au rouge (D16 de docs/12).
      L.acceptanceVerte = vert;
      // Nettoyage refusé : retour au vert, sans escalade (SPEC.md §8.3).
      try {
        const r = await pas(w, d, L, i, "refactor", point, [], 1, unitTests, null);
        point = r.cp;
        // Le dernier état du code est celui du nettoyage : c'est lui qui dit si l'acceptance est verte.
        vert = r.acceptanceVerte;
      }
      catch (e) {
        if (!(e instanceof ScenarioEchoue))
          throw e;
        L.notes = [...L.notes, `Scénario ${sc.id} : nettoyage annulé (${e.message})`];
      }
    }
    if (vert)
      break;
    // Chaque cycle ajoute un test et un checkpoint : sans plafond, il tournerait sans fin (D24).
    if (++cycles >= MAX_CYCLES)
      throw new ScenarioEchoue([`Le test d'acceptance du scénario reste rouge après ${cycles} cycles test puis code.`]);
  }
  await porteScenario(w, d, L, i, cpScenario, unitTests);
  return unitTests;
}

/**
* Un pas : l'agent, puis la porte du pas. Refusé, le pas est rembobiné à son point de départ et
* relancé avec le motif, dans la limite du budget ; au-delà, le scénario échoue.
*/
export async function pas(w, d, L, i, etape, depuis, motifs, max, unitTests, nouveau, correction) {
  let retour = motifs;
  /** Dernier refus de ce pas, pour le disjoncteur (ADR 0073) ; un tour interrompu rompt la suite. */
  let precedent = null;
  for (let essais = 1;; essais++) {
    try {
      const sortie = await agentDuPas(w, d, L, i, etape, retour, unitTests, nouveau, correction);
      // Écarts au plan de test (ADR 0067) : vérifiés contre la matrice gardée depuis DISTILL ; une
      // déclaration fausse refuse le pas, une juste n'est gardée que si la porte du pas le valide.
      const ecarts = sortie.planDeviations ?? [];
      const motifsEcarts = ecarts.length ? verifierEcarts(ecarts, d.planDeTest ?? {}) : [];
      if (motifsEcarts.length)
        throw new PasRefuse(motifsEcarts.join(" ; "));
      const resultat = await porteDuPas(w, d, L, i, etape, depuis, sortie, nouveau, correction);
      const par = etape === "test" || etape === "fix-test" ? "skraft-test" : "skraft-dev";
      d.ecartsAuPlan = [...d.ecartsAuPlan, ...ecarts.map((x) => ({ ...x, par, scenario: L.scenarios[i].id }))];
      return resultat;
    }
    catch (e) {
      const motif = e instanceof PasRefuse || e instanceof TourInterrompu ? e.message : null;
      if (motif === null)
        throw e;
      const rouges = e instanceof PasRefuse ? e.rouges : [];
      const refus = e instanceof PasRefuse ? { porte: etape, motifs: [motif] } : null;
      const disjoncteur = memeRefus(precedent, refus ?? { porte: "", motifs: [] });
      precedent = refus;
      // Pas refusé par sa porte, ou tour interrompu : tracé, puis rembobiné et relancé.
      await w.rejet(`pas ${etape} (${L.scenarios[i].id})`, [motif]);
      await w.rembobiner(depuis);
      await creerDossiers(w, d.slug);
      if (essais >= max || disjoncteur)
        throw new ScenarioEchoue(disjoncteur ? disjoncte([motif]) : [motif], { rouges });
      retour = [motif];
    }
  }
}

const TEXTE = {
  test: ({ unit }) => `Pas en cours : écris UN nouveau test unitaire (dans ${unit}) pour le prochain petit comportement du scénario, vérifie avec run_tests qu'il échoue sur une assertion ou un symbole manquant, puis rends la main. N'écris aucun code de production.\n` +
    "Si ce comportement est déjà vérifié par le test d'acceptance du scénario et qu'un test unitaire ne ferait que le dupliquer, n'écris rien : rends la main en désignant ce test d'acceptance dans le champ `coveredBy` de report_phase. Le code vérifiera qu'il échoue pour une bonne raison, et le pas suivant le fera passer.",
  dev: ({ nouveau, sources }) => `Pas en cours : fais passer le test « ${nouveau ?? "?"} » au vert avec le code minimal (dans ${sources}), vérifie avec run_tests, puis nettoie le code sans changer son comportement. Ne modifie aucun test.`,
  green: ({ nouveau, sources }) => `Pas en cours : fais passer le test « ${nouveau ?? "?"} » au vert avec le code minimal (dans ${sources}), vérifié avec run_tests. Ne modifie aucun test.`,
  refactor: () => "Pas en cours : nettoie le code de production sans changer son comportement ; la suite doit rester verte. Ne modifie aucun test.",
  "fix-test": ({ unit }) => `Pas en cours : correction de revue, côté tests. Pour chaque défaut listé dans « Rejet précédent », ajoute le test demandé (dans ${unit}), ou conteste le défaut avec ta raison. ` +
    "Un test ajouté peut passer d'emblée s'il décrit un comportement que le code a déjà, ou échouer sur une assertion s'il révèle un défaut du code : le développeur le fera passer ensuite. " +
    "Ne modifie un test existant que pour renforcer celui qu'un défaut cite ; sinon, ajoute un test. N'écris aucun code de production. Vérifie avec run_tests.",
  fix: ({ sources }) => `Pas en cours : corrige les défauts de revue listés dans « Rejet précédent », dans le code de production uniquement (${sources}) ; la suite doit rester verte. Ne modifie aucun test. ` +
    "Si un défaut ne doit pas être corrigé selon toi, conteste-le avec ta raison ; s'il est juste mais que sa correction n'est pas de ton ressort (un test à écrire, par exemple), déclare-le `outOfScope`. " +
    "Ne supprime jamais un comportement exigé par le contrat de conception pour faire taire une revue : le code le vérifie, et refuse ce tour.",
};

/** L'agent du pas, avec son dossier de passation ; une question bloquante passe à l'humain. */
async function agentDuPas(w, d, L, i, etape, motifs, unitTests, nouveau, correction) {
  const sc = L.scenarios[i];
  const critere = d.story.criteria.find((c) => c.n === sc.ac);
  let gherkin = "";
  // BDD (ADR 0074) : le Gherkin vit dans les dossiers `features` du projet.
  // Seuls ceux de la story : un scénario d'une story précédente peut porter le même critère.
  for (const f of gherkinDeLaStory(d.gherkinAvant ?? [], await gherkinDuDisque(w, d.slug, L.disp.bdd)).features)
    gherkin ||= featureScenarios(f.content).get(sc.ac) ?? "";
  // Correction de revue : chaque agent reçoit les défauts qui le concernent, à chaque relance.
  const routes = etape === "fix-test" ? (correction?.retourTests ?? []) : etape === "fix" ? [...(correction?.retourDev ?? []), ...(correction?.cibles.length ? [`Tests ajoutés par la correction côté tests, rouges : fais-les passer. ${correction.cibles.join(", ")}`] : [])] : [];
  const rejet = etape === "fix" || etape === "fix-test" ? uniq([...routes, ...motifs]) : motifs;
  d.livres = L.scenarios.filter((x) => x.status === "done").map((x) => `${x.id}${x.role === "regression" ? " (non-régression)" : ""}`);
  d.constats = L.notes;
  const testeur = etape === "test" || etape === "fix-test";
  for (;;) {
    await w.etape("DELIVER");
    const consigne = [
      buildBrief(d, "DELIVER", rejet, leconsPour(d, "DELIVER", testeur ? "skraft-test" : "skraft-dev")),
      lignePile(L.disp.pile, L.disp),
      `Scénario en cours : ${sc.id}${critere ? ` (critère ${critere.n} : ${critere.text})` : ""}`,
      ...(gherkin ? ["Scénario :", gherkin.trim()] : []),
      `Test d'acceptance à faire passer : ${sc.acceptanceTestId}`,
      ...(unitTests.length ? ["Tests unitaires déjà écrits pour ce scénario :", ...unitTests.map((t) => `  - ${t}`)] : []),
      TEXTE[etape]({ nouveau, unit: L.disp.unitTests.join(", "), sources: L.disp.sources.join(", ") }),
    ].join("\n");
    // Avant chaque tour, y compris celui qui suit une réponse : la réponse est aussitôt citable.
    await ecrirePassation(w, d);
    const r = await w.agent(testeur ? "skraft-test" : "skraft-dev", consigne, { lectureSeule: testeur ? GELES_TESTEUR : GELES_DEV, preuve: { etape: sc.id } });
    if (r.sortie)
      return r.sortie;
    const choix = r.blocage.choix.length ? r.blocage.choix : ["Répondre"];
    await w.etape("BLOCKED");
    const rep = await w.humain("blocage", "Question de l'agent (DELIVER)", choix.map((c) => ({ id: c, label: c })), { detail: r.blocage.question });
    d.reponses = [...d.reponses, { question: r.blocage.question, answer: rep.commentaire ? `${rep.decision} (${rep.commentaire})` : rep.decision }];
  }
}
