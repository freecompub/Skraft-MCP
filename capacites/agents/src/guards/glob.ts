/**
 * Les motifs glob sont définis dans `@skraft-mcp/pile`, qui en a besoin pour la
 * disposition d'une pile. Réexportés ici pour le reste du cœur (ADR 0091 §3 : le détour par
 * `extension-api` est retiré).
 */
export { globToRegExp, matchesAny, matchesAnyIgnoringCase } from "@skraft-mcp/pile";
