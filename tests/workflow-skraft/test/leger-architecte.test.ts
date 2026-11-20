/**
 * Porte d'ARCHI de skraft-light (ADR 0098) : le document de l'architecte est jugé par le code, sans
 * LLM. Mêmes citations que la porte de RESEARCH de skraft ; en plus, le mode (conforme ou nouvelle) et
 * ce qu'il exige.
 */
import { describe, expect, it } from "vitest";
import { ARCHI_SECTIONS, checkArchitecture, extraireArchitecture, trierLesQuestions, verifierArchitecture } from "../../../workflows/skraft-light/architecte.mjs";

function doc(over: Partial<Record<string, string>> = {}): string {
  const body: Record<string, string> = {
    Périmètre: "Plafonner la dose proposée.",
    "Fichiers analysés": "- `src/domain/bolus-calculator.ts:1-3`\n- `src/settings/max-bolus-setting.ts`",
    "Conventions du projet": "Objets-valeurs immuables dans le domaine.",
    Mode: "conforme",
    "Architecture retenue": "Domaine pur, réglages injectés : `src/domain/bolus-calculator.ts:1-3`.",
    Décisions: "- Le plafond vit dans le domaine, comme le calcul : `src/domain/bolus-calculator.ts:1-3`.",
    Justification: "La story s'inscrit dans le calcul existant.",
    "Plan de conception": "- `BolusCap` dans `src/domain/bolus-cap.ts`, appelé par `BolusCalculator`.",
    "Existant réutilisable": "- `BolusCalculator` → `src/domain/bolus-calculator.ts`",
    ...over,
  };
  return ["# Architecture US-12", ...Object.entries(body).map(([h, t]) => `## ${h}\n\n${t}`)].join("\n\n");
}

const lignes: Record<string, number> = { "src/domain/bolus-calculator.ts": 3, "src/settings/max-bolus-setting.ts": 1 };
const contenus: Record<string, string> = { "src/domain/bolus-calculator.ts": "export class BolusCalculator {}\n\n\n", "src/settings/max-bolus-setting.ts": "export class MaxBolusSetting {}\n" };
const index = { lineCount: (p: string) => lignes[p] ?? null, contains: (p: string, nom: string) => (contenus[p] ?? "").includes(nom) };

describe("Porte d'ARCHI (ADR 0098)", () => {
  it("document conforme : aucun motif, mode reconnu", () => {
    expect(checkArchitecture(doc(), index)).toEqual({ reasons: [], mode: "conforme", openQuestions: [] });
  });

  it("chaque section du gabarit est exigée", () => {
    const md = doc().replace(/\n\n## Plan de conception\n\n[^\n]*/, "");
    expect(checkArchitecture(md, index).reasons).toEqual(["Section manquante : « Plan de conception »."]);
    expect(ARCHI_SECTIONS).toContain("Existant réutilisable");
    expect(ARCHI_SECTIONS).toContain("Décisions");
  });

  it("décision sans source : refusée, à sourcer ou à poser en question — l'architecte ne tranche pas seul", () => {
    const decisions = [
      "- Adaptateur HTTP différé, doublure en mémoire en attendant.",
      "- Même découpage que le calcul : `src/domain/bolus-calculator.ts`.",
      "- Plafond par prise : `passation.md:4`.",
      "- Domaine pur : `src/domain/bolus-calculator.ts:1-3`.",
    ].join("\n");
    const consigne = "Source-la par `chemin:lignes` (le code existant, la story, ou la réponse de l'utilisateur dans passation.md) ; si rien ne la dicte, retire-la et pose-la dans « Questions ouvertes ».";
    expect(checkArchitecture(doc({ Décisions: decisions }), index).reasons).toEqual([
      `Décision sans source : « Adaptateur HTTP différé, doublure en mémoire en attendant. ». ${consigne}`,
      `Décision sans source : « Même découpage que le calcul : \`src/domain/bolus-calculator.ts\`. ». ${consigne}`,
    ]);
  });

  it("décisions vides : refusées, une architecture retenue est faite de choix", () => {
    expect(checkArchitecture(doc({ Décisions: "aucune" }), index).reasons).toEqual([
      "Décisions vide : liste chaque choix de l'architecture retenue, une puce par choix, avec sa source (`chemin:lignes`).",
    ]);
  });

  it("mode absent, inconnu ou ambigu : refusé", () => {
    const attendu = "Mode : écris « conforme » (suivre l'architecture existante) ou « nouvelle » (en proposer une), un seul des deux.";
    expect(checkArchitecture(doc({ Mode: "hexagonale" }), index)).toMatchObject({ reasons: [attendu], mode: null });
    expect(checkArchitecture(doc({ Mode: "conforme ou nouvelle" }), index)).toMatchObject({ reasons: [attendu], mode: null });
  });

  it("mode conforme sans élément existant : refusé, se conformer à rien n'est pas se conformer", () => {
    expect(checkArchitecture(doc({ "Existant réutilisable": "aucun" }), index).reasons).toEqual([
      "Mode conforme : cite au moins un élément de l'existant réutilisable (« `Nom` → `chemin` ») ; se conformer à rien n'est pas se conformer.",
    ]);
  });

  it("mode nouvelle : la justification est exigée, l'existant peut être vide", () => {
    expect(checkArchitecture(doc({ Mode: "nouvelle", "Existant réutilisable": "aucun", Justification: "" }), index).reasons).toEqual(["Mode nouvelle : la justification est absente."]);
    expect(checkArchitecture(doc({ Mode: "Nouvelle architecture", "Existant réutilisable": "aucun" }), index)).toEqual({ reasons: [], mode: "nouvelle", openQuestions: [] });
  });

  it("citations : fichier inexistant, plage hors du fichier ; les livrables de .skraft/ ne sont pas vérifiés", () => {
    const r = checkArchitecture(doc({ "Architecture retenue": "`src/domain/absent.ts`, `src/domain/bolus-calculator.ts:2-9`, `.skraft/us-12/passation.md`" }), index);
    expect(r.reasons).toEqual(["`src/domain/absent.ts` : fichier inexistant dans le dépôt.", "`src/domain/bolus-calculator.ts:2-9` : plage hors du fichier, qui compte 3 lignes."]);
  });

  it("existant réutilisable : le nom doit apparaître dans le fichier cité", () => {
    const r = checkArchitecture(doc({ "Existant réutilisable": "- `BolusCalculator` → `src/settings/max-bolus-setting.ts`\n- `Absent` → `src/nulle-part.ts`" }), index);
    expect(r.reasons).toEqual([
      "Existant réutilisable : `BolusCalculator` n'apparaît pas dans `src/settings/max-bolus-setting.ts`.",
      "Existant réutilisable : `Absent` → `src/nulle-part.ts` : fichier inexistant.",
    ]);
  });

  it("plan de conception vide : refusé", () => {
    expect(checkArchitecture(doc({ "Plan de conception": "" }), index).reasons).toEqual(["Plan de conception vide : dis où va chaque élément de la story."]);
  });

  it("questions ouvertes : extraites pour l'utilisateur", () => {
    const md = `${doc()}\n\n## Questions ouvertes\n\n- Le plafond est-il affiché au patient ?`;
    expect(checkArchitecture(md, index).openQuestions).toEqual(["Le plafond est-il affiché au patient ?"]);
  });

  it("ce que DISTILL et DELIVER reçoivent : mode, architecture, plan, conventions, existant", () => {
    expect(extraireArchitecture(doc())).toEqual({
      mode: "conforme",
      architecture: "Domaine pur, réglages injectés : `src/domain/bolus-calculator.ts:1-3`.",
      plan: "- `BolusCap` dans `src/domain/bolus-cap.ts`, appelé par `BolusCalculator`.",
      conventions: "Objets-valeurs immuables dans le domaine.",
      existant: "- `BolusCalculator` → `src/domain/bolus-calculator.ts`",
    });
  });

  it("outil verifier_architecture : la même porte, fichiers cités lus à la demande", async () => {
    const lire = async (p: string) => contenus[p] ?? null;
    const chemin = ".skraft/us-12/archi/architecture.md";
    expect(await verifierArchitecture({ fichiers: { [chemin]: doc() }, donnees: { chemin }, lire })).toBe("Aucun motif : la porte d'ARCHI accepterait ce document en l'état.");
    expect(await verifierArchitecture({ fichiers: { [chemin]: doc({ Mode: "" }) }, donnees: { chemin }, lire })).toContain("La porte « architecture » refuserait ce document :");
    expect(await verifierArchitecture({ fichiers: {}, donnees: { chemin }, lire })).toContain(`Document d'architecture absent : ${chemin}`);
  });
});

describe("Questions de l'architecte : l'architecture n'est figée qu'une fois toutes tranchées", () => {
  const connues = [
    { text: "Le plafond s'applique-t-il par prise ?", answer: "par prise" },
    { text: "Quelle unité ?", answer: "(question reportée par l'utilisateur)" },
    { text: "Question de la story sans réponse" },
  ];

  it("une question jamais posée est nouvelle : le code la pose avant de figer", () => {
    expect(trierLesQuestions(["Faut-il historiser le plafond ?"], connues)).toEqual({ nouvelles: ["Faut-il historiser le plafond ?"], motifs: [] });
  });

  it("une question tranchée encore listée est un motif, avec sa réponse : l'architecte doit l'intégrer", () => {
    const r = trierLesQuestions(["Le plafond s'applique-t-il par prise ?", "Quelle unité ?"], connues);
    expect(r.nouvelles).toEqual([]);
    expect(r.motifs).toEqual([
      "Question déjà tranchée, encore listée dans « Questions ouvertes » : « Le plafond s'applique-t-il par prise ? » → par prise. Intègre la réponse à l'architecture et retire la question.",
      "Question déjà tranchée, encore listée dans « Questions ouvertes » : « Quelle unité ? » → (question reportée par l'utilisateur). Intègre la réponse à l'architecture et retire la question.",
    ]);
  });

  it("une question connue mais pas encore répondue n'est ni nouvelle ni un motif : elle sera posée", () => {
    expect(trierLesQuestions(["Question de la story sans réponse"], connues)).toEqual({ nouvelles: [], motifs: [] });
  });
});
