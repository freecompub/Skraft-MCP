/**
 * Confirmation par le client MCP (ADR 0075). Le serveur n'a pas de fenêtre ; le client peut poser une
 * question à l'utilisateur pour lui (elicitation), et la réponse vient de l'utilisateur, pas du LLM de
 * l'hôte. On ne suppose rien du client : il dit au démarrage s'il sait le faire. S'il ne le dit pas,
 * ou si la question n'aboutit pas, la réponse est « non » — le refus explique alors quoi corriger.
 */
import type { ConfirmAnswer, UserConfirmer } from "@skraft-mcp/agents";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export type ClientQuiDemande = Pick<Server, "getClientCapabilities" | "elicitInput">;
type FormulaireElicitation = Extract<Parameters<ClientQuiDemande["elicitInput"]>[0], { requestedSchema: unknown }>;

const REPONSES: Record<string, ConfirmAnswer> = { "Oui, cette fois": "allow-once", "Oui, toujours": "allow-always", Non: "deny" };
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** L'utilisateur peut mettre du temps à lire : le délai par défaut d'une requête (60 s) le couperait. */
const DELAI_MS = 10 * 60_000;

export function confirmerParLeClient(client: ClientQuiDemande): UserConfirmer & { peutDemander(): boolean; choisirHoteGithub(): Promise<string | null> } {
  const peutDemander = () => {
    const e = client.getClientCapabilities()?.elicitation as { form?: unknown; url?: unknown } | undefined;
    // Une capacité vide vaut formulaire (anciennes versions du protocole) ; l'adresse web seule ne suffit pas.
    return e !== undefined && (e.form !== undefined || e.url === undefined);
  };
  const demander = async (message: string, requestedSchema: FormulaireElicitation["requestedSchema"]) => {
    if (!peutDemander()) return null;
    try {
      return await client.elicitInput({ message, requestedSchema }, { timeout: DELAI_MS });
    } catch {
      return null;
    }
  };
  return {
    peutDemander,
    async confirm(req) {
      if (!peutDemander()) return "deny";
      try {
        const r = await client.elicitInput(
          {
            message: `${req.title}\n\n${req.detail}`,
            requestedSchema: { type: "object", properties: { reponse: { type: "string", title: "Réponse", enum: Object.keys(REPONSES) } }, required: ["reponse"] },
          },
          { timeout: DELAI_MS },
        );
        const reponse = r.action === "accept" ? r.content?.["reponse"] : undefined;
        return typeof reponse === "string" && Object.hasOwn(REPONSES, reponse) ? REPONSES[reponse]! : "deny";
      } catch {
        return "deny";
      }
    },
    async choisirHoteGithub() {
      const plateforme = await demander("Choisis où le runtime Copilot doit se connecter : GitHub.com ou GitHub Enterprise.", {
        type: "object",
        properties: { plateforme: { type: "string", title: "Plateforme GitHub", enum: ["GitHub.com", "GitHub Enterprise"] } },
        required: ["plateforme"],
      });
      if (plateforme?.action !== "accept") return null;
      const choix = plateforme.content?.["plateforme"];
      if (choix === "GitHub.com") return "github.com";
      if (choix !== "GitHub Enterprise") return null;
      const enterprise = await demander("Saisis le hostname de ton instance GitHub Enterprise, sans protocole ni chemin.", {
        type: "object",
        properties: { hostname: { type: "string", title: "Hostname Enterprise", minLength: 1, maxLength: 253 } },
        required: ["hostname"],
      });
      const hostname = enterprise?.action === "accept" ? enterprise.content?.["hostname"] : undefined;
      return typeof hostname === "string" && HOSTNAME.test(hostname) ? hostname : null;
    },
  };
}
