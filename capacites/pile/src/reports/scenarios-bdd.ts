import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import type { FeatureChild, Scenario } from "@cucumber/messages";

export interface ScenarioBdd {
  file: string;
  line: number;
  titre: string;
  criteres: number[];
  texte: string;
  cle: string;
}

/** Compilation pure : les exemples et les tags hérités sont ceux du parseur Gherkin, pas d'une expression régulière. */
export function lireScenariosBdd(fichiers: readonly { path: string; content: string }[]): ScenarioBdd[] {
  return fichiers.flatMap(({ path, content }) => {
    let id = 0;
    const newId = () => String(++id);
    const langue = /^\s*Fonctionnalité\s*:/m.test(content) ? "fr" : "en";
    const document = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher(langue)).parse(content);
    const scenarios = new Map<string, Scenario>();
    const lignes = new Map<string, number>();
    const visiter = (children: readonly FeatureChild[]) => {
      for (const child of children) {
        if (child.scenario) {
          scenarios.set(child.scenario.id, child.scenario);
          lignes.set(child.scenario.id, child.scenario.location.line);
          for (const exemple of child.scenario.examples)
            for (const row of exemple.tableBody) lignes.set(row.id, row.location.line);
        }
        if (child.rule) visiter(child.rule.children);
      }
    };
    visiter(document.feature?.children ?? []);
    return compile(document, path, newId).map((pickle): ScenarioBdd => {
      const scenario = scenarios.get(pickle.astNodeIds[0]!);
      const line = lignes.get(pickle.astNodeIds.at(-1)!);
      if (!scenario || line === undefined) throw new Error(`${path} : origine du scénario Gherkin introuvable.`);
      const tags = pickle.tags.map(t => t.name);
      const etapes = pickle.steps.map(s => ({
        texte: s.text,
        ...(s.argument?.docString ? { document: s.argument.docString.content } : {}),
        ...(s.argument?.dataTable ? { tableau: s.argument.dataTable.rows.map(r => r.cells.map(c => c.value)) } : {}),
      }));
      return {
        file: path, line, titre: pickle.name,
        criteres: [...new Set(tags.flatMap(t => /^@ac-(\d+)$/i.exec(t)?.slice(1).map(Number) ?? []))],
        texte: [pickle.name, ...etapes.map(e => JSON.stringify(e))].join("\n"),
        cle: JSON.stringify({ titre: pickle.name, tags: [...tags].sort(), etapes }),
      };
    });
  });
}
