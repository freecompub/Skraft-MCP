/**
 * Le produit s'appelle **skraft**, partout (ADR 0096 puis 0097). L'ADR 0096 avait gardé les
 * identifiants — chemins, variables d'environnement, noms de protocole — au motif qu'un renommage
 * casserait l'existant. **Cette raison était fausse, et personne ne l'avait vérifiée** : rien n'était
 * publié (aucun paquet npm, aucun tag, `private: true`), il existait deux dossiers `.agent-studio`
 * sur la seule machine concernée, aucun poste administré et aucune ref de checkpoint. L'ADR 0097 a
 * donc tout renommé, au dernier moment où c'était gratuit.
 *
 * Ce qui reste est une **liste close de replis** : les emplacements abandonnés que le code lit encore
 * pour qu'une configuration déjà posée ne devienne pas muette sans le dire. Chacun est déclaré avec
 * sa raison. Un repli qui n'est plus lu se signale au lieu de rester.
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
const ANCIEN = /agent[-_]studio/i;

/** Le nom employé **comme mot**, et non collé à un séparateur : il ne doit plus rester nulle part. */
const COMME_MOT = /(^|[^./\\@\w-])agent-studio($|[^./\\@\w-])/i;

/**
 * Les replis : emplacements abandonnés que le code lit encore, et rien d'autre. Chacun porte la
 * raison pour laquelle le supprimer coûterait plus que le garder.
 */
const REPLIS: readonly { fichier: string; valeur: string; pourquoi: string }[] = [
  { fichier: "serveur/src/admin-config.ts", valeur: "AGENT_STUDIO_ADMIN_CONFIG", pourquoi: "un poste administré porte peut-être l'ancienne variable ; la refuser n'autoriserait plus aucun programme (ADR 0095)" },
  { fichier: "serveur/src/config.ts", valeur: ".agent-studio", pourquoi: "ancien dossier de `mcp-skraft.json` : une configuration posée à la main ne doit pas devenir muette en silence" },
  { fichier: "serveur/src/emplacements.ts", valeur: ".agent-studio", pourquoi: "ancien dossier de données : des runs et des verrous vivants y sont peut-être encore" },
  { fichier: "capacites/pile-du-projet/src/profil-du-projet.ts", valeur: ".agent-studio/projet.yaml", pourquoi: "fichier de projet avant l'ADR 0097, lu avec un avertissement qui dit où le déplacer" },
  { fichier: "capacites/pile-du-projet/src/profil-du-projet.ts", valeur: ".agent-studio/stack.yaml", pourquoi: "profil nu d'avant l'ADR 0071, déjà déprécié avant ce renommage" },
  { fichier: "capacites/pile/src/profile/quality-bar.ts", valeur: ".agent-studio/quality.yaml", pourquoi: "barre de qualité d'avant l'ADR 0071, déjà dépréciée avant ce renommage" },
  { fichier: "workflows/skraft/livraison-socle.mjs", valeur: ".agent-studio/quality.yaml", pourquoi: "le workflow lit la même chaîne que le serveur, sinon un projet non migré perdrait sa barre" },
  { fichier: "workflows/skraft/livraison-socle.mjs", valeur: ".agent-studio/projet.yaml", pourquoi: "idem pour le fichier de projet" },
  { fichier: "workflows/skraft/support.mjs", valeur: ".agent-studio/quality.yaml", pourquoi: "gelé pendant un run : un agent ne doit pas pouvoir abaisser sa barre, même à l'ancien emplacement" },
  { fichier: "workflows/skraft/support.mjs", valeur: ".agent-studio/projet.yaml", pourquoi: "idem" },
  // skraft-light (ADR 0098) reprend ces deux modules : mêmes replis, mêmes raisons.
  { fichier: "workflows/skraft-light/livraison-socle.mjs", valeur: ".agent-studio/quality.yaml", pourquoi: "copie de workflows/skraft (ADR 0098) : même chaîne lue que le serveur" },
  { fichier: "workflows/skraft-light/livraison-socle.mjs", valeur: ".agent-studio/projet.yaml", pourquoi: "idem pour le fichier de projet" },
  { fichier: "workflows/skraft-light/support.mjs", valeur: ".agent-studio/quality.yaml", pourquoi: "copie de workflows/skraft (ADR 0098) : gelé pendant un run, même à l'ancien emplacement" },
  { fichier: "workflows/skraft-light/support.mjs", valeur: ".agent-studio/projet.yaml", pourquoi: "idem" },
];

/**
 * Une déclaration autorise un **chemin** dans un fichier, pas une chaîne exacte : un avertissement
 * rendu à l'utilisateur cite le chemin au milieu d'une phrase, et c'est précisément son usage légitime.
 */
const declare = (fichier: string, valeur: string) => REPLIS.some((r) => r.fichier === fichier && valeur.includes(r.valeur));

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

const releve = async (): Promise<{ fichier: string; valeur: string }[]> => {
  const out: { fichier: string; valeur: string }[] = [];
  for (const f of await fichiers(RACINE)) {
    const fichier = relative(RACINE, f);
    for (const valeur of chaines(f, await readFile(f, "utf8"))) if (ANCIEN.test(valeur)) out.push({ fichier, valeur });
  }
  return out;
};

describe("Le nom du produit (ADR 0096, 0097)", () => {
  it("le nom du produit n'est plus agent-studio nulle part", async () => {
    const fautes = (await releve())
      .filter((r) => COMME_MOT.test(r.valeur))
      .map((r) => `${r.fichier} : ${JSON.stringify(r.valeur)}`);
    expect(fautes).toEqual([]);
  });

  it("l'ancien nom ne subsiste que dans les replis déclarés", async () => {
    const fautes = (await releve())
      .filter((r) => !declare(r.fichier, r.valeur))
      .map((r) => `${r.fichier} : ${JSON.stringify(r.valeur.length > 80 ? `${r.valeur.slice(0, 79)}…` : r.valeur)}`);
    expect([...new Set(fautes)]).toEqual([]);
  });

  it("chaque repli déclaré est encore lu par le fichier qui le déclare", async () => {
    const morts: string[] = [];
    for (const r of REPLIS) {
      const texte = await readFile(join(RACINE, r.fichier), "utf8").catch(() => "");
      if (!chaines(r.fichier, texte).some((v) => v.includes(r.valeur))) morts.push(`${r.fichier} : ${r.valeur}`);
    }
    expect(morts).toEqual([]);
  });
});
