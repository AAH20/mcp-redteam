import { test } from "node:test";
import assert from "node:assert/strict";
import { startHttpFixture } from "./helpers.js";
import { runTokenAudienceValidation } from "../src/scenarios/token-audience-validation.js";

test("flags a server that accepts a wrong-audience token because it only checks header presence", async () => {
  const { baseUrl, stop } = await startHttpFixture("audience-blind");
  try {
    const findings = await runTokenAudienceValidation(baseUrl);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.severity, "critical");
    assert.match(findings[0]?.detail ?? "", /unrelated-resource\.example\.com/);
  } finally {
    stop();
  }
});

test("does not flag a server that actually validates the token audience claim", async () => {
  const { baseUrl, stop } = await startHttpFixture("audience-validating");
  try {
    const findings = await runTokenAudienceValidation(baseUrl);
    assert.deepEqual(findings, []);
  } finally {
    stop();
  }
});

test("does not flag a server that rejects unauthenticated/unrecognized requests outright", async () => {
  const { baseUrl, stop } = await startHttpFixture("authenticated");
  try {
    const findings = await runTokenAudienceValidation(baseUrl);
    assert.deepEqual(findings, []);
  } finally {
    stop();
  }
});
