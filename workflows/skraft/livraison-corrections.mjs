// Extrait de livraison.mjs le 2026-11-14 ; provenance : extensions/skraft-workflow/src/livraison.ts (ADR 0055).
/**
* Corrections ciblées en fin de DELIVER (ADR 0062) : les défauts de la revue, les lignes non
* couvertes et les mutants survivants repartent à l'agent concerné, un fil par défaut.
*
* Extrait de `livraison.mjs` (2026-11-14), sans changement de logique.
*/
import { disjoncte, memeRefus, correspond as matchesAny, PanneEnvironnement } from "@skraft-mcp/workflow";
import { causeDEchec } from "./deliver.mjs";
import { agentFeedback, applyResponses, endTurn, isActive } from "./review-thread.mjs";
import { creerDossiers } from "./support.mjs";
import { arbitrerCouverture, arbitrerMutants } from "./livraison-arbitrages.mjs";
import { porteScenario } from "./livraison-portes.mjs";
import { escaladeScenario, pas } from "./livraison-scenario.mjs";
import { ScenarioEchoue, autreAgent, barreDeQualite, elementDe, muter, natures, pourDev, pourTests } from "./livraison-socle.mjs";
/** Mutation de fin de DELIVER (ADR 0049, moment par défaut) : une exécution sur tout ce que la phase a modifié. */
export async function mutationDeFin(w, L, cpPhase, derogations) {
  const { barre, notes } = await barreDeQualite(w, L.disp);
  if (!barre.mutation.active)
    return { motifs: [], faits: [], notes: [...notes, "Mutation désactivée par la barre de qualité du projet."] };
  if (barre.mutation.moment !== "phase-end")
    return { motifs: [], faits: [], notes };
  const k = natures(L.disp);
  const changes = (await w.fichiersModifies(cpPhase)).filter((f) => f.status !== "deleted" && k.production(f.path) && matchesAny(L.disp.sources, f.path));
  if (changes.length === 0)
    return { motifs: [], faits: [], notes };
  const r = await muter(w, barre, changes, "fin de DELIVER", derogations);
  return { motifs: r.motifs, mutants: r.mutants, faits: r.faits, notes: [...notes, ...r.notes] };
}

/**
* Portes de fin de DELIVER qui désignent leur correcteur : un test trop faible (mutation, lignes
* modifiées non couvertes) va au testeur, un test existant cassé au développeur.
*/
const CORRECTIONS_DE_FIN = {
  mutation: {
    id: "mutation",
    target: "test",
    consigne: "Ajoute le test qui tue ce mutant : il doit passer sur le code actuel et échouer sur le mutant. " +
      "Si la ligne mutée ne sert à aucun comportement observable (code superflu), déclare ce défaut `outOfScope` : il ira au développeur. " +
      "Si le mutant est équivalent (aucune entrée ne le distingue du code), conteste-le en le démontrant : un arbitre jugera, et l'humain si besoin.",
  },
  "couverture du diff": {
    id: "couverture",
    target: "test",
    consigne: "Ajoute le test qui exerce ces lignes par un comportement observable. " +
      "Si une ligne ne sert à aucun comportement (code superflu), déclare ce défaut `outOfScope` : il ira au développeur. " +
      "Si elle ne peut pas être exercée (code défensif inatteignable), conteste le défaut avec ta raison : l'humain tranchera.",
  },
  "suite finale": {
    id: "suite finale",
    target: "code",
    consigne: "Corrige le code pour que ce test repasse ; ne modifie pas ce test.",
  },
};

/** Lignes non couvertes → un défaut par fichier, adressé au testeur, qui garde ses lignes. */
export function filsDeCouverture(lignes, tour) {
  const c = CORRECTIONS_DE_FIN["couverture du diff"];
  return lignes.map((x, j) => ({
    id: `${c.id}#${tour}.${j + 1}`,
    lens: c.id,
    severity: "major",
    description: `Couverture du diff : ${x.file}, lignes non couvertes : ${x.lines.join(", ")}. ${c.consigne}`,
    target: c.target,
    couverture: x,
    status: "open",
    round: tour,
  }));
}

/** Mutants survivants → un défaut chacun, adressé au testeur, qui garde le mutant exact (ADR 0065). */
export function filsDeMutation(mutants, tour) {
  const c = CORRECTIONS_DE_FIN.mutation;
  return mutants.map((m, j) => ({
    id: `${c.id}#${tour}.${j + 1}`,
    lens: c.id,
    severity: "major",
    description: `Mutant survivant : ${elementDe(m)}${m.replacement ? ` — code du mutant : ${m.replacement}` : ""}. ${c.consigne}`,
    target: c.target,
    mutant: m,
    status: "open",
    round: tour,
  }));
}

/** Motifs d'une porte de fin de DELIVER → défauts adressés à son correcteur. */
function filsDeFin(porte, motifs, tour) {
  const c = CORRECTIONS_DE_FIN[porte];
  return motifs.map((description, j) => ({
    id: `${c.id}#${tour}.${j + 1}`,
    lens: c.id,
    severity: "major",
    description: `${description} ${c.consigne}`,
    target: c.target,
    status: "open",
    round: tour,
  }));
}

/**
* Porte de fin de DELIVER en échec avec un correcteur (ADR 0049, D5 de docs/12) : les scénarios sont
* verts, rejouer la phase ne ferait travailler personne. Correction ciblée depuis le dernier vert si
* le budget le permet ; rend vrai si elle a eu lieu.
*/
export async function correctionDeFin(w, d, L, s, max, tentatives, consommer, porte, motifs, fils) {
  fils ??= (tour) => filsDeFin(porte, motifs, tour);
  if (!L.dernierVert || tentatives() + 1 >= max)
    return false;
  await w.rejet(`${porte} (correction ciblée)`, motifs);
  consommer();
  s.fils = [...s.fils, ...fils(tentatives())];
  await corriger(w, d, L, s, max);
  return true;
}

/**
* Correction ciblée (§9.3, ADR 0046) depuis le dernier vert : côté tests d'abord, puis côté code,
* chacun ne recevant que ses défauts ; un défaut renvoyé (« hors de mon périmètre ») passe à
* l'autre agent. Un échec reprend la correction à son début, dans la limite du budget.
*/
export async function corriger(w, d, L, s, max) {
  const depart = L.dernierVert;
  const filsAuDepart = s.fils;
  // La mémoire revient au même point que le disque (D12 de docs/12) : sinon l'empreinte et la
  // référence des tests gardent ceux d'un essai effacé, et chaque pas de la reprise est refusé.
  const memoire = { unitTestsHash: L.unitTestsHash, baseline: L.baseline, dernierVert: L.dernierVert };
  // Le scénario courant du réducteur : le dernier scénario moteur.
  const i = L.scenarios.map((x) => x.role).lastIndexOf("driver");
  await w.rembobiner(depart);
  await creerDossiers(w, d.slug);
  let motifs = [];
  /** Motifs du dernier échec de la correction, pour le disjoncteur (ADR 0073). */
  let echecPrecedent = null;
  for (let echecs = 1;; echecs++) {
    try {
      await deroulerCorrection(w, d, L, s, i, depart, max, motifs);
      return;
    }
    catch (e) {
      // Panne d'environnement (D14 de docs/12) : retour à l'entrée de la correction, puis l'humain.
      // « Relancer » reprend la correction, sans essai consommé (D25) ; rien de livré n'est rejoué.
      if (e instanceof PanneEnvironnement) {
        await w.rejet(`panne (correction ${L.scenarios[i].id})`, [e.message]);
        await w.rembobiner(depart);
        await creerDossiers(w, d.slug);
        s.fils = filsAuDepart;
        Object.assign(L, memoire);
        await escaladeScenario(w, e.message);
        echecs--;
        continue;
      }
      if (!(e instanceof ScenarioEchoue))
        throw e;
      await w.rejet(`correction (${L.scenarios[i].id})`, e.motifs);
      await w.rembobiner(depart);
      await creerDossiers(w, d.slug);
      s.fils = filsAuDepart;
      Object.assign(L, memoire);
      // La reprise connaît la cause de l'échec (D15 de docs/12).
      motifs = e.motifs;
      // Disjoncteur (ADR 0073) : la correction échoue comme à sa reprise précédente.
      const refus = { porte: "correction", motifs };
      const disjoncteur = memeRefus(echecPrecedent, refus);
      echecPrecedent = refus;
      if (disjoncteur)
        motifs = disjoncte(motifs);
      if (echecs >= max || disjoncteur) {
        const cause = causeDEchec({ rouges: e.cause.rouges, avantDeliver: L.avantDeliver, lignes: e.cause.lignes });
        motifs = [...motifs, ...(await escaladeScenario(w, `Scénario ${L.scenarios[i].id} : ${motifs.join(" ; ")}`, { d, sc: L.scenarios[i], cause }))];
        echecs = 0;
        echecPrecedent = null;
      }
    }
  }
}

async function deroulerCorrection(w, d, L, s, i, depart, max, motifs) {
  const c = { retourTests: agentFeedback(s.fils, pourTests), retourDev: agentFeedback(s.fils, pourDev), cibles: [], reponses: [] };
  let point = depart;
  let unitTests = [];
  let etape = s.fils.some((t) => isActive(t) && pourTests(t)) ? "fix-test" : "fix";
  for (;;) {
    c.fils = s.fils;
    const r = await pas(w, d, L, i, etape, point, motifs, max, [], null, c);
    motifs = [];
    point = r.cp;
    const concerne = etape === "fix-test" ? pourTests : pourDev;
    s.fils = endTurn(applyResponses(s.fils, c.reponses, concerne, autreAgent), concerne);
    c.reponses = [];
    if (etape === "fix-test") {
      // Mutants contestés : l'arbitre, puis l'humain si besoin (ADR 0065). Un mutant maintenu par
      // l'humain repart au testeur.
      await arbitrerMutants(w, d, s);
      await arbitrerCouverture(w, d, s);
      if (s.fils.some((t) => isActive(t) && pourTests(t))) {
        c.retourTests = agentFeedback(s.fils, pourTests);
        continue;
      }
      if (s.fils.some((t) => isActive(t) && pourDev(t)) || c.cibles.length) {
        c.retourDev = agentFeedback(s.fils, pourDev);
        etape = "fix";
        continue;
      }
      break;
    }
    if (s.fils.some((t) => isActive(t) && pourTests(t))) {
      c.retourTests = agentFeedback(s.fils, pourTests);
      etape = "fix-test";
      continue;
    }
    unitTests = c.cibles;
    break;
  }
  await porteScenario(w, d, L, i, depart, unitTests);
}
