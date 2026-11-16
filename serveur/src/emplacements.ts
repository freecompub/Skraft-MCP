/**
 * Où le serveur range ses données, et où il les cherchait avant (ADR 0097). PUR : rien que des
 * chemins et deux tests d'existence, pour que l'assemblage n'ait pas à décider cela lui-même.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** L'emplacement abandonné par l'ADR 0097, encore repris quand le nouveau n'existe pas. */
export const ANCIENNES_DONNEES = join(".agent-studio", "mcp-skraft");

/**
 * `~/.skraft`, ou l'ancien `~/.agent-studio/mcp-skraft` s'il est le seul présent. `repli` dit
 * lequel a servi : un repli qui ne se signale pas devient un domicile permanent, et le renommage
 * n'aurait jamais lieu sur la machine qui en a besoin.
 */
export function dossierDesDonnees(home: string, existe: (c: string) => boolean = existsSync): { dossier: string; repli: string | null } {
  const nouveau = join(home, ".skraft");
  if (existe(nouveau)) return { dossier: nouveau, repli: null };
  const ancien = join(home, ANCIENNES_DONNEES);
  return existe(ancien) ? { dossier: ancien, repli: ancien } : { dossier: nouveau, repli: null };
}
