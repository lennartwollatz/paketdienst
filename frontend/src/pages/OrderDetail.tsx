import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Package, Truck, MapPin,
  Calendar, Euro, Hash, Trash2, ExternalLink,
  FileText, Download, Eye, Mail, ChevronDown, ChevronUp,
  MapPinned, Info, Pencil, Check, X, GitMerge
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import { ordersApi, Order, OrderEmail, OrderPatch } from '../api/orders';
import { attachmentsApi, Attachment } from '../api/attachments';
import StatusBadge from '../components/StatusBadge';
import MergeOrderModal from '../components/MergeOrderModal';

function TrackingTimeline({ events }: { events: Order['trackingEvents'] }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8">
        <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">Keine Tracking-Ereignisse verfügbar</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, index) => (
        <div key={event.id} className="flex gap-3">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${
                index === 0 ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
            {index < events.length - 1 && (
              <div className="w-0.5 bg-gray-200 flex-1 my-1 min-h-[20px]" />
            )}
          </div>

          {/* Event content */}
          <div className={`pb-4 flex-1 ${index === events.length - 1 ? '' : ''}`}>
            <p className={`text-sm font-semibold ${index === 0 ? 'text-blue-700' : 'text-gray-700'}`}>
              {event.status}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{event.description}</p>
            <div className="flex items-center gap-3 mt-1">
              {event.location && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {event.location}
                </span>
              )}
              <span className="text-xs text-gray-400">
                {format(new Date(event.timestamp), 'dd.MM.yyyy HH:mm', { locale: de })}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

/**
 * Bereinigt HTML-E-Mail-Inhalt und bettet ihn sicher in ein iframe ein.
 *
 * Sicherheitsmaßnahmen:
 * 1. DOMPurify entfernt alle Scripts, Event-Handler und gefährliche Attribute
 * 2. sandbox ohne "allow-same-origin": das iframe kann NICHT auf Cookies,
 *    localStorage oder den Parent-Kontext zugreifen
 * 3. sandbox ohne "allow-scripts": JavaScript im iframe wird blockiert
 * 4. Die E-Mail-HTML wird in ein eigenständiges Dokument mit restriktivem
 *    Content-Security-Policy-Meta-Tag eingebettet
 */
function buildSafeEmailDocument(rawHtml: string): string {
  const clean = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ['script', 'style', 'link', 'meta', 'base', 'form', 'input', 'button', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeypress', 'onkeyup', 'action', 'formaction', 'srcdoc', 'href', 'src'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:;">
  <style>
    body { font-family: sans-serif; font-size: 13px; margin: 12px; word-break: break-word; overflow-x: hidden; }
    * { max-width: 100%; box-sizing: border-box; }
    a { color: #2563eb; }
  </style>
</head>
<body>${clean}</body>
</html>`;
}

function EmailBodyContent({ html, text }: { html: string | null; text: string | null }) {
  if (html) {
    return (
      <iframe
        srcDoc={buildSafeEmailDocument(html)}
        className="w-full rounded-xl border border-gray-100 bg-white mt-3"
        style={{ height: '400px' }}
        /**
         * Kein "allow-same-origin": verhindert Zugriff auf Cookies/localStorage/Parent-DOM.
         * Kein "allow-scripts": JavaScript im iframe wird vollständig blockiert.
         * "allow-popups allow-popups-to-escape-sandbox": Links können in neuem Tab geöffnet werden.
         */
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        title="E-Mail HTML"
      />
    );
  }
  if (text) {
    return (
      <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 border border-gray-100 overflow-auto max-h-96 mt-3">
        {text}
      </pre>
    );
  }
  return null;
}

function EmailsSection({
  orderEmails,
  fallbackSubject,
  fallbackBody,
  fallbackBodyHtml,
  expandedId,
  onToggle,
  onSplit,
}: {
  orderEmails: OrderEmail[];
  fallbackSubject: string | null | undefined;
  fallbackBody: string | null | undefined;
  fallbackBodyHtml: string | null | undefined;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onSplit?: (emailIds: string[]) => Promise<void>;
}) {
  const [splitMode, setSplitMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState(false);

  const showFallback = orderEmails.length === 0 && (fallbackBody || fallbackBodyHtml);
  if (orderEmails.length === 0 && !showFallback) return null;

  const emails = orderEmails.length > 0 ? orderEmails : [{
    id: 'legacy',
    subject: fallbackSubject ?? null,
    fromAddress: null,
    receivedAt: null,
    bodyText: fallbackBody ?? null,
    bodyHtml: fallbackBodyHtml ?? null,
    gptShop: null, gptPrice: null, gptCarrier: null, gptTrackingNumber: null,
    gptDeliveryStatus: null, gptOrderNumber: null, gptEstimatedDelivery: null,
    gptDeliveryAddress: null, gptCurrency: null, gptOrderDate: null,
  } as OrderEmail];

  const canSplit = onSplit && orderEmails.length > 1;

  const toggleSelect = (id: string) => {
    if (id === 'legacy') return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSplit = async () => {
    if (!onSplit || selected.size === 0) return;
    if (selected.size >= orderEmails.length) {
      toast.error('Mindestens eine E-Mail muss in der Bestellung verbleiben');
      return;
    }
    setSplitting(true);
    try {
      await onSplit([...selected]);
      setSplitMode(false);
      setSelected(new Set());
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Mail className="w-4 h-4 text-indigo-500" />
          </div>
          <h2 className="font-semibold text-gray-800">E-Mails ({emails.length})</h2>
        </div>
        {canSplit && (
          splitMode ? (
            <button
              onClick={() => { setSplitMode(false); setSelected(new Set()); }}
              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Abbrechen
            </button>
          ) : (
            <button
              onClick={() => setSplitMode(true)}
              className="text-xs text-orange-600 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Trennen
            </button>
          )
        )}
      </div>

      {splitMode && (
        <p className="text-xs text-gray-500 mb-3 bg-orange-50 rounded-lg px-3 py-2">
          Wähle die E-Mails aus, die als separate Bestellungen abgetrennt werden sollen.
        </p>
      )}

      <div className="space-y-2">
        {emails.map((em, idx) => (
          <div
            key={em.id}
            className={`border rounded-xl overflow-hidden transition-colors ${
              splitMode && selected.has(em.id)
                ? 'border-orange-400 bg-orange-50'
                : 'border-gray-100'
            }`}
          >
            <button
              onClick={() => splitMode ? toggleSelect(em.id) : onToggle(em.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {splitMode && em.id !== 'legacy' ? (
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selected.has(em.id) ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                  }`}>
                    {selected.has(em.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                ) : (
                  <div className="w-7 h-7 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    {idx + 1}
                  </div>
                )}
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {em.subject ?? 'Kein Betreff'}
                  </p>
                  {em.receivedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(em.receivedAt), 'dd.MM.yyyy · HH:mm', { locale: de })} Uhr
                      {em.fromAddress && ` · ${em.fromAddress}`}
                    </p>
                  )}
                  {splitMode && em.gptShop && (
                    <p className="text-xs text-orange-600 mt-0.5">
                      GPT: {em.gptShop}{em.gptOrderNumber ? ` · Nr. ${em.gptOrderNumber}` : ''}
                    </p>
                  )}
                </div>
              </div>
              {!splitMode && (expandedId === em.id
                ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />)}
            </button>

            {!splitMode && expandedId === em.id && (
              <div className="px-4 pb-4">
                <EmailBodyContent html={em.bodyHtml} text={em.bodyText} />
              </div>
            )}
          </div>
        ))}
      </div>

      {splitMode && (
        <button
          onClick={handleSplit}
          disabled={selected.size === 0 || splitting}
          className="mt-3 w-full py-3 rounded-xl font-semibold text-sm bg-orange-500 text-white hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {splitting
            ? <><Info className="w-4 h-4 animate-spin" /> Wird getrennt…</>
            : <><X className="w-4 h-4" /> {selected.size} E-Mail{selected.size !== 1 ? 's' : ''} als separate Bestellung{selected.size !== 1 ? 'en' : ''} trennen</>
          }
        </button>
      )}
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [loadingPdf, setLoadingPdf] = useState<string | null>(null);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTracking, setEditTracking] = useState('');
  const [editCarrier, setEditCarrier] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);

  const handleSplit = useCallback(async (emailIds: string[]) => {
    if (!order) return;
    try {
      const { data } = await ordersApi.split(order.id, emailIds);
      setOrder(data.updatedOrder);
      toast.success(
        `${data.newOrders.length} neue Bestellung${data.newOrders.length > 1 ? 'en' : ''} erstellt`,
      );
    } catch {
      toast.error('Trennen fehlgeschlagen');
    }
  }, [order]);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await ordersApi.getById(id);
      setOrder(data);
    } catch {
      toast.error('Bestellung nicht gefunden');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const loadAttachments = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await attachmentsApi.getForOrder(id);
      setAttachments(data);
    } catch {
      // keine Anhänge = kein Fehler
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
    loadAttachments();
  }, [loadOrder, loadAttachments]);

  // Auto-refresh tracking on mount – nur wenn Carrier bekannt ist
  useEffect(() => {
    if (order?.trackingNumber && order.carrier && order.trackingEvents.length === 0) {
      handleRefreshTracking();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const handleRefreshTracking = async () => {
    if (!id || !order?.trackingNumber) return;
    setRefreshing(true);
    try {
      const { data } = await ordersApi.refreshTracking(id);
      setOrder(data);
      toast.success('Tracking aktualisiert');
    } catch {
      toast.error('Tracking konnte nicht aktualisiert werden');
    } finally {
      setRefreshing(false);
    }
  };

  const handleTogglePreview = async (attId: string) => {
    if (pdfPreviewId === attId) {
      setPdfPreviewId(null);
      return;
    }
    // Blob-URL einmalig laden
    if (!blobUrls[attId]) {
      setLoadingPdf(attId);
      try {
        const url = await attachmentsApi.getBlobUrl(attId);
        setBlobUrls(prev => ({ ...prev, [attId]: url }));
      } catch {
        toast.error('PDF konnte nicht geladen werden');
        setLoadingPdf(null);
        return;
      }
      setLoadingPdf(null);
    }
    setPdfPreviewId(attId);
  };

  const openEdit = () => {
    if (!order) return;
    setEditTracking(order.trackingNumber ?? '');
    setEditCarrier(order.carrier ?? '');
    setEditStatus(order.status);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!id || !order) return;
    setSaving(true);
    try {
      const patch: OrderPatch = {
        trackingNumber: editTracking,
        carrier: editCarrier,
        status: editStatus,
      };
      const { data } = await ordersApi.update(id, patch);
      setOrder(data);
      setEditing(false);
      // Wenn Trackingnummer neu/geändert wurde UND Carrier bekannt → sofort Tracking abrufen
      const trackingChanged = editTracking && editTracking !== order.trackingNumber;
      const carrierKnown = !!(editCarrier || data.carrier);
      if (trackingChanged && carrierKnown) {
        setRefreshing(true);
        try {
          const { data: tracked } = await ordersApi.refreshTracking(id);
          setOrder(tracked);
          toast.success('Sendungsverfolgung aktualisiert');
        } catch {
          toast('Sendungsnummer gespeichert – Tracking konnte nicht geladen werden', { icon: 'ℹ️' });
        } finally {
          setRefreshing(false);
        }
      } else {
        toast.success('Gespeichert');
      }
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Bestellung wirklich löschen?')) return;
    setDeleting(true);
    try {
      await ordersApi.delete(id);
      toast.success('Bestellung gelöscht');
      navigate('/');
    } catch {
      toast.error('Fehler beim Löschen');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400">Lädt...</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="px-4 pt-10 pb-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-lg"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              {order.trackingNumber && order.carrier && (
                <button
                  onClick={handleRefreshTracking}
                  disabled={refreshing}
                  title={`Tracking via ${order.carrier} aktualisieren`}
                  className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={openEdit}
                className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                title="Bearbeiten"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowMergeModal(true)}
                className="p-2 bg-indigo-50 text-indigo-500 rounded-xl hover:bg-indigo-100 transition-colors"
                title="Mit anderer Bestellung zusammenführen"
              >
                <GitMerge className="w-5 h-5" />
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Order Header Card */}
        <div className="card">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{order.shop}</h1>
              {order.subject && (
                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{order.subject}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={order.status} size="md" />
                {order.carrier && (
                  <span className="text-sm text-gray-400 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" />
                    {order.carrier}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inline-Edit-Formular – direkt unterhalb des Header-Cards */}
        {editing && (
          <div className="card border-blue-200 bg-blue-50/40">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Sendung bearbeiten</h2>
              <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Trackingnummer */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Sendungsnummer</label>
                <input
                  type="text"
                  value={editTracking}
                  onChange={e => setEditTracking(e.target.value)}
                  placeholder="z.B. 1Z999AA10123456784"
                  className="input-field"
                />
              </div>

              {/* Spediteur */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Paketdienst</label>
                <select
                  value={editCarrier}
                  onChange={e => setEditCarrier(e.target.value)}
                  className="input-field"
                >
                  <option value="">Automatisch erkennen</option>
                  <option value="DHL">DHL</option>
                  <option value="UPS">UPS</option>
                  <option value="DPD">DPD</option>
                  <option value="Hermes">Hermes</option>
                  <option value="GLS">GLS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="Deutsche Post">Deutsche Post</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Lieferstatus</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  className="input-field"
                >
                  <option value="processing">In Bearbeitung</option>
                  <option value="in transit">Im Versand</option>
                  <option value="in packstation">In Packstation</option>
                  <option value="delivered">Zugestellt</option>
                </select>
              </div>

              {/* Aktionen */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Estimated Delivery Banner */}
        {order.estimatedDelivery && (
          <div className="bg-blue-600 rounded-2xl p-4 text-white">
            <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Voraussichtliche Lieferung</p>
            <p className="text-xl font-bold mt-0.5">
              {format(new Date(order.estimatedDelivery), 'EEEE, d. MMMM', { locale: de })}
            </p>
          </div>
        )}

        {/* Order Details */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-2">Bestelldetails</h2>
          <InfoRow
            icon={Hash}
            label="Bestellnummer"
            value={order.orderNumber}
          />
          <InfoRow
            icon={Truck}
            label="Sendungsnummer"
            value={order.trackingNumber}
          />
          <InfoRow
            icon={Calendar}
            label="Bestelldatum"
            value={order.orderDate
              ? format(new Date(order.orderDate), 'd. MMMM yyyy', { locale: de })
              : undefined}
          />
          <InfoRow
            icon={Euro}
            label="Gesamtbetrag"
            value={order.price != null
              ? `${order.price.toFixed(2)} ${order.currency || 'EUR'}`
              : undefined}
          />
          <InfoRow
            icon={Info}
            label="Lieferstatus (E-Mail)"
            value={order.emailStatus}
          />
          <InfoRow
            icon={MapPinned}
            label="Lieferadresse"
            value={order.deliveryAddress}
          />
          {order.emailAccount && (
            <InfoRow
              icon={ExternalLink}
              label="E-Mail-Konto"
              value={order.emailAccount.email}
            />
          )}
        </div>

        {/* Tracking Timeline – nur anzeigen wenn Trackingnummer vorhanden */}
        {order.trackingNumber && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Sendungsverfolgung</h2>
              {refreshing && (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Wird aktualisiert...
                </span>
              )}
            </div>
            <TrackingTimeline events={order.trackingEvents} />
          </div>
        )}

        {/* PDF-Anhänge */}
        {attachments.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">
              Anhänge ({attachments.length})
            </h2>
            <div className="space-y-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                >
                  <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{att.filename}</p>
                    <p className="text-xs text-gray-400">
                      {(att.sizeBytes / 1024).toFixed(0)} KB · PDF
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleTogglePreview(att.id)}
                      disabled={loadingPdf === att.id}
                      className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                      title="Vorschau"
                    >
                      {loadingPdf === att.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => attachmentsApi.download(att.id, att.filename)}
                      className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Herunterladen"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PDF-Inline-Preview */}
        {pdfPreviewId && blobUrls[pdfPreviewId] && (
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">
                {attachments.find(a => a.id === pdfPreviewId)?.filename}
              </h2>
              <button
                onClick={() => setPdfPreviewId(null)}
                className="text-gray-400 hover:text-gray-600 text-xs font-medium"
              >
                Schließen
              </button>
            </div>
            <iframe
              src={blobUrls[pdfPreviewId]}
              className="w-full"
              style={{ height: '70vh' }}
              title="PDF Vorschau"
            />
          </div>
        )}

        {/* E-Mails zur Bestellung */}
        <EmailsSection
          orderEmails={order.orderEmails ?? []}
          fallbackSubject={order.subject}
          fallbackBody={order.emailBody}
          fallbackBodyHtml={order.emailBodyHtml}
          expandedId={expandedEmailId}
          onToggle={id => setExpandedEmailId(prev => prev === id ? null : id)}
          onSplit={handleSplit}
        />
      </div>

      {/* Merge-Modal */}
      {showMergeModal && order && (
        <MergeOrderModal
          currentOrder={order}
          onClose={() => setShowMergeModal(false)}
          onMerged={(merged) => {
            setOrder(merged);
            setShowMergeModal(false);
          }}
        />
      )}
    </div>
  );
}
