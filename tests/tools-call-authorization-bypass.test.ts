import { test } from "node:test";
import assert from "node:assert/strict";
import { startHttpFixture } from "./helpers.js";
import { runToolsCallAuthorizationBypass } from "../src/scenarios/tools-call-authorization-bypass.js";

test("flags a server that gates tools/list but not tools/call", async () => {
  const { baseUrl, stop } = await startHttpFixture("call-not-gated");
  try {
    const findings = await runToolsCallAuthorizationBypass(baseUrl, ["get_status"]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.severity, "critical");
    assert.equal(findings[0]?.tool, "get_status");
  } finally {
    stop();
  }
});

test("does not flag a server that gates tools/call consistently with tools/list", async () => {
  const { baseUrl, stop } = await startHttpFixture("call-gated");
  try {
    const findings = await runToolsCallAuthorizationBypass(baseUrl, ["get_status"]);
    assert.deepEqual(findings, []);
  } finally {
    stop();
  }
});

test("reports no findings when there is no known tool name to probe", async () => {
  const { baseUrl, stop } = await startHttpFixture("call-not-gated");
  try {
    const findings = await runToolsCallAuthorizationBypass(baseUrl, []);
    assert.deepEqual(findings, []);
  } finally {
    stop();
  }
});
