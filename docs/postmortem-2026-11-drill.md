# Postmortem: practice failure at `check/marts`

**Date:** Nov 16, 2026  **Type:** Practice drill, not a real failure  **Duration of impact:** none  **Severity:** none (no wrong data was published)

## Summary
I ran the Pipeline workflow with the "Practice run" option ticked, which makes the pipeline fail on purpose at the marts check. The goal was to prove that a real failure would be detected, reported, and contained before one happens. The run failed at `check/marts` after 48 seconds, exactly as designed. A Discord alert arrived about a minute after I pressed the button, the Platform Health page turned red and logged an incident, and the website kept showing the previous version. Re-running the workflow normally passed every stage and published the site.

## Impact
None, by design. A run that fails any check publishes nothing, so visitors kept seeing the data from the last good run. That data was 7 days old at the time, against a limit of 12.

The one visible effect was the Health page, which said "Failing" for about three hours. I left the failure in place while I captured screenshots, so the status stayed red until I ran the recovery.

## Detection
Three independent signals reported the failure, and none depended on me noticing.

1. **Discord alert.** It named the failing stage and showed the last line of output:
   > Pipeline FAILED at `check/marts` after 48 seconds. ... SIMULATED FAILURE: check/marts was told to fail on purpose (a practice run, not a real problem).
2. **Platform Health page.** The banner changed to "Failing" and said the latest run failed at `check/marts`. Today's square turned red. The Incidents table gained a row with the failing stage, the last line of output, and a link to the run.
3. **GitHub.** The run was marked failed, with exit code 1.

**Time to detect:** about one minute. I pressed the button at 8:02 PM and the alert arrived at 8:03 PM. The whole workflow ran for 1 minute 17 seconds.

## Timeline (local time)
| Time | What happened |
| --- | --- |
| 8:02 PM | I pressed "Run workflow" with "Practice run" ticked |
| 8:03 PM | The pipeline failed at `check/marts` after 48 seconds. The earlier stages had run normally: the downloads took 9 seconds in total (the saved-download cache worked), the warehouse build 38 seconds, the staging checks 1.3 seconds. The export was skipped. |
| 8:03 PM | The Discord alert arrived |
| 8:03 PM | The run was added to the health history (6 seconds) and the schedule safeguard ran (4 seconds). The Health page showed "Failing". |
| about three hours later | I re-ran the workflow with nothing ticked. Every stage passed (1 minute 19 seconds), the run was recorded, and the site was published (21 seconds). The whole run took 1 minute 48 seconds. |

## Root cause
Deliberate. The workflow's `simulate_failure` input sets `PIPELINE_INJECT_FAILURE=check/marts`, which makes that one stage fail with a message that says it is simulated. Nothing in the data, the code, or the infrastructure was wrong.

## What the drill confirmed
- **The failure was contained, and I can show it.** In the failed run, the "Publish the website" job was skipped and the run produced one artifact (the run record). In the recovery run, "Publish the website" passed and the run produced two (the run record and the site).
- **The failure was recorded in full.** The Health page kept the stage-by-stage timings, the data counts (14,529,368 stop events on 348 days), and the failing stage, so someone could diagnose it without opening GitHub.
- **The alert was useful on its own.** It named the stage and showed the output, and the stage name matches a section of the runbook.
- **Recovery was quick** because the saved downloads were kept even though the run failed. The recovery run's downloads took seconds.
- **The MBTA key was reaching the cloud.** The stations step took 2.6 seconds, against 28 seconds before the key was set.

## What the drill found that needs work
| Finding | Action |
| --- | --- |
| The "Checks on the latest run" table listed only `staging` and `alerts`. The `marts` row was missing because that stage failed before it reported, which could be read as "marts was never checked". | Show a stage that failed before reporting as "did not finish". |
| The run-duration and data-volume charts repeated the label "Nov 16" under every point, because several runs happened on one day. | Show a date label only where the date changes, or add the time. |
| The alert does not say how fresh the published data is, which is the first thing I want to know when deciding how urgent it is. | Add the data's age to the alert message. |
| I left a practice failure in place for about three hours, so the public status page said "Failing" the whole time. For a real incident that honesty is right. For a drill, it only confuses anyone who visits. | Run the recovery immediately after a drill, and take screenshots afterward. |

## What went well / badly / lucky
- **Well:** every signal agreed, the alert arrived within a minute, and recovery needed no investigation because the failure was the only change.
- **Badly:** the Health page showed incomplete information for a stage that failed before reporting, and I delayed the recovery (see above).
- **Lucky:** it was a drill. A real failure at this stage would have left the site stale for a day, not wrong.

## Action items
| Action | Done |
| --- | --- |
| Show failed-before-reporting stages in the checks table | |
| De-duplicate chart date labels | |
| Add data age to the Discord alert | |
| Recover immediately after a drill | |
