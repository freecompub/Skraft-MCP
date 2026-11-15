/**
 * Les invariants de structure de l'ADR 0091, tenus par le code et non par la vigilance.
 *
 * Ce test lit les `package.json` du workspace : il ne dépend d'aucun paquet **du dépôt**, pour ne pas
 * peser lui-même sur le graphe qu'il mesure. Son paquet déclare `typescript`, dont la garde voisine
 * `chemins-du-depot` a besoin pour un parseur (ADR 0094) : extérieur au dépôt, il n'entre pas dans
 * le graphe.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Racine du dépôt : ce fichier vit dans `tests/architecture/test/`. */
const RACINE = resolve(import.meta.dirname, "../../..");

/** Préfixe des paquets du dépôt. */
const INTERNE = "@skraft-mcp/";

/** Dossiers que la marche n'ouvre pas : rien de ce qu'ils contiennent n'est un paquet du dépôt. */
const IGNORES = new Set(["node_modules", ".git", "dist", "coverage"]);

/**
 * Au-delà de ce nombre de paquets internes, un paquet est une racine de composition (ADR 0091 §6).
 * La seule légitime est le livrable, qui en est exempté.
 */
const LIMITE_ASSEMBLAGE = 5;

/** Retirés par l'ADR 0091 §3 : le sous-système d'extensions et son exemple. */
const RETIRES = [
  `${INTERNE}extension-api`,
  `${INTERNE}extension-installer`,
  `${INTERNE}extension-manifest`,
  `${INTERNE}extension-packaging`,
  `${INTERNE}ext-tdd`,
];

interface Paquet {
  readonly nom: string;
  /** Chemin relatif à la racine, pour que l'échec dise où regarder. */
  readonly dossier: string;
  /** Paquets internes dont il dépend, `dependencies` et `devDependencies` confondues. */
  readonly internes: readonly string[];
  /** Un paquet qui expose une commande est le livrable : lui seul assemble (ADR 0091 §6). */
  readonly livrable: boolean;
  /** Un paquet de tests peut dépendre de n'importe quoi (ADR 0091 §6). */
  readonly estDesTests: boolean;
}

const court = (nom: string) => nom.replace(INTERNE, "");

async function lirePaquet(dossier: string): Promise<Paquet | null> {
  let brut: string;
  try {
    brut = await readFile(join(dossier, "package.json"), "utf8");
  } catch {
    return null;
  }
  const json: unknown = JSON.parse(brut);
  if (typeof json !== "object" || json === null) return null;
  const o = json as { name?: unknown; bin?: unknown; dependencies?: unknown; devDependencies?: unknown };
  if (typeof o.name !== "string") return null;
  const cles = (v: unknown) => (typeof v === "object" && v !== null ? Object.keys(v) : []);
  return {
    nom: o.name,
    dossier: relative(RACINE, dossier),
    internes: [...new Set([...cles(o.dependencies), ...cles(o.devDependencies)])].filter((d) => d.startsWith(INTERNE)).sort(),
    livrable: o.bin !== undefined,
    estDesTests: o.name.startsWith(`${INTERNE}tests-`),
  };
}

/** Tous les paquets du dépôt, la racine exclue : elle est le workspace, pas un paquet. */
async function lesPaquets(): Promise<readonly Paquet[]> {
  const trouves: Paquet[] = [];
  const marcher = async (dossier: string, profondeur: number): Promise<void> => {
    if (profondeur > 3) return;
    for (const e of await readdir(dossier, { withFileTypes: true })) {
      if (!e.isDirectory() || IGNORES.has(e.name)) continue;
      const enfant = join(dossier, e.name);
      const p = await lirePaquet(enfant);
      if (p) trouves.push(p);
      await marcher(enfant, profondeur + 1);
    }
  };
  await marcher(RACINE, 0);
  return trouves.sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Les cycles du graphe, chacun rendu une fois, sous la forme « a → b → a ». */
function cyclesDe(paquets: readonly Paquet[]): readonly string[] {
  const sorties = new Map(paquets.map((p) => [p.nom, p.internes]));
  const etat = new Map<string, "en-cours" | "fini">();
  const pile: string[] = [];
  const vus = new Set<string>();
  const cycles: string[] = [];
  const visiter = (nom: string): void => {
    const e = etat.get(nom);
    if (e === "fini") return;
    if (e === "en-cours") {
      const boucle = [...pile.slice(pile.indexOf(nom)), nom];
      const cle = [...new Set(boucle)].sort().join("|");
      if (!vus.has(cle)) {
        vus.add(cle);
        cycles.push(boucle.map(court).join(" → "));
      }
      return;
    }
    etat.set(nom, "en-cours");
    pile.push(nom);
    for (const d of sorties.get(nom) ?? []) visiter(d);
    pile.pop();
    etat.set(nom, "fini");
  };
  for (const p of paquets) visiter(p.nom);
  return cycles;
}

describe("structure du dépôt (ADR 0091)", () => {
  it("aucun cycle de dépendances entre les paquets", async () => {
    expect(cyclesDe(await lesPaquets())).toEqual([]);
  });

  it("seul le livrable assemble : tout autre paquet dépend de 5 paquets internes au plus", async () => {
    const trop = (await lesPaquets())
      .filter((p) => !p.livrable && !p.estDesTests && p.internes.length > LIMITE_ASSEMBLAGE)
      .map((p) => `${court(p.nom)} (${p.dossier}) dépend de ${p.internes.length} paquets : ${p.internes.map(court).join(", ")}`);
    expect(trop).toEqual([]);
  });

  it("le sous-système d'extensions a été retiré", async () => {
    const noms = new Set((await lesPaquets()).map((p) => p.nom));
    expect(RETIRES.filter((r) => noms.has(r)).map(court)).toEqual([]);
  });

  it("aucun paquet de la plateforme ne dépend d'un exemple ou d'une fixture", async () => {
    const inversees = (await lesPaquets())
      .filter((p) => !p.estDesTests)
      .flatMap((p) => p.internes.filter((d) => d === `${INTERNE}ext-tdd`).map((d) => `${court(p.nom)} → ${court(d)}`));
    expect(inversees).toEqual([]);
  });

  it("`extensions/*` n'est plus un emplacement du workspace", async () => {
    const yaml = await readFile(join(RACINE, "pnpm-workspace.yaml"), "utf8");
    const emplacements = yaml.split("\n").filter((l) => /^\s*-\s*"?extensions\//.test(l));
    expect(emplacements).toEqual([]);
  });
});
