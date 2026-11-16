"""
Send an alert to Discord when the pipeline fails.

The workflow runs this when any step fails. It reads the run record that pipeline/run.py writes
(exports/pipeline_run.json) and posts a short message: which stage failed, the last lines of its
output, and a link to the run. It uses only Python's standard library, so it works even when the
failure happened before the project's packages were installed.

The webhook address is a secret: anyone who has it can post to your channel. It comes from the
DISCORD_WEBHOOK_URL environment variable, and this script never prints it.

Usage:
    python3 pipeline/notify.py            # alert about the latest run (what the workflow does)
    python3 pipeline/notify.py --test     # send a clearly labelled test message
    python3 pipeline/notify.py --print    # show the message instead of sending it (no webhook needed)

Exit code: 0 when the message was sent (or there is no webhook set and this was not a test),
1 when sending failed or a test could not be sent.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RECORD = Path(__file__).resolve().parent.parent / "exports" / "pipeline_run.json"
LIMIT = 1900  # Discord allows 2,000 characters in a message; stay safely under it
USER_AGENT = "headway-pipeline-alerts (+https://github.com/davidnamgung/transit-ops-platform)"
# Discord's front door (Cloudflare) rejects requests that send no User-Agent, so one is always set.


def run_url(env):
    server, repo, run_id = env.get("GITHUB_SERVER_URL"), env.get("GITHUB_REPOSITORY"), env.get("GITHUB_RUN_ID")
    return f"{server}/{repo}/actions/runs/{run_id}" if server and repo and run_id else None


def load_record(env):
    """The run record, unless it clearly belongs to a different run (an old file left on disk)."""
    try:
        record = json.loads(RECORD.read_text())
    except (OSError, ValueError):
        return None
    current = env.get("GITHUB_RUN_ID")
    if current and str(record.get("run_id")) != current:
        return None
    return record


def fit(tail_lines, budget):
    """The end of the log, cut at a line boundary, in at most `budget` characters."""
    text = "\n".join(tail_lines).replace("```", "'''")  # a stray fence would break the code block
    if len(text) <= budget:
        return text
    cut = text[-budget:]
    return cut[cut.find("\n") + 1:] if "\n" in cut else cut


def build_message(record, env, test=False):
    link = run_url(env)
    repo = env.get("GITHUB_REPOSITORY", "this repository")
    tail = []
    if test:
        head = "**TEST ALERT.** If you can read this, pipeline alerts work. Nothing is wrong."
    elif record and record.get("status") == "failed":
        head = f"**Pipeline FAILED** at `{record.get('failed_stage')}` after {record.get('duration_sec', 0):.0f} seconds."
        tail = record.get("log_tail") or []
    elif record:
        head = ("**The workflow failed after the pipeline itself succeeded.** "
                "A step that runs after the pipeline went wrong.")
    else:
        head = ("**The workflow failed before the pipeline produced a record.** "
                "Installing the project or starting the pipeline probably failed.")
    lines = [head, f"Repository: {repo}", f"Run: {link}" if link else "Run: (not available outside GitHub)"]
    message = "\n".join(lines)
    if tail:
        budget = LIMIT - len(message) - len("\n\nLast lines of its output:\n```\n\n```")
        message += "\n\nLast lines of its output:\n```\n" + fit(tail, max(budget, 0)) + "\n```"
    return message[:LIMIT]


def send(url, message, attempts=3):
    """POST the message. Returns (sent, plain-language result). Never includes the webhook address."""
    body = json.dumps({"content": message, "allowed_mentions": {"parse": []}}).encode()  # no pings
    result = "no attempt made"
    for attempt in range(1, attempts + 1):
        request = urllib.request.Request(
            url, data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": USER_AGENT})
        wait = 2 ** attempt
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return True, f"sent (HTTP {response.status})"
        except urllib.error.HTTPError as err:
            if err.code == 429:  # rate limited: Discord says how long to wait
                try:
                    wait = min(float(json.loads(err.read()).get("retry_after", wait)), 10)
                except (ValueError, OSError):
                    pass
                result = "Discord is rate limiting this webhook (HTTP 429)"
            elif err.code >= 500:
                wait, result = attempt, f"Discord had a temporary problem (HTTP {err.code})"
            else:
                hints = {404: "the webhook was deleted or the address is wrong",
                         401: "the webhook address is not valid", 403: "the request was blocked",
                         400: "Discord rejected the message format"}
                return False, f"Discord answered HTTP {err.code}: {hints.get(err.code, 'the request was refused')}"
        except (urllib.error.URLError, TimeoutError, OSError):
            result = "could not reach Discord (network problem)"
        if attempt < attempts:
            time.sleep(wait)
    return False, f"{result}; gave up after {attempts} attempts"


def main():
    parser = argparse.ArgumentParser(description="Send a pipeline alert to Discord.")
    parser.add_argument("--test", action="store_true", help="send a labelled test message")
    parser.add_argument("--print", action="store_true", dest="show", help="show the message, do not send it")
    args = parser.parse_args()

    env = dict(os.environ)
    message = build_message(None if args.test else load_record(env), env, test=args.test)
    if args.show:
        print(message)
        return 0
    url = env.get("DISCORD_WEBHOOK_URL", "").strip()
    if not url:
        print("DISCORD_WEBHOOK_URL is not set, so no alert was sent.")
        return 1 if args.test else 0
    sent, result = send(url, message)
    print(f"Discord alert: {result}")
    return 0 if sent else 1


if __name__ == "__main__":
    sys.exit(main())
