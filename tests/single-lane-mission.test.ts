import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createMission, runFixture } from "../src/server/missions";
import { missionSchema } from "../src/server/schema";
import type { Principal } from "../src/server/auth";

test("a named provider can create one lane without unrelated requirements", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-single-lane-"));
  const previous = process.env.OCT3_STATE_PATH;
  process.env.OCT3_STATE_PATH = join(directory, "state.json");
  t.after(async () => {
    if (previous === undefined) delete process.env.OCT3_STATE_PATH; else process.env.OCT3_STATE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const parsed = missionSchema.parse({
    objective: "Find one popular beat maker on Fiverr under ten dollars",
    currency: "USD",
    purchase_budget_minor: 1000,
    deadline: "2026-10-10T17:00:00-07:00",
    headcount: 1,
    requirements: {
      fiverr: {
        category: "beat maker",
        brief: "Research one popular beat maker under $10. Do not contact or hire.",
        due_date: "2026-10-10T17:00:00-07:00",
      },
    },
    mode: "fixture",
  });
  const { mode: _mode, ...input } = parsed;
  const principal: Principal = { id: "single-lane-agent", workspace_id: "single-lane-workspace", role: "agent" };
  const created = await createMission(input, principal, "single-lane-fiverr", "fixture");
  const result = await runFixture(created.record.id, principal.workspace_id);
  assert.deepEqual(result.view.tasks.map(task => task.lane), ["fiverr"]);
  assert.equal(result.view.tasks[0].title, "Find a beat maker");
  assert.ok(result.view.tasks[0].proposal);
  assert.equal(missionSchema.safeParse({ ...parsed, requirements: {} }).success, false);
});
