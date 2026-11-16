/**
 * Connexion à GitHub sans fenêtre (ADR 0068, point 7), par `gh` comme l'application
 * (`@skraft-mcp/github`). Le flux d'appareil dure le temps que l'utilisateur valide dans son
 * navigateur : `connecter()` le lance et rend aussitôt le code et l'adresse ; l'appel suivant dit où
 * il en est. Le jeton ne va qu'au runtime : il n'apparaît dans aucune réponse.
 */
import type { AgentRuntime } from "@skraft-mcp/agents";
import type { AuthStatus, DeviceCode, GitHubAuth } from "@skraft-mcp/github";

export type FabriqueRuntime = (jeton: string, hostname: string) => AgentRuntime;

export interface Connexion {
  /** Connexion utilisable par Copilot, ou ce qu'il faut faire. */
  verifier(): Promise<{ ok: true } | { ok: false; motif: string }>;
  /** Outil `skraft_connexion` : lance le flux, ou dit où il en est. */
  connecter(hostname?: string): Promise<{ ok: boolean; texte: string }>;
  /** Runtime démarré une fois, au premier besoin, avec le jeton courant. */
  runtime(fabrique: FabriqueRuntime): () => Promise<AgentRuntime>;
}

export function createConnexion(auth: GitHubAuth): Connexion {
  let flux: { code: DeviceCode; termine: boolean; erreur?: string } | null = null;

  async function verifier(): Promise<{ ok: true } | { ok: false; motif: string }> {
    const s = await auth.status();
    if (!s.loggedIn) return { ok: false, motif: `Non connecté à GitHub (${s.hostname}) : appelle skraft_connexion.` };
    if (!s.copilotCompatible)
      return {
        ok: false,
        motif: "La connexion GitHub utilise un jeton personnel classique, refusé par Copilot : appelle skraft_connexion pour te reconnecter par le navigateur.",
      };
    return { ok: true };
  }

  const consigne = (c: DeviceCode) =>
    `Ouvre ${c.verificationUrl} et saisis le code ${c.code}, puis rappelle skraft_connexion pour vérifier la connexion.`;

  async function lancer(hostname?: string): Promise<{ ok: boolean; texte: string }> {
    const resultat = await new Promise<{ code: DeviceCode } | { status: AuthStatus }>((resolve, reject) => {
      let codeEmis = false;
      const onCode = (code: DeviceCode) => {
        codeEmis = true;
        flux = { code, termine: false };
        resolve({ code });
      };
      auth.login(onCode, hostname ? { hostname } : undefined).then(
        (s: AuthStatus) => {
          if (flux) flux.termine = true;
          if (!s.loggedIn && flux) flux.erreur = "la connexion n'a pas abouti";
          if (!codeEmis) resolve({ status: s });
        },
        (e: unknown) => {
          const motif = e instanceof Error ? e.message : String(e);
          if (flux) {
            flux.termine = true;
            flux.erreur = motif;
          } else reject(e);
        },
      );
    });
    if ("status" in resultat) {
      flux = null;
      return resultat.status.loggedIn
        ? { ok: true, texte: `Déjà connecté à GitHub (${resultat.status.hostname}) en tant que ${resultat.status.user}.` }
        : { ok: false, texte: `La connexion à GitHub (${hostname ?? auth.hostname()}) n'a pas abouti. Rappelle skraft_connexion pour recommencer.` };
    }
    return { ok: true, texte: `Connexion à GitHub (${hostname ?? auth.hostname()}) lancée. ${consigne(resultat.code)}` };
  }

  return {
    verifier,
    async connecter(hostname) {
      if (flux && !flux.termine) return { ok: true, texte: `Connexion en attente de validation. ${consigne(flux.code)}` };
      if (flux?.erreur) {
        const motif = flux.erreur;
        flux = null;
        return { ok: false, texte: `La connexion à GitHub a échoué : ${motif}. Rappelle skraft_connexion pour recommencer.` };
      }
      const etaitEnCours = flux !== null;
      flux = null;
      if (hostname && hostname !== auth.hostname()) return lancer(hostname);
      const v = await verifier();
      if (v.ok) {
        const s = (await auth.status()) as Extract<AuthStatus, { loggedIn: true }>;
        return { ok: true, texte: etaitEnCours ? `Connecté à GitHub (${s.hostname}) en tant que ${s.user}.` : `Déjà connecté à GitHub (${s.hostname}) en tant que ${s.user}.` };
      }
      return lancer(hostname);
    },
    runtime: (fabrique) =>
      runtimeParesseux(verifier, async () => {
        const rt = fabrique(await auth.token(), auth.hostname());
        await rt.start();
        return rt;
      }),
  };
}

/**
 * Runtime démarré une fois, au premier besoin, après vérification de la connexion ; un échec n'est
 * pas retenu : l'appel suivant, après connexion, réessaie. Commun aux runtimes Copilot et Claude.
 */
export function runtimeParesseux(verifier: () => Promise<{ ok: true } | { ok: false; motif: string }>, creer: () => Promise<AgentRuntime>): () => Promise<AgentRuntime> {
  let demarrage: Promise<AgentRuntime> | null = null;
  return () => {
    demarrage ??= (async () => {
      const v = await verifier();
      if (!v.ok) throw new Error(v.motif);
      return creer();
    })().catch((e: unknown) => {
      demarrage = null;
      throw e;
    });
    return demarrage;
  };
}
