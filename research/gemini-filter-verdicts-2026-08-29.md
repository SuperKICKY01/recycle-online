# Gemini-filter verdicts — 2026-08-29

**What this is.** A dated ledger of the owner's verdicts on an external critique
(the "Gemini filter") of two things: the completion plan in
`research/master-plan-2026-08-26.md` and this project's proof suite. It records
what was REJECTED, what was ADAPTED, and what was ACCEPTED, and nothing more. **It
is a research record, not a roadmap authority.** Where a verdict became a settled
decision it is written into `ROADMAP.md`, and that file wins on any difference;
where it became a proposed sequence it is carried as a proposal, not a mint. The
critique's own step labels (H.1–H.9) are the filter's, not P-numbers, and are
reproduced here only to name what the proposal orders.

This ledger carries no progress claim and no design. It rots the ordinary way — a
verdict is true as of the pass that took it (2026-08-29) and is re-derived, not
trusted, by anyone acting on it later.

---

## REJECTED

- **Adding PgBouncer (a connection pooler) to the stack.** Rejected as premature
  infrastructure for the hosting model the owner already settled: S13 puts
  production on the owner's own machine, one instance per shop, at a concurrency a
  single Postgres handles without a pooler in front of it. A pooler is an added
  operational component on that machine with no measured need behind it, and the
  tenant-context mechanism this project depends on is transaction-scoped
  (`SET LOCAL`, per the RLS convention) precisely so it does not assume a
  dedicated connection — so the pooler answers a problem the design does not have
  yet. If a real deployment ever measures connection pressure, this is revisited
  with that measurement in hand; it is not adopted speculatively.

## ADAPTED

- **The "400 lines of code per review" limit → per-review-SITTING, not
  per-diff.** The filter's fixed LOC ceiling is adapted rather than taken as
  written: the unit that matters here is one review sitting's attention, not a
  line count, because a 600-line mechanical rename and a 120-line change to a
  money path are not the same review. The bound is kept as a discipline on how
  much is reviewed at once and dropped as a hard number.
- **Mutation testing → EVALUATE as a complement, not adopt as a gate.** It is
  recorded as worth trying alongside the existing proofs to measure whether they
  actually kill injected faults, not as a new required gate. The evaluation is the
  commitment; adoption waits on what the evaluation shows.
- **The 17-mechanism catalog → kept as the suite's HONESTY RECORD, not treated as
  a defect list.** The filter read the catalog of ways a check here can silently
  fail as a backlog to burn down. It is the opposite: it is the record of failure
  modes this project has already paid to learn (the machine footguns and the
  "a check that never went red" lessons), and its value is that it stays visible,
  not that it shrinks.

## ACCEPTED

- **A Definition-of-Done skeleton per test level — WITH ONE CORRECTION.** The
  per-level DoD skeletons are accepted as a useful shape. The correction the
  filter needed: a mutation-testing DoD targets a LOW mutation-survival rate (few
  injected faults survive the suite), not a high one; the filter had the polarity
  inverted, and a DoD written to the inverted target would have passed a suite
  that catches nothing.
- **The completion-sequence spine — ACCEPTED AS A PROPOSAL, to be verified and
  numbered in the roadmap, not minted here.** The filter's proposed order to
  handover:

  > H.1 hosting → H.7 RLS audit → desktop → H.6 licensing → H.4 release → H.2
  > backup drills → H.5 PDPA / store-compliance → H.3 monitoring → H.8 / H.9
  > support + onboarding

  It is accepted as a starting spine because its shape matches the dependencies
  this project already carries (hosting before anything reachable; an RLS audit
  before real tenant data; the desktop era before licensing, which the desktop
  holds; release and backup drills before a paying shop; PDPA and store
  compliance before public distribution; monitoring and support last). **It is a
  PROPOSAL, not a decision:** the actual ordering, and any P-number a gate needs,
  is re-derived against the roadmap's own `Depends on` chains in the completion
  sequence, where it is written with its controls. The H-labels do not survive
  into the roadmap; they name the proposal here so it can be pointed at.

---

**What this feeds.** The completion sequence written into `ROADMAP.md` takes the
accepted spine as input and verifies it against the steps that already exist; the
mobile-commercial scope raised on 2026-08-28 (`ROADMAP.md § What the owner has
settled`, decision S23) becomes queue entries under their owning steps, not new work
invented here. Nothing in this ledger schedules anything on its own.
