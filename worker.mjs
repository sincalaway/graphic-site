import { handleSenseNova, handleSenseNovaModels } from './lib/sensenova-proxy.mjs';

const imagePaths = new Set(['/api/sensenova/images/generations', '/api/sensenova/images/edits']);
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/sensenova/models') return handleSenseNovaModels(request, env);
    if (imagePaths.has(path)) return handleSenseNova(request, env, path);
    if (path === '/api' || path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: { code: 'unsupported_operation' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
