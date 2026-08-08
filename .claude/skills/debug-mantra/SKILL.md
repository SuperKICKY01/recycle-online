---
name: debug-mantra
description: Four-mantra debugging discipline — reproduce, know the fail path, falsify the hypothesis, cross-reference every breadcrumb. OPEN THIS SKILL'S BODY before proposing any fix; the four steps, their order, and the escalation inside step 2 are in the body and are not recoverable from this line. Trigger on /debug-mantra and proactively whenever debugging starts — user reports a bug, says something is broken/throwing/failing, asks to debug/diagnose/investigate an issue, or pastes a stack trace or error log.
---

# Debug Mantra

Four-step discipline for any debug session. Apply in order.

## The four steps

Hold these; do not emit them. A session that can read this block has already
loaded the body and gains nothing by quoting it back, and a session holding
only this skill's `description:` cannot quote it at all — which is the
configuration a verbatim-recital order was written for and cannot survive.

> 1. **First is reproducibility.** Can the issue be reproduced reliably?
> 2. **Know the fail path.** Debugger first; then source trace + knob enumeration; then in-code instrumentation.
> 3. **Question your hypothesis.** What would disprove it?
> 4. **Every run is a breadcrumb.** Cross-reference all of them.

Then begin work.

---

## 1. Reproduce reliably

Build a runnable repro before anything else.

**First name the artifact.** A repro is of a specific build, bundle, blob or
database copy — not of "the code". State which one, and how you know: the
bundle the device fetched, the working tree vs. the committed blob, the dev
DB vs. a restored scratch copy. A reliable repro of the wrong artifact is
worse than none: every step after it is sound and every conclusion is wrong.

- **Reliable repro** → capture the exact steps, inputs, and environment as a runnable artifact: failing test, curl script, CLI invocation, replay harness.
- **Flaky repro** → the bug is not yet debuggable. Raise the rate first: loop the trigger, parallelise, add stress, narrow timing windows, inject sleeps. 50% flake is debuggable; 1% is not.
- **No repro at all** → stop. Say so explicitly. Ask for env access, captured artifacts, or permission to instrument. Do **not** proceed to hypothesise.
- **Nothing is failing, and that is the suspicion** — a check, guard or assertion you cannot show going red. This is not the case above and "stop" is wrong here: there is no symptom to reproduce because the instrument may be incapable of producing one. Invert step 1 — BREAK the thing under test on purpose and require the number to move. A green that cannot be made red measured nothing, and no amount of env access will show you that.

Target: a fast (1–5 s), deterministic pass/fail signal. Pin time, seed the RNG, freeze network, isolate filesystem.

**Then run it twice with no reset.** Isolation buys determinism and buys a
second failure with it: a harness that normalises its own fixture as setup
passes the second time by measuring its previous run. Where the state is
shared on purpose (a live DB), keep it shared and require two consecutive
greens instead.

## 2. Know the fail path

Once reproducible, find *where* the code breaks and *what stops it from breaking*. The differential narrows the search. Try in this order — escalate only when the prior tactic fails.

1. **Attach a debugger.** If the env supports it, attach and step to the failure site. One breakpoint beats ten logs. Do this **before** turning any knobs.
2. **Source trace + knob enumeration.** If no debugger (or it can't reach the bug), trace the code path end-to-end and list every knob that can influence the outcome:
   - config flags, env vars, feature toggles
   - branch conditions, input shape
   - timing, concurrency, build options
   Each knob is a candidate axis to flip in the differential. Flip one at a time.
3. **In-code instrumentation.** If outside knobs can't move the failure, go inside: `printf` / log statements at the suspected fail site, dump the relevant internal state. Tag every probe with a unique prefix built from characters no matcher rewrites — `DBG_a4f2`, never `[DBG-a4f2]`: brackets make a bracket expression, and `grep '[DBG-a4f2]'` matches any line containing any of D, B, f, 2 or anything in the range G-a. Measured: 4 of 4 lines matched where 1 was correct. Use `grep -F` for cleanup, and count the probes you added so the cleanup has a number to meet. Let the trace show where reality diverges from your model.

## 3. Falsify the hypothesis

When a candidate root cause surfaces, scrutinise it **before** testing it.

- Does it actually explain the symptom end-to-end? Walk it through.
- What is the simplest **proof**? What is the cleanest **disproof**?
- Run the **disproof first**. If the hypothesis survives, it's real. If it dies, you saved yourself from chasing a phantom.
- Generate 3–5 ranked hypotheses, not one. Single-hypothesis thinking anchors on the first plausible idea.

## 4. Every run is a breadcrumb

Maintain a running **ledger** of every experiment in this session. Each entry: what changed, what happened, what it ruled in or out.

- When a new hypothesis surfaces, walk the ledger. Does it hold for **every** prior observation, not just the most recent?
- If any past run contradicts it, the hypothesis is wrong or incomplete — refine or discard.
- When in doubt, design the **single experiment** whose outcome makes it certain. Run that next, instead of churning on adjacent runs.
- Update the ledger after every run. It is your memory across the session.

---

## Operating rules

- Do not emit the four-step block. It is a constraint you carry, not output (see the last rule below). What the user is owed is the observation each step produced, not a statement that the step will be taken.
- Apply the four steps **in order**:
  - Do not propose a fix before #1 is satisfied (reliable repro exists).
  - Do not start testing hypotheses before #2 has narrowed the fail path.
  - Do not commit to a hypothesis before #3 has tried to disprove it.
  - Do not declare a hypothesis correct until #4 confirms it against every prior breadcrumb.
- If you catch yourself proposing a fix without a reliable repro, stop and return to step 1.
- The mantra is a constraint **you** carry through the session — not advice to deliver back to the user.
