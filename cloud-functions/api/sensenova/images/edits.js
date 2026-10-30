import { handleSenseNova } from '../../../../lib/sensenova-proxy.mjs';
import { edgeEnv, publicRequest, runProxy } from '../../../_lib/public-request.mjs';

export async function onRequest(context) {
  return runProxy(async () => handleSenseNova(await publicRequest(context.request), edgeEnv(context.env), '/api/sensenova/images/edits'));
}
