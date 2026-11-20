/**
 * skraft-light reprend DISTILL et DELIVER de skraft par copie (ADR 0098) : un workflow n'importe que
 * son propre dossier. Une copie dérive en silence ; cette garde l'empêche. Chaque fichier de
 * `workflows/skraft-light/` est identique à son homonyme de `workflows/skraft/`, sauf ceux déclarés
 * ici avec la raison de leur écart. Un correctif apporté à skraft fait donc échouer la garde tant
 * qu'il n'est pas reporté dans la copie.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const RACINE = resolve(import.meta.dirname, "../../..");
const SKRAFT = join(RACINE, "workflows/skraft");
const LEGER = join(RACINE, "workflows/skraft-light");

/** Les fichiers de skraft-light qui s'écartent de skraft, ou n'y existent pas. */
const DIVERGENCES: Record<string, string> = {
  "workflow.mjs": "méta, agents et phase ARCHI à la place de RESEARCH et DESIGN",
  "brief.mjs": "l'architecture retenue est transmise à DISTILL et DELIVER",
  "support.mjs": "dossier `archi/` de la story, document d'architecture figé après ARCHI",
  "reprise.mjs": "phases d'ARCHI ; état dans `etat-light.json`, pour ne pas reprendre une session de skraft",
  "registre.mjs": "la phase ARCHI dans la liste des phases",
  "lecons.mjs": "l'agent d'ARCHI reçoit les leçons de sa phase",
  "README.md": "décrit skraft-light",
  "architecte.mjs": "porte d'ARCHI, propre à skraft-light",
  "agents/skraft-architecte.agent.md": "agent d'ARCHI, propre à skraft-light",
};

async function fichiers(dossier: string, acc: string[] = []): Promise<string[]> {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    if (e.isDirectory()) await fichiers(join(dossier, e.name), acc);
    else acc.push(join(dossier, e.name));
  }
  return acc;
}

describe("skraft-light ne dérive pas de skraft (ADR 0098)", () => {
  it("chaque fichier repris est identique à celui de skraft, sauf les écarts déclarés", async () => {
    const ecarts: string[] = [];
    for (const f of await fichiers(LEGER)) {
      const rel = relative(LEGER, f).split("\\").join("/");
      if (rel in DIVERGENCES) continue;
      const source = await readFile(join(SKRAFT, rel), "utf8").catch(() => null);
      if (source === null) ecarts.push(`${rel} : absent de workflows/skraft, et non déclaré`);
      else if (source !== (await readFile(f, "utf8"))) ecarts.push(`${rel} : diffère de workflows/skraft, sans écart déclaré`);
    }
    expect(ecarts).toEqual([]);
  });

  it("chaque écart déclaré existe encore et s'écarte vraiment", async () => {
    const perimes: string[] = [];
    for (const rel of Object.keys(DIVERGENCES)) {
      const leger = await readFile(join(LEGER, rel), "utf8").catch(() => null);
      const source = await readFile(join(SKRAFT, rel), "utf8").catch(() => null);
      if (leger === null) perimes.push(`${rel} : n'existe plus dans skraft-light`);
      else if (leger === source) perimes.push(`${rel} : identique à skraft, l'écart n'a plus lieu d'être déclaré`);
    }
    expect(perimes).toEqual([]);
  });
});
