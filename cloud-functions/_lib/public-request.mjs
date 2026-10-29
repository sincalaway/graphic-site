// EdgeOne Makers Cloud Functions (Node.js) adapter helper.
// The proxy's same-origin check compares the browser Origin with new URL(request.url).origin.
// Behind EdgeOne the function may see an internal URL, so rebuild the request URL from the
// public Host / X-Forwarded-* headers before handing it to the shared proxy code in lib/.
const HOST_RE = /^[A-Za-z0-9.-]{1,253}(?::\d{1,5})?$/;

export function publicRequest(request) {
  const url = new URL(request.url);
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (proto === "https" || proto === "http") url.protocol = proto + ":";
  if (host && HOST_RE.test(host)) {
    const [name, port = ""] = host.split(":");
    url.hostname = name;
    url.port = port; // empty = default port for the protocol
  }
  if (url.href === request.url) return request;
  const init = { method: request.method, headers: request.headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") { init.body = request.body; init.duplex = "half"; }
  return new Request(url.href, init);
}
