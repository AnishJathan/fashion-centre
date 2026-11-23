"""Publish verified build artifacts and return their public download URLs."""

import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

ORIGIN = "https://fashion-centre-downloads.fashion-centre-cloudflare.workers.dev"
FILES = {
    "fashion-centre-android": ("app-release.apk", "FashionCentre-Android.apk"),
    "fashion-centre-ios-simulator": ("FashionCentre-simulator.zip", "FashionCentre-iOS-Simulator.zip"),
    "fashion-centre-web": (None, "FashionCentre-Web.zip"),
}
MAX_BYTES = 256 * 1024 * 1024


class ArtifactRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected:
            redirected.remove_header("Authorization")
        return redirected


def digest(stream):
    checksum = hashlib.sha256()
    stream.seek(0)
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        checksum.update(chunk)
    stream.seek(0)
    return "sha256:" + checksum.hexdigest()


def publish(run, artifacts, api, pages):
    selected = [a for a in artifacts if a["name"] in FILES and not a["expired"]]
    if not selected:
        return {}
    tag = f"preview-downloads-{run['run_number'] // 100}"
    release_path = f"releases/tags/{tag}"
    try:
        release = api(release_path)
    except HTTPError as error:
        if error.code != 404:
            raise
        try:
            release = api("releases", {"tag_name": tag, "target_commitish": "main",
                          "name": f"Build downloads · group {run['run_number'] // 100}",
                          "body": "Preview files for the Fashion Centre build thread.",
                          "prerelease": True, "make_latest": "false"})
        except HTTPError as conflict:
            if conflict.code != 422:
                raise
            release = api(release_path)
    assets = {a["name"]: a for a in pages(f"releases/{release['id']}/assets")}
    headers = {"Authorization": "Bearer " + os.environ["GH_TOKEN"]}
    opener = build_opener(ArtifactRedirect())
    links = {}
    for artifact in selected:
        member, filename = FILES[artifact["name"]]
        asset_name = f"{run['id']}-{run['run_attempt']}-{filename}"
        req = Request(artifact["archive_download_url"], headers=headers)
        with tempfile.TemporaryFile() as archive, tempfile.TemporaryFile() as extracted:
            if artifact["size_in_bytes"] > MAX_BYTES:
                raise ValueError("Build archive exceeds size limit.")
            with opener.open(req, timeout=120) as response:
                shutil.copyfileobj(response, archive)
            if digest(archive) != artifact["digest"]:
                raise ValueError("Build archive checksum mismatch.")
            payload = archive
            if member:
                with zipfile.ZipFile(archive) as zipped:
                    info = zipped.getinfo(member)
                    if info.file_size > MAX_BYTES:
                        raise ValueError("Build file exceeds size limit.")
                    with zipped.open(info) as source:
                        shutil.copyfileobj(source, extracted)
                payload = extracted
            checksum = digest(payload)
            asset = assets.get(asset_name)
            if not asset:
                url = release["upload_url"].split("{", 1)[0] + "?name=" + asset_name
                upload = Request(url, data=payload, method="POST", headers={
                    **headers, "Content-Type": "application/octet-stream",
                    "Content-Length": str(os.fstat(payload.fileno()).st_size),
                })
                with urlopen(upload, timeout=180) as response:
                    asset = json.load(response)
            if asset.get("digest") != checksum:
                raise ValueError("Published file checksum mismatch.")
        links[artifact["name"]] = f"{ORIGIN}/builds/{run['run_number']}/{run['id']}/{run['run_attempt']}/{filename}"
    return links
