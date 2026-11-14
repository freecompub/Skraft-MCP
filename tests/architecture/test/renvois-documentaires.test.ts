/**
 * Les renvois aux études numérotées (`docs/NN`) doivent résoudre vers un fichier du dépôt
 * (ADR 0093). La séparation d'agent-studio n'avait emporté que `docs/09` et `docs/11`, laissant
 * ~175 renvois dans le vide — dont dix-neuf décisions numérotées que le code implémente.
 *
 * Un renvoi qui ne résout pas n'échoue nulle part : il se dégrade en silence, à mesure que la
 * mémoire de la séparation s'efface. D'où cette garde.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "../../..");
const IGNORES = new Set(["node_modules", ".git", "dist", "coverage"]);
/** Un renvoi : `docs/12`, `docs/12-audit-…md`, `` `docs/10` §3 ``. */
const RENVOI = /docs\/(\d{2})/g;

/** Fichiers du dépôt où un renvoi peut se trouver : code, workflow et documents. */
async function fichiers(): Promise<readonly string[]> {
  const trouves: string[] = [];
  const marcher = async (dossier: string): Promise<void> => {
    for (const e of await readdir(dossier, { withFileTypes: true })) {
      if (IGNORES.has(e.name)) continue;
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) await marcher(chemin);
      else if (/\.(ts|mjs|md)$/.test(e.name)) trouves.push(chemin);
    }
  };
  await marcher(RACINE);
  return trouves;
}

/** Numéros des études présentes dans `docs/` (`09-workflows-rejouables.md` → « 09 »). */
async function presentes(): Promise<ReadonlySet<string>> {
  const noms = await readdir(join(RACINE, "docs"), { withFileTypes: true });
  return new Set(noms.filter((e) => e.isFile()).flatMap((e) => /^(\d{2})-.*\.md$/.exec(e.name)?.[1] ?? []));
}

describe("renvois documentaires (ADR 0093)", () => {
  it("chaque `docs/NN` cité résout vers une étude du dépôt", async () => {
    const etudes = await presentes();
    const manquants = new Map<string, string[]>();
    for (const f of await fichiers()) {
      const texte = await readFile(f, "utf8");
      for (const [, nn] of texte.matchAll(RENVOI)) {
        if (etudes.has(nn!)) continue;
        const ou = manquants.get(nn!) ?? [];
        const rel = relative(RACINE, f);
        if (!ou.includes(rel)) ou.push(rel);
        manquants.set(nn!, ou);
      }
    }
    const resume = [...manquants.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nn, ou]) => `docs/${nn} : cité dans ${ou.length} fichier(s), absent de docs/`);
    expect(resume).toEqual([]);
  });
});
