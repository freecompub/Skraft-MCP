/**
 * Les chemins que le code du dépôt écrit en dur doivent désigner quelque chose qui existe
 * (ADR 0094). L'ADR 0091 a renommé `apps/mcp-skraft` en `serveur` et dissous `packages/` : un
 * chemin resté sur l'ancienne arborescence ne casse aucune compilation, aucun test, et ne se
 * découvre qu'à l'exécution — `scripts/essai-mcp-skraft.ts` a lancé `apps/mcp-skraft/dist/main.mjs`
 * pendant un jour sans que rien ne le signale, jusqu'à ce qu'un essai réel refuse de démarrer.
 *
 * Les chaînes sont relevées par le parseur TypeScript, jamais par une expression régulière : une
 * chaîne et un commentaire ne se distinguent pas de façon fiable à la regex, et c'est précisément
 * l'erreur qui a coûté quatre passes au découpage de `livraison.mjs`. Un commentaire n'est pas un
 * nœud de chaîne : la provenance héritée d'agent-studio (`apps/desktop/...`) passe donc d'elle-même,
 * comme elle le doit — elle raconte le passé, elle ne l'adresse pas.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "../../..");
const IGNORES = new Set(["node_modules", ".git", "dist", "coverage"]);

/**
 * La garde ne regarde que le code qui tourne en production. Le workflow est la charge utile et les
 * tests sont des simulations : les uns et les autres parlent du dépôt de l'utilisateur, pas du
 * nôtre — `apps/web`, `src/ancien.ts`, `stories/us-12.md` y sont des fixtures légitimes, et
 * `packages/` un dossier de modules que le workflow doit savoir reconnaître ailleurs.
 */
const HORS_GARDE = new Set(["workflows", "test", "tests"]);

/** Dossiers de tête que l'ADR 0091 §3 a retirés : plus un seul chemin du code n'y mène. */
const RETIRES = ["apps", "packages", "extensions"];

/** Extensions dont un chemin doit résoudre : ce que le dépôt contient lui-même. */
const RESOLVABLES = /\.(ts|mjs|js|json|md)$/;

/** Dossiers produits par le build : présents ou non selon qu'on a construit, donc hors du second invariant. */
const PRODUITS = new Set(["dist", "node_modules", "coverage"]);

interface Chaine {
  readonly valeur: string;
  readonly ou: string;
}

/** Fichiers de code du dépôt qui tournent en production. */
async function sources(): Promise<readonly string[]> {
  const trouves: string[] = [];
  const marcher = async (dossier: string): Promise<void> => {
    for (const e of await readdir(dossier, { withFileTypes: true })) {
      if (IGNORES.has(e.name)) continue;
      if (e.isDirectory() && HORS_GARDE.has(e.name)) continue;
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) await marcher(chemin);
      else if (/\.(ts|mjs)$/.test(e.name)) trouves.push(chemin);
    }
  };
  await marcher(RACINE);
  return trouves;
}

/** Toutes les chaînes littérales d'un fichier, relevées à l'AST, avec leur ligne. */
function chaines(chemin: string, texte: string): readonly Chaine[] {
  const sf = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, false, chemin.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const trouvees: Chaine[] = [];
  const noter = (valeur: string, debut: number): void => {
    const { line } = sf.getLineAndCharacterOfPosition(debut);
    trouvees.push({ valeur, ou: `${relative(RACINE, chemin)}:${line + 1}` });
  };
  const visiter = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) noter(n.text, n.getStart(sf));
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) noter(n.text, n.getStart(sf));
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return trouvees;
}

/**
 * Un chemin du dépôt : relatif, sans joker ni gabarit, nommant un fichier que nous versionnons.
 *
 * Un chemin qui traverse un dossier **produit** (`dist/`) est écarté : son existence ne dit rien du
 * dépôt, seulement si l'on a construit. La CI, qui teste sans construire, a fait échouer la première
 * version de cette garde sur `serveur/dist/main.mjs` — un chemin juste. Ma machine la disait verte
 * parce que j'avais lancé `pnpm build` : le vert venait de mon poste, pas du dépôt.
 *
 * Ces chemins restent tenus par le premier invariant, qui n'a pas besoin du disque — et c'est bien
 * lui qui a relevé `apps/mcp-skraft/dist/main.mjs`.
 */
function estUnCheminDuDepot(v: string): boolean {
  if (!v.includes("/") || /[*{}:\s\\]/.test(v) || /^[./@~]/.test(v)) return false;
  if (v.split("/").some((seg) => PRODUITS.has(seg))) return false;
  return RESOLVABLES.test(v);
}

const existe = (v: string, depuis: string) => stat(join(depuis, v)).then(() => true, () => false);

/**
 * Le paquet d'où part un chemin écrit en dur : `serveur/scripts/build.mjs` dit « src/main.ts » pour
 * `serveur/src/main.ts`, pas pour la racine. Le plus proche `package.json` en remontant fait foi.
 */
async function paquetDe(fichier: string): Promise<string> {
  for (let d = dirname(fichier); d.startsWith(RACINE); d = dirname(d))
    if (await existe("package.json", d)) return d;
  return RACINE;
}

describe("chemins du dépôt (ADR 0094)", () => {
  it("aucun chemin du code ne mène à un dossier retiré par l'ADR 0091", async () => {
    const morts: string[] = [];
    for (const f of await sources())
      for (const c of chaines(f, await readFile(f, "utf8")))
        if (RETIRES.some((r) => c.valeur === r || c.valeur.startsWith(`${r}/`))) morts.push(`${c.ou} : « ${c.valeur} »`);
    expect(morts).toEqual([]);
  });

  it("chaque chemin de fichier écrit en dur existe dans le dépôt", async () => {
    const absents: string[] = [];
    for (const f of await sources()) {
      const depuis = await paquetDe(f);
      for (const c of chaines(f, await readFile(f, "utf8")))
        if (estUnCheminDuDepot(c.valeur) && !(await existe(c.valeur, depuis)) && !(await existe(c.valeur, RACINE)))
          absents.push(`${c.ou} : « ${c.valeur} »`);
    }
    expect(absents).toEqual([]);
  });
});
