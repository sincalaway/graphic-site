// Never fall through to the site's HTML for an unsupported API operation.
export function onRequest() {
  return new Response(JSON.stringify({ error: { code: "unsupported_operation" } }), {
    status: 404,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
