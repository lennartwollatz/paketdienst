import api from './client';

export interface SubscribePayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export const pushApi = {
  publicKey: () => api.get<{ publicKey: string }>('/push/public-key'),
  subscribe: (payload: SubscribePayload) =>
    api.post<{ id: string }>('/push/subscribe', payload),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }),
  test: () => api.post<{ delivered: number }>('/push/test'),
};
