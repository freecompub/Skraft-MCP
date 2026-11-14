/**
 * Workflows en dossier dans l'application (ADR 0055, `docs/11` §5, §6) : trouvés à l'ouverture du
 * projet, commande enregistrée, accord demandé, exécution isolée ; workflows invalides signalés.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createUsageRecorder } from "@skraft-mcp/core";
import { fixedClock, MemoryEvidenceStore, MemoryInteractionStore, MemoryTaskSessionStore, ScriptedRuntime, sequentialIds } from "@skraft-mcp/core/testing";
import { bundle, createNodeLauncher } from "@skraft-mcp/extension-host";
import { MemoryTaskStore } from "@skraft-mcp/task-engine";
import type { TraceEntry, TraceStore } from "@skraft-mcp/core";
import type { InteractionDto, TaskCardDto } from "../src/assemblage/dto.js";
import type { Workspace } from "@skraft-mcp/workspace";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workspaceServicesFactory } from "../src/assemblage/services-du-projet.js";

let racine: string;
let enfant: string;
beforeAll(async () => {
  racine = await mkdtemp(join(tmpdir(), "app-workflows-"));
  enfant = join(racine, "runtime", "workflow-child.mjs");
  await bundle(resolve(import.meta.dirname, "../../../packages/workflow/src/hote/enfant-entree.ts"), enfant);
}, 60_000);
afterAll(() => rm(racine, { recursive: true, force: true }));

const DEMO = `export const meta = {
  name: "demo",
  description: "Démo.",
  commande: "demo",
  entrees: { story: { type: "fichier", obligatoire: true, aide: "La story." } },
  phases: { REDACTION: "Rédaction" },
  permissions: { ecriture: [".skraft/**"] },
  agents: { redacteur: { prompt: "agents/redacteur.agent.md", ecriture: [".skraft/**"], sortie: "report_phase" } },
};
export default async function (w, entree) {
  await w.phase("REDACTION", async () => {
    const a = await w.agent("redacteur", "Résume " + entree.story);
    await w.ecrireFichier(".skraft/resume.md", a.sortie.summary);
    return true;
  });
}
`;

/**
 * Workflow qui exerce la machinerie d'hôte : une phase avec un agent (donc de l'usage et une
 * session), puis une étape où le script demande une décision à l'humain (donc une tâche en attente
 * et une demande à reprendre après un redémarrage).
 */
const VALIDE = `export const meta = {
  name: "valide",
  description: "Démo avec validation.",
  commande: "valide",
  entrees: { story: { type: "fichier", obligatoire: true, aide: "La story." } },
  phases: { REDACTION: "Rédaction", VALIDATION: "Validation à donner" },
  permissions: { ecriture: [".skraft/**"] },
  agents: { redacteur: { prompt: "agents/redacteur.agent.md", ecriture: [".skraft/**"], sortie: "report_phase" } },
};
export default async function (w, entree) {
  await w.phase("REDACTION", async () => {
    const a = await w.agent("redacteur", "Résume " + entree.story);
    await w.ecrireFichier(".skraft/resume.md", a.sortie.summary);
    return true;
  });
  await w.etape("VALIDATION");
  const d = await w.humain("valider", "Publier le résumé ?", [{ id: "oui", label: "Publier" }, { id: "non", label: "Garder" }], { detail: "le résumé" });
  return { decision: d.decision };
}
`;

async function poser(base: string, fichiers: Record<string, string>) {
  for (const [rel, c] of Object.entries(fichiers)) {
    await mkdir(dirname(join(base, rel)), { recursive: true });
    await writeFile(join(base, rel), c);
  }
}

async function ouvrir(opts: {
  projet?: Record<string, string>;
  machine?: Record<string, string>;
  reponse?: "allow-once" | "allow-always" | "deny";
  sansConfirmeur?: boolean;
  trace?: TraceStore;
  /** Magasins partagés entre deux ouvertures, pour éprouver un redémarrage. */
  taskStore?: MemoryTaskStore;
  interactionStore?: MemoryInteractionStore;
  sessions?: MemoryTaskSessionStore;
  runtime?: ScriptedRuntime;
  usage?: boolean;
}) {
  const projet = await mkdtemp(join(racine, "projet-"));
  const machine = await mkdtemp(join(racine, "machine-"));
  await poser(projet, opts.projet ?? {});
  await poser(machine, opts.machine ?? {});
  const ecrits: string[] = [];
  const posts: string[] = [];
  const demandes: string[] = [];
  const cards: TaskCardDto[] = [];
  const pending: InteractionDto[][] = [];
  const notifications: string[] = [];
  let charges = 0;
  const runtime = opts.runtime ?? new ScriptedRuntime();
  for (const nom of ["demo", "valide"])
    runtime.behave(`workflow.${nom}/redacteur`, async (t) => {
      t.session.emit({ type: "usage", model: "gpt-5", inputTokens: 1200, outputTokens: 80, multiplier: 1 });
      await t.callTool("report_phase", { summary: "résumé", files: [] });
    });
  const taskStore = opts.taskStore ?? new MemoryTaskStore();
  const interactionStore = opts.interactionStore ?? new MemoryInteractionStore();
  const sessions = opts.sessions ?? new MemoryTaskSessionStore();
  const usageRecorder = opts.usage ? createUsageRecorder(await mkdtemp(join(racine, "usage-"))) : undefined;
  const workspace = {
    root: projet,
    files: { read: async () => "", write: async (p: string) => void ecrits.push(p), ensureDir: async () => {}, list: async () => [] },
    checkpoints: { create: async (label: string) => ({ id: "cp", sha: "s", head: "h", label, createdAt: "" }), list: async () => [], diff: async () => ({ files: [], patch: "" }), rollback: async () => {} },
    repo: { worktree: async () => { throw new Error("non"); }, head: async () => "h", commit: async () => null, sync: async () => ({ pulled: 0, pushed: 0 }), switchBranch: async () => {} },
  } as unknown as Workspace;
  const services = await workspaceServicesFactory({
    stacks: [{ id: "typescript", layout: { acceptanceTests: [], unitTests: ["tests/**"], sources: ["src/**"] }, infrastructureModules: [], detect: async () => true, isTestFile: () => false, testFilePattern: "^tests/", runTests: async () => ({ results: [], exitCode: 0, timedOut: false, output: "", durationMs: 0 }) }],
    tasksDir: join(projet, ".taches"),
    taskStore,
    evidenceStore: new MemoryEvidenceStore(),
    interactionStore,
    taskSessionStore: sessions,
    ...(usageRecorder ? { usageRecorder } : {}),
    clock: fixedClock(),
    ids: sequentialIds("id-"),
    workflows: { machine, launcher: createNodeLauncher(), runtimeEntry: enfant },
    ...(opts.trace ? { traceStore: opts.trace } : {}),
  })({
    workspace,
    runtime: async () => (charges++, runtime),
    onTask: (c) => void cards.push(c),
    onInteractions: (p) => void pending.push(p),
    onPost: (_e, md) => void posts.push(md),
    notify: (title: string, body: string) => void notifications.push(`${title} | ${body}`),
    ...(opts.sansConfirmeur ? {} : { confirmer: { confirm: async (r: { title: string }) => (demandes.push(r.title), opts.reponse ?? "allow-once") } }),
  });
  // Comme le serveur : purge des sessions et reprise des tâches une fois les services construits.
  await services.demarrer?.();
  return { services, ecrits, posts, demandes, cards, pending, notifications, runtime, sessions, taskStore, interactionStore, charges: () => charges };
}

const until = async (check: () => Promise<boolean> | boolean) => {
  for (let i = 0; i < 400 && !(await check()); i++) await new Promise((r) => setTimeout(r, 10));
  expect(await check()).toBe(true);
};

const WF = { ".agent-studio/workflows/demo/workflow.mjs": DEMO, ".agent-studio/workflows/demo/agents/redacteur.agent.md": "Tu résumes." };

describe("Workflows en dossier dans l'application (ADR 0055)", () => {
  it("un workflow du projet devient une commande ; après accord, il tourne jusqu'au bout", async () => {
    const o = await ouvrir({ projet: WF });
    expect(o.services.commands().map((c) => c.invocation)).toContain("demo");
    expect(await o.services.route("/demo stories/us-2.md")).toEqual({ kind: "handled" });
    expect(o.demandes).toEqual(["Exécuter le workflow « demo » (projet) ?"]);
    await until(async () => (await o.services.tasks()).some((t) => t.status === "finished"));
    expect(o.ecrits).toEqual([".skraft/resume.md"]);
    await o.services.dispose();
  }, 30_000);

  it("le dossier de la machine est lu aussi ; le projet l'emporte à nom égal, et c'est dit", async () => {
    const machine = Object.fromEntries(Object.entries(WF).map(([k, v]) => [k.replace(".agent-studio/workflows/", ""), v]));
    const o = await ouvrir({ projet: WF, machine });
    expect(o.posts.some((p) => /« demo » du projet remplace celui de la machine/.test(p))).toBe(true);
    await o.services.route("/demo x.md");
    expect(o.demandes).toEqual(["Exécuter le workflow « demo » (projet) ?"]);
    await o.services.dispose();
  }, 30_000);

  it("un workflow invalide est écarté avec son motif, sans empêcher l'ouverture du projet", async () => {
    const o = await ouvrir({ projet: { ".agent-studio/workflows/casse/workflow.mjs": "export const meta = { name: NOM };\nexport default async () => {};\n" } });
    expect(o.posts.some((p) => /Workflow écarté.*casse.*meta non littéral/s.test(p))).toBe(true);
    expect(o.services.commands().map((c) => c.invocation)).not.toContain("casse");
    await o.services.dispose();
  }, 30_000);

  it("l'agent principal peut proposer un workflow ; rien ne démarre sans confirmation", async () => {
    const o = await ouvrir({ projet: WF, reponse: "allow-once" });
    const [outil] = o.services.outilsAgent();
    expect(outil!.name).toBe("proposer_workflow");
    expect(outil!.description).toContain("demo (/demo <story>) : Démo.");
    expect((outil!.parameters as { properties: { nom: { enum: string[] } } }).properties.nom.enum).toEqual(["demo"]);

    expect(await outil!.handler({ nom: "demo", arguments: "stories/us-2.md" })).toMatch(/^Workflow lancé/);
    // Revue de la PR #12 : une seule demande. Accord pas encore donné pour toujours : c'est lui qui
    // confirme la proposition, l'outil ne demande rien de plus.
    expect(o.demandes).toEqual(["Exécuter le workflow « demo » (projet) ?"]);
    await until(async () => (await o.services.tasks()).some((t) => t.status === "finished"));
    await o.services.dispose();
  }, 30_000);

  it("accord déjà donné pour toujours : une seule demande, celle de la proposition de l'agent", async () => {
    const o = await ouvrir({ projet: WF, reponse: "allow-always" });
    expect(await o.services.route("/demo stories/us-2.md")).toEqual({ kind: "handled" });
    await until(async () => (await o.services.tasks()).some((t) => t.status === "finished"));
    o.demandes.length = 0;
    const [outil] = o.services.outilsAgent();
    expect(await outil!.handler({ nom: "demo", arguments: "stories/us-3.md" })).toMatch(/^Workflow lancé/);
    expect(o.demandes).toEqual(["Lancer le workflow « demo » proposé par l'agent ?"]);
    await o.services.dispose();
  }, 30_000);

  it("arguments invalides : rien ne démarre, et l'agent l'apprend au lieu de l'annoncer comme lancé", async () => {
    const o = await ouvrir({ projet: WF, reponse: "allow-once" });
    const [outil] = o.services.outilsAgent();
    expect(await outil!.handler({ nom: "demo", arguments: "" })).toMatch(/^Rien n'a démarré/);
    expect(await o.services.tasks()).toEqual([]);
    await o.services.dispose();
  }, 30_000);

  it("proposition refusée : rien ne démarre, et l'agent l'apprend ; workflow inconnu : refusé", async () => {
    const o = await ouvrir({ projet: WF, reponse: "deny" });
    const [outil] = o.services.outilsAgent();
    expect(await outil!.handler({ nom: "demo", arguments: "x.md" })).toMatch(/refusé/);
    expect(await o.services.tasks()).toEqual([]);
    await expect(outil!.handler({ nom: "autre", arguments: "" })).rejects.toThrow(/inconnu/);
    await o.services.dispose();
  }, 30_000);

  it("les workflows actifs sont listés, avec l'accord à montrer et s'il est déjà retenu (ADR 0068)", async () => {
    const o = await ouvrir({ projet: WF, reponse: "allow-always" });
    const [w] = await o.services.workflows();
    expect(w).toMatchObject({ nom: "demo", commande: "demo", syntaxe: "/demo <story>", description: "Démo.", accordRetenu: false });
    expect(w!.accord.title).toBe("Exécuter le workflow « demo » (projet) ?");
    expect(w!.accord.detail).toContain("Écrire : .skraft/**");
    await o.services.route("/demo x.md");
    expect((await o.services.workflows())[0]!.accordRetenu).toBe(true);
    await o.services.dispose();
  }, 30_000);

  it("accord donné d'avance « une fois » : le workflow démarre sans rien demander, et l'accord n'est pas retenu", async () => {
    const o = await ouvrir({ projet: WF, reponse: "deny" });
    const r = await o.services.lancerWorkflow("demo", "stories/us-2.md", { accord: "une-fois" });
    expect(r).toEqual({ ok: true, taskId: expect.any(String) });
    expect(o.demandes).toEqual([]);
    await until(async () => (await o.services.tasks()).some((t) => t.id === (r as { taskId: string }).taskId && t.status === "finished"));
    expect((await o.services.workflows())[0]!.accordRetenu).toBe(false);
    // L'accord ponctuel est consommé : le lancement suivant redemande.
    expect(await o.services.lancerWorkflow("demo", "stories/us-3.md")).toEqual({ ok: false, motif: expect.stringMatching(/accord refusé/) });
    expect(o.demandes).toEqual(["Exécuter le workflow « demo » (projet) ?"]);
    await o.services.dispose();
  }, 30_000);

  it("accord donné d'avance « toujours » : retenu pour l'empreinte du workflow", async () => {
    const o = await ouvrir({ projet: WF, reponse: "deny" });
    expect(await o.services.lancerWorkflow("demo", "stories/us-2.md", { accord: "toujours" })).toMatchObject({ ok: true });
    expect(o.demandes).toEqual([]);
    expect((await o.services.workflows())[0]!.accordRetenu).toBe(true);
    await o.services.dispose();
  }, 30_000);

  it("arguments invalides : rien ne démarre, le motif est la syntaxe de la commande ; workflow inconnu : refusé", async () => {
    const o = await ouvrir({ projet: WF, reponse: "allow-once" });
    expect(await o.services.lancerWorkflow("demo", "", { accord: "une-fois" })).toEqual({ ok: false, motif: expect.stringContaining("/demo <story>") });
    expect(await o.services.tasks()).toEqual([]);
    // L'accord ponctuel d'un appel refusé ne profite pas au suivant.
    await o.services.lancerWorkflow("demo", "x.md");
    expect(o.demandes).toEqual(["Exécuter le workflow « demo » (projet) ?"]);
    expect(await o.services.lancerWorkflow("autre", "x.md")).toEqual({ ok: false, motif: "Workflow inconnu : autre" });
    await o.services.dispose();
  }, 30_000);

  it("rapport d'un run de workflow : messages du script et fin, lus dans l'état de la tâche ; autre tâche : aucun", async () => {
    const o = await ouvrir({ projet: WF, reponse: "allow-once" });
    const r = await o.services.lancerWorkflow("demo", "stories/us-2.md");
    const id = (r as { taskId: string }).taskId;
    await until(async () => (await o.services.tasks()).some((t) => t.status === "finished"));
    expect(await o.services.rapportWorkflow(id)).toMatchObject({ statut: "fini", messages: [] });
    expect(await o.services.rapportWorkflow("inconnue")).toBeNull();
    await o.services.dispose();
  }, 30_000);

  it("les rejets d'un workflow sont dans la trace de la tâche, avec leur porte et leurs motifs (ADR 0032)", async () => {
    // Run réel du 05/11 par le serveur MCP : un rejet en DESIGN, absent de la trace, parce que le
    // moteur des services ne recevait pas la trace (seul l'exécuteur d'agents l'avait).
    const entrees: TraceEntry[] = [];
    const trace: TraceStore = { append: async (e) => void entrees.push(e), list: async (id) => entrees.filter((e) => e.taskId === id), archive: async () => {} };
    const REJET = DEMO.replace(`await w.ecrireFichier(".skraft/resume.md", a.sortie.summary);`, `await w.rejet("cohérence", ["motif d'essai"]);\n    await w.ecrireFichier(".skraft/resume.md", a.sortie.summary);`);
    const o = await ouvrir({ projet: { ...WF, ".agent-studio/workflows/demo/workflow.mjs": REJET }, reponse: "allow-once", trace });
    await o.services.lancerWorkflow("demo", "x.md");
    await until(async () => (await o.services.tasks()).some((t) => t.status === "finished"));
    expect(entrees.filter((e) => e.kind === "rejet")).toEqual([expect.objectContaining({ kind: "rejet", porte: "cohérence", motifs: ["motif d'essai"] })]);
    expect(entrees.some((e) => e.kind === "transition")).toBe(true);
    // Étapes du run, lues dans la même trace : chaque rejeu est une étape, avec son début et sa fin.
    const id = (await o.services.tasks())[0]!.id;
    const etapes = await o.services.etapesDuRun(id);
    expect(etapes.filter((e) => e.phase === "REDACTION").map((e) => e.essai)).toEqual([1, 2]);
    expect(etapes[0]!.rejets).toEqual([{ porte: "cohérence", motifs: ["motif d'essai"] }]);
    expect(etapes.every((e) => typeof e.début === "string" && typeof e.fin === "string")).toBe(true);
    expect(await o.services.etapesDuRun("inconnue")).toEqual([]);
    await o.services.dispose();
  }, 30_000);

  it("sans workflow actif, l'agent principal n'a pas l'outil", async () => {
    const o = await ouvrir({});
    expect(o.services.outilsAgent()).toEqual([]);
    await o.services.dispose();
  }, 30_000);

  it("sans moyen de demander l'accord, les workflows ne sont pas activés, et c'est dit", async () => {
    const o = await ouvrir({ projet: WF, sansConfirmeur: true });
    expect(o.services.commands().map((c) => c.invocation)).not.toContain("demo");
    expect(o.posts.some((p) => /workflows.*non activés/i.test(p))).toBe(true);
    await o.services.dispose();
  }, 30_000);
});

/**
 * Machinerie d'hôte, éprouvée à travers un workflow (ADR 0091 §9). Ces cas venaient de
 * `workspace-services.test.ts`, où ils s'appuyaient sur l'extension d'exemple `tdd` : ils portent
 * sur l'hôte, pas sur elle, et le workflow est désormais la seule chose qu'il active.
 *
 * Le septième cas d'alors — jalons et alertes — n'est pas repris : `manifesteDuWorkflow` ne déclare
 * ni `milestones` ni `alerts`, et le `meta` n'a pas ces champs. Rien dans le produit ne peut plus
 * en produire.
 */
const WFV = { ".agent-studio/workflows/valide/workflow.mjs": VALIDE, ".agent-studio/workflows/valide/agents/redacteur.agent.md": "Tu résumes." };

describe("machinerie d'hôte, à travers un workflow", () => {
  it("la commande est exposée ; le texte libre part vers la session principale, et aucun runtime n'est chargé d'avance", async () => {
    const o = await ouvrir({ projet: WFV });
    // `/stack` est là aussi : elle s'enregistre dès qu'il y a quelqu'un à qui demander l'accord d'écrire.
    expect(o.services.commands().map((c) => c.invocation)).toEqual(["stack", "valide"]);
    expect(await o.services.route("Bonjour")).toEqual({ kind: "chat" });
    expect(await o.services.route("/inconnue")).toEqual({ kind: "unknown-command", name: "inconnue" });
    expect(o.charges()).toBe(0);
  });

  it("tâche lancée, carte avec les libellés du meta, question du script en demande d'interaction", async () => {
    const o = await ouvrir({ projet: WFV });
    expect(await o.services.route("/valide stories/us-2.md")).toEqual({ kind: "handled" });

    await until(() => o.pending.some((p) => p.length === 1));
    const [demande] = await o.services.pendingInteractions();
    expect(demande).toMatchObject({ extensionId: "workflow.valide", title: "Publier le résumé ?", detail: "le résumé" });
    expect(demande?.options.map((x) => x.label)).toEqual(["Publier", "Garder"]);
    // L'identifiant d'une option porte le numéro de l'appel au journal : c'est par lui que le rejeu retrouve la décision.
    expect(demande?.options.map((x) => x.id)).toEqual([expect.stringMatching(/^\d+:oui$/), expect.stringMatching(/^\d+:non$/)]);

    await until(() => o.cards.at(-1)?.status === "waiting");
    expect(o.cards.at(-1)).toMatchObject({ title: "valide", phase: "VALIDATION", phaseLabel: "Validation à donner", status: "waiting", alert: false, milestone: false });
    expect(await o.services.tasks()).toHaveLength(1);
  });

  it("usage par état sur la carte : requêtes et tokens de l'agent, avec le libellé de sa phase (D37)", async () => {
    const o = await ouvrir({ projet: WFV, usage: true });
    await o.services.route("/valide stories/us-2.md");
    await until(() => o.pending.some((p) => p.length === 1));
    await until(() => o.cards.at(-1)?.usage?.rows.some((r) => r.phase === "REDACTION" && r.requests === 1) ?? false);
    const usage = o.cards.at(-1)!.usage!;
    expect(usage.unit).toBe("requests");
    expect(usage.rows.find((r) => r.phase === "REDACTION")).toMatchObject({ label: "Rédaction", requests: 1, inputTokens: 1200, outputTokens: 80 });
    expect(usage.total.requests).toBe(1);
  });

  it("la réponse relance le script ; l'annulation clôt la tâche et ses demandes", async () => {
    const o = await ouvrir({ projet: WFV });
    await o.services.route("/valide stories/us-2.md");
    await until(() => o.pending.some((p) => p.length === 1));
    const [demande] = await o.services.pendingInteractions();
    await o.services.respond(demande!.id, demande!.options[0]!.id);
    await until(async () => (await o.services.tasks()).some((t) => t.status === "finished"));

    // Une seconde tâche, annulée en attente : la demande qui l'attendait est retirée.
    await o.services.route("/valide stories/us-3.md");
    await until(() => o.pending.at(-1)?.length === 1);
    const [seconde] = await o.services.pendingInteractions();
    await o.services.cancelTask(seconde!.taskId);
    await until(async () => (await o.services.tasks()).some((t) => t.id === seconde!.taskId && t.status === "finished"));
    await until(() => o.pending.at(-1)?.length === 0);
  });

  it("redémarrage : la tâche en attente et sa demande de décision sont toujours là (J3)", async () => {
    const taskStore = new MemoryTaskStore();
    const interactionStore = new MemoryInteractionStore();
    const premier = await ouvrir({ projet: WFV, taskStore, interactionStore });
    await premier.services.route("/valide stories/us-2.md");
    await until(() => premier.pending.some((p) => p.length === 1));
    await premier.services.dispose();

    const second = await ouvrir({ projet: WFV, taskStore, interactionStore });
    const taches = await second.services.tasks();
    expect(taches).toHaveLength(1);
    expect(taches[0]).toMatchObject({ phase: "VALIDATION", status: "waiting" });
    const [demande] = await second.services.pendingInteractions();
    expect(demande?.taskId).toBe(taches[0]?.id);
  });

  it("sessions d'agent : celles d'un crash supprimées à l'ouverture, toutes supprimées à la fermeture (ADR 0053)", async () => {
    // Ouverture après un crash : le registre nomme une session que personne ne libérera plus.
    const sessions = new MemoryTaskSessionStore([{ key: "t-ancienne/workflow.valide/redacteur", sessionId: "orpheline" }]);
    const o = await ouvrir({ projet: WFV, sessions });
    await until(() => o.runtime.deleted.includes("orpheline"));

    // Une tâche en attente d'une décision humaine garde la session de son agent (ADR 0039)…
    await o.services.route("/valide stories/us-2.md");
    await until(() => o.pending.some((p) => p.length === 1));
    const redacteur = o.runtime.history.at(-1)!.id;
    expect(o.runtime.deleted).not.toContain(redacteur);
    expect((await sessions.list()).map((e) => e.sessionId)).toEqual([redacteur]);

    // …mais la fermeture normale la supprime comme un crash le ferait.
    await o.services.dispose();
    expect(o.runtime.deleted).toContain(redacteur);
    expect(await sessions.list()).toEqual([]);
  });
});
