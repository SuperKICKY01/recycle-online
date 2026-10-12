# A guard on loan from the route table

**Applies to:** every guard whose SUFFICIENCY rests on what no route can do — a lock that covers some rows
because "nothing else changes the others", a separation enforced at one door because "there is no other door".

**What happened (B6, 2026-10-13).** Two guards were correct the day they were written and false the day a NEW route
landed in a different file. `users.py`'s last-active-admin lock locked only `users` rows, and said why: "the set the
race can zero is the set of USERS" — true while no route could delete a grant row. The role screen's
`PUT /roles/{id}/permissions` deleted grant rows: removing users.manage from admin, concurrently with a deactivate,
could leave a shop with nobody able to manage accounts. And the owner/admin separation was enforced at `POST /users`
("an admin cannot mint an owner") while `POST /users/{id}/password` had no such guard — harmless while users.manage sat
only on the seats D7 reasons about, an account takeover the day one tick put it on staff. Nothing failed to compile,
no proof reddened, and both premises still read as true in their comments. A red team found both by reading.

**The rule.** When a change adds a route that WRITES a table, search the tree for every comment that reasons about
what can or cannot change that table ("no route", "only", "never", "the set … is") and re-check each premise against
the new route; record the ones it falsifies before the merge. When a guard enforces an invariant at one door, list
every door — the routes that reach the same outcome by another path — and either guard them or say plainly which are
open and whose decision that is.

**Here:** the role screen does not move users.manage at all (422 `users_manage_fixed`), which restores both premises
without changing pre-existing behaviour; the older open door (an admin resetting the owner's password) is filed as the
owner's decision.
