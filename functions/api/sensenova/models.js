import { handleSenseNovaModels } from '../../../lib/sensenova-proxy.mjs';

export async function onRequest(context) {
  return handleSenseNovaModels(context.request, context.env, '/api/sensenova/models');
}
