# A comment that quotes the moved Thai pollutes the "moves only" filtered diff

Applies to any phase whose contract is "no Thai reworded, moves only" — the filtered-diff
proof that every changed Thai line is a MOVE and nothing was reworded or invented.

The proof is a filtered diff: every `+`/`-` line carrying a Thai codepoint. A UI string
that moved — removed from one `<Text>`, added to another — is what it is meant to show. But
DOCUMENTATION PROSE that quotes the moved strings for clarity — a code comment, a docstring,
even a proof's own `why`-string — carries the same Thai codepoints and lands in the same
diff as "added Thai." It is a FALSE POSITIVE, and it is dangerous in two directions: it
BURIES a real reword in noise, and it invites the wave-through ("the added Thai is only
comments"), which is the exact moment a genuine reword slips past dressed as a clean move.
P1.23 item 3 phase D added 14 such comment lines while moving 5 UI strings; the first
filtered-diff read showed 14 "added Thai" lines, and only on inspection were they all
comments — each was then de-Thai'd until the added-tracked count was zero.

Two rules, and they are not the same:

1. **Code comments and docstrings stay ENGLISH** (the CLAUDE.md convention), which means
   DESCRIBING a UI string, never quoting it — "the save button" / "the deactivate action",
   not the Thai for them. Each moved string lives in exactly one place: the `<Text>` that
   renders it. A doc that must name one names its ROLE.

2. **The check is byte-level and reads the DESTINATION file.** `git diff` shows tracked
   changes only, so when the move lands in a NEW file that file is not in the diff at all —
   the *added* half of every move is invisible to a diff-only check. The check must (a) count
   the Thai `+`/`-` lines and assert the added-tracked count is ZERO once comments are
   English, and (b) read the destination file directly and confirm each moved string is
   present BYTE-FOR-BYTE. `removed=N, added_tracked=0, all-N-in-new-file=true` is the shape
   of a clean move; anything else is either a reword or a comment still to de-Thai.

Never judge the filtered diff by eye on this box: cp874 mojibakes Thai in the console, so the
"added Thai" lines are unreadable there anyway. Read the COUNTS and the byte-level membership
checks, never the rendered glyphs — the same discipline as
`lessons/console-is-not-the-observation.md`.
