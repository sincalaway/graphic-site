// EdgeOne Makers Cloud Functions entry; same routes as functions/ (Cloudflare Pages).
import { handleImageProxy } from '../../../../lib/image-proxy.mjs';
import { edgeEnv, publicRequest, runProxy } from '../../../_lib/public-request.mjs';

export async function onRequest(context) {
  return runProxy(async () => handleImageProxy(await publicRequest(context.request), edgeEnv(context.env), String(context.params.provider), String(context.params.op)));
}
