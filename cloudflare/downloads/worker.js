// Public preview downloads only. No application bindings or credentials.
const androidRepair = "/repairs/android-startup/FashionCentre-Android.apk";
// These published builds predate the Room constructor keep rule.
const recalledRuns = new Set(["44779514420", "44829228214", "44830739550"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/builds\/(\d{1,10})\/(\d{1,18})\/(\d{1,5})\/(FashionCentre-(?:Android\.apk|iOS-Simulator\.zip|Web\.zip))$/);
    const repair = url.pathname === androidRepair;
    if (!match && !repair) return new Response("Build file not found.", {status: 404});
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: "GET, HEAD"}});
    const [, number, run, attempt, file] = match || ["", "0", "", "", "FashionCentre-Android.apk"];
    if (file.endsWith(".apk") && recalledRuns.has(run)) {
      return Response.redirect(new URL(androidRepair, url), 307);
    }
    const tag = "preview-downloads-" + Math.floor(Number(number) / 100);
    const asset = repair ? "android-startup-fix-FashionCentre-Android.apk" : run + "-" + attempt + "-" + file;
    const headers = new Headers({"User-Agent": "Fashion-Centre-Downloads"});
    for (const name of ["Range", "If-Range"]) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }
    const upstream = await fetch("https://github.com/AnishJathan/fashion-centre/releases/download/" + tag + "/" + asset,
      {method: request.method, headers, redirect: "follow"});
    if (!upstream.ok) return new Response(null, {status: upstream.status, headers: {"Cache-Control": "no-store"}});
    const responseHeaders = new Headers({
      "Content-Disposition": 'attachment; filename="' + file + '"',
      "Content-Type": file.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/zip",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400",
    });
    for (const name of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"]) {
      if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
    }
    return new Response(upstream.body, {status: upstream.status, headers: responseHeaders});
  }
};
