// Mirrors every revert of contracts/TermCertain.py that can be predicted from
// state already read, in the SAME order the contract checks them. The number of
// signatures a sum needs is NEVER worked out here: it is read from
// get_term().signatures_required, which the contract computes in
// _signatures_required — the only place the threshold exists.

import { pyContainsToken, pyLen, pyStrip } from "./pytext.ts";
import { validDerivedAmount } from "./parse.ts";
import type { Term } from "./types.ts";

export const MAX_TEXT_LENGTH = 600;
export const MAX_LABEL_LENGTH = 80;
export const MAX_NOTE_LENGTH = 60;
export const MAX_AMOUNT = 10n ** 18n;

export const RESERVED_TOKENS = [
  "<UNTRUSTED_TERM_TEXT>",
  "</UNTRUSTED_TERM_TEXT>",
  "<UNTRUSTED_OTHER_SIDE_LABEL>",
  "</UNTRUSTED_OTHER_SIDE_LABEL>",
  "FIXED",
  "TO_BE_AGREED",
] as const;

export const REVERTS = {
  invalidWallet: "Invalid wallet address",
  labelEmpty: "Label is empty",
  labelTooLong: "Label is too long",
  textEmpty: "Text is empty",
  textTooLong: "Text is too long",
  reserved: "Text or label contains a reserved token",
  otherIsAuthor: "The other side cannot be the author",
  duplicate: "This term already exists",
  unknownTerm: "Unknown term id",
  onTable: "An amount is already on the table",
  final: "This sum is already final",
  onlyAuthorFixed: "Only the author may record the sum on a fixed term",
  onlySidesPropose: "Only the two named sides may propose a sum",
  outOfRange: "The amount is out of range",
  amountMismatch: "The amount does not match the validator-derived sum",
  noRoom: "No room for a further round",
  noCountersign: "This sum is fixed by the text; no counter-signature is needed",
  noProposalSign: "There is no proposed sum to counter-sign",
  selfSign: "The side that proposed the sum cannot counter-sign it",
  onlySidesSign: "Only the two named sides may counter-sign",
  nothingToReject: "There is nothing to reject; the text fixes this sum",
  noProposalReject: "There is no proposed sum to reject",
  selfReject: "The side that proposed the sum cannot reject it",
  onlySidesReject: "Only the two named sides may reject a sum",
  noteEmpty: "Note is empty",
  noteTooLong: "Note is too long",
} as const;

/** UI-only: the field is not a whole number at all (the contract only ever receives an int). */
export const NOT_A_NUMBER = "Enter a whole number";

const ZERO = "0x0000000000000000000000000000000000000000";

export type WalletCheck = { ok: true; wallet: string } | { ok: false; reason: string };

/** The contract's _normalize_wallet. */
export function normalizeWallet(value: string): WalletCheck {
  const wallet = pyStrip(value).toLowerCase();
  if (wallet.length !== 42 || !wallet.startsWith("0x") || !/^[0-9a-f]{40}$/.test(wallet.slice(2)) || wallet === ZERO) {
    return { ok: false, reason: REVERTS.invalidWallet };
  }
  return { ok: true, wallet };
}

/** "Signatures: 1 of 2 — not binding yet", straight from the view's own fields. */
export function signatureLine(t: Term): string {
  return `Signatures: ${t.signatures_held} of ${t.signatures_required} — ${t.binding ? "binding" : "not binding yet"}`;
}

export function roundLine(t: Term): string {
  return `Round ${t.round_count} of ${t.max_rounds}`;
}

export type Role = "author" | "other side" | "neither side";

export function roleOf(t: Term, me: string): Role {
  const m = me.toLowerCase();
  if (m === t.author.toLowerCase()) return "author";
  if (m === t.other_wallet.toLowerCase()) return "other side";
  return "neither side";
}

const isSide = (t: Term, me: string) => roleOf(t, me) !== "neither side";

export type AmountCheck = { ok: true; value: bigint } | { ok: false; reason: string };

/** A decimal whole number; the range check is the contract's own sentence. */
export function parseAmount(raw: string): AmountCheck {
  const s = pyStrip(raw).replace(/[,_\s]/g, "");
  if (!/^-?\d+$/.test(s)) return { ok: false, reason: NOT_A_NUMBER };
  const value = BigInt(s);
  if (value <= 0n || value > MAX_AMOUNT) return { ok: false, reason: REVERTS.outOfRange };
  return { ok: true, value };
}

export type OpenInput = { me: string; otherWallet: string; label: string; text: string; exists: boolean };

/** open_term order: wallet -> label -> text -> reserved -> other != author -> duplicate. */
export function openBlock(i: OpenInput): string | null {
  const w = normalizeWallet(i.otherWallet);
  if (!w.ok) return w.reason;
  const label = pyStrip(i.label);
  if (pyLen(label) === 0) return REVERTS.labelEmpty;
  if (pyLen(label) > MAX_LABEL_LENGTH) return REVERTS.labelTooLong;
  const text = pyStrip(i.text);
  if (pyLen(text) === 0) return REVERTS.textEmpty;
  if (pyLen(text) > MAX_TEXT_LENGTH) return REVERTS.textTooLong;
  if (pyContainsToken(label, RESERVED_TOKENS) || pyContainsToken(text, RESERVED_TOKENS)) return REVERTS.reserved;
  if (w.wallet === i.me.toLowerCase()) return REVERTS.otherIsAuthor;
  if (i.exists) return REVERTS.duplicate;
  return null;
}

/** record_amount order: PROPOSED -> FINAL -> caller (by threshold) -> range -> round cap (2-signature terms). */
export function recordBlock(t: Term, me: string, raw: string): string | null {
  if (t.state === "PROPOSED") return REVERTS.onTable;
  if (t.state === "FINAL") return REVERTS.final;
  if (t.signatures_required === 1) {
    if (me.toLowerCase() !== t.author.toLowerCase()) return REVERTS.onlyAuthorFixed;
  } else if (!isSide(t, me)) {
    return REVERTS.onlySidesPropose;
  }
  const a = parseAmount(raw);
  if (!a.ok) return a.reason;
  if (t.signatures_required === 1 && (!validDerivedAmount(t.fixed_amount) || a.value !== BigInt(t.fixed_amount))) return REVERTS.amountMismatch;
  if (t.signatures_required === 2 && t.round_count >= t.max_rounds) return REVERTS.noRoom;
  return null;
}

/** countersign order: threshold -> PROPOSED -> not the proposer -> a named side. */
export function countersignBlock(t: Term, me: string): string | null {
  if (t.signatures_required !== 2) return REVERTS.noCountersign;
  if (t.state !== "PROPOSED") return REVERTS.noProposalSign;
  if (me.toLowerCase() === t.proposed_by.toLowerCase()) return REVERTS.selfSign;
  if (!isSide(t, me)) return REVERTS.onlySidesSign;
  return null;
}

/** reject_amount order: threshold -> PROPOSED -> not the proposer -> a named side -> note. */
export function rejectBlock(t: Term, me: string, note: string): string | null {
  if (t.signatures_required !== 2) return REVERTS.nothingToReject;
  if (t.state !== "PROPOSED") return REVERTS.noProposalReject;
  if (me.toLowerCase() === t.proposed_by.toLowerCase()) return REVERTS.selfReject;
  if (!isSide(t, me)) return REVERTS.onlySidesReject;
  const n = pyStrip(note);
  if (pyLen(n) === 0) return REVERTS.noteEmpty;
  if (pyLen(n) > MAX_NOTE_LENGTH) return REVERTS.noteTooLong;
  return null;
}
