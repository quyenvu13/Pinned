import { test } from "node:test";
import assert from "node:assert/strict";
import { countersignVerified, openVerified, recordVerified, rejectVerified } from "../../src/lib/verify.ts";
import type { Term } from "../../src/lib/types.ts";

const ME = "0x" + "a".repeat(40);
const OTHER = "0x" + "b".repeat(40);
const ID = "1".repeat(64);
const pinned = (o: Partial<Term> = {}): Term => ({ term_id: ID, author: ME, other_wallet: OTHER, other_label: "the other side",
  text: "A sum.", outcome: "FIXED", certainty: "PINNED", state: "AWAITING", amount: "0", proposed_by: "", countersigned_by: "",
  round_count: 0, max_rounds: 10, signatures_required: 1, signatures_held: 0, binding: false, ...o });
const open = (o: Partial<Term> = {}) => pinned({ outcome: "TO_BE_AGREED", certainty: "OPEN_TERM", signatures_required: 2, ...o });
const sub = { me: ME, otherWallet: OTHER, label: " the other side ", text: " A sum. ", termId: ID };

test("open postcondition: either reading, but outcome/certainty/threshold must agree", () => {
  assert.equal(openVerified(pinned(), sub), true);
  assert.equal(openVerified(open(), sub), true);
  assert.equal(openVerified(pinned({ signatures_required: 2 }), sub), false);
  assert.equal(openVerified(open({ outcome: "FIXED" }), sub), false);
  assert.equal(openVerified(pinned({ text: "Other." }), sub), false);
  assert.equal(openVerified(pinned({ amount: "5" }), sub), false);
  assert.equal(openVerified(null, sub), false);
});

test("record postcondition: FINAL with one signature, PROPOSED with two", () => {
  assert.equal(recordVerified(pinned(), pinned({ state: "FINAL", amount: "4000", proposed_by: ME, round_count: 1, signatures_held: 1, binding: true }), ME, 4000n), true);
  assert.equal(recordVerified(open(), open({ state: "PROPOSED", amount: "4000", proposed_by: ME, round_count: 1, signatures_held: 1 }), ME, 4000n), true);
  assert.equal(recordVerified(open(), open({ state: "FINAL", amount: "4000", proposed_by: ME, round_count: 1, signatures_held: 1, binding: true }), ME, 4000n), false);
  assert.equal(recordVerified(pinned(), pinned({ state: "PROPOSED", amount: "4000", proposed_by: ME, round_count: 1, signatures_held: 1 }), ME, 4000n), false);
  assert.equal(recordVerified(open(), open({ state: "PROPOSED", amount: "3999", proposed_by: ME, round_count: 1, signatures_held: 1 }), ME, 4000n), false);
  assert.equal(recordVerified(open(), null, ME, 1n), false);
});

test("counter-sign postcondition", () => {
  const before = open({ state: "PROPOSED", amount: "3500", proposed_by: OTHER, round_count: 2, signatures_held: 1 });
  assert.equal(countersignVerified(before, { ...before, state: "FINAL", countersigned_by: ME, signatures_held: 2, binding: true }, ME), true);
  assert.equal(countersignVerified(before, { ...before, state: "FINAL", countersigned_by: OTHER, signatures_held: 2, binding: true }, ME), false);
  assert.equal(countersignVerified(before, null, ME), false);
});

test("reject postcondition: back to AWAITING, round kept with its note", () => {
  const before = open({ state: "PROPOSED", amount: "4000", proposed_by: ME, round_count: 1, signatures_held: 1 });
  const after = open({ round_count: 1 });
  const rounds = [{ round: 1, amount: "4000", proposed_by: ME, reject_note: "Too high" }];
  assert.equal(rejectVerified(before, after, rounds, " Too high "), true);
  assert.equal(rejectVerified(before, { ...after, round_count: 0 }, rounds, "Too high"), false);
  assert.equal(rejectVerified(before, after, [], "Too high"), false);
  assert.equal(rejectVerified(before, after, rounds, "Other"), false);
});
