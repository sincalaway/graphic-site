import { handleSenseNovaModels } from '../../../lib/sensenova-proxy.mjs';
import { publicRequest, runProxy } from '../../_lib/public-request.mjs';

export async function onRequest(context) {
  return runProxy(async () => handleSenseNovaModels(await publicRequest(context.request), context.env || {}, '/api/sensenova/models'));
}
