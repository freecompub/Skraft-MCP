import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function origineBdd(uri: string, line: number, root: string, base = "."): { file: string; line: number } {
  if (/^[a-z][a-z\d+.-]*:/i.test(uri) && !uri.startsWith("file:"))
    throw new Error(`Origine BDD « ${uri} » non résolue : utilisez une URI de fichier .feature, pas une URI classpath.`);
  const chemin = uri.startsWith("file://") ? fileURLToPath(uri) : decodeURI(uri.replace(/^file:/, ""));
  if (/^[A-Za-z]:/.test(chemin) && !isAbsolute(chemin))
    throw new Error(`Origine BDD hors du projet : « ${uri} ».`);
  const file = relative(root, resolve(root, base, chemin)).replaceAll("\\", "/");
  if (isAbsolute(file) || /^[A-Za-z]:/.test(file) || file.split("/").includes(".."))
    throw new Error(`Origine BDD hors du projet : « ${uri} ».`);
  if (!file.endsWith(".feature") || !Number.isInteger(line) || line < 1)
    throw new Error(`Origine BDD invalide : « ${uri}:${line} » ; fichier .feature et ligne à partir de 1 attendus.`);
  return { file, line };
}
