"""tenants.address, tenants.phone: the shop's own postal address and phone, the
P1.16 shop-identity content a slip header prints, pulled here by the settings
surface that needs it (S17). Both NULLABLE and unset until someone types them.

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-30

WHY NOW, AND WHY ONLY THESE TWO. P1.16 owns the shop-identity content; ROADMAP
S17 says a schema change is PULLED by the feature that needs it, and the phone
settings surface (P1.23 item 4, the S6 extension) is that feature. It edits the
shop's address and phone, and `tenants` did not carry them. Tax id and licence
number are NOT pulled: they belong to P1.1 (the second-hand goods act's
record-keeping obligation), which is unscheduled, and inventing a column no
surface writes is exactly the schema drift lessons/schema-audit.md exists to
refuse.

NULLABLE, NO DEFAULT, ON PURPOSE. A provisioned shop has no address until an
operator types one, and a default here would be a wrong number the office might
act on (lessons/fallback-default-is-a-wrong-number.md). NULL means "not set",
which is every shop that exists today, so no backfill invents an address for a
shop nobody asked. The same shape 0010 gave default_grade.

TEXT WITH A NAMED char_length CHECK, NOT varchar(N). Two reasons. The text
columns already on this table are `text` (name, default_grade), and
default_grade pairs `text` with a named CHECK (ck_tenants_default_grade, 0010),
so this mirrors the established pattern. And the API model constrains both
fields with max_length at the edge; the column must not accept what the edge
refuses (lessons/edge-must-reject-what-the-column-rounds.md), so each CHECK
states the SAME bound the model declares -- 500 for address, 32 for phone -- and
the two agree by construction. The bounds equal the sellers `Address` and
`Phone` edge types in server/app/master.py, because a shop address and a seller
address are the same KIND of hand-typed field, so one number for each is one
place to change it. Nothing here rounds (these are text, not NUMERIC), so the
edge-must-reject trap does not fire; the CHECK is the agreement, not a rounding
guard.

WHAT THIS MIGRATION DOES NOT DO. No tax id, no licence number (see above). No
change to `name` (it already exists and is immutable by decision, 9ad225e) or to
`default_grade`. No route -- server/app/master.py widens GET/PATCH /shop in the
same commit; the schema is separate so a schema audit reads one file (the
convention 0012 states). provision_shop.py names its tenants columns explicitly
(id, name: measured 2026-08-30), so two new NULLABLE columns reach it with no
edit, and it is not touched.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ASCII ONLY, no apostrophes, and NO BRACES: these strings are embedded in a SQL
# literal through an f-string, and they are meant to be read back out of the
# catalogue on a codepage-874 box without needing hex to be believed
# (lessons/console-is-not-the-observation.md). A brace under an f prefix would be
# interpolated away with no error raised. Convention from 0006/0009/0011/0012.
_ADDRESS_COMMENT = (
    "The shop postal address, the slip-header content P1.16 owns, edited by the "
    "settings surface. NULLABLE and unset until typed -- NULL means the shop has "
    "not entered one, never a default. Bounded to 500 characters by "
    "ck_tenants_address_len, the same bound master.py declares at the edge, so "
    "the column refuses exactly what the API refuses."
)
_PHONE_COMMENT = (
    "The shop phone, the slip-header content P1.16 owns, edited by the settings "
    "surface. NULLABLE and unset until typed. Bounded to 32 characters by "
    "ck_tenants_phone_len, matching the edge type in master.py, so the column "
    "refuses exactly what the API refuses."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg's extended query protocol forbids
    # multiple commands in one prepared statement (convention from 0001/0009/0012).
    # Plain strings, not f-strings, for the DDL: nothing here interpolates.
    op.execute("ALTER TABLE tenants ADD COLUMN address text")
    op.execute("ALTER TABLE tenants ADD COLUMN phone text")
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT ck_tenants_address_len"
        " CHECK (char_length(address) <= 500)"
    )
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT ck_tenants_phone_len"
        " CHECK (char_length(phone) <= 32)"
    )
    op.execute(f"COMMENT ON COLUMN tenants.address IS '{_ADDRESS_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN tenants.phone IS '{_PHONE_COMMENT}'")


def downgrade() -> None:
    # Reverse order of upgrade(). CHECK constraints and comments are attributes OF
    # the columns and would die with them, but the constraints are dropped
    # explicitly (IF EXISTS) for symmetry with 0010/0012 and so a partial upgrade
    # is cleanly reversible.
    op.execute("ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_phone_len")
    op.execute(
        "ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_address_len"
    )
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS phone")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS address")
