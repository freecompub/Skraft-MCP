/**
 * Les motifs glob sont définis dans `@skraft-mcp/extension-api` : une extension doit pouvoir
 * s'en servir sans dépendre du cœur (D10). Réexporté ici pour le reste du cœur.
 */
export { globToRegExp, matchesAny, matchesAnyIgnoringCase } from "@skraft-mcp/extension-api";
