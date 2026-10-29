// EdgeOne Makers Cloud Functions entry; same routes as functions/ (Cloudflare Pages).
import { handleImageProxy } from '../../../../lib/image-proxy.mjs';
import { publicRequest } from '../../../_lib/public-request.mjs';

export async function onRequest(context) {
  return handleImageProxy(publicRequest(context.request), context.env || {}, String(context.params.provider), String(context.params.op));
}
