import api from './client';

export interface OrderEmail {
  id: string;
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  // GPT-extrahierte Daten (persistent)
  gptShop: string | null;
  gptPrice: number | null;
  gptCarrier: string | null;
  gptTrackingNumber: string | null;
  gptDeliveryStatus: string | null;
  gptOrderNumber: string | null;
  gptEstimatedDelivery: string | null;
  gptDeliveryAddress: string | null;
  gptCurrency: string | null;
  gptOrderDate: string | null;
}

export interface TrackingEvent {
  id: string;
  timestamp: string;
  location: string | null;
  status: string;
  description: string;
}

export interface Order {
  id: string;
  shop: string;
  orderNumber: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  price: number | null;
  currency: string | null;
  status: string;
  category: string | null;
  categoryManual?: boolean;
  orderDate: string | null;
  estimatedDelivery: string | null;
  subject: string | null;
  emailBody: string | null;
  emailBodyHtml: string | null;
  deliveryAddress: string | null;
  emailStatus: string | null;
  createdAt: string;
  trackingEvents: TrackingEvent[];
  orderEmails?: OrderEmail[];
  emailAccount?: { email: string; provider: string } | null;
}

export interface OrderPatch {
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  category?: string | null;
  price?: number | null;
  currency?: string | null;
}

export const ordersApi = {
  getAll: () => api.get<Order[]>('/orders'),

  getById: (id: string) => api.get<Order>(`/orders/${id}`),

  update: (id: string, patch: OrderPatch) =>
    api.patch<Order & { categoriesPropagated?: number }>(`/orders/${id}`, patch),

  refreshTracking: (id: string) =>
    api.post<Order>(`/orders/${id}/refresh-tracking`, undefined, {
      timeout: 120_000,
    }),

  merge: (primaryId: string, secondaryIds: string[]) =>
    api.post<Order>('/orders/merge', { primaryId, secondaryIds }),

  split: (orderId: string, emailIds: string[]) =>
    api.post<{ updatedOrder: Order; newOrders: Order[] }>(`/orders/${orderId}/split`, { emailIds }),

  delete: (id: string) => api.delete(`/orders/${id}`),
};
