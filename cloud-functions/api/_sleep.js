// TEMPORARY: measure EdgeOne function time limit. Remove after test.
export async function onRequest(context) {
  const s = Math.min(Number(new URL(context.request.url).searchParams.get("s")) || 5, 110);
  await new Promise((r) => setTimeout(r, s * 1000));
  return new Response(JSON.stringify({ slept: s }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
