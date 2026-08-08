-- Bootstrap for the local development cluster: the three runtime roles, the
-- application database, and the schema-level privileges the migrations assume.
--
-- RE-RUNNABLE. Every statement below is safe to execute again on a cluster
-- where it has already run. The three CREATE ROLE statements are guarded by
-- a DO block that checks pg_roles; CREATE DATABASE is guarded by \gexec (see
-- below). Everything else was already idempotent -- re-granting a privilege
-- that is already held, or re-asserting an ownership that is already correct,
-- is a no-op and not an error. The Postgres entrypoint still runs this file
-- ONLY on an empty data directory, so in normal operation it executes once;
-- re-runnability is for the case where it has to be applied by hand to a
-- cluster that already exists, which the previous version could not survive
-- (it aborted on the first CREATE ROLE and left the rest unapplied).
--
-- DEV-ONLY, and the reason is in the next line rather than left implied: the
-- passwords below are literal strings in a file that is committed to the
-- repository, so every clone of this project knows them. That is acceptable
-- for a container listening on a developer's own machine and is NOT acceptable
-- anywhere a real shop's data lives. A deployed cluster must create these
-- roles with generated secrets held outside version control.
--
-- PSQL ONLY. This file is not portable SQL and cannot be fed to a generic SQL
-- executor, a migration runner, or a driver like asyncpg. Two psql-specific
-- meta-commands are load-bearing: `\connect recycle`, which switches database
-- mid-file because the schema statements must run inside the new database and
-- Postgres has no SQL-level equivalent; and `\gexec`, which executes the text
-- returned by the preceding SELECT and is how CREATE DATABASE is guarded.
-- CREATE DATABASE cannot run inside a transaction block, which rules out
-- wrapping it in a DO block the way the roles are wrapped -- \gexec runs it as
-- its own top-level statement, so the guard costs nothing. Anyone who needs
-- this to run somewhere without psql must replace BOTH mechanisms, not just
-- the one that happens to break first.
--
--   recycle_owner     : owns the schema + tables, runs Alembic migrations.
--                       NOT superuser -> FORCE RLS can actually bind to it.
--   recycle_app       : the runtime/application role. NOT superuser, NOT owner,
--                       NOBYPASSRLS -> fully subject to row-level security.
--   recycle_directory : reads the shop directory and nothing else. Deliberately
--                       has NO USAGE on schema public, so it cannot see any
--                       tenant table even by accident. See the note at the
--                       bottom of this file.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'recycle_owner') THEN
        CREATE ROLE recycle_owner LOGIN PASSWORD 'owner_pw_dev'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'recycle_app') THEN
        CREATE ROLE recycle_app LOGIN PASSWORD 'app_pw_dev'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'recycle_directory') THEN
        CREATE ROLE recycle_directory LOGIN PASSWORD 'directory_pw_dev'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

-- The directory role never runs an unqualified query against public, so its
-- search_path must not point there. With the default ("$user", public) every
-- unqualified SELECT would fail with `permission denied for schema public` --
-- a message that reads like a missing table grant and sends the reader looking
-- for a GRANT that was never the problem. Naming the directory schema directly
-- makes the failure honest: an object that is not there reports itself as not
-- there. THIS NAME MUST MATCH THE SCHEMA MIGRATION 0009 CREATES.
--
-- THE PATH IS SET BEFORE THAT SCHEMA EXISTS, and the ordering is deliberate
-- rather than an oversight. This file runs at cluster bootstrap; migration
-- 0009 creates the schema afterwards, so on a database where 0009 has not run
-- the path names a schema that is not there yet. OBSERVED on a throwaway
-- cluster built from this file with no migrations applied: an unqualified
-- query as recycle_directory came back `relation "..." does not exist`,
-- naming no schema, no permission and no migration. That is the designed
-- outcome and not a bug -- a reader meeting it on a fresh database is looking
-- at an object nobody has created yet, not at a privilege granted wrongly.
ALTER ROLE recycle_directory SET search_path = directory;

SELECT 'CREATE DATABASE recycle OWNER recycle_owner'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'recycle')\gexec

GRANT CONNECT ON DATABASE recycle TO recycle_app;
GRANT CONNECT ON DATABASE recycle TO recycle_directory;

\connect recycle

-- Hand the public schema to the owner role and lock everyone else out of
-- creating objects in it. The app role gets USAGE only (it never creates
-- objects; it only reads/writes rows in the owner's tables).
ALTER SCHEMA public OWNER TO recycle_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO recycle_app;

-- Any table the owner creates later (migrations) auto-grants DML to the app
-- role. The initial migration ALSO grants explicitly, so this is belt-and-braces.
ALTER DEFAULT PRIVILEGES FOR ROLE recycle_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO recycle_app;

-- recycle_directory gets NOTHING here, and that is the point of the role.
--   * No USAGE on schema public: it cannot reach a tenant table at all, so it
--     is excluded by default rather than by a REVOKE somebody has to remember
--     on every new table. The ALTER DEFAULT PRIVILEGES above names only
--     recycle_app, so nothing is auto-granted to this role either.
--   * No SELECT on the directory relation: that relation does not exist until
--     migration 0009 creates it, and a grant on a missing object is an error.
--     The migration that creates the object grants on the object. This file
--     establishes only the role.
