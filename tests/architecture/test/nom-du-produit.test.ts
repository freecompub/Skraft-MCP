/**
 * Le nom du produit dans les textes est **skraft** (ADR 0096). Ce dépôt est issu d'agent-studio : le
 * mot y désigne encore deux choses très différentes, et une seule est un défaut.
 *
 * - Un **identifiant** — `~/.agent-studio/`, `.agent-studio/projet.yaml` dans le dépôt des projets,
 *   `AGENT_STUDIO_ADMIN_CONFIG`, `/etc/agent-studio/admin.json`, `refs/agent-studio/checkpoints`,
 *   l'en-tête `Editor-Version`, le nom du serveur MCP, l'identité Git des commits instantanés — est
 *   un contrat avec un disque, un dépôt ou un protocole. Le renommer casse l'existant : il reste, et
 *   la liste ci-dessous le dit pour chacun.
 * - Un **texte** lu par un agent ou par l'utilisateur ne nomme plus agent-studio. Le contrat
 *   d'exécution ajouté à chaque prompt disait « Fonctionnement dans agent-studio » : le code
 *   donnait au LLM un cadre faux, et rien ne le signalait.
 *
 * La garde ne regarde que les **chaînes** du code de production : un commentaire de provenance n'est
 * pas un nœud de chaîne, il passe donc de lui-même, comme pour l'ADR 0094.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const RACINE = resolve(import.meta.dirname, "../../..");
const IGNORES = new Set(["node_modules", ".git", "dist", "coverage", "docs", "test", "tests"]);
const SOURCES = /\.(ts|mjs|js)$/;

/** Le nom employé **comme mot** : ni `.agent-studio`, ni `agent-studio/x`, ni `agent-studio-x`, ni `agent-studio@`. */
const COMME_MOT = /(^|[^./\\@\w-])agent-studio($|[^./\\@\w-])/i;

/** Les identifiants gardés, chacun avec sa raison : un contrat qu'un renommage casserait. */
const IDENTIFIANTS: readonly { fichier: string; valeur: string; pourquoi: string }[] = [
  { fichier: "capacites/runtime-claude/src/claude-runtime.ts", valeur: "agent-studio", pourquoi: "nom du serveur MCP : les outils s'appellent `mcp__agent-studio__*` dans la session du CLI" },
  { fichier: "capacites/runtime-claude/src/relais.ts", valeur: "agent-studio", pourquoi: "même nom, côté serveur du relais" },
  { fichier: "capacites/github/src/gh-auth.ts", valeur: "Editor-Version: agent-studio", pourquoi: "en-tête envoyé à l'API Copilot, qui l'attend tel quel" },
  { fichier: "capacites/depot/src/git/cli-git-runner.ts", valeur: "agent-studio", pourquoi: "identité Git des commits instantanés déjà écrits dans les dépôts" },
];

const garde = (fichier: string, valeur: string) => IDENTIFIANTS.some((i) => i.fichier === fichier && i.valeur === valeur);

async function fichiers(dossier: string, acc: string[] = []): Promise<string[]> {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!IGNORES.has(e.name)) await fichiers(join(dossier, e.name), acc);
    } else if (SOURCES.test(e.name) && !/\.(test|spec)\./.test(e.name)) acc.push(join(dossier, e.name));
  }
  return acc;
}

/** Les chaînes du fichier, par le compilateur : un commentaire n'est pas un nœud de chaîne. */
function chaines(chemin: string, texte: string): string[] {
  const kind = chemin.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const src = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, false, kind);
  const trouvees: string[] = [];
  const visite = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) trouvees.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) trouvees.push(n.text);
    ts.forEachChild(n, visite);
  };
  ts.forEachChild(src, visite);
  return trouvees;
}

describe("Le nom du produit (ADR 0096)", () => {
  it("aucun texte du code ne nomme agent-studio, sauf les identifiants déclarés", async () => {
    const fautes: string[] = [];
    for (const f of await fichiers(RACINE)) {
      const rel = relative(RACINE, f);
      for (const v of chaines(f, await readFile(f, "utf8")))
        if (COMME_MOT.test(v) && !garde(rel, v)) fautes.push(`${rel} : ${JSON.stringify(v.length > 80 ? `${v.slice(0, 79)}…` : v)}`);
    }
    expect(fautes).toEqual([]);
  });

  it("chaque identifiant gardé est encore dans le fichier qui le déclare", async () => {
    const manquants: string[] = [];
    for (const i of IDENTIFIANTS) {
      const texte = await readFile(join(RACINE, i.fichier), "utf8").catch(() => "");
      if (!chaines(i.fichier, texte).includes(i.valeur)) manquants.push(`${i.fichier} : ${i.valeur}`);
    }
    expect(manquants).toEqual([]);
  });
});
