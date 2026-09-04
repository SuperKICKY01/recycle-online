r"""permissions, roles, role_permissions: the permission model. users.role_id
replaces users.role; tenants.staff_money_visible folds into the staff role.

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-04

WHAT THIS IS
------------
STRUCTURE.md section 3, approved by the owner 2026-09-03 and built as unit 1 of
its section 12 (the branches unit, its "Unit 2", was built first -- 0018 says
why). The SET of permissions is code (server/app/permissions.py, the closed
enumeration); the ASSIGNMENT of permissions to roles and of roles to users is
per-tenant data, and the gate reads the row on every request. Three tables and
one column:

  permissions        global catalogue, no tenant_id, no RLS, SELECT-only to the
                     app role; written by migrations and nothing else. The
                     server compares it as a SET against its enumeration at boot
                     and REFUSES TO START on any difference (app/permissions.py).
  roles              per tenant: id, code (the stable handle), name (the shop's
                     own text), is_system, is_active. Every tenant is born with
                     three system roles named exactly as S9 has them: owner,
                     admin, staff. A system role cannot change its code, lose
                     is_system or be deactivated -- a BEFORE UPDATE trigger
                     refuses -- and no role is ever deleted (no DELETE grant).
  role_permissions   (tenant_id, role_id, permission), composite FK to roles,
                     FK to permissions(code). A grant is a row; revoking is a
                     DELETE of that row (the one master table where the app role
                     holds DELETE and not UPDATE: a membership row has nothing to
                     update).
  users.role_id      uuid NOT NULL, composite FK to roles (tenant_id, id),
                     replacing users.role and its CHECK -- the way 0015 replaced
                     the letter CHECKs with a table a shop configures.

WHAT THE THREE ROLES HOLD AT BIRTH, and the fold
------------------------------------------------
owner: all thirteen. admin: all but roles.manage. staff: exactly what the
pre-0019 gates gave a staff caller -- bills.create, bills.read, sellers.create --
PLUS money.view_own where the tenant's staff_money_visible was true. That column
was a permission wearing a toggle's clothes (E1: "staff may see their own money
figures"); it is folded into the staff role's grant set and then DROPPED, and
PATCH /shop refuses the key thereafter (extra=forbid). Measured on dev
2026-09-04 before this migration: six tenants, staff_money_visible false on all
six, so the fold grants nothing on dev and the proofs that exercised the toggle
grant money.view_own by SQL instead.

Existing users map admin -> admin and staff -> staff, value against value (the
migration compares roles.code with the old users.role for every user and refuses
on any difference). NOBODY IS SEATED AS OWNER by this migration: which admin of
an existing shop is its owner is not a fact the data holds, and guessing it would
be inventing an identity. The owner seat of every pre-0019 shop is therefore
EMPTY until the role-management screen exists to fill it (the owner's decision,
2026-09-04) -- correct, because roles.manage gates no route yet and the surface
that would need it does not exist. A shop provisioned after 0019 gets its first
user as owner (scripts/provision_shop.py).

users.token_version IS NOT TOUCHED. A bump would end every operator's session at
the moment of the deploy and strand queued work for no reason.

A FAILURE AT ANY STEP LEAVES A SIGNABLE-IN SYSTEM (the S0 stop's question 2)
---------------------------------------------------------------------------
Alembic runs this whole upgrade inside ONE transaction (server/migrations/env.py,
context.begin_transaction(); Postgres DDL is transactional -- alembic's own log
line reads "Will assume transactional DDL"). Every step below ends in a read-back
that raises RuntimeError on a wrong count, and a raise anywhere rolls the whole
thing back: the database is at 0018 with users.role intact, and the running
server keeps signing people in. There is no half-applied state.

What cannot be atomic is the PAIRING of code and schema, and it is stated rather
than papered over. Old code on the new schema: main.login and auth.get_principal
select users.role, which no longer exists -> UndefinedColumn -> 500 on login and
on every authenticated request until the server is restarted (a phone reads that
as `unavailable`, keeps its bills queued and nobody is signed out). New code on
the old schema: the boot check refuses to start because `permissions` is absent.
So the deploy is stop, migrate, start; the window is the operator's own restart.

THE BACKFILL, AND WHY FORCE IS LIFTED AND THE TRIGGERS ATTACHED LAST
--------------------------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS) and tenants and users are FORCE
ROW LEVEL SECURITY, so with no app.tenant_id set the owner reads and updates
ZERO rows, silently (lessons/a-migration-reads-zero-under-force-rls.md). FORCE
is lifted on those two for the backfill and restored afterwards; the app role is
not the owner and stays governed. roles and role_permissions are created WITHOUT
RLS, backfilled, and only then given ENABLE+FORCE+policy -- 0015/0018's order.
The audit trigger (0017's audit_capture, SECURITY DEFINER) refuses a write with
no app.actor_id in context and a migration sets none
(lessons/a-fail-closed-trigger-conscripts-every-writer-of-its-table.md), so both
NEW triggers are attached AFTER every backfill INSERT -- and, unlike 0018, this
migration also WRITES an already-audited table: the UPDATE that fills
users.role_id fires the trigger users has carried since 0017. The first scratch
run refused there and rolled back whole; the migration now declares itself as
the system writer (the reserved all-zero actor, username system:migration_0019)
for the transaction, so every user's re-key is recorded under that name. roles
and role_permissions join reconcile.py's TENANT_TABLES, SCOPE and AUDITED_TABLES
in this commit (STRUCTURE.md invariant 14); a new S7 requires every tenant to
keep at least one active user holding users.manage through an active role.

WHAT IS NOT HERE, ON PURPOSE (lessons/schema-audit.md)
------------------------------------------------------
Section 3.1's roles table carries payment_limit_per_bill and
payment_limit_per_shift. They are NOT created: nothing reads them, payments are
batch B (unit 3), and an unused NUMERIC column becomes load-bearing the day later
code trusts it -- they arrive with the payments unit that gives them a reader.
The ten catalogue codes with no gate in this tree are likewise not minted;
app/permissions.py DEFERRED names each against its unit.

DOWNGRADE REFUSES RATHER THAN DESTROYS (the 0015 precedent, twice over)
-----------------------------------------------------------------------
The downgrade restores users.role with its CHECK (role IN ('admin','staff')),
restores tenants.staff_money_visible from the staff role's money.view_own, and
drops the three tables. That is only safe where nothing has moved past the
born-with state. It REFUSES, naming each count, if ANY of four things is true:
a shop created a role of its own; a system role was renamed or deactivated; a
system role's grants differ from the born-with set (staff may additionally hold
money.view_own -- that is the fold, and it is re-derived); or a user holds the
owner role, which the two-value CHECK cannot express. Each is a shop's own
declaration or an identity the old schema cannot hold. A freshly-upgraded
database satisfies none of them, so the down-then-up path is provable on a
scratch.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reusable RLS predicate. The same expression 0001 uses on every tenant table,
# so the value an INSERT writes and the value the policy tests are one thing.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# THE CATALOGUE, restated by hand from app/permissions.py (a migration is not a
# library; the boot check is what holds the two equal). ASCII ONLY, no
# apostrophes, NO BRACES: embedded in SQL literals through f-strings and read
# back out of the catalogue on a codepage-874 box (0006..0018 convention).
_CATALOGUE: tuple[tuple[str, str], ...] = (
    ("bills.create", "create a purchase bill: POST /bills"),
    ("bills.read", "read the shops bills: GET /bills, GET /bills/id"),
    ("bills.void", "void a bill: POST /bills/id/void"),
    ("money.view_own",
     "see money on the callers OWN bills: GET /reports/summary scoped to"
     " created_by = self; money keys in GET /sellers/id/history"
     " (the former tenants.staff_money_visible, folded here)"),
    ("money.view_shop",
     "see the shops money: GET /reports/daily, GET /reports/summary at any"
     " scope, money keys in GET /sellers/id/history"),
    ("master.write",
     "create, edit, retire and reactivate units, categories and products"),
    ("prices.write", "set a products price per tier: PUT /products/id/prices/grade"),
    ("sellers.create",
     "create a seller and reserve seller codes: POST /sellers,"
     " POST /seller-code-reservations"),
    ("sellers.write",
     "edit, retire and reactivate a seller: PATCH /sellers/id, deactivate, activate"),
    ("tiers.manage",
     "create, edit and reorder grade tiers: POST /grade-tiers,"
     " PATCH /grade-tiers/id, PUT /grade-tiers/order"),
    ("users.manage",
     "the roster and every act on another account: GET /users, POST /users,"
     " revoke-sessions, deactivate, activate, unlock-login, password reset"),
    ("shop.settings.write", "write the shops settings: PATCH /shop"),
    ("roles.manage",
     "create and edit a shops own roles (the role-management screen, owed;"
     " no route gates on this yet)"),
)
_CATALOGUE_SIZE = 13
_OWNER, _ADMIN, _STAFF = "owner", "admin", "staff"
_ADMIN_EXCLUDED = ("roles.manage",)
_STAFF_BORN = ("bills.create", "bills.read", "sellers.create")
_STAFF_FOLD = "money.view_own"

_PERMISSIONS_COMMENT = (
    "The permission CATALOGUE: global, no tenant_id, no RLS, SELECT-only to the "
    "app role, written by migrations and nothing else. The SET of permissions is "
    "code (server/app/permissions.py); this table must EQUAL that enumeration or "
    "the server refuses to start (the boot check in main.lifespan). A row here "
    "with no code behind it names a permission nothing checks; a code with no row "
    "cannot be granted. The assignment of permissions to roles is role_permissions. "
    "See migration 0019 and STRUCTURE.md section 3."
)
_ROLES_COMMENT = (
    "A role of a shop: the unit a permission is granted to and a user holds. Every "
    "tenant is born with three SYSTEM roles named as S9 has them (owner, admin, "
    "staff); a shop may create more once the role screen exists. code is the "
    "stable handle (a system role cannot change it, lose is_system or be "
    "deactivated: the roles_system_guard trigger refuses); name is the shops own "
    "text and starts equal to the code. A role is DEACTIVATED, never deleted (no "
    "DELETE grant); a deactivated role grants NOTHING to the users holding it. "
    "Audited. See migration 0019."
)
_ROLE_PERMISSIONS_COMMENT = (
    "A grant: this role of this tenant holds this permission. Composite FK to "
    "roles (tenant_id, id) and FK to permissions(code). A grant is a ROW: granting "
    "inserts one, revoking deletes it, and there is nothing to UPDATE (the app "
    "role holds SELECT, INSERT, DELETE and no UPDATE). Audited, so every grant "
    "and revoke names its actor. Read on every request by auth.get_principal "
    "through the users -> roles -> role_permissions join. See migration 0019."
)
_USERS_ROLE_ID_COMMENT = (
    "The role this user holds, a composite FK into roles (tenant_id, id). "
    "Replaces users.role text CHECK IN (admin, staff) since 0019: admin -> the "
    "system role admin, staff -> the system role staff, value against value. The "
    "gate reads the users -> roles -> role_permissions join on every request and "
    "never a token claim; a user whose role is deactivated holds NO permission."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg's extended query protocol forbids
    # multiple commands in one prepared statement (convention from 0001/0018).
    bind = op.get_bind()

    # ------------------------------------------------------- the catalogue
    # Global, keyed on the code, outside RLS the way server_clock_watermark is.
    # The CHECK pins the code shape (lower-case words joined by dots) so a typo
    # cannot be inserted as a new permission by a later migration without the
    # boot check also refusing it.
    op.execute(
        """
        CREATE TABLE permissions (
            code        text PRIMARY KEY,
            description text NOT NULL,
            CONSTRAINT ck_permissions_code CHECK (code ~ '^[a-z]+(\\.[a-z_]+)+$')
        )
        """
    )
    op.execute(f"COMMENT ON TABLE permissions IS '{_PERMISSIONS_COMMENT}'")
    for code, description in _CATALOGUE:
        op.execute(
            f"INSERT INTO permissions (code, description)"
            f" VALUES ('{code}', '{description}')"
        )
    n_perm = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
    if n_perm != _CATALOGUE_SIZE:
        raise RuntimeError(
            f"REFUSING 0019: {n_perm} catalogue row(s) after the insert, expected"
            f" {_CATALOGUE_SIZE}. Nothing is committed."
        )
    # ALTER DEFAULT PRIVILEGES handed recycle_app arwd (0008/0012 measured this);
    # the REVOKE is what narrows: the app role reads the catalogue and never
    # writes it. The owner (migrations) is the sole writer.
    op.execute("GRANT SELECT ON permissions TO recycle_app")
    op.execute("REVOKE INSERT, UPDATE, DELETE ON permissions FROM recycle_app")

    # ------------------------------------------------------------- roles
    # id uuid PK plus the composite uq (tenant_id, id), ARCHITECTURE 4 point 1:
    # the FK target for users.role_id and role_permissions. code unique per
    # tenant; the length bounds are engineering bounds matching grade_tiers.
    # NO payment_limit columns -- the docstring says why.
    op.execute(
        """
        CREATE TABLE roles (
            id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid        NOT NULL REFERENCES tenants (id),
            code       text        NOT NULL,
            name       text        NOT NULL,
            is_system  boolean     NOT NULL,
            is_active  boolean     NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_roles_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_roles_tenant_code UNIQUE (tenant_id, code),
            CONSTRAINT ck_roles_code_len
                CHECK (char_length(code) BETWEEN 1 AND 32),
            CONSTRAINT ck_roles_name_len
                CHECK (char_length(name) BETWEEN 1 AND 100)
        )
        """
    )
    op.execute(f"COMMENT ON TABLE roles IS '{_ROLES_COMMENT}'")

    # -------------------------------------------------------- role_permissions
    op.execute(
        """
        CREATE TABLE role_permissions (
            tenant_id  uuid NOT NULL REFERENCES tenants (id),
            role_id    uuid NOT NULL,
            permission text NOT NULL REFERENCES permissions (code),
            CONSTRAINT pk_role_permissions PRIMARY KEY (tenant_id, role_id, permission),
            CONSTRAINT fk_role_permissions_role
                FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id)
        )
        """
    )
    op.execute(f"COMMENT ON TABLE role_permissions IS '{_ROLE_PERMISSIONS_COMMENT}'")

    # ------------------------------------------- the born-with roles per tenant
    # FORCE lifted on the SOURCE tables ONLY, and ONLY for the owner (the app
    # role stays governed). roles / role_permissions have no RLS yet, by design.
    op.execute("ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users   NO FORCE ROW LEVEL SECURITY")

    # THIS MIGRATION DECLARES ITSELF AS THE SYSTEM WRITER. `users` is audited
    # (0017), and the UPDATE that fills users.role_id below fires audit_capture,
    # which REFUSES a write with no app.actor_id in context -- measured on the
    # first scratch run 2026-09-04: the whole migration rolled back at that
    # statement with `audit_capture: no actor in context (app.actor_id unset)
    # for UPDATE on users`, the schema still at 0018 (the atomicity the
    # docstring claims, observed rather than argued). So the migration sets the
    # reserved all-zero actor with a username naming this revision, exactly as
    # provision_shop.py and seed_dev.py declare themselves (db.SYSTEM_ACTOR_ID),
    # and every user's re-key is recorded in audit_log under that name. SET
    # LOCAL (is_local = true): transaction-scoped, gone at commit.
    op.execute(
        "SELECT set_config('app.actor_id', '00000000-0000-0000-0000-000000000000', true)"
    )
    op.execute("SELECT set_config('app.actor_username', 'system:migration_0019', true)")

    tenants_n = bind.exec_driver_sql("SELECT count(*) FROM tenants").scalar()
    op.execute(
        f"""
        INSERT INTO roles (tenant_id, code, name, is_system, is_active)
        SELECT t.id, c.code, c.code, true, true
          FROM tenants t
         CROSS JOIN (VALUES ('{_OWNER}'), ('{_ADMIN}'), ('{_STAFF}')) AS c(code)
        """
    )
    roles_n = bind.exec_driver_sql("SELECT count(*) FROM roles").scalar()
    if roles_n != 3 * tenants_n:
        raise RuntimeError(
            f"REFUSING 0019: {tenants_n} tenant(s) but {roles_n} system role(s)"
            " after the backfill; the two must stand 1:3. Nothing is committed."
        )

    # ------------------------------------------------------------- the grants
    op.execute(
        f"""
        INSERT INTO role_permissions (tenant_id, role_id, permission)
        SELECT r.tenant_id, r.id, p.code
          FROM roles r CROSS JOIN permissions p
         WHERE r.code = '{_OWNER}'
        """
    )
    excluded = ", ".join(f"'{c}'" for c in _ADMIN_EXCLUDED)
    op.execute(
        f"""
        INSERT INTO role_permissions (tenant_id, role_id, permission)
        SELECT r.tenant_id, r.id, p.code
          FROM roles r CROSS JOIN permissions p
         WHERE r.code = '{_ADMIN}' AND p.code NOT IN ({excluded})
        """
    )
    born = ", ".join(f"'{c}'" for c in _STAFF_BORN)
    op.execute(
        f"""
        INSERT INTO role_permissions (tenant_id, role_id, permission)
        SELECT r.tenant_id, r.id, p.code
          FROM roles r CROSS JOIN permissions p
         WHERE r.code = '{_STAFF}' AND p.code IN ({born})
        """
    )
    # THE FOLD: money.view_own to the staff role of every tenant whose
    # staff_money_visible was true. Read before the column is dropped below.
    folded = bind.exec_driver_sql(
        "SELECT count(*) FROM tenants WHERE staff_money_visible"
    ).scalar()
    op.execute(
        f"""
        INSERT INTO role_permissions (tenant_id, role_id, permission)
        SELECT r.tenant_id, r.id, '{_STAFF_FOLD}'
          FROM roles r JOIN tenants t ON t.id = r.tenant_id
         WHERE r.code = '{_STAFF}' AND t.staff_money_visible
        """
    )
    grants_n = bind.exec_driver_sql("SELECT count(*) FROM role_permissions").scalar()
    expected_grants = tenants_n * (
        _CATALOGUE_SIZE + (_CATALOGUE_SIZE - len(_ADMIN_EXCLUDED)) + len(_STAFF_BORN)
    ) + folded
    if grants_n != expected_grants:
        raise RuntimeError(
            f"REFUSING 0019: {grants_n} grant row(s) after the backfill, expected"
            f" {expected_grants} ({tenants_n} tenants; {folded} staff fold(s))."
            " Nothing is committed."
        )

    # ---------------------------------------------------------- users.role_id
    # Nullable first, filled through the (tenant, code) join, checked, then NOT
    # NULL and the composite FK -- 0018's order for purchase_bills.branch_id.
    op.execute("ALTER TABLE users ADD COLUMN role_id uuid")
    # PER TENANT, UNDER THAT TENANT'S CONTEXT. The trigger writes the audit row
    # with tenant_id = app.tenant_id into audit_log, which is FORCE RLS with a
    # WITH CHECK on that column and NOT NULL on it -- measured on the second
    # scratch run 2026-09-04: one cross-tenant UPDATE with no tenant context was
    # refused with `new row violates row-level security policy for table
    # "audit_log"` and the migration rolled back whole. So the re-key runs once
    # per tenant with SET LOCAL app.tenant_id, exactly as provision_shop.py and
    # every request write; users has FORCE lifted here, so the UPDATE itself is
    # scoped by its own WHERE and not by the policy.
    tenant_ids = [
        str(r[0]) for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall()
    ]
    for tid in tenant_ids:
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"""
            UPDATE users u
               SET role_id = r.id
              FROM roles r
             WHERE r.tenant_id = u.tenant_id AND r.code = u.role
               AND u.tenant_id = '{tid}'
            """
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")
    users_null = bind.exec_driver_sql(
        "SELECT count(*) FROM users WHERE role_id IS NULL"
    ).scalar()
    if users_null:
        raise RuntimeError(
            f"REFUSING 0019: {users_null} user(s) found no system role matching"
            " their users.role after the backfill. Nothing is committed."
        )
    # VALUE AGAINST VALUE, every user: the role code now held equals the text
    # held before, in the same tenant. This is the reading that says the map is
    # the identity map and not a shuffle.
    moved = bind.exec_driver_sql(
        "SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id"
        " WHERE r.code <> u.role OR r.tenant_id <> u.tenant_id"
    ).scalar()
    if moved:
        raise RuntimeError(
            f"REFUSING 0019: {moved} user(s) would change role or tenant in the"
            " re-key. Nothing is committed."
        )
    op.execute("ALTER TABLE users ALTER COLUMN role_id SET NOT NULL")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT fk_users_role"
        " FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id)"
    )
    op.execute(f"COMMENT ON COLUMN users.role_id IS '{_USERS_ROLE_ID_COMMENT}'")

    # --------------------------------- drop users.role and its CHECK (0001)
    # The CHECK is named users_role_check (re-derived from pg_constraint on dev
    # 2026-09-04, not from the migration log). Dropped explicitly so the log
    # names it; the column drop would take it anyway.
    op.execute("ALTER TABLE users DROP CONSTRAINT users_role_check")
    op.execute("ALTER TABLE users DROP COLUMN role")

    # ----------------------------- drop tenants.staff_money_visible (0014)
    # Folded above. The column comment dies with the column.
    op.execute("ALTER TABLE tenants DROP COLUMN staff_money_visible")

    # Restore FORCE. reconcile.py S3 re-checks this; a forgotten line goes red.
    op.execute("ALTER TABLE tenants FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users   FORCE ROW LEVEL SECURITY")

    # -------------------------------------------------------------------- RLS
    # Enabled AFTER every backfill that wrote these tables, exactly as 0015/0018.
    for table in ("roles", "role_permissions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id = {_TENANT_MATCH}) "
            f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
        )

    # ----------------------------------------------------------------- grants
    # A role is deactivated, never deleted: no DELETE. A grant is a row that is
    # inserted or deleted and never updated: no UPDATE.
    op.execute("GRANT SELECT, INSERT, UPDATE ON roles TO recycle_app")
    op.execute("REVOKE DELETE ON roles FROM recycle_app")
    op.execute("GRANT SELECT, INSERT, DELETE ON role_permissions TO recycle_app")
    op.execute("REVOKE UPDATE ON role_permissions FROM recycle_app")

    # ------------------------------------------- the system-role guard trigger
    # What refuses renaming a system role's code or deactivating it: the
    # database, not a route (no route writes roles in this unit, and SQL can).
    # The NAME stays free -- it is the shop's own text, as a tier's is.
    op.execute(
        """
        CREATE FUNCTION roles_system_guard() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            IF OLD.is_system THEN
                IF NEW.code IS DISTINCT FROM OLD.code THEN
                    RAISE EXCEPTION
                        'roles_system_guard: a system role cannot change its code (% -> %)',
                        OLD.code, NEW.code;
                END IF;
                IF NOT NEW.is_system THEN
                    RAISE EXCEPTION
                        'roles_system_guard: a system role cannot stop being one (%)',
                        OLD.code;
                END IF;
                IF NOT NEW.is_active THEN
                    RAISE EXCEPTION
                        'roles_system_guard: a system role cannot be deactivated (%)',
                        OLD.code;
                END IF;
            END IF;
            RETURN NEW;
        END
        $fn$
        """
    )
    op.execute(
        "CREATE TRIGGER roles_system_guard"
        " BEFORE UPDATE ON roles"
        " FOR EACH ROW EXECUTE FUNCTION roles_system_guard()"
    )

    # ---------------------------------------------------------- the triggers
    # LAST, after every backfill INSERT: audit_capture refuses a write with no
    # actor in context, and a migration has none. Both tables are master data a
    # shop edits (a grant, a role's name), so both are audited like the nine.
    for table in ("roles", "role_permissions"):
        op.execute(
            f"CREATE TRIGGER audit_capture"
            f" AFTER INSERT OR UPDATE OR DELETE ON {table}"
            f" FOR EACH ROW EXECUTE FUNCTION audit_capture()"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.exec_driver_sql("SELECT to_regclass('public.roles')").scalar() is None:
        return

    # LIFT FORCE FIRST, or the guard reads nothing and defeats itself (0015's
    # measured lesson). Owner-only; the app role stays governed.
    for t in ("tenants", "users", "roles", "role_permissions"):
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")

    # The four refusal conditions, each a count the operator can read.
    custom = bind.exec_driver_sql(
        "SELECT count(*) FROM roles WHERE NOT is_system"
    ).scalar()
    moved = bind.exec_driver_sql(
        "SELECT count(*) FROM roles WHERE is_system AND (name <> code OR NOT is_active)"
    ).scalar()
    owners = bind.exec_driver_sql(
        f"SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id"
        f" WHERE r.code = '{_OWNER}'"
    ).scalar()
    # A system role's grant set must be the born-with set; staff may ALSO hold
    # the fold. Counted as rows outside the pristine set plus pristine rows
    # missing, over the three system roles.
    excluded = ", ".join(f"'{c}'" for c in _ADMIN_EXCLUDED)
    born = ", ".join(f"'{c}'" for c in _STAFF_BORN)
    pristine = f"""
        SELECT r.id AS role_id, p.code AS permission
          FROM roles r CROSS JOIN permissions p
         WHERE (r.code = '{_OWNER}')
            OR (r.code = '{_ADMIN}' AND p.code NOT IN ({excluded}))
            OR (r.code = '{_STAFF}' AND p.code IN ({born}, '{_STAFF_FOLD}'))
    """
    extra_grants = bind.exec_driver_sql(
        f"SELECT count(*) FROM role_permissions rp"
        f" JOIN roles r ON r.id = rp.role_id WHERE r.is_system"
        f" AND NOT EXISTS (SELECT 1 FROM ({pristine}) q"
        f"                  WHERE q.role_id = rp.role_id AND q.permission = rp.permission)"
    ).scalar()
    missing_grants = bind.exec_driver_sql(
        f"SELECT count(*) FROM ({pristine}) q"
        f" WHERE q.permission <> '{_STAFF_FOLD}'"
        f"   AND NOT EXISTS (SELECT 1 FROM role_permissions rp"
        f"                    WHERE rp.role_id = q.role_id AND rp.permission = q.permission)"
    ).scalar()
    drifted = extra_grants + missing_grants

    if custom or moved or owners or drifted:
        # Restore FORCE on the tables that survive before the raise, so a refusal
        # leaves a clean tree even were the transaction not rolled back.
        op.execute("ALTER TABLE tenants FORCE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE users   FORCE ROW LEVEL SECURITY")
        raise RuntimeError(
            "REFUSING to downgrade 0019: the permission model has moved past the"
            " born-with state.\n"
            f"  roles a shop created (not system)              : {custom}\n"
            f"  system roles renamed or deactivated            : {moved}\n"
            f"  users holding the owner role                   : {owners}\n"
            f"  grants on a system role differing from birth   : {drifted}\n"
            "\n"
            "WHY THAT IS NOT SAFE: this downgrade restores users.role text CHECK"
            " (role IN admin, staff) and DROPS roles and role_permissions. A"
            " shop's own role, a renamed system role and every grant it changed"
            " would be lost, and a user holding owner cannot be expressed by the"
            " two-value CHECK at all.\n"
            "\n"
            "REMEDY: only downgrade a database still in the born-with state. If"
            " you genuinely mean to discard the permission configuration, move"
            " every owner back to admin, restore the born-with grants and remove"
            " the shop's own roles deliberately first.\n"
        )

    # Reverse order of upgrade(), with FORCE still lifted for the two restores.
    # The users UPDATE below is audited: declare the system writer as upgrade did.
    op.execute(
        "SELECT set_config('app.actor_id', '00000000-0000-0000-0000-000000000000', true)"
    )
    op.execute("SELECT set_config('app.actor_username', 'system:migration_0019', true)")
    op.execute("ALTER TABLE users ADD COLUMN role text")
    # Per tenant under its context, for the audit_log reason upgrade() gives.
    for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall():
        tid = str(r[0])
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"UPDATE users u SET role = r.code FROM roles r"
            f" WHERE r.id = u.role_id AND u.tenant_id = '{tid}'"
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")
    op.execute("ALTER TABLE users ALTER COLUMN role SET NOT NULL")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT users_role_check"
        " CHECK (role IN ('admin', 'staff'))"
    )
    op.execute(
        "ALTER TABLE tenants ADD COLUMN staff_money_visible boolean NOT NULL"
        " DEFAULT false"
    )
    op.execute(
        f"""
        UPDATE tenants t SET staff_money_visible = true
         WHERE EXISTS (SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
                        WHERE r.tenant_id = t.id AND r.code = '{_STAFF}'
                          AND rp.permission = '{_STAFF_FOLD}')
        """
    )
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_role")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS role_id")

    op.execute("ALTER TABLE tenants FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users   FORCE ROW LEVEL SECURITY")

    op.execute("DROP TRIGGER IF EXISTS audit_capture ON role_permissions")
    op.execute("DROP TRIGGER IF EXISTS audit_capture ON roles")
    op.execute("DROP TRIGGER IF EXISTS roles_system_guard ON roles")
    op.execute("DROP FUNCTION IF EXISTS roles_system_guard()")
    op.execute("DROP TABLE IF EXISTS role_permissions")
    op.execute("DROP TABLE IF EXISTS roles")
    op.execute("DROP TABLE IF EXISTS permissions")
