// @ts-nocheck — le workflow est en JavaScript, sans types (ADR 0055) : ce test vérifie son comportement, pas ses types.
/** L'outil `verifier_scenarios` montre aussi les avertissements de la porte des valeurs (ADR 0090). */
import { describe, expect, it } from "vitest";
import { motifsDesScenarios, texteDeVerification } from "../../../workflows/skraft/distillation.mjs";

describe("réponse de verifier_scenarios", () => {
  const avertissements = ["La valeur « 12,5 U » du critère 2 n'apparaît pas dans le scénario @ac-2 (f.feature)."];
  it("sans motif : accepté, et les avertissements suivent, dits non bloquants", () => {
    const t = texteDeVerification({ motifs: [], porte: "", avertissements });
    expect(t).toMatch(/^Aucun motif/);
    expect(t).toContain("Avertissements non bloquants de la porte des valeurs");
    expect(t).toContain("- La valeur « 12,5 U »");
  });

  describe("verifier_scenarios en BDD", () => {
    it("un titre métier sans préfixe AC est valide : le tag porte la traçabilité", () => {
      const r = motifsDesScenarios({
        slug: "dose",
        bdd: [{ lanceur: "cucumber-jvm", features: "features", etapes: "steps" }],
        criteria: [{ n: 2, text: "La dose respecte le plafond", literals: [] }],
        globsAcceptance: ["features/**", "steps/**"],
        fichiers: {
          "features/plafond.feature": `Fonctionnalité: Plafonner la dose
    @ac-2
    Scénario: La dose proposée respecte le plafond
      Soit un plafond de 10 U
      Quand le calcul donne 12 U
      Alors la dose proposée est 10 U
  `,
          ".skraft/dose/distill/test-plan.md": `| Scénario | Cas d'usage | Couche | Doublure | Walking skeleton |
  |---|---|---|---|---|
  | @ac-2 | Plafonner | Application | aucune | oui |
  `,
          ".skraft/dose/distill/impl-plan.md": "## Étape ac-2\n- Test : `features/plafond.feature`\n",
        },
      });
      expect(r.motifs).toEqual([]);
    });
  });
  it("avec un motif : le refus d'abord, puis les avertissements ; sans avertissement, rien de plus", () => {
    const t = texteDeVerification({ motifs: ["Plan de test absent"], porte: "plan de test", avertissements });
    expect(t.indexOf("refuserait")).toBeLessThan(t.indexOf("Avertissements"));
    expect(texteDeVerification({ motifs: [], porte: "" })).not.toContain("Avertissements");
  });
});
