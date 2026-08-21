import { test } from "node:test";
import assert from "node:assert/strict";
import { connectToFixture, startHttpFixture } from "./helpers.js";
import { runAgainstClient, runAgainstTarget } from "../src/runner.js";

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

test("HTTP target also runs unauthenticated-tool-exposure alongside the client scenarios", async () => {
  const { baseUrl, stop } = await startHttpFixture("unauthenticated");
  try {
    const results = await runAgainstTarget({ kind: "http", url: baseUrl });
    const names = results.map((r) => r.scenario).sort();
    assert.deepEqual(names, [
      "tool-description-stability",
      "unannotated-destructive-tools",
      "unauthenticated-tool-exposure",
    ]);
    const exposure = results.find((r) => r.scenario === "unauthenticated-tool-exposure");
    assert.equal(exposure?.findings.length, 1);
  } finally {
    stop();
  }
});

test("unauthenticated-tool-exposure still runs when the primary (credentialed) connection fails", async () => {
  const { baseUrl, stop } = await startHttpFixture("authenticated");
  try {
    // No headers supplied — the primary connection is expected to fail
    // against a fixture that requires auth. The scenario that doesn't
    // need that connection should still produce a real result rather
    // than the whole run aborting.
    const results = await runAgainstTarget({ kind: "http", url: baseUrl });
    const names = results.map((r) => r.scenario).sort();
    assert.deepEqual(names, ["connection", "unauthenticated-tool-exposure"]);

    const connection = results.find((r) => r.scenario === "connection");
    assert.match(connection?.error ?? "", /primary connection/);

    const exposure = results.find((r) => r.scenario === "unauthenticated-tool-exposure");
    assert.deepEqual(exposure?.findings, []);
  } finally {
    stop();
  }
});
