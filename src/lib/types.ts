export type Term = {
  term_id: string;
  author: string;
  other_wallet: string;
  other_label: string;
  text: string;
  outcome: "FIXED" | "TO_BE_AGREED" | string;
  certainty: "PINNED" | "OPEN_TERM" | string;
  state: "AWAITING" | "PROPOSED" | "FINAL" | string;
  /** Decimal string: the contract allows up to 10^18, beyond a JS number's exact range. */
  amount: string;
  proposed_by: string;
  countersigned_by: string;
  round_count: number;
  max_rounds: number;
  signatures_required: number;
  signatures_held: number;
  binding: boolean;
};

export type Round = {
  round: number;
  amount: string;
  proposed_by: string;
  reject_note: string;
};

export type TxPhase = "idle" | "checking" | "signing" | "submitted" | "delayed" | "success" | "error";

export type TxStatus = {
  phase: TxPhase;
  message: string;
  hash?: string;
};
