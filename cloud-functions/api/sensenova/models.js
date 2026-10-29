import { handleSenseNovaModels } from '../../../lib/sensenova-proxy.mjs';
import { publicRequest } from '../../_lib/public-request.mjs';

export async function onRequest(context) {
  return handleSenseNovaModels(publicRequest(context.request), context.env || {}, '/api/sensenova/models');
}
