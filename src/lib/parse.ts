// Contract views return JSON strings. Amounts can reach 10^18, beyond the exact
// range of a JS number, so every "amount" is quoted BEFORE JSON.parse and kept
// as a decimal string end to end.
import type { Round, Term } from "./types.ts";

export function quoteAmounts(raw: string): string {
  return raw.replace(/"amount":\s*(-?\d+)/g, '"amount": "$1"');
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(quoteAmounts(raw));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseTerm(raw: string): Term | null {
  return parseObject(raw) as Term | null;
}

export function parseRounds(raw: string): Round[] {
  const obj = parseObject(raw);
  return obj && Array.isArray(obj.rounds) ? (obj.rounds as Round[]) : [];
}

export const CONTRACT_VERSION = "2.0.0";
export type Limits = { contract_name?: string; version?: string; fixed_amount_required?: boolean };
export function compatibleContract(limits: Limits | null | undefined): boolean {
  return limits?.contract_name === "TermCertain" && limits.version === CONTRACT_VERSION && limits.fixed_amount_required === true;
}
export function validDerivedAmount(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 10n ** 18n;
}
