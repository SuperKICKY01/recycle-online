# A grant boundary belongs to a DATABASE, not to a role

**Applies** whenever a containment property is written down as a property of a
role — "it cannot reach X", "it has no USAGE on Y", "it is excluded by default" —
and whenever a bootstrap script establishes that property with a `REVOKE`.

**The rule.** A `GRANT` or `REVOKE` on a schema is scoped to the database it was
executed in. A role is scoped to the CLUSTER. So a sentence of the form *"this
role cannot reach schema `public`"* is never true of the role; it is true of the
role **in the one database where somebody ran the REVOKE**. Write the database
into the sentence, or the sentence will be carried to a database where it is
false.

## What was measured, 2026-08-10, live cluster

`recycle_directory` is the reader role migration 0009 grants to. Three documents
state its containment as a property of the role:

- `server/db/init/00_init_roles.sql:38-41` — "Deliberately has **NO USAGE on
  schema public**, so it cannot see any tenant table even by accident."
- `server/migrations/versions/0009_directory_shop_codes.py:55-59` — "recycle_directory
  has NO USAGE on schema public [...] cannot reach tenants, users, purchase_bills or
  any other business table **BY ANY PATH**".
- `ARCHITECTURE.md:604-605` — "holding no `USAGE` on schema `public` — which can
  therefore reach the shop list **and nothing else**."

None of the three names a database. **The property was established by one
statement in one database:** `00_init_roles.sql:101` runs
`REVOKE ALL ON SCHEMA public FROM PUBLIC` — and it runs **after** `\connect recycle`
at `:95`. It never applied anywhere else.

Measured as the role itself, over every database it can connect to:

| database | `public` USAGE | read of `public.tenants` |
|---|---|---|
| `recycle` and the eight other `recycle*` | `f` | `ERROR: permission denied for schema public` |
| **`postgres`** | **`t`** | no relations exist to read |

`nspacl` on `postgres`'s `public` is the PostgreSQL 15+ default,
`{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}` — the `=U/` entry
IS the PUBLIC grant. Nothing revoked it there, because the script that revokes was
pointed at one database.

**The hole has nothing behind it today** — that schema holds 0 relations, and
`CREATE` is `f`, so no permanent object can be added to it. That is luck about
CONTENT, not a property of the boundary.

## Why it would cause a real bug

The next database created on this cluster starts with PUBLIC holding `USAGE` on
its `public` schema. If it is created by `CREATE DATABASE` from `template1` and
then given tenant tables — a staging copy, a second region, a per-customer
database, a scratch built by hand rather than by restore — **the role is inside
`public` there from the first second, and the three sentences above say it is
not.** The only thing that would stop it reading rows is the separate absence of
table grants, which is the belt the migration explicitly declined to rely on:
`0009:74-78` calls the schema boundary "the load-bearing half" and says the
containment "excludes by DEFAULT rather than by a REVOKE somebody has to remember
on every future table". In a database where the schema REVOKE never ran, that is
exactly the position you are in — remembering, per table, forever.

And the thing that makes it hard to notice: **the nine databases that DO have the
property agree with the documents perfectly.** The measurement that would catch it
is the one nobody runs, against the database nobody thinks of as part of the
system.

## The disproof, and it ran the other way first

The hypothesis going in was the opposite and stronger: that the SCRATCH databases
would be weak, because they are created by restore rather than by the bootstrap
script. **That was wrong** — all nine `recycle*` databases carry
`{recycle_owner=UC/recycle_owner,recycle_app=U/recycle_owner}`, byte-identical,
because `pg_dump` emits the schema's ACL and the restore replays it. The weak
database is the one that was never part of the application at all.

**A test aimed at the plausible failure found nothing; the same test widened to
every database the role can reach found it.** The widening cost one extra
`\c` per database.

## What to do

- **Put the database in the sentence.** "No `USAGE` on `public` **in `recycle`**"
  is the true claim and is barely longer.
- **Ask of any containment property: what statement established it, and what was
  that statement's scope?** Role attributes (`rolsuper`, `rolbypassrls`) are
  cluster-wide and travel. `GRANT`/`REVOKE` on schemas and relations do not.
  `ALTER ROLE ... SET` without `IN DATABASE` is cluster-wide — measured here:
  `pg_db_role_setting` holds one row for this role with `setdatabase = 0`, so its
  `search_path` DOES travel to all twelve databases while its containment does
  not. **Two settings on one role, opposite scopes, in the same `.sql` file.**
- **Prefer a migration to a bootstrap script for anything that must travel with
  the schema** (`revoke-in-migration.md` gives the same instruction for a
  different reason: a migration is applied per database, which is exactly the
  scope a schema REVOKE has).
- **Enumerate every database, not the one under discussion**, when testing a
  claim that names none.

Sibling of `a-round-trip-must-agree-on-its-key-space.md`: there, two sides of a
check disagreed about their DOMAIN. Here a claim and its evidence disagree about
their domain, and the claim's domain is the wider one.
