"""Mail contributors the available artifacts from a completed verification run."""

import json
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from urllib.request import Request, urlopen

SENDER = "sattva.tech.team@gmail.com"
ARTIFACTS = {
    "fashion-centre-ios-simulator": "iOS · Apple Silicon Simulator",
    "fashion-centre-web": "Web · production site files",
    "fashion-centre-android": "Android · ARM64 APK",
}


def artifact_links(repository, run_id, token):
    endpoint = f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/artifacts"
    links = {}
    page = 1
    while True:
        request = Request(f"{endpoint}?per_page=100&page={page}", headers={
            "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
        })
        with urlopen(request, timeout=20) as response:
            artifacts = json.load(response)["artifacts"]
        for artifact in artifacts:
            if artifact["name"] in ARTIFACTS and not artifact["expired"]:
                links[artifact["name"]] = (
                    f"https://github.com/{repository}/actions/runs/{run_id}"
                    f"/artifacts/{artifact['id']}"
                )
        if len(artifacts) < 100:
            return links
        page += 1


def build_message(run, links):
    number = run["run_number"]
    outcome = run["conclusion"]
    message = EmailMessage()
    message["From"] = SENDER
    message["To"] = "undisclosed-recipients:;"
    message["Subject"] = f"Fashion Centre build #{number} · {outcome}"
    lines = [
        f"Build #{number}, attempt {run['run_attempt']}, finished with status {outcome}.",
        f"Commit {run['head_sha'][:12]}", "",
    ]
    for name, label in ARTIFACTS.items():
        lines.extend([label, links.get(name, "No download available for this run."), ""])
    lines.extend(["Sign in to GitHub with repository access to download the archives.",
                  f"Build details and logs: {run['html_url']}"])
    message.set_content("\n".join(lines))
    return message


def main():
    addresses = list(dict.fromkeys(filter(None, re.split(r"[,;\s]+", os.environ["BUILD_MAIL_RECIPIENTS"]))))
    password = os.environ["BUILD_MAIL_PASSWORD"]
    if not addresses or not password:
        raise SystemExit("Configure BUILD_MAIL_RECIPIENTS and BUILD_MAIL_PASSWORD in repository secrets.")
    if any(not re.fullmatch(r"[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+", address) for address in addresses):
        raise SystemExit("BUILD_MAIL_RECIPIENTS must contain plain email addresses.")
    run = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())["workflow_run"]
    links = artifact_links(os.environ["GITHUB_REPOSITORY"], run["id"], os.environ["GH_TOKEN"])
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30, context=ssl.create_default_context()) as mail:
        mail.login(SENDER, password)
        refused = mail.send_message(build_message(run, links), from_addr=SENDER, to_addrs=addresses)
        if refused:
            raise SystemExit(f"Mail server rejected {len(refused)} recipient(s).")


if __name__ == "__main__":
    main()
