// Postconditions checked AFTER the receipt says SUCCESS, against reloaded
// accepted state. Every written field must match the submission.

import { pyStrip } from "./pytext.ts";
import { validDerivedAmount } from "./parse.ts";
import type { Round, Term } from "./types.ts";

export type OpenSubmission = { me: string; otherWallet: string; label: string; text: string; termId: string };

export function openVerified(t: Term | null, s: OpenSubmission): boolean {
  if (!t) return false;
  const pinned = t.certainty === "PINNED" && t.outcome === "FIXED" && t.signatures_required === 1 && validDerivedAmount(t.fixed_amount);
  const open = t.certainty === "OPEN_TERM" && t.outcome === "TO_BE_AGREED" && t.signatures_required === 2 && t.fixed_amount === "0";
  return (
    (pinned || open) &&
    t.term_id === s.termId &&
    t.author.toLowerCase() === s.me.toLowerCase() &&
    t.other_wallet === s.otherWallet &&
    t.other_label === pyStrip(s.label) &&
    t.text === pyStrip(s.text) &&
    t.state === "AWAITING" && t.amount === "0" && t.proposed_by === "" && t.countersigned_by === "" &&
    t.round_count === 0 && t.signatures_held === 0 && t.binding === false
  );
}

export function recordVerified(before: Term, after: Term | null, me: string, value: bigint): boolean {
  if (!after) return false;
  const one = after.signatures_required === 1;
  return (
    after.fixed_amount === before.fixed_amount &&
    (!one || (validDerivedAmount(before.fixed_amount) && value.toString() === before.fixed_amount)) &&
    after.amount === value.toString() &&
    after.proposed_by === me.toLowerCase() &&
    after.round_count === before.round_count + 1 &&
    after.state === (one ? "FINAL" : "PROPOSED") &&
    after.signatures_held === 1 &&
    after.binding === one &&
    after.signatures_required === before.signatures_required
  );
}

export function countersignVerified(before: Term, after: Term | null, me: string): boolean {
  return !!after && after.state === "FINAL" && after.countersigned_by === me.toLowerCase() &&
    after.signatures_held === 2 && after.binding === true && after.amount === before.amount && after.fixed_amount === before.fixed_amount &&
    after.proposed_by === before.proposed_by;
}

export function rejectVerified(before: Term, after: Term | null, rounds: Round[], note: string): boolean {
  if (!after) return false;
  const row = rounds.find((r) => r.round === before.round_count);
  return (
    after.fixed_amount === before.fixed_amount &&
    after.state === "AWAITING" && after.amount === "0" && after.proposed_by === "" &&
    after.round_count === before.round_count &&
    !!row && row.reject_note === pyStrip(note) && row.amount === before.amount && row.proposed_by === before.proposed_by
  );
}
