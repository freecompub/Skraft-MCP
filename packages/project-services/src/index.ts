/**
 * Assemblage des services d'un projet ouvert. La pile du projet est dans `@skraft-mcp/pile-projet`
 * (ADR 0091 §2) ; cette racine de composition rejoindra le serveur, son seul consommateur.
 */
export type * from "./protocols.js";
export * from "./dto.js";
export { AucunePile, workspaceServicesFactory, toTaskCard, type ExtensionSource, type WorkspaceServicesConfig } from "./workspace-services.js";
export { DEFAULT_ALLOWED_PROGRAMS, defaultAdminConfigPath, loadAdminConfig, type AdminConfig } from "./admin-config.js";
