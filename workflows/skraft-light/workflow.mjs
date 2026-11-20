// Repris de workflows/skraft/workflow.mjs le 2026-11-20 (ADR 0098) : RESEARCH et DESIGN y sont
// remplacées par ARCHI ; DISTILL et DELIVER sont celles de skraft, inchangées.
/**
 * skraft-light (ADR 0098) : la description qui suit est lue par la plateforme SANS exécuter
 * ce fichier ; elle doit rester une valeur littérale (ni variable, ni appel, ni calcul). C'est
 * aussi ce que l'utilisateur voit avant de donner son accord.
 */
export const meta = {
  name: "skraft-light",
  description: "Livre une user story par le chemin court : architecture conforme à l'existant ou nouvelle (ratifiée), scénarios d'acceptance, TDD, revues. Ni recherche séparée ni ADR.",
  commande: "skraft-light",
  entrees: {
    story: { type: "fichier", obligatoire: true, aide: "La user story (« # US-2 — Titre », critères numérotés)." },
    auto: { type: "booleen", defaut: false, aide: "Retenir la difficulté proposée sans la faire confirmer." },
    archi: { type: "texte", aide: "Skill d'architecture du projet, par son nom ou son langage (--archi java) ; sans elle, ou inconnue, la clean architecture par défaut." },
  },
  phases: {
    "DÉBUT": "Préparation et difficulté",
    INIT: "Lecture de la story",
    CLASSIFY: "Évaluation de la difficulté",
    CONFIRM_DIFFICULTY: "Difficulté à confirmer",
    ROUTE: "Questions ouvertes",
    REVIEW: "Revue",
    ARBITRATION: "Arbitrage à rendre",
    RATIFICATION: "Architecture à ratifier",
    BLOCKED: "Question d'un agent",
    ESCALATED: "Escalade",
    DONE: "Terminé",
    LECONS: "Leçons tirées des erreurs",
    ARCHI: "Architecture : conforme à l'existant ou nouvelle",
    DISTILL: "Scénarios d'acceptance",
    DELIVER: "Implémentation en TDD",
  },
  // Tout ce que le script et ses agents peuvent écrire. `revert` : les phases rembobinent à l'escalade.
  permissions: {
    ecriture: [".skraft/**", ".skraft/lecons/**", "@stack:acceptanceTests", "@stack:unitTests", "@stack:sources"],
    tests: true,
    git: ["branche", "commit", "revert"],
  },
  // Outils apportés aux agents (ADR 0082) : la porte que le code rejoue, consultable pendant le tour.
  outils: {
    verifier_architecture: { description: "Vérifie ton document d'architecture avec la porte du code : sections, mode, fichiers cités et plages de lignes, existant réutilisable, plan de conception. Sans argument : le code lit lui-même ton document." },
    verifier_scenarios: { description: "Vérifie tes scénarios, ton plan de test et tes tests d'acceptance avec les portes du code (gherkin, valeurs, plan de test). Sans argument : le code lit lui-même tes fichiers." },
  },
  agents: {
    "skraft-lecons": {
      prompt: "agents/skraft-lecons.agent.md",
      consignes: "Le dossier de passation, construit par l'orchestrateur, donne les groupes d'erreurs à classer et les catalogues avec leurs sections. Rends une leçon par groupe avec l'outil submit_lecons ; le code vérifie chaque référence de catalogue, chaque source et l'exemple.",
      classe: "light",
      sortie: "submit_lecons",
    },
    "skraft-classifier": {
      prompt: "agents/skraft-classifier.agent.md",
      consignes: "Le dossier de passation, construit par l'orchestrateur, donne la story, le dossier de travail (`.skraft/<slug>/`) et le résultat des phases précédentes.\nRends le niveau et sa justification avec l'outil submit_difficulty.",
      classe: "light",
      sortie: "submit_difficulty",
    },
    "skraft-architecte": {
      prompt: "agents/skraft-architecte.agent.md",
      consignes: "Le dossier de passation, construit par l'orchestrateur, donne la story, le dossier de travail (`.skraft/<slug>/`), le document à écrire et les fichiers utiles.\nAvant de rendre ton travail, appelle `verifier_architecture` : il rend ce que la porte d'ARCHI dirait de ton document, avec les mêmes règles que le code appliquera après ton tour. Corrige chaque motif, puis vérifie de nouveau.",
      classe: "strong",
      reasoningEffort: "high",
      contextTier: "long_context",
      sortie: "report_phase",
      ecriture: [".skraft/**"],
      outils: ["list_files", "verifier_architecture", "report_blocker"],
      skills: { obligatoires: ["architecture-patterns"], aLaDemande: ["clean-architecture-dotnet", "clean-architecture-java", "clean-architecture-python", "clean-architecture-react"] },
    },
    "skraft-acceptance": {
      prompt: "agents/skraft-acceptance.agent.md",
      consignes: "Le dossier de passation, construit par l'orchestrateur, donne la story, le dossier de travail (`.skraft/<slug>/`) et le résultat des phases précédentes.\nLes skills décrivent aussi des étapes que l'orchestrateur exécute lui-même (commits, portes, mutation) : ne les fais pas.\nPour la forme du code, le linter du projet fait foi : en cas d'écart avec les seuils d'une skill (Object Calisthenics), suis le linter.\nL'emplacement des tests d'acceptance du projet est indiqué dans le dossier de passation. Le code vérifie ensuite chaque valeur\nrecopiée et la raison de chaque rouge : un écart est rejeté avec son motif.\nAvant de rendre ton travail, appelle `verifier_scenarios` : il rend ce que les portes gherkin, valeurs et plan de test diraient de tes fichiers, avec les mêmes règles que le code appliquera après ton tour. Corrige chaque motif, puis vérifie de nouveau.",
      classe: "standard",
      sortie: "report_phase",
      ecriture: [".skraft/**", "@stack:acceptanceTests", "@stack:sources"],
      outils: ["list_files", "run_tests", "verifier_scenarios", "report_blocker"],
      skills: { obligatoires: ["bdd-methodology", "test-design-mandates"], aLaDemande: ["outside-in-tdd", "craft-discipline", "clean-architecture-testing", "bdd-step-definitions"] },
    },
    "skraft-test": {
      prompt: "agents/skraft-test.agent.md",
      consignes: "Le dossier de passation, construit par l'orchestrateur, donne la story, le dossier de travail (`.skraft/<slug>/`) et le résultat des phases précédentes.\nLes skills décrivent aussi des étapes que l'orchestrateur exécute lui-même (commits, portes, mutation) : ne les fais pas.\nPour la forme du code, le linter du projet fait foi : en cas d'écart avec les seuils d'une skill (Object Calisthenics), suis le linter.\nLe scénario en cours, son test d'acceptance et les tests déjà écrits sont dans le dossier de passation. Les tests d'acceptance\nsont gelés : toute écriture y est refusée.\nLe plan de test est `.skraft/<slug>/distill/test-plan.md`. Un écart à sa matrice se déclare dans le champ planDeviations de report_phase (ADR 0067) : le code le vérifie contre la matrice et refuse le pas s'il ne reprend pas la ligne du critère.",
      classe: "standard",
      sortie: "report_phase",
      ecriture: ["@stack:unitTests"],
      outils: ["list_files", "run_tests", "run_lint", "report_blocker"],
      skills: { obligatoires: ["test-design-mandates", "outside-in-tdd#RED"], aLaDemande: ["test-refactoring-catalog", "clean-architecture-testing", "clean-architecture-dotnet", "clean-architecture-java", "clean-architecture-python", "clean-architecture-react"] },
    },
    "skraft-dev": {
      prompt: "agents/skraft-dev.agent.md",
      consignes: "Le dossier de passation, construit par l'orchestrateur, donne la story, le dossier de travail (`.skraft/<slug>/`) et le résultat des phases précédentes.\nLes skills décrivent aussi des étapes que l'orchestrateur exécute lui-même (commits, portes, mutation) : ne les fais pas.\nPour la forme du code, le linter du projet fait foi : en cas d'écart avec les seuils d'une skill (Object Calisthenics), suis le linter.\nLe test à faire passer est indiqué dans le dossier de passation. Tous les tests sont gelés pendant ton tour : une modification,\nmême hors des outils d'écriture, est détectée par empreinte et annule le tour.\nLe plan de test est `.skraft/<slug>/distill/test-plan.md`. Un écart à sa matrice se déclare dans le champ planDeviations de report_phase (ADR 0067) : le code le vérifie contre la matrice et refuse le pas s'il ne reprend pas la ligne du critère.",
      classe: "standard",
      sortie: "report_phase",
      ecriture: ["@stack:sources"],
      outils: ["list_files", "run_tests", "run_lint", "report_blocker"],
      skills: { obligatoires: ["craft-discipline", "outside-in-tdd#SYNTHESIZE-GREEN"], aLaDemande: ["clean-architecture-testing", "test-refactoring-catalog", "clean-architecture-dotnet", "clean-architecture-java", "clean-architecture-python", "clean-architecture-react"] },
    },
    "skraft-mutation-arbiter": {
      prompt: "agents/skraft-mutation-arbiter.agent.md",
      consignes: "Rends ta décision avec l'outil submit_lens_verdict : lens « mutation-arbiter », verdict APPROVED, aucun défaut, et pour\nchaque défaut de mutation listé un arbitrage (rulings) : accepted si le mutant est équivalent, maintained sinon, avec ta raison.",
      classe: "standard",
      sortie: "submit_lens_verdict",
    },
    "skraft-finding-refuter": {
      prompt: "agents/skraft-finding-refuter.agent.md",
      consignes: "Rends ta décision avec l'outil submit_lens_verdict : lens « finding-refuter », verdict APPROVED, aucun défaut, et pour\nchaque défaut listé un arbitrage (rulings) : accepted s'il est réfuté, avec le passage `chemin:ligne` qui le montre dans ta raison ;\nmaintained sinon, avec ta raison.",
      classe: "strong",
      sortie: "submit_lens_verdict",
    },
    "skraft-lens-cold-reader": {
      prompt: "agents/skraft-lens-cold-reader.agent.md",
      consignes: "Tu fais partie d'une revue à plusieurs lentilles ; chacune travaille isolée et la synthèse est calculée par le code.\nRends ton verdict avec l'outil submit_lens_verdict.\nUn comportement vérifié par un test d'acceptance n'appelle pas de test unitaire qui le duplique : avant de signaler un test\nmanquant, cherche-le dans les tests d'acceptance du projet. S'il y est, ce n'est pas un défaut (choix du projet, ADR 0045).\nDonne à chaque défaut sa cible (target) : test, code ou deliverable. Un défaut, un seul sujet : scinde celui qui touche à la fois\nun test et le code. Pour chaque défaut, dis pourquoi il a cette gravité (severityReason, une phrase) ;\ns'il se répète ailleurs, donne les autres endroits (occurrences, chemin:ligne) au lieu d'un défaut par endroit. Un défaut sur une ligne que la phase n'a pas modifiée est noté pour l'humain,\nsans renvoyer le travail. Si le dossier liste tes défauts précédents contestés par l'agent, rends pour chacun un arbitrage (rulings) :\naccepted si sa raison te convainc, maintained sinon, avec ta raison ; ne les relance pas dans tes défauts.\nSi juger demande une décision métier que ni la story ni les réponses de l'utilisateur ne tranchent, pose la question avec\nreport_blocker au lieu de deviner. Une question déjà tranchée te sera renvoyée avec sa réponse.",
      classe: "standard",
      sortie: "submit_lens_verdict",
      outils: ["report_blocker"],
      skills: { aLaDemande: ["adversarial-review-lenses", "acceptance-review-criteria", "architecture-review-criteria"] },
    },
    "skraft-lens-test-integrity": {
      prompt: "agents/skraft-lens-test-integrity.agent.md",
      consignes: "Tu fais partie d'une revue à plusieurs lentilles ; chacune travaille isolée et la synthèse est calculée par le code.\nRends ton verdict avec l'outil submit_lens_verdict.\nUn comportement vérifié par un test d'acceptance n'appelle pas de test unitaire qui le duplique : avant de signaler un test\nmanquant, cherche-le dans les tests d'acceptance du projet. S'il y est, ce n'est pas un défaut (choix du projet, ADR 0045).\nDonne à chaque défaut sa cible (target) : test, code ou deliverable. Un défaut, un seul sujet : scinde celui qui touche à la fois\nun test et le code. Pour chaque défaut, dis pourquoi il a cette gravité (severityReason, une phrase) ;\ns'il se répète ailleurs, donne les autres endroits (occurrences, chemin:ligne) au lieu d'un défaut par endroit. Un défaut sur une ligne que la phase n'a pas modifiée est noté pour l'humain,\nsans renvoyer le travail. Si le dossier liste tes défauts précédents contestés par l'agent, rends pour chacun un arbitrage (rulings) :\naccepted si sa raison te convainc, maintained sinon, avec ta raison ; ne les relance pas dans tes défauts.\nSi juger demande une décision métier que ni la story ni les réponses de l'utilisateur ne tranchent, pose la question avec\nreport_blocker au lieu de deviner. Une question déjà tranchée te sera renvoyée avec sa réponse.",
      classe: "standard",
      sortie: "submit_lens_verdict",
      outils: ["report_blocker"],
      skills: { aLaDemande: ["adversarial-review-lenses", "acceptance-review-criteria", "architecture-review-criteria"] },
    },
    "skraft-lens-architecture": {
      prompt: "agents/skraft-lens-architecture.agent.md",
      consignes: "Tu fais partie d'une revue à plusieurs lentilles ; chacune travaille isolée et la synthèse est calculée par le code.\nRends ton verdict avec l'outil submit_lens_verdict.\nUn comportement vérifié par un test d'acceptance n'appelle pas de test unitaire qui le duplique : avant de signaler un test\nmanquant, cherche-le dans les tests d'acceptance du projet. S'il y est, ce n'est pas un défaut (choix du projet, ADR 0045).\nDonne à chaque défaut sa cible (target) : test, code ou deliverable. Un défaut, un seul sujet : scinde celui qui touche à la fois\nun test et le code. Pour chaque défaut, dis pourquoi il a cette gravité (severityReason, une phrase) ;\ns'il se répète ailleurs, donne les autres endroits (occurrences, chemin:ligne) au lieu d'un défaut par endroit. Un défaut sur une ligne que la phase n'a pas modifiée est noté pour l'humain,\nsans renvoyer le travail. Si le dossier liste tes défauts précédents contestés par l'agent, rends pour chacun un arbitrage (rulings) :\naccepted si sa raison te convainc, maintained sinon, avec ta raison ; ne les relance pas dans tes défauts.\nSi juger demande une décision métier que ni la story ni les réponses de l'utilisateur ne tranchent, pose la question avec\nreport_blocker au lieu de deviner. Une question déjà tranchée te sera renvoyée avec sa réponse.",
      classe: "standard",
      sortie: "submit_lens_verdict",
      outils: ["report_blocker"],
      skills: { aLaDemande: ["adversarial-review-lenses", "acceptance-review-criteria", "architecture-review-criteria"] },
    },
    "skraft-lens-quality-gates": {
      prompt: "agents/skraft-lens-quality-gates.agent.md",
      consignes: "Tu fais partie d'une revue à plusieurs lentilles ; chacune travaille isolée et la synthèse est calculée par le code.\nRends ton verdict avec l'outil submit_lens_verdict.\nUn comportement vérifié par un test d'acceptance n'appelle pas de test unitaire qui le duplique : avant de signaler un test\nmanquant, cherche-le dans les tests d'acceptance du projet. S'il y est, ce n'est pas un défaut (choix du projet, ADR 0045).\nDonne à chaque défaut sa cible (target) : test, code ou deliverable. Un défaut, un seul sujet : scinde celui qui touche à la fois\nun test et le code. Pour chaque défaut, dis pourquoi il a cette gravité (severityReason, une phrase) ;\ns'il se répète ailleurs, donne les autres endroits (occurrences, chemin:ligne) au lieu d'un défaut par endroit. Un défaut sur une ligne que la phase n'a pas modifiée est noté pour l'humain,\nsans renvoyer le travail. Si le dossier liste tes défauts précédents contestés par l'agent, rends pour chacun un arbitrage (rulings) :\naccepted si sa raison te convainc, maintained sinon, avec ta raison ; ne les relance pas dans tes défauts.\nSi juger demande une décision métier que ni la story ni les réponses de l'utilisateur ne tranchent, pose la question avec\nreport_blocker au lieu de deviner. Une question déjà tranchée te sera renvoyée avec sa réponse.",
      classe: "light",
      sortie: "submit_lens_verdict",
      outils: ["report_blocker"],
      skills: { aLaDemande: ["adversarial-review-lenses", "acceptance-review-criteria", "architecture-review-criteria"] },
    },
  },
};
/**
* Commande `/skraft-light` : la préparation, la difficulté, les questions ouvertes, ARCHI (l'architecte
* lit le code, se conforme à l'architecture existante ou en propose une nouvelle, que l'humain ratifie),
* puis DISTILL et DELIVER de skraft. Indépendant de `workflows/skraft` : il n'en importe rien (ADR 0098).
*/
import { essayer, PanneEnvironnement, Escalade, TourInterrompu, problemesTestsExistants, correspond, bddNonDeclare, estUnManifeste } from "@skraft-mcp/workflow";
import { buildBrief, ecrirePassation } from "./brief.mjs";
import { computeIndicators, DEFAULT_THRESHOLDS, gradeDifficulty, isDifficulty, levelEffects, shift } from "./difficulty.mjs";
import { preselectFiles } from "./preselect.mjs";
import { cheminArchitecture, citesDansLArchitecture, extraireArchitecture, motifsDeLArchitecture, TOURS_DE_QUESTIONS, trierLesQuestions, verifierArchitecture } from "./architecte.mjs";
import { skillDArchitecture } from "./architecture.mjs";
import { parseStory, slugOf } from "./story.mjs";
import { distiller, motifsDesScenarios, texteDeVerification } from "./distillation.mjs";
/**
* Outils apportés aux agents (ADR 0082) : fonctions pures, sur les fichiers que l'hôte a lus. La
* porte appelle le même calcul après le tour : l'agent est jugé comme il s'est vérifié.
*/
export const outils = {
  verifier_architecture: verifierArchitecture,
  verifier_scenarios: ({ fichiers, donnees }) => texteDeVerification(motifsDesScenarios({ fichiers, ...donnees })),
};
import { livrer } from "./livraison.mjs";
import { barreDeQualite } from "./livraison-socle.mjs";
import { checkCoverage } from "./deliver.mjs";
import { ARCHI_FIGEE, commitMessage, creerDossiers, GELÉS, LEVEL_LABELS, repositoryShape } from "./support.mjs";
import { ecrireLeRegistre, ligneDuRegistre, nouveauRegistre, ouvrirLeRegistre, suivreLesRefus } from "./registre.mjs";
import { chargerLaMemoire, leconsPour, ligneDesLecons, tirerLesLecons } from "./lecons.mjs";
import { noterLEtat, proposerLaReprise, releveDeDepart, restaurer } from "./reprise.mjs";
const RELANCER_OU_ABANDONNER = [
  { id: "relancer", label: "Relancer" },
  { id: "abandonner", label: "Abandonner" },
];
export default async function skraft(w0, entree) {
  // Registre des erreurs commises (LEC-1) : les refus de porte comptés sont relevés au moment où le
  // code les trace ; le reste du script ne voit aucune différence.
  const registre = nouveauRegistre();
  const w = suivreLesRefus(w0, registre);
  const { story, slug, indicateurs, base } = await preparer(w, entree.story);
  // Une session précédente sur la branche de la story : continuer ou l'écraser, au choix de l'utilisateur
  // (ADR 0089). Le registre est ouvert ensuite : le retour au commit de phase a pu changer le disque.
  const reprise = await proposerLaReprise(w, story, slug, base);
  if (reprise)
    await creerDossiers(w, slug);
  await ouvrirLeRegistre(w, registre, slug);
  // Les leçons validées du projet, données aux agents de leur rôle au début de leur phase (LEC-3).
  const memoire = await chargerLaMemoire(w);
  // Session continuée : les tests d'acceptance de la story sont rouges en attendant DELIVER (ADR 0089).
  const run = releveDeDepart(await w.lancerTests({ etiquette: "INIT_BASELINE" }), reprise);
  // BDD non déclaré (08/11) : un composant muet qui en montre les signes partirait dans le mauvais mode.
  const racinesMuettes = (await w.disposition()).bddNonDecide ?? [];
  const tousLesFichiers = racinesMuettes.length ? await w.listerFichiers() : [];
  const manifestes = [];
  for (const path of tousLesFichiers.filter(estUnManifeste))
    manifestes.push({ path, content: await w.lireFichier(path).catch((e) => (e instanceof PanneEnvironnement ? Promise.reject(e) : "")) });
  const problems = [...problemesTestsExistants(run), ...bddNonDeclare(racinesMuettes, tousLesFichiers, manifestes)];
  if (problems.length) {
    await w.informer(`Lancement skraft bloqué avant tout appel d'agent :\n${problems.map((p) => `- ${p}`).join("\n")}`);
    throw new PanneEnvironnement(problems.join(" ; "));
  }
  const disp = await w.disposition();
  const { barre, notes } = await barreDeQualite(w, disp);
  const sources = (await w.listerFichiers()).filter((p) => correspond(disp.sources, p));
  const warnings = run.coverage ? checkCoverage(run.coverage, sources, barre) : ["Couverture initiale non mesurée : la commande de test du projet n'en produit pas."];
  if (warnings.length || notes.length)
    await w.informer(`Précontrôle skraft — avertissement non bloquant sur le code existant :\n${[...warnings, ...notes].map((p) => `- ${p}`).join("\n")}\nLes seuils de couverture de livraison portent uniquement sur les lignes ajoutées ou modifiées.`);
  const qualityCheckpoint = await w.checkpoint(`skraft ${slug} : qualité initiale`);
  // Skill d'architecture transmise à l'appel ; absente ou inconnue : la clean architecture par défaut.
  const architecture = skillDArchitecture(entree.archi);
  if (architecture.avertissement)
    await w.informer(architecture.avertissement);
  const niveau = reprise?.niveau ?? (await evaluerDifficulte(w, story, indicateurs, !entree.auto, registre));
  const effets = levelEffects(niveau);
  // Ce que le dossier de passation raconte, tenu à jour au fil du script.
  const vue = {
    story,
    slug,
    base,
    niveau,
    registre,
    memoire,
    injectees: [],
    phasesFaites: [],
    // ARCHI n'est jamais sautée : c'est elle qui donne à DISTILL et DELIVER l'architecture à suivre.
    phasesSautees: [],
    // Le document d'ARCHI, tel que DISTILL et DELIVER le reçoivent (ADR 0098).
    architectureRetenue: null,
    architecture: architecture.skill,
    // Les nombres des critères ne sont plus soumis à l'utilisateur (ADR 0090, remplace l'ADR 0080).
    questions: story.openQuestions.map((text, i) => ({ id: `q${i + 1}`, text })),
    reponses: [],
    adrs: [],
    regressions: [],
    acceptanceHash: null,
    // Tests au relevé d'INIT : ceux des stories précédentes (ADR 0074 §4). ARCHI n'écrit
    // aucun test : c'est encore la suite au début de DISTILL.
    testsAvant: run.results.map((r) => ({ id: r.id, status: r.status })),
    // Tests d'acceptance de la story, relevés à la porte de DISTILL : DELIVER n'en fait pas d'autres scénarios.
    testsDeLaStory: null,
    qualityCheckpoint,
    // Mutants reconnus équivalents par arbitrage, exemptés de la porte de mutation (ADR 0065).
    derogations: [],
    // Lignes exemptées de la couverture du diff par l'humain, après contestation du testeur.
    derogationsCouverture: [],
    // Tests existants déclarés obsolètes à l'escalade d'un scénario (ADR 0066).
    testsObsoletes: [],
    // Phases approuvées dont le commit a échoué, continuées sans commit (D19 de docs/12).
    nonCommitees: [],
    // Matrice du plan de test (DISTILL) et écarts déclarés en DELIVER, vérifiés contre elle (ADR 0067).
    planDeTest: null,
    ecartsAuPlan: [],
  };  // Session continuée (ADR 0089) : les phases approuvées et ce qu'elles ont laissé, relus du disque.
  if (reprise)
    restaurer(vue, reprise);
  const dejaFaite = (phase) => vue.reprise?.phases.includes(phase) ?? false;

  // Les questions de la story sont tranchées avant ARCHI : l'architecte reçoit leurs réponses.
  await trancher(w, vue, story.id);
  if (!dejaFaite("ARCHI")) {
    // `w.phase` rend `undefined` si l'humain saute la phase : la fonction rend donc une valeur.
    const faite = await w.phase("ARCHI", async (_cp, relance) => {
      await architecturer(w, vue, effets.maxAttempts, relance);
      // L'état de la phase, commité avec elle : une relance de la story le retrouve (ADR 0089).
      await noterLEtat(w, vue, "ARCHI");
      return true;
    }, {
      commit: commitMessage("ARCHI", slug),
      // Commit impossible, continué par l'humain : le bilan le dit (D19 de docs/12).
      commitManque: () => void vue.nonCommitees.push("ARCHI"),
      // Git ne suit pas les dossiers vides : le rembobinage les emporte (ADR 0037).
      apresRembobinage: () => creerDossiers(w, slug),
    });
    if (faite === undefined)
      vue.phasesSautees = [...vue.phasesSautees, "ARCHI"];
    else
      vue.phasesFaites = [{ phase: "ARCHI", fichiers: [cheminArchitecture(slug)] }];
  }
  // Une phase approuvée dans la session continuée n'est pas refaite (ADR 0089).
  for (const [phase, faire] of [["DISTILL", distiller], ["DELIVER", livrer]]) {
    if (dejaFaite(phase) || vue.phasesSautees.includes(phase))
      continue;
    if (await faire(w, vue, effets.lenses, effets.maxAttempts))
      vue.phasesFaites = [...vue.phasesFaites, { phase, fichiers: [] }];
    else
      vue.phasesSautees = [...vue.phasesSautees, phase];
  }
  // Le registre de la story est écrit, puis commité seul : sa trace reste dans l'historique (LEC-1).
  await ecrireLeRegistre(w, registre);
  if (registre.erreurs.length)
    await w.commiter(`docs(skraft): registre des erreurs de ${slug}`, [registre.chemin]);
  // Leçons tirées des erreurs répétées (LEC-2), à jour pour le run suivant.
  vue.lecons = await tirerLesLecons(w, slug, vue.injectees, registre.erreurs);
  await w.etape("DONE");
  await w.informer(bilan(vue, !entree.auto));
  return {
    slug,
    niveau,
    acceptanceHash: vue.acceptanceHash,
    regressions: vue.regressions,
    phases: vue.phasesFaites.map((p) => p.phase),
    adrs: vue.adrs,
    architecture: vue.architectureRetenue?.mode ?? null,
    livraison: vue.livraison ?? null,
    // Les leçons données à chaque dossier de passation (LEC-3, critère 7).
    leconsInjectees: vue.injectees,
  };
}
/**
* Défauts relevés hors du changement de la story (06/11) : les bloquants d'abord, à corriger après
* la fin du cycle, puis les autres remarques.
*/
function notesDuBilan(notes, testsObsoletes = []) {
  const ligne = (n) => `- ${n.file}${n.line ? `:${n.line}` : ""} (${n.lens}, ${n.severity}) : ${n.description}`;
  const bloquants = notes.filter((n) => n.severity === "blocker");
  const autres = notes.filter((n) => n.severity !== "blocker");
  return [
    ...rappelDesTestsObsoletes(testsObsoletes),
    ...(bloquants.length ? ["**À corriger après le cycle** — défauts bloquants hors du changement de la story :", ...bloquants.map(ligne)] : []),
    ...(autres.length ? ["Remarques hors du changement de la story :", ...autres.map(ligne)] : []),
  ];
}
/** Tests déclarés obsolètes (ADR 0066) : à mettre à jour après le cycle, comme les défauts hors du changement. */
function rappelDesTestsObsoletes(tests) {
  if (!tests.length)
    return [];
  return ["**À corriger après le cycle** — tests existants déclarés obsolètes, sortis des portes :", ...tests.map((x) => `- mettre à jour ${x.test} : déclaré obsolète au scénario ${x.scenario}${x.raison ? ` (${x.raison})` : ""}.`)];
}
function bilan(d, confirmee) {
  return [
    `Pipeline skraft-light terminé pour **${d.story.id}** (branche skraft/${d.slug}).`,
    `Difficulté : ${d.niveau} (${confirmee ? "confirmée" : "automatique"}).`,
    `Phases exécutées : ${d.phasesFaites.map((p) => p.phase).join(", ") || "aucune"} ; sautées : ${d.phasesSautees.join(", ") || "aucune"}.`,
    `Architecture : ${d.architectureRetenue ? `${d.architectureRetenue.mode}, dans ${cheminArchitecture(d.slug)}` : "aucune (ARCHI sautée)"}.`,
    ...[ligneDuRegistre(d.registre)].filter((l) => l !== null),
    ...[ligneDesLecons(d.lecons)].filter((l) => l !== null),
    ...(d.verifications?.length ? [`Vérifications par les agents (ADR 0082) : ${d.verifications.map((v) => `${v.phase} ${v.agent} ${v.appels} appel(s)`).join(" ; ")}.`] : []),
    ...(d.derogationsCouverture?.length
      ? [`Lignes exemptées de la couverture du diff : ${d.derogationsCouverture.length} (détail dans .skraft/${d.slug}/deliver/derogations.md).`]
      : []),
    ...(d.nonCommitees?.length ? [`Phases non commitées : ${d.nonCommitees.join(", ")} (commit impossible ; leurs fichiers sont inclus dans le commit suivant, ou restent à commiter).`] : []),
    ...(d.derogations?.length
      ? [`Dérogations de mutation : ${d.derogations.length} (détail dans .skraft/${d.slug}/deliver/derogations.md).`, ...d.derogations.map((x) => `- ${x.file}:${x.line} (${x.operator}), par ${x.par} : ${x.raison}`)]
      : []),
    ...(d.ecartsAuPlan?.length
      ? [`Écarts au plan de test : ${d.ecartsAuPlan.length} (détail dans .skraft/${d.slug}/deliver/ecarts-au-plan.md).`, ...d.ecartsAuPlan.map((x) => `- ${x.criterion} (${x.par}) : ${x.planned} → ${x.actual} — ${x.rule}`)]
      : []),
    ...notesDuBilan(d.notesHorsChangement ?? [], d.testsObsoletes ?? []),
  ].join("\n");
}
/**
* Questions ouvertes sans réponse, posées toutes à la fois. Étapes annoncées avec le vocabulaire de
* l'extension skraft : les deux se comparent (docs/10 §3). Comme l'extension, ROUTE n'existe que s'il
* reste des questions (D11 de docs/12) ; une question tranchée n'est jamais reposée.
*/
async function trancher(w, vue, storyId) {
  const ouvertes = vue.questions.filter((q) => q.answer === undefined);
  if (!ouvertes.length)
    return;
  await w.etape("ROUTE");
  const reponses = await poserLesQuestions(w, ouvertes, storyId, vue.registre);
  const reponseDe = new Map(ouvertes.map((q, i) => [q.id, reponses[i]]));
  vue.questions = vue.questions.map((q) => {
    const d = reponseDe.get(q.id);
    if (!d)
      return q;
    return { ...q, answer: d.decision === "defer" ? "(question reportée par l'utilisateur)" : d.commentaire?.trim() || "(réponse vide)" };
  });
}
/**
* Questions ouvertes, posées toutes à la fois, hors de toute phase. Une panne à la création d'une
* demande (D17 de docs/12) escalade : « Relancer » repose les seules questions en échec ; il n'y a
* pas de phase à sauter.
*/
async function poserLesQuestions(w, questions, storyId, registre) {
  const reponses = new Array(questions.length);
  let restantes = questions.map((_, i) => i);
  for (;;) {
    const issues = await Promise.allSettled(restantes.map((i) => poser(w, questions[i], storyId)));
    const pannes = [];
    issues.forEach((r, j) => {
      if (r.status === "fulfilled")
        reponses[restantes[j]] = r.value;
      else if (r.reason instanceof PanneEnvironnement)
        pannes.push({ i: restantes[j], motif: r.reason.message });
      else
        throw r.reason;
    });
    if (!pannes.length)
      return reponses;
    await w.etape("ESCALATED");
    const d = await w.humain("escalade", "Pipeline skraft bloqué (ROUTE)", [
      { id: "relancer", label: "Relancer : reposer les questions" },
      { id: "abandonner", label: "Abandonner" },
    ], { detail: `Panne pendant les questions ouvertes : ${pannes.map((p) => p.motif).join(" ; ")}` });
    if (d.decision === "abandonner") {
      await ecrireLeRegistre(w, registre);
      w.echec(`Abandon pendant les questions ouvertes : ${pannes[0].motif}`);
    }
    await w.etape("ROUTE");
    restantes = pannes.map((p) => p.i);
  }
}
/** Une question ouverte, à réponse libre. */
function poser(w, q, storyId) {
  return w.humain("question-ouverte", `Question ouverte (${storyId})`, [{ id: "answer", label: "Répondre" }, { id: "defer", label: "Reporter" }], { detail: q.text, texteLibre: true });
}
/** Lecture de la story, branche et arborescence (effet `init` du réducteur). */
async function preparer(w, chemin) {
  await w.etape("INIT");
  for (;;) {
    let motifs;
    try {
      const lue = parseStory(await w.lireFichier(chemin));
      if (lue.ok) {
        const slug = slugOf(lue.story.id, lue.story.title);
        // Le point de départ de la session : une nouvelle session y recrée la branche (ADR 0089).
        const base = await w.tete();
        await w.brancher(`skraft/${slug}`);
        await creerDossiers(w, slug);
        const indicateurs = computeIndicators(lue.story, repositoryShape(await w.listerFichiers()));
        return { story: lue.story, slug, indicateurs, base };
      }
      motifs = lue.errors;
    }
    catch (e) {
      motifs = [e instanceof PanneEnvironnement ? `Panne d'environnement : ${e.message}` : `Story introuvable : ${chemin}`];
    }
    await relancerOuAbandonner(w, `Story invalide : ${motifs.join(" ; ")}`);
  }
}
/** Classifieur, budget compté par le code (D24), puis confirmation humaine si demandée. */
async function evaluerDifficulte(w, story, indicateurs, confirmer, registre) {
  await w.etape("CLASSIFY");
  const grille = gradeDifficulty(indicateurs, DEFAULT_THRESHOLDS);
  const consigne = [`Story : ${story.id} — ${story.title}`, `Indicateurs : ${JSON.stringify(indicateurs)}`, `Niveau proposé par la grille : ${grille}`].join("\n");
  let propose;
  for (;;) {
    try {
      await essayer(w, { max: 3 }, async () => {
        const r = await w.agent("skraft-classifier", consigne);
        if (!r.sortie)
          return { motifs: [`Blocage inattendu : ${r.blocage.question}`], porte: "classifieur" };
        if (!isDifficulty(r.sortie.level))
          return { motifs: [`Niveau de difficulté inconnu : ${r.sortie.level}`], porte: "classifieur" };
        propose = { level: r.sortie.level, justification: r.sortie.justification };
        return [];
      });
      break;
    }
    catch (e) {
      if (!(e instanceof Escalade || e instanceof PanneEnvironnement))
        throw e;
      await relancerOuAbandonner(w, e.message, registre);
    }
  }
  if (!confirmer)
    return propose.level;
  const niveaux = [...new Set([propose.level, shift(propose.level, 1), shift(propose.level, -1)])];
  await w.etape("CONFIRM_DIFFICULTY");
  const d = await w.humain("confirmer-difficulte", `Difficulté de ${story.id} : ${LEVEL_LABELS[propose.level]} ?`, niveaux.map((l) => ({ id: l, label: l === propose.level ? `Confirmer : ${LEVEL_LABELS[l]}` : LEVEL_LABELS[l] })), { detail: propose.justification });
  return isDifficulty(d.decision) ? d.decision : propose.level;
}
/**
* Un essai d'ARCHI : l'architecte, ses questions bloquantes, la porte du code, ses questions ouvertes,
* puis, en mode `nouvelle`, la ratification de l'humain ; un refus est le motif de l'essai suivant
* (ADR 0098). L'architecture n'est figée qu'une fois toutes ses questions tranchées : tant qu'il en
* lève, le code les pose toutes, puis le relance sur son brouillon avec les réponses ; au-delà de
* `TOURS_DE_QUESTIONS` tours, l'humain tranche avant tout nouveau tour.
*/
function architecturer(w, vue, max, relance) {
  const document = cheminArchitecture(vue.slug);
  let tours = 0;
  // Relancée après une escalade : le premier essai reçoit son motif (D15 de docs/12).
  return essayer(w, { max, motifs: relance }, async (motifs) => {
    let porte;
    for (;;) {
      await rediger(w, vue, document, motifs, tours > 0);
      porte = await porteArchitecture(w, vue, document);
      if (porte.motifs.length)
        return { motifs: porte.motifs, porte: "architecture" };
      const { nouvelles, motifs: nonIntegrees } = trierLesQuestions(porte.openQuestions, vue.questions);
      if (nonIntegrees.length)
        return { motifs: nonIntegrees, porte: "architecture" };
      if (!nouvelles.length)
        break;
      if (tours >= TOURS_DE_QUESTIONS) {
        await relancerOuAbandonner(w, `Après ${TOURS_DE_QUESTIONS} tours de questions, l'architecte en pose encore : ${nouvelles.join(" ; ")}`, vue.registre);
        tours = 0;
      }
      tours += 1;
      vue.questions = [...vue.questions, ...nouvelles.map((text, i) => ({ id: `q${vue.questions.length + i + 1}`, text }))];
      await trancher(w, vue, vue.story.id);
    }
    const retenue = extraireArchitecture(porte.md);
    // Une architecture nouvelle engage le projet : l'humain la ratifie, comme un ADR dans skraft.
    if (retenue.mode === "nouvelle") {
      await w.etape("RATIFICATION");
      const d = await w.humain("ratifier-architecture", `Architecture de ${vue.story.id} : la ratifier ?`, [
        { id: "accepter", label: "Accepter" },
        { id: "refuser", label: "Refuser, avec ce qu'il faut changer" },
      ], { detail: [`Nouvelle architecture proposée (${document}) :`, retenue.architecture, "", "Plan de conception :", retenue.plan].join("\n"), texteLibre: true });
      if (d.decision !== "accepter")
        return { motifs: [`Architecture refusée par l'utilisateur : ${d.commentaire?.trim() || "(sans précision)"}`], porte: "ratification" };
    }
    // Transmises à DISTILL et DELIVER par le dossier de passation.
    vue.recherche = { conventions: retenue.conventions, existant: retenue.existant };
    vue.architectureRetenue = retenue;
    return [];
  });
}
/**
* Un tour de l'architecte, jusqu'à sa sortie : chaque question bloquante va à l'humain, et l'agent repart
* avec la réponse. `brouillon` : il reprend son document avec les réponses à ses questions ouvertes.
*/
async function rediger(w, vue, document, motifs, brouillon) {
  for (;;) {
    await w.etape("ARCHI");
    const utiles = preselectFiles(vue.story, await w.listerFichiers());
    await ecrirePassation(w, vue);
    const consigne = [
      buildBrief(vue, "ARCHI", motifs, leconsPour(vue, "ARCHI", "skraft-architecte")),
      `Document à écrire : ${document}`,
      ...(brouillon ? [`Brouillon précédent : ${document}. Relis-le, intègre les réponses de l'utilisateur à l'architecture et retire de « Questions ouvertes » celles qui sont tranchées.`] : []),
      ...(utiles.length ? ["Fichiers utiles (présélection) :", ...utiles.map((f) => `  - ${f}`)] : []),
    ].join("\n");
    // L'architecte vérifie son document avec la porte que le code rejouera (ADR 0082).
    const r = await w.agent("skraft-architecte", consigne, { lectureSeule: GELÉS.filter((g) => g !== ARCHI_FIGEE), verification: { outil: "verifier_architecture", fichiers: [document], donnees: { chemin: document } } });
    if (r.verification)
      vue.verifications = [...(vue.verifications ?? []), { phase: "ARCHI", agent: "skraft-architecte", appels: r.verification.appels }];
    if (r.sortie)
      return;
    // Question bloquante (D31) : l'humain répond, l'agent repart avec la réponse dans son dossier, et le même motif (D9 de docs/12).
    const choix = r.blocage.choix.length ? r.blocage.choix : ["Répondre"];
    await w.etape("BLOCKED");
    const d = await w.humain("blocage", "Question de l'agent (ARCHI)", choix.map((c) => ({ id: c, label: c })), { detail: r.blocage.question });
    vue.reponses = [...vue.reponses, { question: r.blocage.question, answer: d.commentaire ? `${d.decision} (${d.commentaire})` : d.decision }];
  }
}
/** La porte d'ARCHI, sur le document et les fichiers qu'il cite : le même calcul que `verifier_architecture`. */
async function porteArchitecture(w, vue, chemin) {
  let md;
  try {
    md = await w.lireFichier(chemin);
  }
  catch (e) {
    if (e instanceof PanneEnvironnement || e instanceof TourInterrompu)
      throw e;
    return { motifs: [`Document d'architecture absent : ${chemin}`] };
  }
  const existants = new Set(await w.listerFichiers());
  const contenus = new Map();
  for (const cite of citesDansLArchitecture(md))
    if (existants.has(cite))
      contenus.set(cite, await w.lireFichier(cite));
  const { reasons, openQuestions } = motifsDeLArchitecture(md, contenus);
  return { motifs: reasons, openQuestions, md };
}
async function relancerOuAbandonner(w, motif, registre) {
  await w.etape("ESCALATED");
  const d = await w.humain("escalade", "Pipeline skraft bloqué", RELANCER_OU_ABANDONNER, { detail: motif });
  if (d.decision !== "relancer") {
    // Le run s'arrête : le registre de la story est écrit avant (LEC-1).
    if (registre)
      await ecrireLeRegistre(w, registre);
    w.echec(`Abandon : ${motif}`);
  }
}
