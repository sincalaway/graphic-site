import { handleSenseNova } from '../../../../lib/sensenova-proxy.mjs';
import { publicRequest } from '../../../_lib/public-request.mjs';

export async function onRequest(context) {
  return handleSenseNova(publicRequest(context.request), context.env || {}, '/api/sensenova/images/generations');
}
