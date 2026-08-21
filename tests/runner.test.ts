import { test } from "node:test";
import assert from "node:assert/strict";
import { connectToFixture } from "./helpers.js";
import { runAgainstClient } from "../src/runner.js";

test("default run covers the two read-only scenarios and skips the invasive one", async () => {
  const { client, disconnect } = await connectToFixture("stable");
  try {
    const results = await runAgainstClient(client);
    const names = results.map((r) => r.scenario).sort();
    assert.deepEqual(names, ["tool-description-stability", "unannotated-destructive-tools"]);
    for (const result of results) {
      assert.equal(result.error, undefined);
    }
  } finally {
    await disconnect();
  }
});

test("allowToolCalls opts into the oversized-payload scenario as well", async () => {
  const { client, disconnect } = await connectToFixture("bounded");
  try {
    const results = await runAgainstClient(client, { allowToolCalls: true });
    const names = results.map((r) => r.scenario).sort();
    assert.deepEqual(names, [
      "oversized-payload",
      "tool-description-stability",
      "unannotated-destructive-tools",
    ]);
  } finally {
    await disconnect();
  }
});
