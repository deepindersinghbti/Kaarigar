import React, { useState } from 'react';
import {
  Mic,
  TrendingUp,
  Calendar,
  CreditCard,
  Banknote,
  Sparkles,
  Download,
  Keyboard,
} from 'lucide-react';
import { KamaiEntry, SupportedLanguage, SyncState } from '../types';
import { SyncBadge } from './SyncBadge';
import { TRANSLATIONS } from '../data/translations';
import { getScreenCopy, localizeDisplayValue } from '../data/uiCopy';
import { daysAgoIso, todayIso } from '../utils/date';

export interface ManualKamaiInput {
  amount: number;
  description: string;
  paymentType: 'cash' | 'upi';
}

interface KamaiViewProps {
  kamaiList: KamaiEntry[];
  currentLanguage: SupportedLanguage;
  onAddKamaiVoice: () => void;
  onAddKamaiManual: (input: ManualKamaiInput) => void;
  onDownloadIncomeStatement: () => void;
  /** Sync state per record (section 9.1). See JobsView for why it is a function. */
  syncStateOf: (recordId: string) => SyncState;
}

export const KamaiView: React.FC<KamaiViewProps> = ({
  kamaiList,
  syncStateOf,
  currentLanguage,
  onAddKamaiVoice,
  onAddKamaiManual,
  onDownloadIncomeStatement,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const copy = getScreenCopy(currentLanguage).kamai;
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'month'>('today');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualPaymentType, setManualPaymentType] = useState<'cash' | 'upi'>('cash');
  const [manualError, setManualError] = useState('');

  const todayStr = todayIso();
  const weekStart = daysAgoIso(6);
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const todayEntries = kamaiList.filter((k) => k.date === todayStr);
  const weekEntries = kamaiList.filter((k) => k.date >= weekStart && k.date <= todayStr);
  const monthEntries = kamaiList.filter((k) => k.date >= monthStart && k.date <= todayStr);

  const effect = (entry: KamaiEntry) => entry.direction === 'in' ? entry.amount : -entry.amount;
  const net = (entries: KamaiEntry[]) => entries.reduce((sum, entry) => sum + effect(entry), 0);
  const incomeByPayment = (paymentType: 'cash' | 'upi') => monthEntries
    .filter((entry) => entry.direction === 'in' && entry.paymentType === paymentType)
    .reduce((sum, entry) => sum + entry.amount, 0);

  const todayTotal = net(todayEntries);
  const weekTotal = net(weekEntries);
  const monthTotal = net(monthEntries);
  const cashTotal = incomeByPayment('cash');
  const upiTotal = incomeByPayment('upi');
  const outstandingTotal = monthEntries
    .filter((entry) => entry.direction === 'out' && !entry.settledAt)
    .reduce((sum, entry) => sum + entry.amount, 0);

  const currentDisplayList = activeTab === 'today'
    ? todayEntries
    : activeTab === 'week'
      ? weekEntries
      : monthEntries;
  const currentDisplayTotal = net(currentDisplayList);

  const formatAmount = (value: number) =>
    `${value < 0 ? '-' : ''}₹${Math.abs(value).toLocaleString('en-IN')}`;
  const amountClass = (value: number) => value < 0 ? 'text-red-600' : 'text-green-600';

  const submitManualEntry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(manualAmount);
    const description = manualDescription.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError(copy.enterAmount);
      return;
    }
    if (!description) {
      setManualError(copy.describePayment);
      return;
    }

    onAddKamaiManual({ amount, description, paymentType: manualPaymentType });
    setManualAmount('');
    setManualDescription('');
    setManualPaymentType('cash');
    setManualError('');
    setManualOpen(false);
    setActiveTab('today');
  };

  return (
    <div id="kamai-view-container" className="space-y-6 max-w-2xl mx-auto pb-10">
      {/* Header Banner with Huge Voice Button */}
      <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 sm:p-8 text-gray-900 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-extrabold shadow-xs">
            <Sparkles className="w-4 h-4 text-orange-600" />
            <span>{copy.eyebrow}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {t.navKamai}{copy.titleSuffix}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 font-medium max-w-sm">
            {copy.description}
          </p>
        </div>

        {/* 🎙️ Add Earnings Voice Button */}
        <div className="w-full sm:w-auto grid gap-2 shrink-0">
          <button
            id="kamai-view-voice-add-btn"
            type="button"
            onClick={onAddKamaiVoice}
            className="flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-base shadow-xl shadow-orange-200 transition-all active:scale-95 group"
          >
            <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span>{t.addEarnings}{copy.voiceSuffix}</span>
          </button>
          <button
            id="kamai-view-manual-add-btn"
            type="button"
            onClick={() => {
              setManualOpen((open) => !open);
              setManualError('');
            }}
            aria-expanded={manualOpen}
            aria-controls="kamai-manual-entry-form"
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-gray-900 text-white font-extrabold text-sm hover:bg-gray-800 transition-all active:scale-95"
          >
            <Keyboard className="w-4 h-4" aria-hidden="true" />
            <span>{copy.typePayment}</span>
          </button>
          <button
            id="kamai-view-income-statement-btn"
            type="button"
            onClick={onDownloadIncomeStatement}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white border border-orange-200 text-orange-800 font-extrabold text-sm hover:bg-orange-50 transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>{copy.incomePdf}</span>
          </button>
        </div>
      </div>

      {manualOpen ? (
        <form
          id="kamai-manual-entry-form"
          onSubmit={submitManualEntry}
          className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 space-y-4"
        >
          <div>
            <h3 className="font-extrabold text-gray-900">{copy.addReceivedPayment}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {copy.manualHint}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-700">
              {copy.amount} (₹)
              <input
                id="kamai-manual-amount"
                inputMode="decimal"
                type="number"
                min="1"
                step="1"
                value={manualAmount}
                onChange={(event) => setManualAmount(event.target.value)}
                className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
            </label>
            <label className="text-xs font-bold text-gray-700">
              {copy.paymentMethod}
              <select
                id="kamai-manual-payment-type"
                value={manualPaymentType}
                onChange={(event) => setManualPaymentType(event.target.value as 'cash' | 'upi')}
                className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3 text-base font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="cash">{copy.cash}</option>
                <option value="upi">{copy.upiOnline}</option>
              </select>
            </label>
          </div>
          <label className="text-xs font-bold text-gray-700 block">
            {copy.descriptionLabel}
            <input
              id="kamai-manual-description"
              type="text"
              maxLength={120}
              value={manualDescription}
              onChange={(event) => setManualDescription(event.target.value)}
              placeholder={copy.descriptionPlaceholder}
              className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            />
          </label>
          {manualError ? (
            <p role="alert" className="text-xs font-bold text-red-600">{manualError}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-full bg-orange-500 text-white font-extrabold hover:bg-orange-600"
            >
              {copy.savePayment}
            </button>
            <button
              type="button"
              onClick={() => {
                setManualOpen(false);
                setManualError('');
              }}
              className="min-h-11 px-5 rounded-full border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
            >
              {copy.cancel}
            </button>
          </div>
        </form>
      ) : null}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        {/* Today's Kamai */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t.todayEarnings}
            </span>
            <span className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-2 ${amountClass(todayTotal)}`}>
            {formatAmount(todayTotal)}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            {copy.ledgerEntriesToday(todayEntries.length)}
          </div>
        </div>

        {/* Weekly Total */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {copy.week}
            </span>
            <span className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className={`text-xl sm:text-2xl font-black mt-2 ${amountClass(weekTotal)}`}>
            {formatAmount(weekTotal)}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            {copy.weekCaption}
          </div>
        </div>

        {/* Monthly actual */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t.thisMonth} ({copy.actual})
            </span>
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <div className={`text-xl sm:text-2xl font-black mt-2 ${amountClass(monthTotal)}`}>
            {formatAmount(monthTotal)}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            {copy.monthCaption}
          </div>
        </div>
      </div>

      {/* Payment Method Split Card (Cash vs UPI) */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-gray-900 text-sm">
            {copy.paymentSplit} ({copy.receivedThisMonth})
          </h3>
          <span className="text-xs text-gray-400 font-medium">{copy.actualLedger}</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {/* UPI */}
          <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-purple-900 block">
                UPI / ऑनलाइन
              </span>
              <span className="text-base sm:text-lg font-black text-purple-950">
                ₹{upiTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Cash */}
          <div className="bg-green-50/60 p-4 rounded-2xl border border-green-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-green-900 block">
                {copy.cash}
              </span>
              <span className="text-base sm:text-lg font-black text-green-950">
                ₹{cashTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 rounded-2xl px-5 py-4 border border-amber-200 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-amber-900 uppercase">{copy.outstanding}</p>
          <p className="text-[11px] text-amber-800">{copy.outstandingCaption}</p>
        </div>
        <strong className="text-lg font-black text-amber-900">{formatAmount(outstandingTotal)}</strong>
      </div>

      {/* Ledger History List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex bg-gray-100 p-1.5 rounded-full border border-gray-200 text-xs font-bold text-gray-700">
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={`px-4 py-2 rounded-full transition-all ${
                activeTab === 'today'
                  ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                  : 'hover:text-gray-900'
              }`}
            >
              {t.todayEarnings}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('week')}
              className={`px-4 py-2 rounded-full transition-all ${
                activeTab === 'week'
                  ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                  : 'hover:text-gray-900'
              }`}
            >
              {copy.week} ({weekEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('month')}
              className={`px-4 py-2 rounded-full transition-all ${
                activeTab === 'month'
                  ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                  : 'hover:text-gray-900'
              }`}
            >
              {copy.month} ({monthEntries.length})
            </button>
          </div>

          <div className="text-xs text-gray-500 font-semibold">
            {copy.shownAmount}{' '}
            <strong className="text-gray-900 font-black">
              {formatAmount(currentDisplayTotal)}
            </strong>
          </div>
        </div>

        <div className="space-y-2.5">
          {currentDisplayList.length === 0 ? (
            <div className="bg-white p-6 rounded-3xl border border-dashed border-gray-300 text-center text-sm text-gray-500">
              {copy.noEntries}
            </div>
          ) : currentDisplayList.map((item) => {
            const value = effect(item);
            const entryLabel = item.reversesId
              ? copy.correction
              : item.direction === 'in'
                ? copy.incomeReceived
                : item.settledAt
                  ? copy.settledOutgoing
                  : copy.outstandingOutgoing;

            return (
            <div
              key={item.id}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between gap-3 hover:border-green-300 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-bold ${
                    value < 0
                      ? 'bg-red-100 text-red-700'
                      : item.paymentType === 'upi'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {item.paymentType === 'upi' ? 'UPI' : '₹'}
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base text-gray-900">
                    {localizeDisplayValue(item.description, currentLanguage)}
                  </h4>
                  <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 flex-wrap">
                    <span>{item.date} {item.customerName ? `• ${localizeDisplayValue(item.customerName, currentLanguage)}` : ''}</span>
                    <span>• {entryLabel}</span>
                    <SyncBadge state={syncStateOf(item.id)} currentLanguage={currentLanguage} compact />
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-base sm:text-lg font-black ${amountClass(value)}`}>
                  {value >= 0 ? '+' : '-'}₹{Math.abs(value).toLocaleString('en-IN')}
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                    item.paymentType === 'upi'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-green-50 text-green-700'
                  }`}
                >
                  {item.paymentType === 'upi' ? 'UPI' : copy.cash}
                </span>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
