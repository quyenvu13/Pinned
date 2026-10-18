import { test } from "node:test";
import assert from "node:assert/strict";
import { compatibleContract, validDerivedAmount, parseRounds, parseTerm, quoteAmounts } from "../../src/lib/parse.ts";

test("amounts up to 10^18 survive parsing exactly (JS numbers would round them)", () => {
  const raw = '{"term_id": "a", "amount": 999999999999999999, "round_count": 1}';
  assert.equal(JSON.parse(raw).amount, 1000000000000000000);       // the trap
  assert.equal(parseTerm(raw)?.amount, "999999999999999999");
  assert.equal(parseTerm('{"amount": 1000000000000000000}')?.amount, "1000000000000000000");
  assert.equal(quoteAmounts('{"amount":0}'), '{"amount": "0"}');
});

test("unknown id and broken JSON read as nothing", () => {
  assert.equal(parseTerm("{}"), null);
  assert.equal(parseTerm("not json"), null);
  assert.deepEqual(parseRounds("{}"), []);
});

test("rounds keep their amounts as strings", () => {
  const rows = parseRounds('{"term_id": "a", "round_count": 2, "offset": 0, "rounds": [{"round": 1, "amount": 4000, "proposed_by": "0xa", "reject_note": "no"}, {"round": 2, "amount": 3500, "proposed_by": "0xb", "reject_note": ""}]}');
  assert.deepEqual(rows.map((r) => [r.round, r.amount, r.reject_note]), [[1, "4000", "no"], [2, "3500", ""]]);
});

test("amount-bound contract compatibility rejects old or incomplete deployments", () => {
  assert.equal(compatibleContract({contract_name:"TermCertain",version:"2.0.0",fixed_amount_required:true}),true);
  for(const value of [null,{contract_name:"TermCertain",version:"1.0.0"},{contract_name:"TermCertain",version:"2.0.0"}]) assert.equal(compatibleContract(value),false);
  assert.equal(validDerivedAmount("1000000000000000000"),true);
  for(const value of ["0","01","4e3",4000,"1000000000000000001"]) assert.equal(validDerivedAmount(value),false);
});
