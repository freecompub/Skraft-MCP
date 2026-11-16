import { readFile } from "node:fs/promises";
import { z } from "zod";

/**
 * Configuration posée par l'administrateur (§12) : **les programmes qu'une pile peut lancer**, et
 * s'ils peuvent être soumis à l'utilisateur. Rien d'autre (ADR 0095). Lue depuis un emplacement
 * système que l'utilisateur ne modifie pas ; le serveur ne l'écrit jamais.
 *
 * Les clés que ce dépôt a retirées — `profile` (ADR 0087), `trustedPublishers`, `revocation`,
 * `developerMode` (ADR 0091 §3), `permissionPolicy`, `defaultMode` (ADR 0095) — sont **ignorées**,
 * jamais refusées : un poste administré les porte encore, et un refus n'autoriserait plus aucun
 * programme.
 */
/**
 * Programmes qu'un profil de stack peut nommer sans que l'administrateur intervienne (D47, O12).
 *
 * Un profil vient du dépôt du projet, donc d'un fichier que l'agent peut modifier : sans cette
 * liste, il ferait exécuter n'importe quoi. N'y figurent que des lanceurs de tests, des linters,
 * des outils de format et de mutation — jamais un interpréteur (`bash`, `node`), un client réseau
 * (`curl`) ni un outil capable d'écrire hors du projet.
 */
export const DEFAULT_ALLOWED_PROGRAMS = [
  // tests
  "pytest", "go", "cargo", "gradle", "mvn", "dotnet", "vitest", "jest", "phpunit", "rspec",
  // qualité de forme
  "eslint", "ruff", "flake8", "pylint", "ktlint", "rubocop", "phpcs",
  // format (ADR 0071) ; `dotnet format`, `cargo fmt`, `ruff format` passent par leur programme
  "prettier",
  // mutation
  "stryker", "mutmut", "pitest",
] as const;

/** Un nom de commande, jamais un chemin : `./x` ou `/usr/bin/x` échapperaient à la liste. */
const nomDeProgramme = z
  .string()
  .min(1)
  .refine((v) => !/[/\\]/.test(v) && v !== "." && v !== "..", "doit être un nom de commande, sans chemin");

const schema = z.object({
  /** Remplace la liste par défaut — un poste administré doit pouvoir restreindre, pas seulement élargir. */
  allowedPrograms: z.array(nomDeProgramme).optional(),
  /** L'utilisateur peut-il accepter un programme hors de la liste, quand on le lui demande (ADR 0075) ? */
  programConsent: z.boolean().default(true),
});

export interface AdminConfig {
  /** Chemin du fichier lu, ou « défaut ». */
  source: string;
  /** Programmes qu'un profil de stack peut lancer (D47, O12). */
  allowedPrograms: string[];
  /** D'où vient cette liste, en une phrase à citer quand un programme est refusé (09/11). */
  origineDesProgrammes: string;
  /** L'utilisateur peut accepter un programme hors de la liste, si on peut le lui demander (ADR 0075). */
  programConsent: boolean;
  error?: string;
}

export function defaultAdminConfigPath(platform: NodeJS.Platform, env: Record<string, string | undefined>): string {
  if (env["SKRAFT_ADMIN_CONFIG"]) return env["SKRAFT_ADMIN_CONFIG"];
  // L'ancien nom reste lu (ADR 0097) : un poste administré le porte peut-être, et le refuser
  // n'autoriserait plus aucun programme — même raisonnement qu'à l'ADR 0095 pour les clés retirées.
  if (env["AGENT_STUDIO_ADMIN_CONFIG"]) return env["AGENT_STUDIO_ADMIN_CONFIG"];
  if (platform === "win32") return `${env["ProgramData"] ?? "C:\\ProgramData"}\\skraft\\admin.json`;
  if (platform === "darwin") return "/Library/Application Support/skraft/admin.json";
  return "/etc/skraft/admin.json";
}

export async function loadAdminConfig(path: string): Promise<AdminConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    // Poste personnel sans administration : la politique la plus souple.
    return {
      source: "défaut",
      allowedPrograms: [...DEFAULT_ALLOWED_PROGRAMS],
      programConsent: true,
      origineDesProgrammes: `Liste par défaut : aucun fichier d'administration à ${path}. Pour la changer, y écrire \`allowedPrograms\` (qui remplace la liste par défaut, sans s'y ajouter), ou désigner un autre fichier par la variable SKRAFT_ADMIN_CONFIG.`,
    };
  }
  let parsed: z.infer<typeof schema>;
  try {
    const r = schema.safeParse(JSON.parse(raw));
    if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "));
    parsed = r.data;
  } catch (err) {
    // Fichier présent mais illisible : la politique la plus restreinte, jamais la plus permissive.
    // Configuration refusée : on n'autorise aucun programme. Retomber sur la liste par défaut
    // appliquerait des permissions que l'administrateur n'a pas relues.
    const error = err instanceof Error ? err.message : String(err);
    return { source: path, allowedPrograms: [], programConsent: false, origineDesProgrammes: `${path} est refusé (${error}) : aucun programme n'est autorisé.`, error };
  }
  return {
    source: path,
    // Le fichier remplace la liste ; sans mention, celle par défaut s'applique.
    allowedPrograms: parsed.allowedPrograms ?? [...DEFAULT_ALLOWED_PROGRAMS],
    programConsent: parsed.programConsent,
    origineDesProgrammes: parsed.allowedPrograms
      ? `Liste de \`allowedPrograms\` dans ${path} ; elle remplace la liste par défaut, qui ne s'applique donc pas.`
      : `Liste par défaut : ${path} ne contient pas \`allowedPrograms\`. L'y ajouter remplace la liste par défaut, sans s'y ajouter.`,
  };
}
