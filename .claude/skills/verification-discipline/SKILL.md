---
name: verification-discipline
description: How to know a change actually works and a result is actually real. Use when validating a fix or feature, running experiments, benchmarks, or A/B tests, evaluating models or heuristics, comparing before/after metrics, checking performance claims, or deciding whether a result justifies a rollout. Trigger on verify, validate, benchmark, experiment, significance, baseline, regression, A/B, "did it work", "is this real".
---

# Verification Discipline

The first four rules were each independently re-derived from two or more
separate incidents — they are the load-bearing core. The rest are single-
incident but hard-won. "Measurement hygiene" at the end covers the
statistics of not fooling yourself.

## Battle-tested core (each confirmed by multiple incidents)

### 1. Pre-register the gate; never tune to pass it

Decide the pass/fail criterion and freeze the configuration BEFORE running
the evaluation. If the result fails, execute the pre-registered stop rule:
record the verdict and stop. Do not adjust parameters until the validation
set passes — that is fitting on the validation set, and the resulting
"pass" is meaningless. Preserve held-out data unspent for the next
hypothesis.

Examples: a new filter was gated on "quality metric improves in evaluation
windows 1 and 2, no regression in 3," with its configuration frozen on
first principles before any test window was seen — the pass was honest. A
later feature failed its pre-registered gate and was stopped the same day,
with the held-out evaluation partitions deliberately left untouched for
the next idea.

### 2. "Applied" is not "verified"

A fix is UNTESTED until the real path has exercised it — record that
status explicitly and let it drive what you trust. A failure that predates
the fix is not evidence the fix failed.

Confirmed twice: a recovery-path fix was applied after two self-halts —
neither halt had tested it, so restarting was framed as "a deliberate test
of the fix," not "resuming normal operation." A separately reconstructed
code path was labeled "reconstructed from spec, never confirmed against
the real vendor" until a live check confirmed it.

### 3. Change one variable at a time, with a measurement between changes

Stacked changes make contributions unattributable — you cannot tell which
change carried the improvement and which is silently costing you. For
comparisons, construct the two runs to differ in exactly one variable.

Examples: two proposed filters were deliberately shipped one at a time
with a measurement gate between them, isolating each one's contribution. A
harness-repair effort ran identical code twice with only the windowing
rule varied, cleanly separating "code drift" from "harness effect."

### 4. Duplicated prod/test logic must change in lockstep

When the same computation exists in both the live path and the
test/simulation path — by design or by accident — a change applied to only
one side makes every comparison vacuous. The tell: results come back
identical to baseline, "verifying" nothing, because the change never
reached the measured path. Change both sides in one commit, or verify
which path the measurement actually exercises.

Confirmed twice: a sizing formula duplicated between the live engine and
the simulator, where changing only the live side made the A/B comparison
meaningless; and the same trap documented as the reason a five-file change
was five files instead of three.

## Establishing that a result is real

### 5. Run a positive control

A negative result is only attributable if a known-good signal passes the
same harness. Example: three model classes all scored ≈ coin-flip on real
data; a synthetic planted signal scored 0.69 AUC through the identical
pipeline — proving the data, not the models or the harness, lacked the
signal. Without the control, the wrong conclusion ("try better models")
was the natural next step.

### 6. A surprising negative on a sanity case means your instrument is broken

Before publishing a surprising conclusion, run the test on a case where
the answer is known. Example: an equivalence test rejected two funds that
track the *same index* — that contradiction, not the headline result, was
the real finding. The test's default lag-selection parameter had collapsed
its power; with the instrument fixed, the (still negative) headline became
trustworthy.

### 7. If in-sample strength collapses out-of-sample, audit the harness first

Results that are too good in evaluation and vanish in reality usually mean
the measurement leaked the answer. Example: two harness bugs — future data
leaking into evaluation windows, plus significance computed on correlated
sub-units — accounted for most of a "proven" effect; under the repaired
harness the effect was statistically indistinguishable from zero. The
in-sample edge never survived out-of-sample *because it never existed*.

### 8. Upstream changes invalidate downstream numbers

A structural fix upstream of a previously validated number invalidates
that number — re-derive the baseline rather than assuming it still holds.
This applies even when the fix "seems unrelated" to the measurement.

Example: a lifecycle-status bug fix upstream of a measured "+5%
improvement" flipped the true figure negative on re-derivation — the
original number had been measured against an input stream the bug was
silently inflating.

### 9. Approvals don't carry forward across assumption changes

A limit, threshold, or go-decision approved under old assumptions must be
re-derived when the model becomes more realistic — the approval was made
against numbers that no longer exist. Ask: "was this approved against the
old model or the new one?" If the former, the approval is void, not
grandfathered.

Example: a risk limit approved against an optimistic cost model no longer
met its own headroom rule once realistic costs were modeled; the limit
was re-derived and tightened in the same change that improved the model —
not defended on the strength of the stale approval.

### 10. Label the epistemic status of every number

In-sample vs out-of-sample; measured vs assumed; verified live vs
simulated; and always the n. Quote thresholds together with results ("1 of
3 windows passes at the relaxed bar, 0 of 3 at the standard bar" — never
just "fails"). Correct stale facts explicitly when found: a wrong "known"
number poisons every downstream decision that cites it.

### 11. First fire proves wired, not calibrated

A protective gate's first real rejection proves the wiring works
end-to-end — nothing more. A gate that rejects everything and a gate tuned
correctly look identical at n=2. Example: a new gate rejected 2 of 2 items
on its first day; both readings ("correctly strict" vs "too tight") fit
the data, so it was logged as a watch item and the threshold left alone
until a real distribution accumulated.

### 12. Sanity-check effect direction

A stricter rule must worsen the favorable metric. If tightening something
*improves* the result, you have a bug, not a win. Example: after any
simulator rule change, the expected sign of the impact was stated first;
a "stricter" rule that raised the result would have meant the rule wasn't
wired.

### 13. Evaluate a threshold by replaying what it rejected

Don't argue about whether a gate is too tight — replay the rejected items
and compute what accepting them would have cost. Example: a gate suspected
of over-blocking was tested by replaying all 30 rejected items; accepting
them would have produced a large net loss, and the "too tight" hypothesis
died on evidence rather than being argued.

### 14. Reproduce claimed numbers before optimizing against them

Example: a folklore "91-second startup cost" justified a planned component
swap; when actually benchmarked it measured 11 s, and the swap candidate
failed on quality in the same benchmark. Profile the end-to-end path
before assuming which stage is the bottleneck.

### 15. Audit which guards actually fire

A safety check that has never fired is unverified code, not proven
protection. Example: an audit found 8 of 10 safety checks had zero
production fires — only two were load-bearing. Separately, a hard-cutoff
branch was flagged as "unit-verified only, never exercised end-to-end" so
nobody would mistake it for battle-tested.

### 16. Run the cheapest honest falsification before spending

Before buying compute, data, or fees — or building more — design the $0
test that could kill the hypothesis. Example: a paid challenge's pass
probability was simulated from existing data before paying the fee; the
simulation showed the fee was, in expectation, a donation, and it was not
paid. Six hypotheses were killed in one session for $0 total, each with a
pre-registered gate.

### 17. Find the binding constraint before optimizing a layer

Fixing execution cannot fix a frequency problem; fixing throughput cannot
fix a quality problem. Example: after an execution-layer fix worked
mechanically, results were still capped — the binding constraint had moved
to how few quality items the upstream stage emitted, and further
execution work was provably wasted effort.

### 18. A defensive net is not a root fix

Gates and guards that catch a failure mode are nets; the process producing
the failure is the root. Ship the net, label it a net, and keep the root
cause on the books. Example: a rejection gate stopped bad submissions
while the real cause — 60+ seconds of pipeline latency upstream — remained
the tracked root workstream.

### 19. Pin randomness; verify replay determinism

Seed every stochastic component in a validation harness, and confirm a
rerun reproduces byte-identical results before trusting any comparison
across runs. Example: a detector with random initialization was pinned so
parallel validation subprocesses were reproducible; a crashed run's replay
was verified byte-identical at a mid-run checkpoint before its results
were compared to anything.

## Measurement hygiene

### 20. Slice time buckets by close time, not label

Buckets labeled by start time (hourly rollups, resampled frames) must be
filtered by bucket END ≤ decision time, or the still-forming bucket leaks
the future into every evaluation window. Example: hourly metric rollups
labeled 14:00 contain data through 14:59 — selecting `label <= 14:30`
hands the evaluation 29 minutes of the future, in ~92% of decisions. That
leak alone accounted for most of a "proven" effect.

### 21. Compute significance on independent units

Sub-units of one decision (two order lines from one checkout; multiple
events from one user session) are correlated — treating them as
independent inflates apparent significance by up to √k. Collapse to the
decision unit first. Example: per-event statistics claimed t ≈ 2.8; per
independent decision, the honest figure was t ≈ 2.0 — below the gate.

### 22. Calibrate statistical gates to achievable power

Significance scales as t = S·√n. If the per-unit effect size and the
realistic sample per window make the threshold unreachable even in a good
period, the gate tests luck, not the system. Set the bar where a
typical-quality period can pass and a good one passes comfortably — and
record the calibration decision rather than silently changing a default.

Example: a t > 3.0 gate at ~90 samples per window and realistic effect
sizes had an achievable ceiling of roughly 1.3–3.7 — passing required a
lucky window. The bar was recalibrated to 2.5 with the reasoning recorded,
and the code's conservative default left untouched.

### 23. If adding samples lowers significance, the marginal samples are noise

Growing n should strengthen a real effect. When loosening a filter raises
n but *drops* the significance, the added items are diluting a thin real
subset — you are harvesting volume at quality's expense. Example: a
relaxation doubled acceptances (9 → 12) while honest significance fell
from ~3.3 to ~2.0; the "improvement" in volume was noise.

### 24. One dominant outlier is fragility, not performance

If removing the single best item halves the result, the result will not
replicate. Report concentration (top-1 / top-3 share of the total)
alongside the headline. Example: one item was 44% of the net result and
the top-3 days were 87% — the headline number was an outlier's biography,
not a system's performance.

### 25. Check confidence intervals before claiming segment differences

"Segment B outperforms A" at n=18 with overlapping intervals is not a
finding. Example: an 85+ score bucket showed 56% success vs 31% for
75–84 — at n=18, the 95% CI was roughly [33%, 78%], overlapping the other
bucket entirely; sizing decisions built on "85 is better" were
unjustified.

### 26. Summed-flag scores: check per-bucket monotonicity

A score built by summing weighted booleans assumes more = better. Plot the
outcome per score bucket; a non-monotone profile means at least one
component encodes contradiction as agreement. Example: a scoring model's
75–84 bucket performed *worse* than 65–74 — one component measured a
condition that structurally opposes the others, and the sum counted the
conflict as confluence. Fix the component; don't ship the score.

### 27. Decompose factor variance within the surviving cohort

A factor that gates entry is near-constant among items that passed the
threshold, so it discriminates nothing among them. Measure each factor's
variance *within the accepted population*, not across all candidates.
Example: in a "6-factor" score, five factors were ON in ~98% of accepted
items — the composite was secretly one binary feature, and that feature's
apparent edge vanished out-of-sample.

### 28. A ceiling diagnostic is a direction signal, never the deployable number

Optimistic upper bounds (best-case rates ignoring contention and
constraints) answer "is this worth trying," not "what will we get."
Example: an unconstrained best-case estimate of 68% overstated the
realized 28% by ~2.4×. Quote ceilings only as go/no-go direction, and say
so when you quote them.
