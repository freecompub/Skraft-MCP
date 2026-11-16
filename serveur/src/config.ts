/**
 * Configuration du serveur MCP (`~/.skraft.json`, ou `SKRAFT_MCP_CONFIG`) : les
 * dossiers où il accepte un projet en plus des roots du client (ADR 0068, point 6), et l'hôte
 * GitHub (point 7). Les programmes autorisés et la politique de permissions viennent d'`admin.json`, comme pour
 * l'application.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

/** Classes de rôle des agents (ADR 0048) et modèle choisi pour chacune. */
export type ModelesParClasse = Partial<Record<"strong" | "standard" | "light", string>>;

export interface ConfigurationServeur {
  autorises: string[];
  hostname: string;
  /** Runtime des agents (ADR 0070) : Copilot par défaut. */
  runtime: "copilot" | "claude";
  /** Modèle par classe de rôle ; absent : le défaut du runtime. */
  modeles: ModelesParClasse;
}

const schema = z
  .object({
    autorises: z.array(z.string().min(1)).default([]),
    hostname: z.string().min(1).max(253).default("github.com"),
    runtime: z.enum(["copilot", "claude"]).default("copilot"),
    modeles: z.object({ strong: z.string().min(1), standard: z.string().min(1), light: z.string().min(1) }).partial().strict().default({}),
  })
  .strict();

/** L'emplacement abandonné par l'ADR 0097, encore lu quand le nouveau n'existe pas. */
export const ANCIENNE_CONFIGURATION = join(".agent-studio", "mcp-skraft.json");

/**
 * `~/.skraft.json`, ou ce que `SKRAFT_MCP_CONFIG` désigne. À défaut du nouveau nom, l'ancien
 * `~/.agent-studio/mcp-skraft.json` est rendu s'il existe : une configuration posée à la main ne
 * devient pas muette sans le dire (ADR 0097).
 */
export function cheminConfiguration(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (env["SKRAFT_MCP_CONFIG"]) return env["SKRAFT_MCP_CONFIG"];
  const nouveau = join(home, ".skraft.json");
  if (existsSync(nouveau)) return nouveau;
  const ancien = join(home, ANCIENNE_CONFIGURATION);
  return existsSync(ancien) ? ancien : nouveau;
}

export async function lireConfiguration(fichier: string, o: { home?: string } = {}): Promise<{ ok: true; config: ConfigurationServeur } | { ok: false; motif: string }> {
  const home = o.home ?? homedir();
  let brut: string;
  try {
    brut = await readFile(fichier, "utf8");
  } catch {
    return { ok: true, config: { autorises: [], hostname: "github.com", runtime: "copilot", modeles: {} } };
  }
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch (e) {
    return { ok: false, motif: `Configuration illisible (${fichier}) : ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, motif: `Configuration refusée (${fichier}) : ${r.error.issues.map((i) => `${i.path.join(".") || "racine"} : ${i.message}`).join(" ; ")}` };
  const autorises = r.data.autorises.map((a) => (a === "~" ? home : a.startsWith("~/") ? join(home, a.slice(2)) : a));
  const relatif = autorises.find((a) => !isAbsolute(a));
  if (relatif) return { ok: false, motif: `Configuration refusée (${fichier}) : « ${relatif} » n'est pas un chemin absolu.` };
  const modeles = Object.fromEntries(Object.entries(r.data.modeles).filter(([, v]) => v !== undefined)) as ModelesParClasse;
  return { ok: true, config: { autorises, hostname: r.data.hostname, runtime: r.data.runtime, modeles } };
}
