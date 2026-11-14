/**
 * La pile d'un projet : la trouver, la déclarer, la vérifier, l'écrire (ADR 0071, 0074, 0076).
 * Ce paquet ne connaît ni l'hôte qui l'appelle, ni le serveur MCP.
 */
export * from "./profil-du-projet.js";
export { createStackCommand, type ProfilDeclare, type StackCommandDeps } from "./stack-command.js";
export { createDecouverteParAgent, ROLE_DECOUVREUR } from "./decouverte-de-pile-agent.js";
export {
  ESSAIS_DE_DECOUVERTE,
  indicesPourLAgent,
  verifierPiles,
  type Decouverte,
  type DemandeDecouverte,
  type PileProposee,
  type PileVerifiee,
  type ReponseDecouverte,
} from "./decouverte-de-pile.js";
export { createProgrammesAcceptesFichier, type ProgrammesAcceptes } from "./programmes-acceptes.js";
