import api from './client';

export const stripeApi = {
  getStatus: () =>
    api.get<{
      hasPaymentMethod: boolean;
      isTestUser: boolean;
      stripeConfigured: boolean;
      processedOrdersCount: number;
      freeProcessedOrdersLimit: number;
      paymentRequired: boolean;
      oneTimeAmountCents: number;
    }>(
      '/stripe/status'
    ),

  createPaymentIntent: () =>
    api.post<{ clientSecret: string; amountCents: number; freeProcessedOrdersLimit: number }>('/stripe/create-payment-intent'),

  confirmOneTimePayment: (paymentIntentId: string) =>
    api.post('/stripe/confirm-one-time-payment', { paymentIntentId }),
};
