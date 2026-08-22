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

test("HTTP target also runs the credential-independent scenarios alongside the client ones", async () => {
  const { baseUrl, stop } = await startHttpFixture("unauthenticated");
  try {
    const results = await runAgainstTarget({ kind: "http", url: baseUrl });
    const names = results.map((r) => r.scenario).sort();
    assert.deepEqual(names, [
      "token-audience-validation",
      "tool-description-stability",
      "tools-call-authorization-bypass",
      "unannotated-destructive-tools",
      "unauthenticated-tool-exposure",
    ].sort());
    const exposure = results.find((r) => r.scenario === "unauthenticated-tool-exposure");
    assert.equal(exposure?.findings.length, 1);
    const audience = results.find((r) => r.scenario === "token-audience-validation");
    // "unauthenticated" mode accepts anything, including the wrong-audience
    // probe token, so this scenario should flag it too on this fixture.
    assert.equal(audience?.findings.length, 1);
    const callBypass = results.find((r) => r.scenario === "tools-call-authorization-bypass");
    // "unauthenticated" mode has no gating at all, on any method, so an
    // unauthenticated tools/call using the tool name discovered by the
    // primary connection succeeds here too.
    assert.equal(callBypass?.findings.length, 1);
  } finally {
    stop();
  }
});

test("credential-independent scenarios still run when the primary (credentialed) connection fails", async () => {
  const { baseUrl, stop } = await startHttpFixture("authenticated");
  try {
    // No headers supplied — the primary connection is expected to fail
    // against a fixture that requires auth. The scenarios that don't need
    // that connection should still produce real results rather than the
    // whole run aborting.
    const results = await runAgainstTarget({ kind: "http", url: baseUrl });
    const names = results.map((r) => r.scenario).sort();
    assert.deepEqual(
      names,
      [
        "connection",
        "token-audience-validation",
        "tools-call-authorization-bypass",
        "unauthenticated-tool-exposure",
      ].sort(),
    );

    const connection = results.find((r) => r.scenario === "connection");
    assert.match(connection?.error ?? "", /primary connection/);

    const exposure = results.find((r) => r.scenario === "unauthenticated-tool-exposure");
    assert.deepEqual(exposure?.findings, []);

    // "authenticated" mode requires an exact bearer match, which the
    // wrong-audience probe token also fails to satisfy.
    const audience = results.find((r) => r.scenario === "token-audience-validation");
    assert.deepEqual(audience?.findings, []);

    // The primary connection never succeeded, so there's no known tool
    // name to probe — nothing to flag, and nothing guessed.
    const callBypass = results.find((r) => r.scenario === "tools-call-authorization-bypass");
    assert.deepEqual(callBypass?.findings, []);
  } finally {
    stop();
  }
});
