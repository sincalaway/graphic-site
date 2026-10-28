import { handleImageProxy } from '../../../../lib/image-proxy.mjs';

export async function onRequest(context) {
  return handleImageProxy(context.request, context.env, String(context.params.provider), String(context.params.op));
}
