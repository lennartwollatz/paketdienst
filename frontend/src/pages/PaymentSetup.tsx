import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Shield, ArrowRight, CheckCircle } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import toast from 'react-hot-toast';
import { stripeApi } from '../api/stripe';
import { useAuthStore } from '../store/authStore';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = STRIPE_PK && STRIPE_PK !== 'pk_test_PLACEHOLDER'
  ? loadStripe(STRIPE_PK)
  : null;

function CardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      const { data } = await stripeApi.createPaymentIntent();
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: cardElement },
      });

      if (result.error) {
        toast.error(result.error.message || 'Kartenfehler');
      } else {
        if (!result.paymentIntent?.id) {
          throw new Error('PaymentIntent fehlt');
        }
        await stripeApi.confirmOneTimePayment(result.paymentIntent.id);
        onSuccess();
      }
    } catch {
      toast.error('Fehler beim Hinterlegen der Karte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border-2 border-gray-200 rounded-xl bg-gray-50 focus-within:border-blue-500 transition-colors">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#111827',
                fontFamily: 'Inter, system-ui, sans-serif',
                '::placeholder': { color: '#9ca3af' },
              },
              invalid: { color: '#ef4444' },
            },
          }}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={loading || !stripe}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Wird verarbeitet...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Shield className="w-4 h-4" />
            Karte sicher hinterlegen
          </span>
        )}
      </button>
    </form>
  );
}

function MockCardForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await stripeApi.confirmOneTimePayment('mock_pi_' + Date.now());
      onSuccess();
    } catch {
      toast.error('Fehler');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border-2 border-amber-200 rounded-xl bg-amber-50">
        <p className="text-amber-700 text-sm font-medium">
          Demo-Modus: Stripe ist nicht konfiguriert. Klicke auf "Weiter" um fortzufahren.
        </p>
      </div>
      <div className="space-y-3">
        <input className="input-field" placeholder="4242 4242 4242 4242 (Demo)" disabled />
        <div className="grid grid-cols-2 gap-3">
          <input className="input-field" placeholder="MM/JJ" disabled />
          <input className="input-field" placeholder="CVC" disabled />
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Wird gespeichert...' : 'Weiter (Demo)'}
      </button>
    </form>
  );
}

export default function PaymentSetup() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const [done, setDone] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [processedOrders, setProcessedOrders] = useState(0);
  const [freeLimit, setFreeLimit] = useState(20);
  const [amountCents, setAmountCents] = useState(1000);

  useEffect(() => {
    if (user?.isTestUser) {
      navigate('/');
      return;
    }
    if (user?.hasPaymentMethod) {
      navigate('/');
      return;
    }
    stripeApi.getStatus().then(({ data }) => {
      setStripeConfigured(data.stripeConfigured);
      setProcessedOrders(data.processedOrdersCount);
      setFreeLimit(data.freeProcessedOrdersLimit);
      setAmountCents(data.oneTimeAmountCents);
      if (!data.paymentRequired && !user?.hasPaymentMethod) {
        navigate('/');
      }
    }).catch(() => {});
  }, [user, navigate]);

  const handleSuccess = () => {
    updateUser({ hasPaymentMethod: true });
    setDone(true);
    toast.success('Zahlung erfolgreich abgeschlossen!');
    setTimeout(() => navigate('/'), 2000);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Alles bereit!</h2>
          <p className="text-gray-500">Du wirst weitergeleitet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-lg mb-4">
            <CreditCard className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-white">Kreditkarte hinterlegen</h1>
          <p className="text-blue-200 mt-1 text-sm">
            Einmalige Zahlung von {(amountCents / 100).toFixed(2).replace('.', ',')} EUR nach {freeLimit} verarbeiteten Bestellungen
          </p>
        </div>

        {/* Features */}
        <div className="bg-blue-700 bg-opacity-50 rounded-2xl p-4 mb-6 space-y-2">
          {[
            `${processedOrders}/${freeLimit} verarbeitete Bestellungen erreicht`,
            'Freigabe für weitere Tracking-Vorgänge',
            'Einmalzahlung statt Abo',
          ].map(f => (
            <div key={f} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-blue-100 text-sm">{f}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Zahlungsdetails</h2>
          <p className="text-gray-500 text-sm mb-6 flex items-center gap-1">
            <Shield className="w-4 h-4 text-green-500" />
            Sicher verschlüsselt durch Stripe - einmalige Freischaltung
          </p>

          {stripeConfigured && stripePromise ? (
            <Elements stripe={stripePromise}>
              <CardForm onSuccess={handleSuccess} />
            </Elements>
          ) : (
            <MockCardForm onSuccess={handleSuccess} />
          )}
        </div>

        {user?.isTestUser ? (
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-blue-200 text-sm text-center flex items-center justify-center gap-1 hover:text-white"
          >
            Überspringen (nur für Testnutzer)
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
