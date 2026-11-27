import { getStore } from '@netlify/blobs';
import { makeHandler } from '../lib/core.mjs';

export default async (req) => {
  const store = getStore({ name: 'nckh', consistency: 'strong' });
  const handle = makeHandler(store, { INITIAL_PASSWORD: process.env.INITIAL_PASSWORD });
  return handle(req);
};

export const config = { path: '/api/*' };
