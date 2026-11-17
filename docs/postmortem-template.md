# Postmortem: <short title of what happened>

**Date:** <date, UTC>  **Duration of impact:** <how long data was stale or the site was affected>  **Severity:** <none, stale data, wrong data>

A postmortem describes what happened and what was learned, not who is to blame. Be specific; use times and numbers.

## Summary
Two or three sentences: what failed, what the effect was, how it was fixed.

## Impact
- What did visitors see, and for how long?
- Was any wrong data published? (A failed run publishes nothing, so normally: no.)

## Timeline (UTC)
| Time | What happened |
| --- | --- |
| hh:mm | The run started |
| hh:mm | The stage failed |
| hh:mm | The Discord alert arrived |
| hh:mm | The cause was identified |
| hh:mm | The fix was pushed or the run repeated |
| hh:mm | The Health page returned to Healthy |

## Detection
How did we find out: the alert, the Health page, or someone noticing? How long after the failure?

## Root cause
What actually went wrong, and why the checks or tests did not prevent it. Distinguish the trigger from the cause.

## Resolution
What was done to fix it, and how it was verified.

## What went well / what went badly / where we were lucky
-
-
-

## Action items
| Action | Owner | Done |
| --- | --- | --- |
| e.g. add a check that would have caught this earlier | | |
