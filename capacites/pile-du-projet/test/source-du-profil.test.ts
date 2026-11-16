/**
 * La chaîne de lecture du profil de pile du projet : `.skraft/projet.yaml` fait foi (ADR 0071, 0097),
 * et les emplacements abandonnés sont encore lus, chacun avec un avertissement qui dit où aller.
 *
 * Ce test manquait : la chaîne n'était vérifiée qu'indirectement, par les tests qui s'en servent.
 * L'ADR 0097 y ajoute un échelon, et un échelon de repli non testé ne se distingue pas d'un échelon
 * absent — c'est précisément ce qu'on ne veut pas découvrir sur le poste de quelqu'un.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANCIEN_FICHIER_PROJET, lireSourceDuProfil, PROFIL_PROJET } from "../src/profil-du-projet.js";
import { FICHIER_PROJET } from "@skraft-mcp/pile";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skraft-source-profil-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const poser = async (chemin: string, contenu: string) => {
  await mkdir(dirname(join(root, chemin)), { recursive: true });
  await writeFile(join(root, chemin), contenu);
};

const PILE = "pile:\n  id: dotnet\n";
const NUE = "id: dotnet\n";

describe("D'où vient le profil de pile du projet (ADR 0071, 0097)", () => {
  it("sans aucun fichier : aucune source", async () => {
    expect(await lireSourceDuProfil(root)).toBeNull();
  });

  it("`.skraft/projet.yaml` fait foi, sans rien à signaler", async () => {
    await poser(FICHIER_PROJET, PILE);
    const s = await lireSourceDuProfil(root);
    expect(s?.libelle).toBe(`\`${FICHIER_PROJET}\` (section pile)`);
    expect(s?.avertissements).toEqual([]);
  });

  it("l'ancien `.skraft/projet.yaml` est lu, et dit où aller", async () => {
    await poser(ANCIEN_FICHIER_PROJET, PILE);
    const s = await lireSourceDuProfil(root);
    expect(s?.libelle).toContain(ANCIEN_FICHIER_PROJET);
    expect(s?.avertissements.join(" ")).toContain(FICHIER_PROJET);
  });

  it("l'ancien `.agent-studio/stack.yaml` est lu, et dit où aller", async () => {
    await poser(PROFIL_PROJET, NUE);
    const s = await lireSourceDuProfil(root);
    expect(s?.libelle).toBe(`\`${PROFIL_PROJET}\``);
    expect(s?.brut).toBe(NUE);
    expect(s?.avertissements.join(" ")).toContain(FICHIER_PROJET);
  });

  it("le neuf l'emporte sur les deux anciens, et les signale tous les deux", async () => {
    await poser(FICHIER_PROJET, PILE);
    await poser(ANCIEN_FICHIER_PROJET, PILE);
    await poser(PROFIL_PROJET, NUE);
    const s = await lireSourceDuProfil(root);
    expect(s?.libelle).toBe(`\`${FICHIER_PROJET}\` (section pile)`);
    const dit = s!.avertissements.join(" ");
    expect(dit).toContain(ANCIEN_FICHIER_PROJET);
    expect(dit).toContain(PROFIL_PROJET);
  });

  it("entre les deux anciens, `projet.yaml` l'emporte sur `stack.yaml`", async () => {
    await poser(ANCIEN_FICHIER_PROJET, PILE);
    await poser(PROFIL_PROJET, NUE);
    const s = await lireSourceDuProfil(root);
    expect(s?.libelle).toContain(ANCIEN_FICHIER_PROJET);
  });
});
