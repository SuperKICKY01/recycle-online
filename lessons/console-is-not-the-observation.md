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

**Where found.** Phase 2c-3, verifying `/products` before the on-device cart
test. No code changed as a result — the correct outcome was a retraction.
