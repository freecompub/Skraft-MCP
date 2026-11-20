/**
 * skraft-light (ADR 0098) : la story, l'architecture (conforme à l'existant ou nouvelle, ratifiée par
 * l'humain), puis DISTILL et DELIVER de skraft, sans RESEARCH ni DESIGN.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptedRuntime, type ScriptedBehavior } from "@skraft-mcp/agents/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptanceWriter, answerQuestions, architectureDoc, assemble, createProject, git, put, ROLE, shutdownHosts, simulatedAgents, SKRAFT_LIGHT, until } from "./support/harness.js";
import { fin, lancerWorkflow } from "./support/fin.js";

const DOC = ".skraft/us12-f15ade30/archi/architecture.md";

/** L'architecte simulé : écrit le document que rend `doc(n)` au n-ième tour, et garde chaque prompt. */
function architecte(root: string, prompts: string[], doc: (n: number) => string): ScriptedBehavior {
  return async (t) => {
    prompts.push(t.prompt);
    await put(root, DOC, doc(prompts.length));
    await t.callTool("verifier_architecture", {});
    await t.callTool("report_phase", { summary: `écrit ${DOC}`, files: [DOC] });
  };
}

describe("skraft-light — US → ARCHI → DISTILL → DELIVER (ADR 0098)", () => {
  let root: string;
  let tasksDir: string;
  beforeEach(async () => {
    root = await createProject();
    tasksDir = await mkdtemp(join(tmpdir(), "skraft-tasks-"));
  });
  afterEach(async () => {
    await shutdownHosts();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    await rm(tasksDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("mode conforme : l'architecture retenue va jusqu'à DISTILL, la story est livrée sans ratification", async () => {
    const acceptance: string[] = [];
    const accept = acceptanceWriter(root);
    const runtime = simulatedAgents(new ScriptedRuntime(), root, {
      "skraft-acceptance": async (t) => {
        acceptance.push(t.prompt);
        await accept(t);
      },
    }, { workflow: "skraft-light" });
    const app = await assemble(root, runtime, tasksDir, { workflow: SKRAFT_LIGHT });
    answerQuestions(app);
    const id = await lancerWorkflow(app, "stories/us-12.md", undefined, "skraft-light");
    const bilan = await fin(app, id, 60_000);
    expect(bilan.phases).toEqual(["ARCHI", "DISTILL", "DELIVER"]);
    expect(acceptance[0]).toContain("Architecture retenue (mode conforme");
    expect(acceptance[0]).toContain("Le plafond est un objet-valeur du domaine");
    expect(acceptance[0]).toContain("`BolusCap` → `src/domain/bolus-cap.ts`");
    expect((await app.interactions.pending()).some((p) => p.title.includes("ratifier"))).toBe(false);
    expect(git(root, "log", "--format=%s")).toContain("docs(skraft): archi de us12-f15ade30");
    expect(await readFile(join(root, DOC), "utf8")).toContain("## Mode");
  }, 90_000);

  it("mode nouvelle : l'humain ratifie ; un refus renvoie l'architecte avec son commentaire", async () => {
    const prompts: string[] = [];
    const runtime = simulatedAgents(new ScriptedRuntime(), root, {
      "skraft-architecte": architecte(root, prompts, (n) => architectureDoc({ Mode: "nouvelle", "Architecture retenue": `Proposition ${n}.`, Justification: "Aucune couche domaine n'existe.", "Existant réutilisable": "aucun" })),
    }, { workflow: "skraft-light" });
    const app = await assemble(root, runtime, tasksDir, { workflow: SKRAFT_LIGHT });
    answerQuestions(app);
    const id = await lancerWorkflow(app, "stories/us-12.md", undefined, "skraft-light");
    const ratification = async () => {
      await until(async () => (await app.interactions.pending()).some((p) => p.title.includes("ratifier")), 60_000);
      return (await app.interactions.pending()).find((p) => p.title.includes("ratifier"))!;
    };
    const premiere = await ratification();
    expect(premiere.detail).toContain("Proposition 1.");
    await app.interactions.respond(premiere.id, premiere.options.find((o) => o.id.endsWith("refuser"))!.id, "garder un seul module");
    const seconde = await ratification();
    expect(seconde.detail).toContain("Proposition 2.");
    expect(prompts[1]).toContain("Architecture refusée par l'utilisateur : garder un seul module");
    await app.interactions.respond(seconde.id, seconde.options.find((o) => o.id.endsWith("accepter"))!.id);
    const bilan = await fin(app, id, 60_000);
    expect(bilan.phases).toEqual(["ARCHI", "DISTILL", "DELIVER"]);
  }, 90_000);

  it("questions de l'architecte : toutes posées avant de figer ; il reprend son brouillon avec les réponses", async () => {
    const prompts: string[] = [];
    const acceptance: string[] = [];
    const accept = acceptanceWriter(root);
    const runtime = simulatedAgents(new ScriptedRuntime(), root, {
      "skraft-architecte": architecte(root, prompts, (n) => (n === 1
        ? architectureDoc({ "Architecture retenue": "Brouillon 1.", "Questions ouvertes": "- Le plafond est-il par prise ?\n- Faut-il historiser le plafond ?" })
        : architectureDoc({ "Architecture retenue": "Version 2, plafond par prise." }))),
      "skraft-acceptance": async (t) => {
        acceptance.push(t.prompt);
        await accept(t);
      },
    }, { workflow: "skraft-light" });
    const app = await assemble(root, runtime, tasksDir, { workflow: SKRAFT_LIGHT });
    answerQuestions(app);
    const id = await lancerWorkflow(app, "stories/us-12.md", undefined, "skraft-light");
    const bilan = await fin(app, id, 60_000);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain(`Brouillon précédent : ${DOC}`);
    expect(prompts[1]).toContain("Le plafond est-il par prise ? → par prise");
    expect(prompts[1]).toContain("Faut-il historiser le plafond ? → par prise");
    expect(acceptance[0]).toContain("Version 2, plafond par prise.");
    expect(acceptance[0]).not.toContain("Brouillon 1.");
    // Même tâche, même rôle : le second tour reprend la session du premier (ADR 0030, 0039), avec tout ce qu'il a lu.
    const sessions = runtime.history.filter((x) => runtime.configs.get(x.id)?.role === ROLE("skraft-architecte", "skraft-light")).map((x) => x.id);
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions).size).toBe(1);
    expect(bilan.phases).toEqual(["ARCHI", "DISTILL", "DELIVER"]);
  }, 90_000);

  it("questions de l'architecte : au-delà de deux tours, l'humain tranche avant tout nouveau tour", async () => {
    const prompts: string[] = [];
    const runtime = simulatedAgents(new ScriptedRuntime(), root, {
      "skraft-architecte": architecte(root, prompts, (n) => architectureDoc({ "Questions ouvertes": `- Question ${n} ?` })),
    }, { workflow: "skraft-light" });
    const app = await assemble(root, runtime, tasksDir, { workflow: SKRAFT_LIGHT });
    answerQuestions(app);
    await lancerWorkflow(app, "stories/us-12.md", undefined, "skraft-light");
    await until(async () => (await app.interactions.pending()).some((p) => p.title.includes("bloqué")), 60_000);
    const escalade = (await app.interactions.pending()).find((p) => p.title.includes("bloqué"))!;
    expect(escalade.detail).toContain("Après 2 tours de questions, l'architecte en pose encore : Question 3 ?");
    expect(prompts).toHaveLength(3);
  }, 90_000);

  it("question bloquante de l'architecte : l'humain répond, l'architecte repart avec la réponse", async () => {
    const prompts: string[] = [];
    const ecrire = architecte(root, [], () => architectureDoc());
    const runtime = simulatedAgents(new ScriptedRuntime(), root, {
      "skraft-architecte": async (t) => {
        prompts.push(t.prompt);
        if (prompts.length === 1)
          return void (await t.callTool("report_blocker", { question: "Quelle unité pour le plafond ?", choices: ["U", "mL"] }));
        await ecrire(t);
      },
    }, { workflow: "skraft-light" });
    const app = await assemble(root, runtime, tasksDir, { workflow: SKRAFT_LIGHT });
    answerQuestions(app);
    const id = await lancerWorkflow(app, "stories/us-12.md", undefined, "skraft-light");
    await until(async () => (await app.interactions.pending()).some((p) => p.title === "Question de l'agent (ARCHI)"), 60_000);
    const q = (await app.interactions.pending()).find((p) => p.title === "Question de l'agent (ARCHI)")!;
    await app.interactions.respond(q.id, q.options.find((o) => o.id.endsWith("U"))!.id);
    await fin(app, id, 60_000);
    expect(prompts[1]).toContain("Quelle unité pour le plafond ? → U");
  }, 90_000);

  it("porte d'ARCHI : un document qui cite un fichier inexistant est rendu à l'architecte avec le motif", async () => {
    const prompts: string[] = [];
    const runtime = simulatedAgents(new ScriptedRuntime(), root, {
      "skraft-architecte": architecte(root, prompts, (n) => (n === 1 ? architectureDoc({ "Fichiers analysés": "- `src/domain/absent.ts`" }) : architectureDoc())),
    }, { workflow: "skraft-light" });
    const app = await assemble(root, runtime, tasksDir, { workflow: SKRAFT_LIGHT });
    answerQuestions(app);
    const id = await lancerWorkflow(app, "stories/us-12.md", undefined, "skraft-light");
    await fin(app, id, 60_000);
    expect(prompts[1]).toContain("`src/domain/absent.ts` : fichier inexistant dans le dépôt.");
  }, 90_000);
});
