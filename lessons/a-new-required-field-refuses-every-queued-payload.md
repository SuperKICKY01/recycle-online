# A new required field on a write route refuses every payload already queued offline

**Applies** the moment a schema change adds a column to a table the phone writes
THROUGH A QUEUE — a bill, a payment, a seller — and the natural next line is "and
the request body requires it". On an offline-first client the request bodies that
will hit the new server first are not the ones the new client builds; they are
the ones ALREADY SITTING IN OUTBOXES, built by the previous bundle, stored
verbatim and posted byte for byte. A required field refuses every one of them.

**Context.** Migration 0018 added `purchase_bills.branch_id NOT NULL`. The obvious
`BillCreate.branch_id: uuid.UUID` would have been correct for every bill the new
phone builds and wrong for every bill the old phone had queued, and the failure is
not a retry: the phone stores the wire body as JSON at creation
(`mobile/src/sync/createBill.ts`), parses it back unchanged
(`SqliteLocalStore.ts`) and posts `JSON.stringify(bill.payload)`
(`httpTransport.ts`); a 422 is decided by STATUS alone (`httpTransport.ts`), maps
to `terminal` (`outboxHandlers.ts`), lands the row in `sync_state='failed'`, which
the sendable queue excludes for ever; the void button is withheld
(`parkedReason.ts`), and the operator reads that the system refused the bill and
will not accept it later, that the money is already paid, and that the bill exists
on this device only. That is `unavailable-is-not-rejected.md`'s worst case
reached from the schema side: a PERMANENT refusal, of cash already handed over,
manufactured by a deploy.

**Rule.** When a write route gains a field for a column that is NOT NULL on the
server, the field is OPTIONAL ON THE WIRE and the SERVER resolves it — from the
principal, from the tenant's single row, from a default the business owns — and
refuses only with the RESOLVABLE class (424) when it cannot. The column's NOT
NULL is the database's; the request body's shape is the queue's. Ask, before
every `Field(...)` without a default on a route the outbox reaches: **what is in
an outbox right now, and what does this line do to it?** Write the answer in the
migration's docstring, so the next session that wants to "tidy" the field into a
required one has to meet it first.

**Why (the failure it prevents).** The refusal is silent at deploy time and loud
in the yard the next morning. No proof against the new client catches it, because
the new client sends the field; only a proof that stages the OLD payload shape and
drains it through the new server does (server `prove_branches.py` B5, mobile
`prove:branch` B2), and that proof only exists if someone asked the question. The
schema-side lesson pairs with the client-side one: `sqlite` migrations here are
ADDITIVE and never rebuild a table holding unsent bills (`schema.ts`'s
`migrateColumns`) for the same reason — the rows that matter most at an upgrade
are the ones written before it.

**Where proven.** 2026-09-03, migration 0018: `BillCreate.branch_id: UUID | None
= None`, resolved by `_resolve_bill_branch` in `server/app/bills.py`;
`prove_branches.py` B5 posts a payload with no `branch_id` to a 0018 server and
reads 201 on the born-with branch; `prove:branch` B2 stages a bill row whose
payload JSON has no `branch_id` key, drains it through the real `SyncEngine`, and
reads the wire body without the key and the row `synced` with a doc_no. The
opposite reading — what a required field would have done — is the chain of
file:line above, read from the client, not run: no session should have to run it.

Sibling of `unavailable-is-not-rejected.md` (the classification whose terminal arm
this reaches) and of `a-fail-closed-trigger-conscripts-every-writer-of-its-table.md`
(a fail-closed obligation's blast radius is every writer, and the outbox is a
writer nobody sees from `app/`).
