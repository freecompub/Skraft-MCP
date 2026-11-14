/**
 * La pile du projet, telle que le dépôt la déclare (ADR 0071, 0074) : où est son profil, ce qu'il
 * faut en dire, les piles de ses composants, et les programmes qu'il faut faire accepter avant de
 * les lancer (ADR 0075).
 *
 * Extrait de `project-services/src/workspace-services.ts` par l'ADR 0091 §2 : lire la pile d'un
 * projet est une capacité, pas de l'assemblage.
 */
import { accessSync, constants as fsConstants } from "node:fs";
import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { ConfirmAnswer, Logger, UserConfirmer } from "@skraft-mcp/agents";
import {
  FICHIER_PROJET,
  createComposedAdapter,
  createProfileAdapter,
  lireFichierProjet,
  parseStackProfile,
  programmesDuProfil,
  selectStackAdapter,
  type Composant,
  type ComposantDeclare,
  type ParseOptions,
  type StackAdapter,
  type StackProfile,
} from "@skraft-mcp/pile";
import type { ProgrammesAcceptes } from "./programmes-acceptes.js";
import type { ProfilDeclare } from "./stack-command.js";

/** Les profils en YAML d'une source : sa section pile, ou la pile de chacun de ses composants. */
export function brutsDuProfil(src: SourceDuProfil | null): string[] {
  if (!src) return [];
  if (src.composants) return src.composants.map((c) => c.pile);
  return src.brut !== null ? [src.brut] : [];
}

/**
 * Programmes que la pile nomme hors de la liste de l'administrateur (ADR 0075) : acceptés s'ils l'ont
 * été « toujours » pour ce projet, sinon demandés à l'utilisateur s'il y a quelqu'un à qui demander.
 * Rend la liste élargie de ceux-là ; le profil est ensuite jugé contre elle, comme avant. Un nom avec
 * un chemin n'est jamais demandé : il échapperait à la liste. Inactif, la liste seule.
 */
export async function accepterLesProgrammes(o: {
  root: string;
  bruts: readonly string[];
  programmes: ParseOptions;
  actif: boolean;
  acceptes: ProgrammesAcceptes;
  /** Acceptés « cette fois » pendant la vie de ces services. */
  acceptesCetteFois: Set<string>;
  confirmer?: UserConfirmer;
  onPost: (extensionId: string, markdown: string) => void;
  logger?: Logger;
}): Promise<ParseOptions> {
  if (!o.actif) return o.programmes;
  const nommes = o.bruts.flatMap(programmesDuProfil);
  const hors = [...new Set(nommes.map((n) => n.programme))].filter((p) => !o.programmes.allowedPrograms.includes(p) && !/[/\\]/.test(p) && p !== "." && p !== "..");
  const ajoutes: string[] = [];
  for (const programme of hors) {
    if (o.acceptesCetteFois.has(programme) || (await o.acceptes.accepte(o.root, programme))) {
      ajoutes.push(programme);
      continue;
    }
    if (!o.confirmer) continue;
    const commandes = nommes.filter((n) => n.programme === programme).map((n) => `${n.section} : ${n.commande.join(" ")}`);
    let reponse: ConfirmAnswer;
    try {
      reponse = await o.confirmer.confirm({
        title: `Autoriser « ${programme} » pour ce projet ?`,
        detail: [
          `La pile du projet lance « ${programme} », qui n'est pas dans la liste des programmes autorisés :`,
          ...commandes,
          ...(o.programmes.origine ? [o.programmes.origine] : []),
          "Accepté, il s'exécutera sans shell, dans le projet, aux portes de test, de lint, de format ou de mutation, avec les droits de l'utilisateur, réseau compris. « Toujours » le retient pour ce projet.",
        ].join("\n"),
      });
    } catch {
      reponse = "deny";
    }
    // Chaque accord est journalisé (ADR 0075), refus compris.
    o.logger?.info("programme hors liste", { root: o.root, programme, reponse });
    if (reponse === "deny") continue;
    if (reponse === "allow-always") await o.acceptes.ajouter(o.root, programme);
    o.acceptesCetteFois.add(programme);
    ajoutes.push(programme);
    o.onPost("agent-studio", `« ${programme} » accepté par l'utilisateur pour ce projet (${reponse === "allow-always" ? "toujours" : "cette fois"}).`);
  }
  return ajoutes.length ? { ...o.programmes, allowedPrograms: [...o.programmes.allowedPrograms, ...ajoutes] } : o.programmes;
}

/** Ancien emplacement du profil (avant l'ADR 0071), relu le temps de la transition. */
export const PROFIL_PROJET = ".agent-studio/stack.yaml";

/** Où est le profil de pile du projet, et ce qu'il faut en dire (ADR 0071). */
interface SourceDuProfil {
  /** Nom à donner dans les messages : `projet.yaml` (section pile) ou l'ancien `stack.yaml`. */
  libelle: string;
  /** Profil en YAML ; `null` : le fichier de projet n'a pas de section `pile`. */
  brut: string | null;
  /** Composants déclarés (ADR 0074), à la place de la section `pile`. */
  composants?: ComposantDeclare[];
  erreur?: string;
  avertissements: string[];
}

export async function lireOuNul(chemin: string): Promise<string | null> {
  try {
    return await readFile(chemin, "utf8");
  } catch {
    return null;
  }
}

/** `projet.yaml` fait foi (ADR 0071) ; sinon l'ancien `stack.yaml`, avec un avertissement. */
export async function lireSourceDuProfil(root: string): Promise<SourceDuProfil | null> {
  const projet = await lireOuNul(join(root, FICHIER_PROJET));
  const ancien = await lireOuNul(join(root, PROFIL_PROJET));
  if (projet !== null) {
    const avertissements = ancien !== null ? [`\`${PROFIL_PROJET}\` est ignoré : \`${FICHIER_PROJET}\` fait foi, supprime-le (ADR 0071).`] : [];
    const p = lireFichierProjet(projet);
    if ("error" in p) return { libelle: `\`${FICHIER_PROJET}\``, brut: null, erreur: p.error, avertissements };
    if (p.composants) return { libelle: `\`${FICHIER_PROJET}\` (section composants)`, brut: null, composants: p.composants, avertissements };
    return { libelle: `\`${FICHIER_PROJET}\` (section pile)`, brut: p.pile ?? null, avertissements };
  }
  if (ancien !== null)
    return { libelle: `\`${PROFIL_PROJET}\``, brut: ancien, avertissements: [`Profil de pile lu dans \`${PROFIL_PROJET}\` : regroupe-le dans \`${FICHIER_PROJET}\`, section pile (ADR 0071).`] };
  return null;
}

/**
 * Lit le profil déclaré par le projet, s'il existe. Un profil refusé n'interrompt pas
 * l'ouverture : il est expliqué à l'utilisateur — champ et valeur fautive nommés — et la
 * détection habituelle reprend la main. Le fichier vient du dépôt, donc d'une source que
 * l'agent peut modifier : les programmes qu'il nomme sont soumis à la liste de l'administrateur.
 */
export async function lireProfilDeclare(root: string, programmes: ParseOptions): Promise<ProfilDeclare> {
  const src = await lireSourceDuProfil(root);
  if (!src) return null; // pas de profil : la détection s'applique, sans rien dire
  if (src.erreur) return { error: src.erreur };
  if (src.composants) {
    const lu = profilsDesComposants(src.composants, programmes);
    return "error" in lu ? { error: `${src.libelle}, ${lu.error}` } : lu;
  }
  if (src.brut === null) return null;
  const lu = parseStackProfile(src.brut, programmes);
  return "error" in lu ? { error: `${src.libelle} : ${lu.error}` } : lu;
}

/** Pile du projet, et ses composants quand il en déclare (ADR 0074). */
interface PileDuProjet {
  adapter: StackAdapter;
  composants?: { nom: string; racine: string; id: string }[];
}

export async function lireProfilDuProjet(
  root: string,
  programmes: ParseOptions,
  onPost: (extensionId: string, markdown: string) => void,
  logger?: Logger,
): Promise<PileDuProjet | null> {
  const src = await lireSourceDuProfil(root);
  for (const a of src?.avertissements ?? []) onPost("agent-studio", a);
  const lu = await lireProfilDeclare(root, programmes);
  if (lu === null) return null;
  if ("error" in lu) {
    logger?.warn("profil de stack refusé", { root, error: lu.error });
    onPost("agent-studio", `**Le profil de stack du projet est refusé.** ${lu.error}\n\nL'application se rabat sur la détection automatique ; corrigez ${src?.libelle ?? `\`${FICHIER_PROJET}\``} puis rouvrez le projet.`);
    return null;
  }
  if ("composants" in lu) return pileComposee(lu.composants);
  return { adapter: createProfileAdapter(lu.profile) };
}

/** Composants (ADR 0074) : chaque pile validée comme une pile seule, contre la liste de l'administrateur ; une seule refusée suffit. */
export function profilsDesComposants(declares: readonly ComposantDeclare[], programmes: ParseOptions): { composants: { nom: string; racine: string; profile: StackProfile }[] } | { error: string } {
  const composants = [];
  for (const c of declares) {
    // Depuis la racine du composant : ses outils peuvent viser le `node_modules` partagé du monorepo.
    const lu = parseStackProfile(c.pile, { ...programmes, racine: c.racine });
    if ("error" in lu) return { error: `composant « ${c.nom} » : ${lu.error}` };
    composants.push({ nom: c.nom, racine: c.racine, profile: lu.profile });
  }
  return { composants };
}

/** Un adaptateur composé, et ce que la pile dit de ses composants. */
export function pileComposee(profils: readonly { nom: string; racine: string; profile: StackProfile }[]): PileDuProjet {
  const composants: Composant[] = profils.map((c) => ({ nom: c.nom, racine: c.racine, adapter: createProfileAdapter(c.profile) }));
  return { adapter: createComposedAdapter(composants), composants: composants.map((c) => ({ nom: c.nom, racine: c.racine, id: c.adapter.id })) };
}

/** Le programme est-il lançable ? Recherche dans le PATH, sans exécuter quoi que ce soit. */
export function dansLePath(programme: string, path = process.env["PATH"]): boolean {
  const chemins = (path ?? "").split(delimiter).filter(Boolean);
  const suffixes = process.platform === "win32" ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const base of chemins)
    for (const suffixe of suffixes) {
      try {
        accessSync(join(base, `${programme}${suffixe}`), fsConstants.X_OK);
        return true;
      } catch {
        /* pas ici : on continue */
      }
    }
  return false;
}
