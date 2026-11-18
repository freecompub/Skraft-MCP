// @ts-nocheck — le workflow est en JavaScript, sans types (ADR 0055) : ce test vérifie son comportement, pas ses types.
/** Reprise d'une story (ADR 0089) : ce que le code note à chaque phase approuvée, et ce qu'il en relit. */
import { describe, expect, it, vi } from "vitest";
import { commitDeReprise, etatApresPhase, lireEtat, proposerLaReprise, questionDeReprise, releveDeDepart, restaurer } from "../../../workflows/skraft/reprise.mjs";

const story = { id: "US-2", title: "Remise par palier", criteria: [], openQuestions: [] };
const vue = () => ({
  story,
  slug: "us02-abcd1234",
  base: "b0",
  niveau: "medium",
  architecture: "clean-architecture",
  registre: { erreurs: [{ phase: "DESIGN", source: "cohérence", motif: "m" }] },
  injectees: [{ phase: "DESIGN", role: "skraft-architect-decide", ids: ["L-01"] }],
  phasesFaites: [{ phase: "RESEARCH", fichiers: [".skraft/us02-abcd1234/research/research.md"] }],
  phasesSautees: [],
  questions: [{ id: "q1", text: "Paliers ?" }],
  reponses: [{ question: "Paliers ?", answer: "les mêmes" }],
  recherche: { conventions: "c", existant: "e" },
  adrs: [{ id: "ADR-003", path: "docs/adr/adr-003-x.md", status: "Accepted" }],
  regressions: [],
  acceptanceHash: null,
  testsAvant: [{ id: "t1", status: "passed" }],
  testsDeLaStory: null,
  planDeTest: null,
  derogations: [],
  derogationsCouverture: [],
  testsObsoletes: [],
  ecartsAuPlan: [],
  nonCommitees: [],
});

describe("état noté à chaque phase approuvée", () => {
  it("les phases approuvées jusqu'ici, et ce que les suivantes reçoivent ; rien de propre au run (agents, mémoire)", () => {
    const e = etatApresPhase(vue(), "DESIGN");
    expect(e).toMatchObject({ version: 1, story: { id: "US-2", title: "Remise par palier" }, slug: "us02-abcd1234", base: "b0", phases: ["RESEARCH", "DESIGN"], niveau: "medium" });
    expect(e.adrs).toEqual([{ id: "ADR-003", path: "docs/adr/adr-003-x.md", status: "Accepted" }]);
    expect(e.erreurs).toHaveLength(1);
    expect(e).not.toHaveProperty("registre");
    expect(e).not.toHaveProperty("memoire");
    expect(JSON.parse(JSON.stringify(e))).toEqual(e);
  });

  it("relu tel quel ; refusé s'il ne vient pas de cette story, de ce slug ou de cette version", () => {
    const texte = JSON.stringify(etatApresPhase(vue(), "DESIGN"));
    expect(lireEtat(texte, story, "us02-abcd1234")).toMatchObject({ phases: ["RESEARCH", "DESIGN"] });
    expect(lireEtat(texte, { ...story, id: "US-3" }, "us02-abcd1234")).toBeNull();
    expect(lireEtat(texte, story, "us02-autre")).toBeNull();
    expect(lireEtat(JSON.stringify({ ...JSON.parse(texte), version: 99 }), story, "us02-abcd1234")).toBeNull();
    expect(lireEtat("pas du json", story, "us02-abcd1234")).toBeNull();
  });

  it("restauré dans un run neuf : les phases faites, la recherche, les réponses, les ADR, le niveau, les erreurs déjà commises", () => {
    const etat = etatApresPhase(vue(), "DESIGN");
    const neuf = { ...vue(), base: "autre", niveau: undefined, phasesFaites: [], reponses: [], adrs: [], recherche: undefined, registre: { erreurs: [] }, injectees: [] };
    restaurer(neuf, etat);
    expect(neuf.phasesFaites.map((p) => p.phase)).toEqual(["RESEARCH", "DESIGN"]);
    expect(neuf.phasesFaites[0].fichiers).toEqual([".skraft/us02-abcd1234/research/research.md"]);
    expect(neuf).toMatchObject({ base: "b0", niveau: "medium", recherche: { conventions: "c", existant: "e" }, reponses: [{ question: "Paliers ?", answer: "les mêmes" }] });
    expect(neuf.adrs).toHaveLength(1);
    expect(neuf.registre.erreurs).toHaveLength(1);
  });

  it("la reprise BDD conserve le lien source–critères et les mêmes identifiants de preuve pour DELIVER", () => {
    const id = "features/plafond.feature:11";
    const depart = { ...vue(), testsDeLaStory: [id], criteresParTest: { [id]: [2] } };
    const etat = JSON.parse(JSON.stringify(etatApresPhase(depart, "DISTILL")));
    const neuf = vue();
    restaurer(neuf, etat);
    expect(neuf.testsDeLaStory).toEqual([id]);
    expect(neuf.criteresParTest).toEqual({ [id]: [2] });
    const r = { results: [{ id, status: "failed" }], exitCode: 1, timedOut: false };
    expect(releveDeDepart(r, etat)).toMatchObject({ results: [], exitCode: 0 });
  });
});

describe("retour au dernier commit de phase", () => {
  const etat = etatApresPhase(vue(), "DESIGN");
  it("le commit le plus récent au message de la dernière phase approuvée", () => {
    const h = [
      { sha: "c4", subject: "feat(us02-abcd1234): ac-1" },
      { sha: "c3", subject: "docs(skraft): design de us02-abcd1234" },
      { sha: "c2", subject: "docs(skraft): research de us02-abcd1234" },
    ];
    expect(commitDeReprise(h, etat)).toBe("c3");
  });

  it("introuvable (commit manqué, branche réécrite) : null", () => {
    expect(commitDeReprise([{ sha: "c2", subject: "docs(skraft): research de us02-abcd1234" }], etat)).toBeNull();
  });
});

describe("question posée à l'utilisateur", () => {
  it("continuer au checkpoint, continuer ici ou recommencer ; le détail dit ce qui est conservé ou perdu", () => {
    const q = questionDeReprise(story, etatApresPhase(vue(), "DESIGN"));
    expect(q.titre).toBe("US-2 a déjà une session : la continuer ?");
    expect(q.options).toEqual([
      { id: "continuer", label: "Continuer la session précédente" },
      { id: "continuer-ici", label: "Continuer depuis l'état actuel (conserver les corrections)" },
      { id: "nouvelle", label: "Nouvelle session (écrase la précédente)" },
    ]);
    for (const attendu of ["skraft/us02-abcd1234", "RESEARCH, DESIGN", "reprend à DISTILL", "perdu", "aucun rembobinage", "sans les approuver"]) expect(q.detail).toContain(attendu);
  });

  it("story déjà livrée : continuer ne refait rien", () => {
    const livree = etatApresPhase({ ...vue(), phasesFaites: ["RESEARCH", "DESIGN", "DISTILL"].map((phase) => ({ phase, fichiers: [] })) }, "DELIVER");
    expect(questionDeReprise(story, livree).detail).toMatch(/déjà livrée/);
  });
});

describe("reprise après une correction de configuration commitée", () => {
  const etat = etatApresPhase(vue(), "DESIGN");
  const workflow = (decision) => ({
    lireFichier: async () => JSON.stringify(etat),
    humain: async () => ({ decision }),
    historique: vi.fn(async () => [{ sha: "design", subject: "docs(skraft): design de us02-abcd1234" }]),
    revenirA: vi.fn(async () => ({ nonSuivis: [] })),
    brancher: vi.fn(),
    informer: vi.fn(),
  });

  it("conserve les corrections présentes quand l'utilisateur choisit explicitement de continuer ici", async () => {
    const w = workflow("continuer-ici");
    expect(await proposerLaReprise(w, story, "us02-abcd1234", "configuration")).toEqual(etat);
    expect(w.revenirA).not.toHaveBeenCalled();
    expect(w.brancher).not.toHaveBeenCalled();
    expect(w.informer).toHaveBeenCalledWith(expect.stringMatching(/sans rembobinage/));
  });

  it("conserve le retour au dernier commit pour le choix historique de continuation", async () => {
    const w = workflow("continuer");
    expect(await proposerLaReprise(w, story, "us02-abcd1234", "configuration")).toEqual(etat);
    expect(w.revenirA).toHaveBeenCalledWith("design");
  });
});

describe("relevé des tests au départ d'une session continuée", () => {
  const run = (results, exitCode) => ({ results, exitCode, timedOut: false, output: "", durationMs: 0 });
  const rouge = (id) => ({ id, status: "failed" });
  const vert = (id) => ({ id, status: "passed" });

  it("les tests d'acceptance de la story, rouges en attendant DELIVER, sont mis à part ; la sortie en erreur qu'ils causent aussi", () => {
    const etat = { testsDeLaStory: ["A > ac-1", "A > ac-2"] };
    expect(releveDeDepart(run([vert("u1"), rouge("A > ac-1"), rouge("A > ac-2")], 1), etat)).toEqual(run([vert("u1")], 0));
  });

  it("un autre test rouge reste un problème : rien n'est masqué", () => {
    const etat = { testsDeLaStory: ["A > ac-1"] };
    expect(releveDeDepart(run([rouge("u1"), rouge("A > ac-1")], 1), etat)).toEqual(run([rouge("u1")], 1));
  });

  it("sans session continuée, ou avant DISTILL, le relevé est rendu tel quel", () => {
    const r = run([rouge("A > ac-1")], 1);
    expect(releveDeDepart(r, null)).toBe(r);
    expect(releveDeDepart(r, { testsDeLaStory: null })).toBe(r);
  });
});
