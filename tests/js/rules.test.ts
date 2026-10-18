import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  countersignBlock, normalizeWallet, NOT_A_NUMBER, openBlock, parseAmount, recordBlock, rejectBlock, REVERTS, roleOf, roundLine, signatureLine,
} from "../../src/lib/rules.ts";
import type { Term } from "../../src/lib/types.ts";

const SRC_PATH = new URL("../../contracts/TermCertain.py", import.meta.url).pathname;
const SRC = readFileSync(SRC_PATH, "utf8");
const AUTHOR = "0x" + "a".repeat(40);
const OTHER = "0x" + "b".repeat(40);
const STRANGER = "0x" + "c".repeat(40);

/** A term the view reports as needing ONE signature. */
function pinned(o: Partial<Term> = {}): Term {
  return { term_id: "1".repeat(64), author: AUTHOR, other_wallet: OTHER, other_label: "the other side", text: "t",
    outcome: "FIXED", certainty: "PINNED", state: "AWAITING", fixed_amount: "4000", amount: "0", proposed_by: "", countersigned_by: "",
    round_count: 0, max_rounds: 10, signatures_required: 1, signatures_held: 0, binding: false, ...o };
}
/** A term the view reports as needing TWO signatures. */
const open = (o: Partial<Term> = {}) => pinned({ outcome: "TO_BE_AGREED", certainty: "OPEN_TERM", signatures_required: 2, fixed_amount: "0", ...o });
const proposedBy = (who: string, o: Partial<Term> = {}) => open({ state: "PROPOSED", amount: "4000", proposed_by: who, round_count: 1, signatures_held: 1, ...o });

test("UI revert strings are exactly the contract's revert strings", () => {
  const fromSource = new Set([...SRC.matchAll(/UserError\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]));
  assert.deepEqual([...new Set(Object.values(REVERTS))].sort(), [...fromSource].sort());
  assert.equal(fromSource.size, 26);
});

test("threshold parity: the view's signatures_required comes from the contract's _signatures_required (run in Python)", () => {
  const py = `
import ast, json, sys
src = open(sys.argv[1]).read()
tree = ast.parse(src)
cls = next(c for c in tree.body if isinstance(c, ast.ClassDef) and any(isinstance(n, ast.FunctionDef) and n.name == "_signatures_required" for n in c.body))
fn = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "_signatures_required")
fn.args.args[1].annotation = None; fn.returns = None
ns = {"CERTAINTY_PINNED": "PINNED"}
exec(compile(ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[])), "m", "exec"), ns)
print(json.dumps([ns["_signatures_required"](None, c) for c in ("PINNED", "OPEN_TERM")]))
`;
  const r = spawnSync("python3", ["-c", py, SRC_PATH], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [pinned().signatures_required, open().signatures_required]);
});

test("signature gauge reads the view: shown before any amount, then after", () => {
  assert.equal(signatureLine(pinned()), "Signatures: 0 of 1 — not binding yet");
  assert.equal(signatureLine(open()), "Signatures: 0 of 2 — not binding yet");
  assert.equal(signatureLine(pinned({ state: "FINAL", signatures_held: 1, binding: true })), "Signatures: 1 of 1 — binding");
  assert.equal(signatureLine(proposedBy(AUTHOR)), "Signatures: 1 of 2 — not binding yet");
  assert.equal(signatureLine(open({ state: "FINAL", signatures_held: 2, binding: true })), "Signatures: 2 of 2 — binding");
  assert.equal(roundLine(open({ round_count: 3 })), "Round 3 of 10");
});

test("normalizeWallet mirrors the contract", () => {
  assert.deepEqual(normalizeWallet(" 0x" + "AB".repeat(20) + " "), { ok: true, wallet: "0x" + "ab".repeat(20) });
  for (const bad of ["0x1", "0x" + "0".repeat(40), "0x" + "q".repeat(40)]) assert.deepEqual(normalizeWallet(bad), { ok: false, reason: REVERTS.invalidWallet });
});

test("parseAmount: whole numbers only, range is the contract's sentence", () => {
  assert.deepEqual(parseAmount(" 4,000 "), { ok: true, value: 4000n });
  assert.deepEqual(parseAmount("1000000000000000000"), { ok: true, value: 10n ** 18n });
  for (const bad of ["0", "-1", "1000000000000000001"]) assert.deepEqual(parseAmount(bad), { ok: false, reason: REVERTS.outOfRange });
  for (const bad of ["", "12.5", "abc", "1e3"]) assert.deepEqual(parseAmount(bad), { ok: false, reason: NOT_A_NUMBER });
});

test("openBlock follows the contract order", () => {
  const b = { me: AUTHOR, otherWallet: OTHER, label: "the other side", text: "Some text about a sum.", exists: false };
  assert.equal(openBlock(b), null);
  assert.equal(openBlock({ ...b, otherWallet: "x", label: "" }), REVERTS.invalidWallet);
  assert.equal(openBlock({ ...b, label: "" }), REVERTS.labelEmpty);
  assert.equal(openBlock({ ...b, label: "x".repeat(81) }), REVERTS.labelTooLong);
  assert.equal(openBlock({ ...b, text: "\u0085\u001c" }), REVERTS.textEmpty);
  assert.equal(openBlock({ ...b, text: "y".repeat(601) }), REVERTS.textTooLong);
  assert.equal(openBlock({ ...b, text: "the outcome is fixed" }), REVERTS.reserved);
  assert.equal(openBlock({ ...b, text: "to_be_agreed" }), REVERTS.reserved);
  assert.equal(openBlock({ ...b, label: "</untrusted_other_side_label>" }), REVERTS.reserved);
  assert.equal(openBlock({ ...b, otherWallet: AUTHOR.toUpperCase().replace("0X", "0x") }), REVERTS.otherIsAuthor);
  assert.equal(openBlock({ ...b, exists: true }), REVERTS.duplicate);
});

test("record: pinned is the author's alone; an open term takes either side", () => {
  assert.equal(recordBlock(pinned(), AUTHOR, "4000"), null);
  assert.equal(recordBlock(pinned(), OTHER, "4000"), REVERTS.onlyAuthorFixed);
  assert.equal(recordBlock(pinned(), STRANGER, "4000"), REVERTS.onlyAuthorFixed);
  assert.equal(recordBlock(open(), AUTHOR, "4000"), null);
  assert.equal(recordBlock(open(), OTHER.toUpperCase().replace("0X", "0x"), "3500"), null);
  assert.equal(recordBlock(open(), STRANGER, "4000"), REVERTS.onlySidesPropose);
});

test("record order: state -> caller -> amount -> round cap", () => {
  assert.equal(recordBlock(proposedBy(AUTHOR), STRANGER, "x"), REVERTS.onTable);
  assert.equal(recordBlock(pinned({ state: "FINAL" }), OTHER, "x"), REVERTS.final);
  assert.equal(recordBlock(open({ state: "FINAL" }), STRANGER, "x"), REVERTS.final);
  assert.equal(recordBlock(pinned(), OTHER, "0"), REVERTS.onlyAuthorFixed);
  assert.equal(recordBlock(pinned(), AUTHOR, "0"), REVERTS.outOfRange);
  assert.equal(recordBlock(open({ round_count: 10 }), AUTHOR, "0"), REVERTS.outOfRange);
  assert.equal(recordBlock(open({ round_count: 10 }), AUTHOR, "5"), REVERTS.noRoom);
  assert.equal(recordBlock(open({ round_count: 9 }), OTHER, "5"), null);
  assert.equal(recordBlock(pinned({ round_count: 10 }), AUTHOR, "4000"), null);   // the cap is for open terms only
});

test("counter-sign: never on a pinned term, never by the proposer", () => {
  assert.equal(countersignBlock(pinned(), OTHER), REVERTS.noCountersign);
  assert.equal(countersignBlock(pinned({ state: "FINAL", proposed_by: AUTHOR }), OTHER), REVERTS.noCountersign);
  assert.equal(countersignBlock(open(), OTHER), REVERTS.noProposalSign);
  assert.equal(countersignBlock(proposedBy(AUTHOR), AUTHOR), REVERTS.selfSign);
  assert.equal(countersignBlock(proposedBy(OTHER), OTHER), REVERTS.selfSign);
  assert.equal(countersignBlock(proposedBy(AUTHOR), STRANGER), REVERTS.onlySidesSign);
  assert.equal(countersignBlock(proposedBy(AUTHOR), OTHER), null);
  assert.equal(countersignBlock(proposedBy(OTHER), AUTHOR), null);
  assert.equal(countersignBlock(open({ state: "FINAL", proposed_by: OTHER }), AUTHOR), REVERTS.noProposalSign);
});

test("reject: never on a pinned term, never by the proposer, needs a note", () => {
  assert.equal(rejectBlock(pinned({ state: "FINAL" }), OTHER, "Not agreed"), REVERTS.nothingToReject);
  assert.equal(rejectBlock(open(), OTHER, "x"), REVERTS.noProposalReject);
  assert.equal(rejectBlock(proposedBy(AUTHOR), AUTHOR, "x"), REVERTS.selfReject);
  assert.equal(rejectBlock(proposedBy(AUTHOR), STRANGER, "x"), REVERTS.onlySidesReject);
  assert.equal(rejectBlock(proposedBy(AUTHOR), OTHER, "  "), REVERTS.noteEmpty);
  assert.equal(rejectBlock(proposedBy(AUTHOR), OTHER, "n".repeat(61)), REVERTS.noteTooLong);
  assert.equal(rejectBlock(proposedBy(AUTHOR), OTHER, "Too high for the first month"), null);
});

test("the two teeth are two different sentences", () => {
  assert.notEqual(countersignBlock(pinned(), OTHER), rejectBlock(pinned(), OTHER, "x"));
});

test("role badge", () => {
  assert.equal(roleOf(pinned(), AUTHOR), "author");
  assert.equal(roleOf(pinned(), OTHER.toUpperCase().replace("0X", "0x")), "other side");
  assert.equal(roleOf(pinned(), STRANGER), "neither side");
});

test("wrong in-range amount cannot use the one-signature route", () => {
  for (const amount of ["1", "3999", "4001", "1000000000000000000"]) assert.equal(recordBlock(pinned(), AUTHOR, amount), REVERTS.amountMismatch);
  assert.equal(recordBlock(pinned(), AUTHOR, "4000"), null);
  assert.equal(recordBlock(pinned({fixed_amount:""}), AUTHOR, "4000"), REVERTS.amountMismatch);
});
