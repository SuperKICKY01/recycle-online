# A round trip must agree on its key space

**Applies to** every check that compares two enumerations of "the same" set —
a backup against its restore, a manifest against a catalogue, an expected list
against an observed one, a dump's tables against a database's. Hardest where
the two sides are built by different code reading different sources, which is
the ordinary case and the reason the agreement looks free.

**The rule:** the two sides must be proven to enumerate the same DOMAIN, and
the day a domain widens is a SCHEMA change, not a data change. Ask of any
two-sided check: **what would make one side's key space grow without the
other's?** Whatever the answer is, that is the change that turns the check
into a liar, and it will arrive long before anybody uses the feature that
brought it.

## The instance

`server/scripts/backup_db.py` keys its manifest off whatever `pg_dump` wrote,
stripping only a `public.` prefix:

    if current.startswith("public."):
        current = current[len("public."):]

`server/scripts/restore_db.py` builds the other side from schema `public`
alone — `where n.nspname = 'public' and c.relkind = 'r'` — and then compares
over the UNION of the two key sets:

    for t in sorted(set(expected) | set(counts)):

For eight migrations the two sides agreed, and agreed by accident: every
relation in this database lived in `public`. Migration 0009 created
`directory.shop_codes`, the first relation outside it, and the comparison
broke in the same minute.

Measured on a throwaway fixture restored from the 0008 dump and walked up the
real upgrade path (`recycle_tw20260809_0009fixture`, 2026-08-09):

| dump | COPY headers | manifest key | `restore_db.py` |
| --- | --- | --- | --- |
| at 0008 | 12 | — | `RESTORE_EXIT=0` |
| at 0009, table EMPTY | 13 | `"directory.shop_codes": 0` | **exit 1** |
| at 0009, one row | 13 | `"directory.shop_codes": 1` | **exit 1** |

The red, verbatim, with every other one of the twelve tables `[OK]`:

    [FAIL] directory.shop_codes     dump=0  restored=None

    RESTORE FAILED: row counts differ from the dump for ['directory.shop_codes']

A number on the expected side, and nothing at all on the counts side. That is
the signature of a key-space disagreement rather than a lost row, and it is
worth learning to read: a row that failed to land shows a number on BOTH
sides.

## The trigger is migration-time, and everyone guessed first-use

`OPEN_ITEMS.md` recorded the open question in its own words — *"One inference
not measured: whether `pg_dump` emits a `COPY` block for an EMPTY table. If it
does, this fires on the first backup after 0009 is applied; if not, on the
first backup after the first code is issued."*

**It does, and the measurement went the worse way.** `pg_dump` writes

    COPY directory.shop_codes (tenant_id, code) FROM stdin;

for a table holding zero rows, followed immediately by its `\.` terminator. So
the manifest gains the unstripped key, and the restore fails, **on the first
backup taken after the migration is applied** — before any endpoint reads the
relation, before any client sends a code, before the feature exists as a code
path at all. The window everyone had in mind, between "migration applied" and
"first row written", is not a window. It is zero wide.

That is the part of this file worth carrying. The inference was reasonable,
was written down honestly as an inference, and was wrong in the direction that
costs more. **Cheap measurements that resolve a recorded inference should be
taken when the inference is written, not when it bites** — this one cost one
restore of a dump that already existed and two backups.

## One defect, two observables, DIFFERENT triggers

The same asymmetry produces a second symptom, and it does not arrive at the
same time. `backup_db.py` sums row counts across every schema while itemising
only `public`, so the summary total stops equalling its own itemisation — but
only once a row exists, because a zero-row table adds zero:

* at 0009 with the table empty: summary `844 rows`, itemisation 844. **They
  agree.** Nothing looks wrong.
* at 0009 with one code issued: summary `845 rows` over an itemisation of 844,
  and `MANIFEST.txt` reads `Rows      : 845 across 12 tables` above a list in
  which `shop_codes` appears **zero times**. `restore_db.py` prints the same
  inflated total back: `rows in dump   : 845`.

So one defect fires two observables with two different triggers, and **the
earlier one is the one nobody predicted**. Anyone who set out to reproduce
this by issuing a code would have seen both at once and concluded the data was
the trigger. The empty-table case is what separates them, and it only exists
as evidence because the fixture was dumped BEFORE the first row was written.

Where a defect has more than one symptom, stage the reproduction so the
symptoms can arrive separately. Two symptoms observed together are evidence
about neither's trigger.

## A red drawn over a good restore is worse than a missing check

The restore this failed was correct. Read back out of the target afterwards:

    recycle_restore_scratch|0009|1|0|1

— schema `directory` present, the table present, `alembic_version` `0009`, and
every one of the twelve public tables `[OK]` with `dump == restored`. Every
row landed. The checker called it broken anyway.

That is worse than having no check, and for a reason that has nothing to do
with this defect's size. `restore_db.py` is run in exactly two situations:
idly, to verify a backup harmlessly, and at 07:00 with a dead disk. A checker
that reds on a good restore teaches an operator that its red means nothing —
and the lesson is learned during the idle runs, then applied during the other
one. The instrument that would catch a genuinely empty backup
([[a-backup-is-a-claim-until-it-is-restored]]) is the same instrument being
taught to be ignored.

**A false red is not the safe direction. It is the slow way to arrive at no
check at all.**

## Why a positive control could not have found this

Both sides work. `copy_block_counts` correctly counts the rows `pg_dump`
wrote; the restore-side query correctly counts the rows in `public`. Point a
control at either and it passes for the right reason. The counter used to
measure all of this was itself controlled — `grep -c "^COPY "` against a
hand-built six-line file whose correct answer is 3, returning 3, proving
simultaneously that the pattern is anchored to line start and that blank lines
are not being dropped ([[a-check-that-never-went-red-was-never-observed]]).
Every instrument in the chain was sound.

This is the sibling shape of
[[a-gate-that-matches-a-keyword-misses-its-aliases]], one level up. There, a
control proved the matcher WORKS and said nothing about its DOMAIN. Here, two
controls each prove their own side works, and neither can say anything about
whether the two sides share a domain — because a control lives inside one side
and the defect lives BETWEEN them. It is found by reading the two enumerations
against each other, or by walking a fixture through the schema change that
widens one of them. Not by running the suite.

## How to apply

1. **Name both key spaces out loud, in the same sentence.** "The manifest is
   keyed by whatever `pg_dump` emitted, minus a `public.` prefix; the restore
   is keyed by relations in `public`." Written down side by side, the
   disagreement is visible without running anything. It is invisible while the
   two definitions live 200 lines and one file apart.
2. **Ask what widens one side and not the other.** A new schema. A partition.
   A view. A relkind nobody filtered on — `directory` holds THREE `pg_class`
   rows, the table plus two indexes at relkind `i`, so a predicate widened to
   "outside `public`" without a relkind filter gets a different wrong answer in
   the other direction.
3. **Fix it by making both sides use ONE key convention**, both qualified or
   both stripped — not by adding the new name to an exclusion list. An
   exclusion list entry reads as coverage and changes no result when the
   enumeration never produced the name in the first place.
4. **Treat a UNION comparison as a domain assertion.** `set(a) | set(b)` says
   "these two sets have the same members and I will report any that do not."
   That is a strong claim, usually made accidentally. If it is not what you
   mean, intersect deliberately and say what you dropped.
5. **Distinguish a key-space failure from a data failure in the OUTPUT.** A
   number opposite a `None` is not the same event as two numbers that differ,
   and an operator reading a red at 07:00 needs to know which one they have
   before deciding whether to trust the restore.
6. **Resolve a recorded inference while it is cheap.** An entry that says "not
   measured, and it fires either way" has already paid for the thinking; the
   measurement is what is left, and its cost only rises.
7. **Keep the negative control in the same lineage.** The 0008 backup and
   restore of the same fixture, same two scripts, one migration earlier,
   `RESTORE_EXIT=0` — that is what makes the red at 0009 evidence about the
   migration rather than about the fixture, the box, or the tools.
