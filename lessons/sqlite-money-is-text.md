# In SQLite, money columns are TEXT — and STRICT will not save you

**Context.** Postgres has NUMERIC; SQLite does not. It has column *affinity*,
which converts values silently on the way in. The mobile local store holds the
same money and weight values the server stores as NUMERIC.

**Rule.** Every amount and weight is stored as a decimal STRING in a column with
TEXT (or BLOB) affinity — in this project, inside `payload_json TEXT`. Never
declare a money or weight column NUMERIC, DECIMAL, or REAL in SQLite, however
much it looks like the Postgres schema it mirrors.

**Why (the failure it prevents).** Verified, not assumed:

- Binding the string `"10.500"` to a **NUMERIC** column stores the float `10.5`,
  with `typeof()` reporting `real`. The trailing digit is gone and the value is
  now IEEE-754. `SELECT 0.1 + 0.2` in the same SQLite returns
  `0.30000000000000004`.
- A **STRICT** table does *not* protect against this. STRICT rejects text in an
  INTEGER column, but a TEXT column silently **accepts** a bound number and
  stringifies it: `0.3` is stored as `"0.3"` and the integer `5` is stored as
  `"5.0"`. A JS float reaching that bind would be written as its full decimal
  expansion, with no error anywhere.

So the database will not catch this class of bug. The guarantee has to live
upstream: `BillPayload` declares every amount and weight as `string`, the client
performs no arithmetic on them, and the store only ever binds the output of
`JSON.stringify`. TypeScript is the enforcement; SQLite is not.

**Where proven.** `mobile/src/proof/sqliteProof.ts` S1 (affinity conversion,
float drift, and the STRICT behaviour, all asserted against real SQLite 3.50.4)
and S2 (`"0.3" "0.1" "0.2" "0.10" "10.500" "0.30"` round-trip byte-identical
through a real file). Project hard rule 1.
