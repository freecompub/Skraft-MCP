// Extrait de livraison.mjs le 2026-11-14 ; provenance : extensions/skraft-workflow/src/livraison.ts (ADR 0055).
/**
* Arbitrages de fin de DELIVER : un mutant jugé équivalent (ADR 0065) ou une ligne non couverte
* contestée par le testeur sont soumis à un arbitre, puis à l'humain ; les dérogations obtenues
* sortent des portes et sont rapportées.
*
* Extrait de `livraison.mjs` (2026-11-14), sans changement de logique.
*/
import { TourInterrompu } from "@skraft-mcp/workflow";
import { elementDe, memeMutant } from "./livraison-socle.mjs";
/** Au-delà, l'arbitre ne peut plus exempter de mutant : l'humain tranche (ADR 0065). */
const MAX_DEROGATIONS_PAR_ARBITRE = 2;

/**
* Mutants survivants contestés par le testeur (mutant équivalent) : l'arbitre de mutation juge, et
* l'humain tranche s'il refuse ou si le plafond de ses dérogations est atteint. Chaque décision est
* tracée ; une dérogation exempte ce seul mutant de la porte (ADR 0065).
*/
export async function arbitrerMutants(w, d, s) {
  const contestes = s.fils.filter((t) => t.mutant && (t.status === "contested" || t.status === "recontested"));
  if (!contestes.length)
    return;
  const statut = (t, status) => (s.fils = s.fils.map((x) => (x.id === t.id ? { ...x, status } : x)));
  // Déjà exempté (correction reprise après un échec) : rien à rejuger.
  const aJuger = [];
  for (const t of contestes)
    if (d.derogations.some((x) => memeMutant(x, t.mutant)))
      statut(t, "accepted");
    else
      aJuger.push(t);
  if (!aJuger.length)
    return;
  await w.etape("ARBITRATION");
  const restants = MAX_DEROGATIONS_PAR_ARBITRE - d.derogations.filter((x) => x.par === "agent").length;
  const jugements = new Map();
  if (restants > 0) {
    // Un défaut de travail de l'arbitre (muet, délai) n'arrête rien : son silence laisse chaque
    // mutant à l'humain, comme dans l'extension (écart relevé dans docs/skraft-fonctionnement).
    try {
      const r = await w.agent("skraft-mutation-arbiter", await briefArbitre(w, d, aJuger));
      for (const j of r.sortie?.rulings ?? [])
        jugements.set(j.defect, j);
    }
    catch (e) {
      if (!(e instanceof TourInterrompu))
        throw e;
    }
  }
  let accordes = 0;
  for (const t of aJuger) {
    const j = jugements.get(t.id);
    if (j?.decision === "accepted" && accordes < restants) {
      accordes++;
      await accorder(w, d, t, "agent", j.reason ?? "");
      statut(t, "accepted");
      continue;
    }
    if (j?.decision === "maintained")
      await w.arbitrage({ porte: "mutation", élément: elementDe(t.mutant), contestation: t.contestation ?? "", décision: "à corriger", par: "agent", raison: j.reason ?? "" });
    const avis = !j
      ? `L'arbitre n'a pas été consulté ou n'a rien rendu (plafond de ${MAX_DEROGATIONS_PAR_ARBITRE} dérogations par l'arbitre).`
      : j.decision === "accepted"
        ? `L'arbitre le juge équivalent (${j.reason ?? "sans raison"}), mais le plafond de ${MAX_DEROGATIONS_PAR_ARBITRE} dérogations par l'arbitre est atteint.`
        : `L'arbitre le juge non équivalent : ${j.reason ?? "sans raison"}.`;
    const rep = await w.humain("arbitrer-mutation", `Arbitrer un mutant (${t.id})`, [
      { id: "derogation", label: "Mutant équivalent : accorder la dérogation" },
      { id: "corriger", label: "Non équivalent : le testeur doit le tuer" },
    ], {
      detail: `Mutant survivant : ${elementDe(t.mutant)}${t.mutant.replacement ? ` — code du mutant : ${t.mutant.replacement}` : ""}\n` +
        `Contestation du testeur : « ${t.contestation ?? "?"} »\n${avis}\nJustifie ta décision en commentaire : elle est tracée et commitée.`,
      texteLibre: true,
    });
    if (rep.decision === "derogation") {
      await accorder(w, d, t, "humain", rep.commentaire ?? "(sans justification)");
      statut(t, "humanAccepted");
    }
    else {
      await w.arbitrage({ porte: "mutation", élément: elementDe(t.mutant), contestation: t.contestation ?? "", décision: "à corriger", par: "humain", raison: rep.commentaire ?? "" });
      statut(t, "humanMaintained");
    }
  }
}

async function accorder(w, d, t, par, raison) {
  await w.arbitrage({ porte: "mutation", élément: elementDe(t.mutant), contestation: t.contestation ?? "", décision: "dérogation", par, raison });
  if (!d.derogations.some((x) => memeMutant(x, t.mutant)))
    d.derogations = [...d.derogations, { file: t.mutant.file, line: t.mutant.line, operator: t.mutant.operator, par, raison, contestation: t.contestation ?? "", defaut: t.id }];
}

/** Dossier de l'arbitre : chaque mutant contesté, la contestation, et le code des fichiers mutés. */
async function briefArbitre(w, d, fils) {
  const fichiers = [...new Set(fils.map((t) => t.mutant.file))];
  const codes = [];
  for (const f of fichiers)
    codes.push(`Fichier ${f} :`, "```", await w.lireFichier(f), "```");
  return [
    `Story : ${d.story.id} — ${d.story.title ?? ""}`,
    "Mutants survivants contestés par le testeur :",
    ...fils.map((t) => `  - [${t.id}] ${elementDe(t.mutant)}${t.mutant.replacement ? ` — code du mutant : ${t.mutant.replacement}` : ""} ; contestation : « ${t.contestation ?? "?"} »`),
    ...codes,
  ].join("\n");
}

/** Fichier des dérogations, commité avec DELIVER (ADR 0065). */
/** Écarts au plan de test déclarés en DELIVER, vérifiés par le code et jugés par la revue (ADR 0067). */
export function rapportDEcarts(d) {
  const cellule = (x) => x.replace(/\|/g, "\\|");
  return [
    `# Écarts au plan de test — ${d.story.id}`,
    "",
    "Tests écrits à une autre couche, ou avec une autre doublure, que la matrice de `distill/test-plan.md`. Chaque écart a été déclaré par l'agent avec la règle qui l'impose, vérifié par le code contre la matrice, puis soumis à la revue.",
    "",
    "| Scénario | Critère | Déclaré par | Prévu | Réel | Règle |",
    "| --- | --- | --- | --- | --- | --- |",
    ...d.ecartsAuPlan.map((x) => `| ${x.scenario} | ${x.criterion} | ${x.par} | ${cellule(x.planned)} | ${cellule(x.actual)} | ${cellule(x.rule)} |`),
    "",
  ].join("\n");
}

export function rapportDeDerogations(d) {
  const cellule = (x) => x.replace(/\|/g, "\\|");
  return [
    `# Dérogations — ${d.story.id}`,
    "",
    ...(d.derogations.length
      ? [
          "## Mutation",
          "",
          "Mutants survivants reconnus équivalents après arbitrage, exemptés de la porte de mutation (ADR 0065).",
          "",
          "| Mutant | Décidé par | Raison | Contestation du testeur |",
          "| --- | --- | --- | --- |",
          ...d.derogations.map((x) => `| ${elementDe(x)} | ${x.par} | ${cellule(x.raison)} | ${cellule(x.contestation)} |`),
          "",
        ]
      : []),
    ...(d.derogationsCouverture.length
      ? [
          "## Couverture du diff",
          "",
          "Lignes exemptées par l'humain, après contestation du testeur.",
          "",
          "| Ligne | Décidé par | Raison | Contestation du testeur |",
          "| --- | --- | --- | --- |",
          ...d.derogationsCouverture.map((x) => `| ${x.file}:${x.line} | humain | ${cellule(x.raison)} | ${cellule(x.contestation)} |`),
          "",
        ]
      : []),
    ...(d.testsObsoletes.length
      ? [
          "## Tests existants déclarés obsolètes",
          "",
          "Tests qui passaient avant DELIVER, que la story fait échouer, sortis des portes par l'humain (ADR 0066). À mettre à jour après le cycle.",
          "",
          "| Test | Scénario | Raison |",
          "| --- | --- | --- |",
          ...d.testsObsoletes.map((x) => `| ${cellule(x.test)} | ${x.scenario} | ${cellule(x.raison)} |`),
          "",
        ]
      : []),
  ].join("\n");
}

/**
* Couverture du diff contestée par le testeur (code défensif inatteignable) : l'humain tranche.
* Dérogation : les lignes sortent du calcul, la décision est tracée et commitée ; sinon, à tester.
*/
export async function arbitrerCouverture(w, d, s) {
  const contestes = s.fils.filter((t) => t.couverture && (t.status === "contested" || t.status === "recontested"));
  if (!contestes.length)
    return;
  await w.etape("ARBITRATION");
  for (const t of contestes) {
    const element = `${t.couverture.file}:${t.couverture.lines.join(", ")}`;
    const rep = await w.humain("arbitrer-couverture", `Arbitrer un défaut de couverture (${t.id})`, [
      { id: "derogation", label: "Lignes inatteignables ou sans comportement : accorder la dérogation" },
      { id: "corriger", label: "À tester : le testeur doit les couvrir" },
    ], {
      detail: `Lignes non couvertes : ${element}\nContestation du testeur : « ${t.contestation ?? "?"} »\nJustifie ta décision en commentaire : elle est tracée et commitée.`,
      texteLibre: true,
    });
    const derogation = rep.decision === "derogation";
    const raison = rep.commentaire ?? (derogation ? "(sans justification)" : "");
    await w.arbitrage({ porte: "couverture du diff", élément: element, contestation: t.contestation ?? "", décision: derogation ? "dérogation" : "à corriger", par: "humain", raison });
    if (derogation)
      d.derogationsCouverture = [...d.derogationsCouverture, ...t.couverture.lines.map((line) => ({ file: t.couverture.file, line, raison, contestation: t.contestation ?? "", defaut: t.id }))];
    s.fils = s.fils.map((x) => (x.id === t.id ? { ...x, status: derogation ? "humanAccepted" : "humanMaintained" } : x));
  }
}
