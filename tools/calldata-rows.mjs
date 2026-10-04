// Shared rows for tools/calldata-bytes.mjs, tools/probe-calldata.mjs and tests.
export const OTHER = "0x" + "1".repeat(40);
export const LABEL = "the other side";
export const ID = "f".repeat(64);
export const NOTE60 = "n".repeat(60);
export const MAX_AMOUNT = 10n ** 18n;

export const CASES = {
  X1: "The fee is 4,000 a month.",
  X2: "The rate is set out in the schedule and does not move.",
  X3: "Each additional seat costs the same as the first.",
  X4: "The amount is whatever the published list says on the day of order.",
  X5: "The total is the unit price times the quantity ordered.",
  Y1: "The fee will be settled between us nearer the time.",
  Y2: "The rate is to be discussed once volumes are clear.",
  Y3: "Each additional seat costs whatever we later think reasonable.",
  Y4: "The amount is whatever the parties arrive at in good faith.",
  Y5: "The total will be worked out together after the first month.",
};

/** HARD BLOCK: any of these over 255 bytes stops the release. */
export function hardBlockRows() {
  const rows = Object.entries(CASES).map(([name, text]) => ({
    name: `open_term ${name}`, method: "open_term", args: [OTHER, LABEL, text],
  }));
  rows.push({ name: "record_amount (id + 10^18)", method: "record_amount", args: [ID, MAX_AMOUNT] });
  rows.push({ name: "countersign (id)", method: "countersign", args: [ID] });
  rows.push({ name: "reject_amount (id + 60-char note)", method: "reject_amount", args: [ID, NOTE60] });
  return rows;
}

/** MEASURE ONLY: the contract caps are wider than the proven path. */
export function measureOnlyRows() {
  return [
    { name: "open_term at max label 80 + max text 600", method: "open_term", args: [OTHER, "l".repeat(80), "t".repeat(600)] },
  ];
}
