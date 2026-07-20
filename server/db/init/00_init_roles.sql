-- Runs ONCE, as the bootstrap superuser (postgres), the first time the
-- data volume is initialised. Establishes the two-role separation that the
-- rest of Phase 1a depends on.
--
-- DEV-ONLY credentials. This file only ever runs inside the local container.
--
--   recycle_owner : owns the schema + tables, runs Alembic migrations.
--                   NOT superuser -> FORCE RLS can actually bind to it.
--   recycle_app   : the runtime/application role. NOT superuser, NOT owner,
--                   NOBYPASSRLS -> fully subject to row-level security.

CREATE ROLE recycle_owner LOGIN PASSWORD 'owner_pw_dev'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE ROLE recycle_app LOGIN PASSWORD 'app_pw_dev'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE recycle OWNER recycle_owner;

GRANT CONNECT ON DATABASE recycle TO recycle_app;

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
