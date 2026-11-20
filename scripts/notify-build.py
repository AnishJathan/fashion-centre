"""Publish trusted Actions artifact links in the repository's build thread."""

import json
import os
from urllib.request import Request, urlopen

ISSUE = 6
PLATFORMS = {
    "fashion-centre-ios-simulator": "iOS Simulator",
    "fashion-centre-web": "Web app",
    "fashion-centre-android": "Android APK",
}


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    run_id = int(os.environ["RUN_ID"])
    base = f"https://github.com/{repo}/actions/runs/{run_id}"

    def api(path, body=None):
        request = Request(
            f"https://api.github.com/repos/{repo}/{path}",
            headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                     "Content-Type": "application/json"},
            data=json.dumps(body).encode() if body is not None else None,
        )
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    def pages(path, key=None):
        page = 1
        while True:
            data = api(f"{path}?per_page=100&page={page}")
            items = data[key] if key else data
            yield from items
            if len(items) < 100:
                return
            page += 1

    run = api(f"actions/runs/{run_id}")
    if run["status"] != "completed" or run["workflow_id"] != api("actions/workflows/verify.yml")["id"]:
        raise SystemExit("Select a completed Verify Fashion Centre run.")
    marker = f"<!-- verification:{run_id}:{run['run_attempt']} -->"
    comments = f"issues/{ISSUE}/comments"
    if any(c["user"]["login"] == "github-actions[bot]" and marker in c["body"] for c in pages(comments)):
        print("This build attempt was already announced.")
        return

    artifacts = {a["name"]: a["id"] for a in pages(f"actions/runs/{run_id}/artifacts", "artifacts")
                 if not a["expired"]}
    lines = [f"**[Build #{run['run_number']}, attempt {run['run_attempt']}]({base}) · {run['conclusion']}**", ""]
    for name, label in PLATFORMS.items():
        lines.append(f"- [{label}]({base}/artifacts/{artifacts[name]})" if name in artifacts
                     else f"- {label} — download unavailable")
    people = {p["login"] for p in pages("contributors") if p["type"] == "User"}
    for pr in run.get("pull_requests", []):
        author = api(f"pulls/{int(pr['number'])}")["user"]
        if author["type"] == "User":
            people.add(author["login"])
    lines.extend(["", " ".join("@" + login for login in sorted(people, key=str.lower)), "", marker])
    print(api(comments, {"body": "\n".join(lines)})["html_url"])


if __name__ == "__main__":
    main()
