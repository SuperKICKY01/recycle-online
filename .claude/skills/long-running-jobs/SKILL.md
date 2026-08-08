---
name: long-running-jobs
description: Hygiene for any computation that takes more than a few minutes OR runs unattended (cron, Task Scheduler, CI — no human at the console) — batch jobs, ETL, backfills, scheduled syncs, ML training, migrations, large dataset processing, simulations. Use before launching such a job and when writing the tooling around one. Trigger on long-running, batch, pipeline run, backfill, training run, scheduled task, unattended, cron, "this will take a while", multi-hour, overnight job.
---

# Long-Running Jobs

Learned the expensive way: one 5-hour blind run produced nothing usable,
and a 90-minute run was destroyed by a formatting crash in its final
print statement — ~6.5 avoidable hours on a single tool. Rules in
lifecycle order.

### 1. Test the output path before the expensive computation

A bug in the last 1% of the pipeline (report formatting, serialization,
encoding) must never be discovered after the expensive 99% has run.
Exercise the full print/serialize path on synthetic data first — under the
same conditions as the real run: same output redirection, same console
encoding, same target directory.

Example: a report full of Unicode symbols (×, →, ✅) crashed on a legacy
Windows console codepage — but only when stdout was redirected; the unit
test ran through a UTF-8 pipe and never saw it. The crash happened after
the results were computed and took the whole 90-minute run down with it.
(`sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")` is
cheap insurance on Windows.)

### 2. Persist expensive results the instant they exist

Write the costly artifact — computed distribution, trained model, API
batch result — to disk at its source, BEFORE any downstream processing.
Provide a `--from-cache` flag so everything downstream (reports, plots,
sweeps) can be iterated for free. Any later bug then costs a re-run of the
cheap part, never the expensive part.

Example: the 90-minute distribution above lived only in a local variable
consumed directly by the report; the report crash lost it entirely. The
rewrite dumps the distribution to JSON the moment it's computed, and
`--from-cache` regenerates the full report in under a second.

### 3. Never run a long job blind

Emit progress with an ETA, or write incremental output. A multi-hour job
with zero output makes "working or hung?" an uninformed coin-flip — and
killing it destroys whatever it did. Bound the scope too: run the smallest
window that answers the question before committing to the full dataset.

Example: a full-dataset run at WARNING-level logging with progress
disabled produced 0 bytes of output over 5 hours; there was no way to tell
40%-done from deadlocked, so it was killed, having produced nothing. The
fix emits "X% — item i/total — ($Ys)" lines that give a live rate and ETA.

The rule is about the *absence of a watcher*, not the duration: a
30-second job on a scheduler is equally blind. For short unattended runs
the same rule takes the form of structured logs — per-stage counts and
durations plus one run-summary line — and a run-history record a human
can query later.

### 4. Run heavy jobs strictly sequentially

Kill prior runs before starting another. Never fan out N parallel jobs
that each load the full dataset — peak memory multiplies by N.

Example: 10 parallel runs, each loading a full 100k-row dataset, produced
a MemoryError cascade that exhausted the machine and forced a manual
reboot — losing the in-flight work of every run, including earlier ones
still going.

### 5. Sweep parameters as a post-process when they don't affect the expensive stage

If a parameter only shapes the *interpretation* of results (a threshold,
an expiry, a grouping), run the expensive stage once, save its raw output
(rule 2), and sweep the parameter over the saved output in seconds.
Re-running a multi-hour pipeline once per parameter value is paying
compute for a for-loop.

Example: a 4-value parameter sweep would have cost 4 × 5 pipeline-hours;
recognizing that the parameter didn't change the generation stage, the
pipeline ran once and the sweep became a ~1-minute post-process over the
saved results.
