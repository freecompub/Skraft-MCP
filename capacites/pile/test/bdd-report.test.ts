import { describe, expect, it } from "vitest";
import { lireScenariosBdd } from "../src/reports/scenarios-bdd.js";
import { lireCucumberJson, reunirRapportsBdd } from "../src/reports/cucumber-json.js";

describe("origine BDD : sources et preuves du lanceur", () => {
  it("compile les tags hérités et chaque ligne d'exemple, sans AC dans les titres", () => {
    const sources = [{ path: "features/plafond.feature", content: `# language: fr
Fonctionnalité: Plafonner
  @ac-2
  Règle: Respecter la limite
    Plan du scénario: Une dose limitée
      Soit une dose de <dose>
      Quand le plafond est appliqué
      Alors le résultat est <resultat>
      Exemples:
        | dose | resultat |
        | 12   | 10       |
        | 8    | 8        |
` }];
    expect(lireScenariosBdd(sources).map(s => ({ file: s.file, line: s.line, criteres: s.criteres }))).toEqual([
      { file: sources[0]!.path, line: 11, criteres: [2] },
      { file: sources[0]!.path, line: 12, criteres: [2] },
    ]);
  });

  const rapport = (status = "failed", error_message = "java.lang.AssertionError: expected 10 but was 12") => JSON.stringify([{
    uri: "file:///projet/features/plafond.feature", name: "Plafonner",
    elements: [{ type: "scenario", id: "plafonner;une-dose-limitee", name: "Une dose limitée", line: 3,
      steps: [{ result: { status, error_message } }, { result: { status: "skipped" } }] }],
  }]);

  it("lit une assertion Cucumber et son origine ; les étapes suivantes ignorées ne masquent pas le rouge", () => {
    const lus = lireCucumberJson(rapport(), "/projet");
    expect(lus[0]?.resultat).toMatchObject({
      id: "features/plafond.feature:3", bdd: { file: "features/plafond.feature", line: 3 },
      status: "failed", failureKind: "assertion",
    });
  });

  it.each(["undefined", "pending", "ambiguous"])("ne classe jamais %s comme un rouge métier", status => {
    expect(lireCucumberJson(rapport(status, "AssertionError dans une définition absente"), "/projet")[0]?.resultat)
      .toMatchObject({ status: "failed", failureKind: "other_error" });
  });

  it("une URI classpath non résolue ne devient pas un chemin de source supposé", () => {
    expect(() => lireCucumberJson(rapport().replace("file:///projet/", "classpath:"), "/projet")).toThrow(/classpath/);
  });

  it("lit les URI file: relatives réellement émises par Cucumber-JVM", () => {
    expect(lireCucumberJson(rapport().replace("file:///projet/", "file:"), "/projet")[0]?.resultat.bdd)
      .toEqual({ file: "features/plafond.feature", line: 3 });
  });

  it("la base des URI pytest-bdd est explicite, jamais devinée à partir du nom de fichier", () => {
    expect(lireCucumberJson(rapport().replace("file:///projet/", "projet/"), "/projet", "..")[0]?.resultat.bdd)
      .toEqual({ file: "features/plafond.feature", line: 3 });
  });

  it("classe l'exception terminale pytest, pas une ligne de code recopiée dans sa trace", () => {
    expect(lireCucumberJson(rapport("failed", "> assert obtenu == attendu\nE assert 2 == 1\ntest_sonde.py:31: AssertionError"), "/projet")[0]?.resultat.failureKind)
      .toBe("assertion");
    expect(lireCucumberJson(rapport("failed", "> assertTrue(obtenu)\nE ValueError: configuration invalide\ntest_sonde.py:31: ValueError"), "/projet")[0]?.resultat.failureKind)
      .toBe("other_error");
  });

  it("refuse un rapport mal formé ou une source hors du projet", () => {
    expect(() => lireCucumberJson("{}", "/projet")).toThrow();
    expect(() => lireCucumberJson(rapport().replace("/projet/", "/ailleurs/"), "/projet")).toThrow(/hors/);
  });

  it("réunit le XML et son rapport natif sans doubler le scénario ni renommer les tests unitaires", () => {
    const unit = { id: "Unitaire.calcul", file: "Unitaire", status: "passed" as const };
    const doublon = { id: "Plafonner.Une dose limitée", file: "Plafonner", status: "failed" as const };
    const bdd = lireCucumberJson(rapport(), "/projet");
    expect(reunirRapportsBdd([unit, doublon], bdd)).toEqual([unit, bdd[0]!.resultat]);
  });

  it("refuse les collisions de rapports au lieu de prendre le dernier résultat", () => {
    const bdd = lireCucumberJson(rapport(), "/projet");
    expect(() => reunirRapportsBdd([], [...bdd, ...bdd])).toThrow(/plusieurs/i);
  });

  it("réconcilie le relevé du moteur JUnit Cucumber, sans attribuer ses noms Example #1.1 aux scénarios", () => {
    const bdd = lireCucumberJson(rapport(), "/projet");
    const temoin = { id: "Exemples.Example #1.1", file: "Exemples", status: "failed" as const, failureKind: "assertion" as const };
    expect(reunirRapportsBdd([], bdd, [temoin])).toEqual([bdd[0]!.resultat]);
    expect(() => reunirRapportsBdd([], bdd, [{ ...temoin, failureKind: "other_error" }])).toThrow(/incohérents/);
    expect(() => reunirRapportsBdd([], bdd, [])).toThrow(/incohérents/);
  });
});
