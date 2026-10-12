# An answer belongs to the question that asked it

**Applies to:** every screen that shows data from an asynchronous request while its controls can change
the request — filters, date ranges, a search box, paging.

**What happened (desktop B3, 2026-10-12).** The bills screen kept `rows` (the last SUCCESSFUL answer) and
`filter` (what the operator has chosen now) in two states. The range heading and the filter controls
read `filter`; the table and the bill COUNT read `rows`. A failed load wrote nothing, so after choosing
"7 วันล่าสุด" with the server unreachable the screen read "06/10/2569 – 12/10/2569 · 12 บิล" over TODAY's
twelve bills — a week's heading over one day's money, unmarked, on the screen a cashier balances a
drawer from. The same split lets a slow answer for an OLD filter land after a newer one and replace it.
Every proof was green: each cell checked a successful load, and the first paint always agrees.

**The rule.** Store an answer WITH the question it answers (`{ key: billsQuery(filter), rows }`), and
render it only while that question is still the one on screen. A different key means the answer is not
this screen's: show loading, or — when the request for THIS key failed — say the load failed, and never
the previous range's rows or count. A count is part of the answer, not of the heading.

**Proof shape.** Change the question, make its answer fail (stop the server), and assert that NO row and
NO count from the old answer remains (`prove:billsflow` B9). Disproved by rendering `listed.rows`
regardless of its key: B9 red with 200 stale rows. A proof that only ever loads successfully cannot see
this, because success overwrites the stale state.

**Also learned in the same fix:** once rows empty while a new answer loads, a proof that waited for the
OLD rows to disappear reads the loading state — wait for the NEW answer's evidence (the expected row),
never for the absence of the old one (B2 went red exactly so, and the wait was the defect).
