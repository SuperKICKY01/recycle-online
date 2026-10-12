# Thai words nest: select a control by its role and exact name, never by a text fragment

**Applies to:** every Playwright (or any DOM) proof that clicks a control by its Thai label.

**What happened (desktop B5 and B6, 2026-10-13).** `page.click("text=ปิด")` was meant for a panel's close button. Playwright's
`text=` matches a SUBSTRING, and `เปิดใช้งานอีกครั้ง` ("bring back") contains `ปิด`: the proof clicked "bring back"
right after retiring a product, and its cell read an active product as a retirement that had not stuck. A day later
`text=ปิดกะ` ("close shift") clicked the hint sentence `…ตอนปิดกะ…` beside the button, and `เปิดกะ` ("open shift") would
have matched too. Thai composes words from words with no spaces — ปิด in เปิด, ปิดกะ in เปิดกะ and in any sentence about
closing a shift — so a fragment that is unique in English is routinely not unique in Thai. Both times the proof went red
for a reason that was the PROOF's, and both times the first reading of the red was "the screen is wrong".

**The rule.** Click by role and EXACT accessible name — `page.getByRole("button", { name: "ปิดกะ", exact: true })` — or by a
`data-*` attribute the screen sets for the purpose (`.panel .panel-head button`, `[data-toggle-active]`). A text
selector is for READING what a screen says, never for choosing what to press.

**When a click-driven cell goes red,** look at the window before the code: the last-state screenshot showed the open
shift still open with the amount typed — the click had landed elsewhere — which a log line could never say.
