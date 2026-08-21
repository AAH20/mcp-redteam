import { test } from "node:test";
import assert from "node:assert/strict";
import { connectToFixture } from "./helpers.js";
import { runUnannotatedDestructiveTools } from "../src/scenarios/unannotated-destructive-tools.js";

test("flags a destructive-sounding tool with no destructiveHint annotation, and only that one", async () => {
  const { client, disconnect } = await connectToFixture("unannotated-destructive");
  try {
    const findings = await runUnannotatedDestructiveTools(client);
    // get_account_information (contains "format" only as a substring of
    // "information") and purge_cache (explicit destructiveHint: false) must
    // both be excluded — only delete_records should be flagged.
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.tool, "delete_records");
  } finally {
    await disconnect();
  }
});

test("does not flag a destructive tool that is correctly annotated", async () => {
  const { client, disconnect } = await connectToFixture("stable");
  try {
    // "stable" fixture's delete_records tool IS annotated destructiveHint: true
    const findings = await runUnannotatedDestructiveTools(client);
    assert.deepEqual(findings, []);
  } finally {
    await disconnect();
  }
});
