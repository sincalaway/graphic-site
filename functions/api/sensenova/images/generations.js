import { handleSenseNova } from '../../../../lib/sensenova-proxy.mjs';
export async function onRequest(context) {
  return handleSenseNova(context.request, context.env, '/api/sensenova/images/generations');
}
