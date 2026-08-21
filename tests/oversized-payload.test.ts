import { test } from "node:test";
import assert from "node:assert/strict";
import { connectToFixture } from "./helpers.js";
import { runOversizedPayload } from "../src/scenarios/oversized-payload.js";

test("flags a read-only tool that does not respond within the timeout to an oversized argument", async () => {
  const { client, disconnect } = await connectToFixture("unbounded");
  try {
    const findings = await runOversizedPayload(client, { payloadBytes: 2000, timeoutMs: 500 });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.tool, "search_docs");
    assert.match(findings[0]?.message ?? "", /did not respond within/);
  } finally {
    await disconnect();
  }
});

test("does not flag a read-only tool that validates and rejects an oversized argument", async () => {
  const { client, disconnect } = await connectToFixture("bounded");
  try {
    const findings = await runOversizedPayload(client, { payloadBytes: 20_000, timeoutMs: 500 });
    assert.deepEqual(findings, []);
  } finally {
    await disconnect();
  }
});
