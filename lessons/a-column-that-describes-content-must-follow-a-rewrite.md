# A column that describes the row's CONTENT must follow a rewrite; one that records its ORIGIN never may

**Applies to** every `ON CONFLICT ... DO UPDATE` list, and to every other place a
row is rewritten in part — an upsert, a partial UPDATE, a merge, a sync that
reconciles a local row against a server one. The question is always the same and
it is never "which columns changed": **does this column describe WHAT THE ROW NOW
HOLDS, or WHERE THE ROW CAME FROM?** Content follows a rewrite. Origin never does.

Getting it backwards is silent in both directions, and the two failures look
nothing alike, which is why the rule has to be stated as one rule rather than
learned twice.

## Three upserts, one directory, and they do not agree

`mobile/src/adapters/sqlite/` holds three `DO UPDATE` lists. All three carry a
tenant or a user id. Two must carry it forward and one must not. Nothing about
their shape says which is which.

| statement | the identity columns | why |
|---|---|---|
| `master_cache` ON CONFLICT (kind) — `SqliteMasterStore.ts` | **carried forward** | the row describes WHICH SHOP the cached list currently belongs to |
| `local_identity` ON CONFLICT (only_row) — `SqliteIdentityStore.ts` | **carried forward** | the row describes WHO IS SIGNED IN NOW |
| `local_draft` ON CONFLICT (id) — `SqliteDraftStore.ts` | **deliberately absent** | the pair records WHO OPENED this cart, a fact about the past |

Read as "the owner columns", the third looks like an oversight beside the other
two. Read as "the origin of the row", it is the only one that is right.

## Both failures, and neither raises anything

**OMITTING IT WHERE IT IS CONTENT.** `master_cache` is keyed on `kind`, so a
handset that changes shops UPDATES the existing `'products'` row rather than
inserting one. Set only `fetched_at` and the OLD shop's tenant stays on a stamp
that now describes the NEW shop's rows. The reader compares the stamp's tenant
against the signed-in one, they differ, and a refresh that has just succeeded
reports the cache as ABSENT — blocking a yard whose data is perfectly good. The
opposite of the failure the column was added for, reached by the same line.
Caught by reading while writing `8ec784e`, not by a green.

**INCLUDING IT WHERE IT IS ORIGIN.** `local_draft` saves on a keystroke. List the
owner in the DO UPDATE and the next character typed after a shift change
silently reattributes the cart to whoever is signed in now, erasing the fact that
somebody else opened it — and nothing on the device would ever show that it
happened (`ARCHITECTURE.md` section 11). `proveOwner.ts` O4 exists for this and
asserts the row still records the opener after a later save under another
identity; recorded at `0ac09ef`.

Note what the two have in common: **no error, no exception, no failed write.**
One quietly withholds good data, the other quietly rewrites provenance. Both are
one line in a list that reviewers read as a formality.

## The test

Ask of the column: **if this row's DATA were rewritten wholesale tomorrow, would
this value still be true of it?**

- A tenant on a cached price list: no — the list would be another shop's, and the
  column must move with it. CONTENT.
- The pair on a draft: yes — somebody opened that cart, and no later edit makes
  that untrue. ORIGIN.
- `master_as_of` on a draft: yes, and it is the same rule again — the column
  records which master data the lines were priced from, which a later refresh
  cannot change retroactively. Already absent from that DO UPDATE list for
  exactly this reason, written up before the owner columns joined it.

The wrong question, and the one that produces both defects, is "does this column
belong to the same feature as the ones above it". `owner_tenant_id` belongs to
the same FEATURE in all three statements and needs opposite treatment in one of
them.

## How to apply

1. **Classify every column in a DO UPDATE list as content or origin, out loud,
   before writing the list.** Not the ones you are adding — all of them.
2. **Write the classification at the statement**, because the next author meets
   the statement and not this file. All three sites above now say which they are
   and name at least one of the others, so a reader comparing them lands on the
   distinction rather than on the apparent inconsistency.
3. **Never copy a DO UPDATE list between tables.** It is the one construct where
   two tables that model the same idea want different answers, and copying
   carries the source's classification silently.
4. **Where the column is ORIGIN, expect a proof that a later write does not move
   it** — a write under a DIFFERENT identity, then a read of the column. A proof
   that only checks the value after the first insert cannot see the defect.
5. **Where the column is CONTENT, expect a proof that a rewrite under a NEW value
   is readable afterwards.** The omission's symptom is a correct write that reads
   back as absent, which no assertion about the write itself will catch.
