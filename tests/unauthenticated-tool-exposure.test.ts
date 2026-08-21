import { test } from "node:test";
import assert from "node:assert/strict";
import { startHttpFixture } from "./helpers.js";
import { runUnauthenticatedToolExposure } from "../src/scenarios/unauthenticated-tool-exposure.js";

test("flags a server that returns tools/list with no credentials presented", async () => {
  const { baseUrl, stop } = await startHttpFixture("unauthenticated");
  try {
    const findings = await runUnauthenticatedToolExposure(baseUrl);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.severity, "critical");
    assert.match(findings[0]?.detail ?? "", /get_status/);
  } finally {
    stop();
  }
});

test("does not flag a server that rejects unauthenticated requests", async () => {
  const { baseUrl, stop } = await startHttpFixture("authenticated");
  try {
    const findings = await runUnauthenticatedToolExposure(baseUrl);
    assert.deepEqual(findings, []);
  } finally {
    stop();
  }
});
