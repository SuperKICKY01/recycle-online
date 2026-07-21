# Login resolves the user INSIDE tenant context

**Context.** Usernames are unique only per tenant (`UNIQUE (tenant_id,
username)`); the same username (e.g. `admin`) exists in many tenants. Login
takes a tenant identifier + username + password.

**Rule.** Set tenant context from the submitted tenant id FIRST, then look the
user up under that context, so RLS makes users of other tenants invisible to the
query. A foreign-tenant username simply is not found. Return ONE generic error
("invalid credentials") for both unknown-user and wrong-password, and verify
against a dummy hash when the user is missing so timing does not reveal
existence.

**Why (the failure it prevents).** Looking a user up by username across all
tenants (no context) lets someone authenticate against, or enumerate, another
tenant's account — a cross-tenant login. Distinct error messages or unequal
timing for "no such user" vs "wrong password" leak which usernames exist.

**Where proven.** Phase 1b `server/app/main.py` `login()` and
`server/scripts/prove_auth.py` case 8 (username exists in A; login with B's
tenant id + A's password is rejected) and case 7 (wrong password, same generic
error).
