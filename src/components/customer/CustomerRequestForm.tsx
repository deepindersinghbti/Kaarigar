import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Star, MapPin } from 'lucide-react';
import { api, ApiError, type PublicKaarigar } from '../../lib/api';
import { uuidv7 } from '../../lib/ids';
import { useAuth } from '../../auth/AuthProvider';
import type { SupportedLanguage } from '../../types';
import { getCustomerCopy, getCustomerTrade } from './customerCopy';

interface CustomerRequestFormProps {
  onSent: () => void;
  currentLanguage: SupportedLanguage;
}

/**
 * Ask one kaarigar for work.
 *
 * The kaarigar is identified by the PASSPORT HANDLE in the URL. There is no
 * user id anywhere in this component, because the directory never publishes
 * one - the server resolves the handle to an owner and rejects a handle that
 * matches no passport.
 *
 * The submit is a plain awaited POST, NOT an outbox enqueue. A worker's own
 * completed job is already true and must survive a missing network; a request
 * to someone else is not true until the server has it, and queueing one would
 * tell a customer their request was sent when no kaarigar had been asked
 * anything.
 */
export const CustomerRequestForm: React.FC<CustomerRequestFormProps> = ({ onSent, currentLanguage }) => {
  const { handle = '' } = useParams();
  const { user } = useAuth();
  const [requestId] = useState(uuidv7);

  const [kaarigar, setKaarigar] = useState<PublicKaarigar | null>(null);
  const [loadError, setLoadError] = useState('');

  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState(user?.phone === '+910123456789' ? 'Neha Sharma' : '');
  const [location, setLocation] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const copy = getCustomerCopy(currentLanguage);

  /**
   * The directory is re-read and filtered rather than fetched per handle.
   * There is no GET /api/kaarigars/:handle, and adding one to render a header
   * would be a route built for a heading. Six rows cost nothing to re-read.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listKaarigars();
        if (cancelled) return;
        const found = list.find((k) => k.passportHandle === handle) ?? null;
        setKaarigar(found);
        if (!found) setLoadError(copy.form.notFound);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) return;
        setLoadError(copy.form.loadError);
      }
    })();
    return () => { cancelled = true; };
  }, [copy.form.loadError, copy.form.notFound, handle]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    setError('');
    setSending(true);
    try {
      await api.requestJob({
        // Generated on the client so a retry after a timeout returns the
        // existing job instead of filing a second request.
        id: requestId,
        kaarigarHandle: handle,
        title: title.trim(),
        customerName: customerName.trim(),
        location: location.trim(),
        amount: Number(amount || 0),
        notes: notes.trim() || undefined,
      });
      onSent();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(copy.form.sendError);
      setSending(false);
    }
  };

  const field = 'w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white font-semibold outline-none focus:border-orange-400';
  const label = 'block text-sm font-extrabold text-gray-700 mb-1.5';

  return (
    <div className="space-y-4">
      <Link
        to="/customer"
        className="inline-flex items-center gap-1.5 text-sm font-extrabold text-gray-600"
      >
        <ArrowLeft className="w-4 h-4" />
        {copy.form.back}
      </Link>

      {loadError && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 text-center">
          <p className="text-sm font-bold text-red-700">{loadError}</p>
        </div>
      )}

      {kaarigar && (
        <div className="bg-white rounded-3xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-extrabold text-lg shrink-0">
            {kaarigar.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-extrabold truncate">{kaarigar.name}</p>
            <p className="text-sm text-orange-600 font-bold">{getCustomerTrade(currentLanguage, kaarigar.trade)}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500 font-semibold mt-0.5">
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                {kaarigar.rating}
              </span>
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{kaarigar.location}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-3xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className={label} htmlFor="req-title">{copy.form.workLabel}</label>
          <input
            id="req-title"
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={copy.form.workPlaceholder}
            required
          />
        </div>

        <div>
          <label className={label} htmlFor="req-name">{copy.form.nameLabel}</label>
          <input
            id="req-name"
            className={field}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={copy.form.namePlaceholder}
          />
        </div>

        <div>
          <label className={label} htmlFor="req-location">{copy.form.locationLabel}</label>
          <input
            id="req-location"
            className={field}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={copy.form.locationPlaceholder}
          />
        </div>

        <div>
          <label className={label} htmlFor="req-amount">{copy.form.estimateLabel}</label>
          <input
            id="req-amount"
            className={field}
            type="number"
            min={0}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <label className={label} htmlFor="req-notes">{copy.form.notesLabel}</label>
          <textarea
            id="req-notes"
            className="w-full min-h-24 p-4 rounded-2xl border border-gray-200 bg-white font-semibold outline-none focus:border-orange-400"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={sending || !kaarigar}
          className="w-full h-14 rounded-2xl bg-orange-500 text-white font-extrabold active:scale-[0.98] transition disabled:opacity-50"
        >
          {sending ? copy.form.sending : copy.form.submit}
        </button>
      </form>
    </div>
  );
};
