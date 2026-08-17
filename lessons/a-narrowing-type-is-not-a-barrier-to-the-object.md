# A narrowing type stops the FIELD being named, not the OBJECT being passed

**Applies to** every type in this project whose omitted fields are described as a
safety property — "with no `id_number` on the type, nothing can leak one" — and
to every claim that a compiler is enforcing a data boundary.

**The rule:** a structural type with fewer fields refuses to let you *name* the
missing ones. It does not refuse to *carry* an object that has them. Those are
different guarantees, they are one word apart in English, and only the first is
the compiler's.

## What the claim was

`mobile/app/api.ts` declares `Seller` with five fields where the wire carries
nine, and says so deliberately, in its own header:

> FIVE FIELDS, AND THE WIRE NOW CARRIES NINE. THE OMISSION IS DELIBERATE. …
> a structural type describing a subset is a NARROWING, and here the narrowing is
> a SECURITY PROPERTY. With no `id_number` on the type, no screen can render one
> **and no code can hand one to `saveSellers` by accident** — the compiler's half
> of the guarantee that proveSellerCreate's C6 proves at the cache layer.

The first half is true. The second half is false, and it is the half that guards
the write.

## Measured, not argued

`tsc -p tsconfig.node.json --noEmit`, P1.8a phase 3, over a probe file holding
one line per way of moving a wide value into a narrow position.
`CreatedSeller` has all nine fields; `MasterSeller` has five.

| | the line | result |
|---|---|---|
| A | `const a: MasterSeller = created` | **compiles** |
| B | `const b: MasterSeller = { ...created }` | **compiles** |
| C | `saveSellers([created], "x")` | **compiles** |
| D | a literal naming `id_number` outright | refused — `TS2353` |
| E | `(a as MasterSeller & Record<string, unknown>)["id_number"]` | **compiles** |
| F | `a.id_number` | refused — `TS2339` |

Excess-property checking applies to **fresh object literals only**. A variable
(A), a spread (B) and an argument (C) are all ordinary assignability, and a wider
object is assignable to a narrower type — that is what structural typing *is*.

**The two refusals are the two nobody writes by accident.** D is somebody typing
the forbidden field's name into a literal, and F is somebody reading it back. The
three that compile are the three an ordinary author reaches for: take the thing
the server returned, put it in the list, hand the list to the store.

## What actually stops the leak, and it is not the type

`SqliteMasterStore.saveSellers` writes a fixed column list —
`(id, code, name, phone, grade, owner_tenant_id)` — into a table that has no
`id_number`, `address` or `vehicle_no` column at all, which is what
`proveSellerCreate`'s C6 measures at runtime and calls "the leak is
unrepresentable". **That guarantee is real and it is the whole of the guarantee.**
Between the server's response and that INSERT, a wide object can sit in React
state, be handed to any prop, and be serialised by anything that stringifies the
list.

So the ledger is:

- reaching **disk** with an ID card number — stopped, by the writer's column list;
- **rendering** one by name — stopped, by the type;
- **holding** one in memory and moving it around — not stopped by anything.

## Why nothing here would have caught it

There is no failing state to observe. Every typecheck passes, because the code is
type-correct; every proof passes, because the value never reaches the table the
proofs read. This is not [[a-check-that-never-went-red-was-never-observed]] — no
assertion is vacuous, and nothing was pointed at the wrong artefact. It is closer
to [[a-docstring-that-states-a-filter-is-a-claim-about-its-caller]]: a sentence in
a header, describing something outside the file, that nothing executes and no
instrument compares against the language's actual rules.

And it is the reason the second path is the dangerous one. C6 proves the
**refresh** path — the device is handed the server's list and writes it. Creating
a seller from the phone (P1.8a) opens a second door into the same list, and
[[two-green-proofs-do-not-cover-the-seam]] is exactly this shape: the proof that
owns the cache does not know a create exists.

## How to apply

1. **Never write "the type prevents X" about a value that is passed.** Write it
   about a field that is *named*. If the sentence is about an object crossing a
   boundary, the compiler is not the mechanism and something else must be.
2. **Convert at the boundary, field by field, and never by a spread.** The repair
   here is `pickableSeller(created: CreatedSeller): MasterSeller` in
   `mobile/src/master/sellerForm.ts`, which names all five and can carry nothing
   else. A spread would have compiled and would have carried everything.
3. **Put the conversion where a proof can reach it** — under `src/`, never under
   `app/` — and assert both halves in the same cell: that the five fields
   *survived* and that the three values are *absent*. An absence over a function
   that returned `{}` is true of everything ([[a-check-that-never-went-red-was-never-observed]],
   the ninth mechanism).
4. **When a new path starts producing a type you already narrow somewhere, go and
   read the narrowing's justification.** It was written about the path that
   existed then.
5. **Measure the claim before repeating it.** Six lines in a probe file and one
   `tsc` run separated the true half from the false half of a sentence that had
   been in the tree, believed, since P1.8a phase 1.

## Bounds, so this is not read as wider than it is

The over-claim in `app/api.ts` is **recorded and NOT corrected** — that file is
outside the phase that found this, and the correction is the owner's to schedule.
Nothing has been observed leaking: no code path in the tree today hands a
`CreatedSeller` to `saveSellers` or into `sellers` state, because
`pickableSeller` was written before one existed. What is measured is the
compiler's behaviour and the falseness of the sentence, not a defect in shipped
code.
