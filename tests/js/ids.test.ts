import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { termId } from "../../src/lib/ids.ts";
import { pyLen, pyNormalize, pyStrip } from "../../src/lib/pytext.ts";

const v = JSON.parse(readFileSync(new URL("./id-vectors.json", import.meta.url), "utf8"));

test("term ids match the contract, including whitespace edge cases", () => {
  assert.ok(v.terms.length >= 7);
  for (const row of v.terms) {
    assert.equal(pyNormalize(pyStrip(row.text)), row.normalized);
    assert.equal(pyLen(row.normalized), row.py_len);
    assert.equal(termId(v.author, row.text), row.term_id, JSON.stringify(row.text));
    assert.equal(termId(v.author.toUpperCase().replace("0X", "0x"), row.text), row.term_id);
  }
});
