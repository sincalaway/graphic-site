import { handleSenseNova, handleSenseNovaModels } from './lib/sensenova-proxy.mjs';
import { handleImageProxy } from './lib/image-proxy.mjs';

const imagePaths = new Set(['/api/sensenova/images/generations', '/api/sensenova/images/edits']);
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const multi = /^\/api\/image\/([a-z0-9-]{1,32})\/([a-z]{1,16})$/.exec(path);
    if (multi) return handleImageProxy(request, env, multi[1], multi[2]);
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
