import { test } from "node:test";
import assert from "node:assert/strict";
import { connectToFixture } from "./helpers.js";
import { runToolDescriptionStability } from "../src/scenarios/tool-description-stability.js";

test("flags a tool description that changes between two listTools() calls", async () => {
  const { client, disconnect } = await connectToFixture("rug-pull");
  try {
    const findings = await runToolDescriptionStability(client, { delayMs: 300 });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.tool, "read_file");
    assert.match(findings[0]?.message ?? "", /description changed/);
  } finally {
    await disconnect();
  }
});

test("does not flag a server whose tool descriptions stay stable", async () => {
  const { client, disconnect } = await connectToFixture("stable");
  try {
    const findings = await runToolDescriptionStability(client, { delayMs: 300 });
    assert.deepEqual(findings, []);
  } finally {
    await disconnect();
  }
});
