r"""sellers.created_by — the session that CREATED the seller

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-18

WHY THIS COLUMN EXISTS
----------------------
P1.8a moved POST /sellers off require_admin and onto get_principal
(app/master.py, create_seller), so a STAFF account at the weighbridge can now
bring a seller into existence — a row carrying a real person's name, and, where
the shop asks for them, an id number and an address. Nothing recorded who did
it. purchase_bills has carried created_by since 0006, so the system knew who
bought the load and not who created the person it was bought from.

NOTHING HERE IS RETROACTIVE. Every seller already written stays authorless
permanently — no column added now makes one existing row traceable. This closes
the gap going forward and closes nothing behind it. 0006's own words about the
same problem on purchase_bills, and they are unchanged because the argument is.

WHAT IT MEANS — AND THE BOUND LIVES IN THE DATABASE, NOT IN THIS FILE
--------------------------------------------------------------------
created_by is the principal of the POST /sellers request: the session that
CREATED the row. It is NOT who first met the seller, who introduced them, or who
walked them to the counter, and it cannot become that — nothing in the request
carries such a fact and no user id is accepted from the client.

It is also NOT who last EDITED the row. PATCH /sellers/{id} keeps require_admin
and is deliberately untouched here: modification is not creation, and a second
column for a last-modified author is a different decision nobody has taken. So
an admin who renames or re-grades a staff-created seller leaves created_by
naming the staff member, which is the truth about who created it.

The NAME cannot carry those distinctions and does not try to. "created_by" is
the string purchase_bills already uses for the same fact, and a second spelling
for one concept is worse than a name that needs a sentence. So the bound is
written into the SCHEMA, as a COMMENT ON COLUMN — the convention 0006
established, for the reason it gives: a bound that only exists in prose outside
the database is a bound the database cannot state about itself, and somebody
running \d+ on this table in two years will not have this migration open. It is
ASCII-only and apostrophe-free on purpose, the same two reasons — this box is
codepage 874, so a comment read back through a console must not need hex to be
trusted (cf. lessons/console-is-not-the-observation.md), and the string is
embedded in a SQL literal.

NULLABLE, NO DEFAULT — 0006's ARGUMENT, AND IT IS NOT WEAKER HERE
------------------------------------------------------------------
Every existing seller has no author and there is no true value to backfill with,
so NOT NULL is not available: ADD COLUMN ... NOT NULL on a non-empty table
requires a DEFAULT, and any uuid a DEFAULT could name is a REAL PERSON. It would
put their name permanently on sellers they never created — a default IDENTITY
(lessons/config-defaults-must-fail-closed.md) and a wrong number somebody acts
on (lessons/fallback-default-is-a-wrong-number.md). Worse than a blank, because
a blank makes the next reader ask.

WHAT NULL MEANS: no author was recorded for this row. NOT "created by nobody" —
somebody created every seller; the system did not write it down.

AND WHAT A POST-MIGRATION NULL DOES *NOT* PROVE, stated because 0006 had to
correct exactly this claim about itself. After this migration POST /sellers
cannot produce a NULL — create_seller is Depends(get_principal), which raises
401 before the handler body runs — so a NULL means THE ROW DID NOT COME THROUGH
POST /sellers. It does NOT follow that the NULLs form a prefix in creation
order. Sellers are inserted directly by fixtures on every run of several
scripts; see the next section, which names them.

THE DIRECT INSERTS ARE LEFT ALONE, AND THAT IS A DECISION, NOT AN OVERSIGHT
--------------------------------------------------------------------------
Four sites INSERT into sellers. Exactly one of them is the product:

  * app/master.py           _insert_seller — the API path, and the only writer
                            this column is about.
  * scripts/seed_dev.py:97  the dev/demo seed.
  * scripts/prove_rls.py:100 and :283 — per-tenant fixtures inside throwaway
                            tenants, and the deliberate cross-tenant INSERT the
                            RLS WITH CHECK must refuse.
  * scripts/prove_seller_create.py:253 — the binding sentinel, written BEFORE
                            the server starts precisely so that no server can
                            have written it.

The last three keep writing NULL and are NOT changed. A fixture is not an
API-written row, and teaching a fixture to fill this column would make it a row
the product could have produced when it is not one — the inverse of the harm
lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md describes,
and it would destroy the sentinel's whole discriminating property. prove_rls's
:283 INSERT must additionally stay minimal: it exists to be REFUSED, and every
column it names is a column the refusal has to survive.

COMPOSITE FK, NEVER A PLAIN ONE
-------------------------------
FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id), against
uq_users_tenant_id from 0001. A plain created_by -> users (id) would not stop a
seller in shop X naming a user in shop Y. The composite one makes that
impossible at the constraint level (hard rule 2: enforce at the lowest layer,
not by remembering in each handler), and referential-integrity checks in
Postgres bypass RLS, so the guarantee holds whatever the session's tenant
context is — it is not something a policy could be tricked into skipping. Same
shape as fk_bills_created_by and fk_bills_voided_by, resting on the same UNIQUE,
for the same reason.

MATCH SIMPLE, so the FK is simply NOT CHECKED when created_by is NULL. That is
what makes a nullable column and a composite FK coherent, and it is the same
mechanic 0001 documents for voided_by and 0006 for bills.created_by.

NO ck_sellers_created_by, AND THAT IS NOT AN OMISSION. An author is ONE fact.
There is no second column for it to be consistent with, and a multi-column
consistency CHECK over one column would be ceremony — 0006's words, and the
shape they contrast with (voided_at/voided_by/void_reason under
ck_bills_void_consistency) has no counterpart here.

DELIBERATELY NOT IN reconcile.py's REQUIRED_CONSTRAINTS
-------------------------------------------------------
sellers currently declares uq_sellers_tenant_id and uq_sellers_tenant_code
there, and fk_sellers_created_by is NOT added beside them. Same reason 0005
gives for ck_users_token_version and 0006 for fk_bills_created_by, unchanged
here: prove_reconcile.py restores a COPY from a dump, and a dump taken before
this migration has neither the column nor the constraint, so S5 would go red on
every such copy for a reason that has nothing to do with money. "The money is
wrong" and "the fixture predates the schema" must never share an outcome.
Postgres enforces the FK on the live database regardless; what is missing is
only the checker's assertion that it is still there. Wake condition, the same as
its two twins: a dump taken AFTER 0011 becoming the oldest one anyone restores
from.

NO INDEX. Nothing queries sellers BY author — not GET /sellers, not the daily
report, not reconcile.py, and no client asks for one because the column is not
in the response payload at all. An index is a write cost on a create path, paid
to speed up a query no code makes. Add one when something reads it, not before.
Same reasoning as 0004's is_active and 0006's.

NOT IN THE RESPONSE PAYLOAD, AND THAT IS THIS MIGRATION'S SCOPE SPEAKING.
_seller_payload is unchanged, so nothing under mobile/ or desktop/ sees a new
field and no client schema moves. The column is written by the server and read
by whoever queries the database; exposing it is a product decision with a screen
attached, and there is no screen.

A NULLABLE COLUMN WITH NO DEFAULT IS SAFE ON A LIVE TABLE: with no default there
is no value to write at all, so Postgres records the column in the catalogue and
rewrites nothing. Every existing row reads back NULL, which is the truth about
it.

No privilege changes: the table-level grants in 0001 already cover future
columns, and RLS policies are per-table rather than per-column, so sellers'
existing tenant_isolation policy governs this column unchanged
(cf. lessons/revoke-in-migration.md — there is genuinely nothing to grant here,
which is not the same as forgetting).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ASCII ONLY, and no apostrophes: this string is embedded in a SQL literal and is
# meant to be read back out of the catalogue on a codepage-874 box without
# needing hex to be believed. See the docstring.
_CREATED_BY_COMMENT = (
    "The user whose session CREATED this seller - the principal of the "
    "POST /sellers request. NOT who first met or introduced the seller, and NOT "
    "who last edited the row: PATCH /sellers/{id} does not touch this column, "
    "so an admin edit leaves the staff creator named. NULL means no author was "
    "recorded - every seller written before migration 0011, plus any row "
    "inserted outside the API."
)


def upgrade() -> None:
    op.execute("ALTER TABLE sellers ADD COLUMN created_by uuid")
    op.execute(
        "ALTER TABLE sellers ADD CONSTRAINT fk_sellers_created_by"
        " FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)"
    )
    op.execute(
        f"COMMENT ON COLUMN sellers.created_by IS '{_CREATED_BY_COMMENT}'"
    )


def downgrade() -> None:
    # The comment is an attribute OF the column and dies with it, so there is no
    # third statement here. Dropped in the reverse order of upgrade() all the
    # same: the constraint depends on the column, not the other way round.
    op.execute(
        "ALTER TABLE sellers DROP CONSTRAINT IF EXISTS fk_sellers_created_by"
    )
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS created_by")
