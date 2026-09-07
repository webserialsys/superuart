"""Send one CI summary containing the name and result of every dependency job."""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


JOB_NAMES = {
    "backend-test": "Backend test",
    "sonar-backend": "SonarQube backend",
    "backend-build": "Backend build",
    "frontend-test": "Frontend test",
    "sonar-frontend": "SonarQube frontend",
    "frontend-build": "Frontend build",
    "docker-build-backend": "Docker build backend",
    "docker-build-frontend": "Docker build frontend",
}


def format_message(jobs: dict, branch: str, commit: str, run_url: str) -> str:
    results = {job["result"] for job in jobs.values()}
    if "failure" in results:
        status = "failure"
    elif "cancelled" in results:
        status = "cancelled"
    elif "success" in results:
        status = "success"
    else:
        status = "skipped"
    lines = [f"SuperUART CI: {status}", f"Branch: {branch}", f"Commit: {commit[:7]}", ""]
    for job_id, job in jobs.items():
        lines.append(f"{JOB_NAMES.get(job_id, job_id)}: {job['result']}")
    return "\n".join([*lines, "", run_url])


def send_message(token: str, chat_id: str, message: str) -> None:
    payload = json.dumps({"chat_id": chat_id, "text": message}).encode("utf-8")
    request = Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
    except HTTPError as error:
        # Do not include the request URL: it contains the bot token.
        raise RuntimeError(f"Telegram returned HTTP {error.code}") from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("Could not reach Telegram") from None
    except (ValueError, UnicodeError):
        raise RuntimeError("Telegram returned an invalid response") from None
    if not isinstance(result, dict) or result.get("ok") is not True:
        raise RuntimeError("Telegram rejected the notification")


def main() -> int:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("::warning::Telegram secrets are not configured; notification skipped.")
        return 0
    try:
        message = format_message(
            json.loads(os.environ["NEEDS_JSON"]),
            os.environ["BRANCH"],
            os.environ["COMMIT_SHA"],
            os.environ["RUN_URL"],
        )
        send_message(token, chat_id, message)
    except RuntimeError as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1
    print("Telegram notification sent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
