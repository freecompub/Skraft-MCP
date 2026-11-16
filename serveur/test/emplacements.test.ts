/**
 * Où le serveur range ses données. Le nom a changé (ADR 0097) et l'ancien emplacement reste repris
 * s'il est le seul présent — mais en le **disant**, sinon le repli devient un domicile permanent et
 * la machine qui a besoin du renommage est précisément celle qui ne l'aura jamais.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANCIENNES_DONNEES, dossierDesDonnees } from "../src/emplacements.js";

const HOME = "/home/moi";
const NEUF = join(HOME, ".skraft");
const ANCIEN = join(HOME, ANCIENNES_DONNEES);
const presents = (...c: string[]) => (chemin: string) => c.includes(chemin);

describe("Le dossier de données du serveur (ADR 0097)", () => {
  it("rien sur le disque : le nouvel emplacement, sans repli", () => {
    expect(dossierDesDonnees(HOME, presents())).toEqual({ dossier: NEUF, repli: null });
  });

  it("le nouvel emplacement existe : il sert, sans repli", () => {
    expect(dossierDesDonnees(HOME, presents(NEUF))).toEqual({ dossier: NEUF, repli: null });
  });

  it("l'ancien seul : il sert, et le repli est signalé", () => {
    expect(dossierDesDonnees(HOME, presents(ANCIEN))).toEqual({ dossier: ANCIEN, repli: ANCIEN });
  });

  it("les deux : le nouveau l'emporte, et rien n'est signalé", () => {
    expect(dossierDesDonnees(HOME, presents(NEUF, ANCIEN))).toEqual({ dossier: NEUF, repli: null });
  });
});
