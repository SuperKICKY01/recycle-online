# The console is not the observation — verify text at the source, in bytes

**Rule: never diagnose a text or encoding problem from terminal output, or from
anything piped through a tool whose default encoding follows the console
codepage. Check at the source: codepoints from the file, hex from the database,
`.decode('utf-8')` pinned explicitly on the wire.**

This dev machine runs `Active code page: 874` (Thai). Any UTF-8 that passes
through the console, or through a Python process reading stdin with default
encoding, is silently re-decoded as CP874 and comes out as plausible-looking
garbage.

## What happened

Checking the master-data endpoint before the Phase 2c-3 device test, the product
names came back looking corrupted:

```
"name": "เธญเธฅเธน..."
```

`เธ` is `เธ` — the textbook signature of UTF-8 bytes re-decoded as
TIS-620/CP874. It was `\uXXXX`-escaped output, which the console cannot alter,
so it looked like hard evidence that the seeded data was double-encoded. It was
not. The escaping happened *after* `python -m json.tool` had already mis-decoded
the pipe.

A second check "confirmed" it: reading the seed file printed `?????????????`.
That was `errors='replace'` plus the console again.

What the source actually says:

```
file codepoints : 0xe2d 0xe25 0xe39 0xe21 0xe34 ...   = อลูมิเนียมกระป๋อง
postgres hex    : e0b8ad e0b8a5 e0b8b9 e0b8a1 e0b8b4 ... (byte-identical)
API, pinned     : json.load(f, encoding='utf-8') -> clean Thai
chcp            : 874
```

Nothing was wrong anywhere. Three layers agreed; only the rendering disagreed.

## Why this one is dangerous

Most false positives waste time. This one is destructive. The "fix" for phantom
mojibake is to rewrite the strings — which would have taken correct UTF-8 and
replaced it with something derived from a broken reading, in seed data that
populates every new customer's database. The bug would have been *created* by
the investigation, and the next person to look would have found real corruption
with a commit that says it fixed corruption.

It also fails the honesty test in the worst way: it looks like evidence.
`\uXXXX` escapes feel authoritative precisely because they are ASCII and cannot
be mangled in transit — but they are computed from a string that was already
wrong.

## How to apply

- **Postgres:** `SELECT encode(convert_to(col,'UTF8'),'hex')`. Hex is
  codepage-proof. Compare against the source file's bytes.
- **Files:** read binary and print `[hex(ord(c)) for c in raw.decode('utf-8')]`.
  Never `print()` the string and judge by eye.
- **HTTP:** write the body to a file, then `open(path, encoding='utf-8')`. Never
  pipe a UTF-8 body into a tool that decodes stdin with the locale default.
- **Rule of thumb:** if the conclusion is "the data is corrupt", first prove the
  *reader* is correct. Corrupt-looking output has two candidate causes and the
  rendering path is by far the more common one.

## The general form

Kalāma says never assert what the server did from memory — only from an observed
response. This is the same discipline one layer deeper: **a rendering of a
response is not the response.** The console is a second system with its own
lossy transformation, exactly like Metro's file map in
[[metro-file-map-nesting]], where `fs.existsSync` said `true` and the bundler's
own index said `false`. Ask the layer that actually holds the truth, in a form
it cannot reformat: bytes.

## AMENDED 2026-08-18 (P1.12) — bytes are not enough when the two sides are in DIFFERENT encodings

**Everything above is about a READER decoding with the wrong codepage, and its
remedy is "compare bytes". That remedy is necessary and NOT sufficient, and this
amendment lives here rather than in its own file because the remedy is what
failed — a reader who follows the rule above and stops there lands in exactly
this hole.**

Scanning a Hermes bytecode bundle to confirm a string had reached the app:

```
needle "บิล" as UTF-8     -> count = 0     <- the confident false absence
needle "บิล" as UTF-16LE  -> count = 89
needle "shopDateTime"     -> count = 1     (ASCII, found)
needle "zzz-not-present"  -> count = 0     (ASCII, correctly absent)
```

**Nothing was decoded.** No console, no pipe, no locale default — the file was
read with `read_bytes()` and compared byte to byte, which is what the rule above
prescribes. The instrument was correct and the NEEDLE was wrong: Hermes stores
non-ASCII strings as UTF-16LE, so a UTF-8 needle cannot match a string that is
certainly there.

**Why it is the same lesson and not a new one.** The output is a CONFIDENT FALSE
ABSENCE about the artefact, and the natural response to it is to go and "fix"
strings that were never broken — the same destructive direction as the phantom
mojibake above, reached from the opposite end. There the reader corrupted
correct data; here the search failed to find correct data. Both end with an
author editing text that was right.

**AND THE CONTROL WAS THE WRONG CONTROL, which is the part worth carrying.** The
absence was paired with ASCII PRESENT needles (`shopDateTime`,
`SHOP_UTC_OFFSET_MINUTES`, both found) and ASCII ABSENT needles (both zero). All
four behaved, and none of them could move: they proved the scan worked on ASCII
and said nothing whatever about Thai, which is the only thing in question. A
control must contain what fooled you — [[a-control-must-contain-what-fooled-you]]
— and here that means a needle in the SAME encoding class as the one whose
absence you are about to believe.

**How to apply.** Establish the STORE's encoding before searching it, not after a
zero. Where you cannot, search for the same string in every plausible encoding in
ONE run and require exactly one to hit — the evidence is the PAIR (0 and 89), not
either number. And never report "the string is not in the artefact" from a single
encoding's miss.

**Two homes, one test.** A LESSON, not a machine footgun: Hermes stores UTF-16LE
on every platform it runs on, so this is not a property of this box, and a
session on any machine would relearn it. It is also NOT the never-went-red
family — nothing here is a vacuous assertion, the scan fired correctly and
answered the question it was actually asked.

**Where found.** Phase 2c-3, verifying `/products` before the on-device cart
test. No code changed as a result — the correct outcome was a retraction.
