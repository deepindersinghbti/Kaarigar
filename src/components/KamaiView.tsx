import React, { useState } from 'react';
import {
  Mic,
  TrendingUp,
  IndianRupee,
  Calendar,
  CreditCard,
  Banknote,
  ArrowUpRight,
  Sparkles,
  PieChart,
  Download,
  Share2,
} from 'lucide-react';
import { KamaiEntry, SupportedLanguage } from '../types';
import { TRANSLATIONS } from '../data/translations';

interface KamaiViewProps {
  kamaiList: KamaiEntry[];
  currentLanguage: SupportedLanguage;
  onAddKamaiVoice: () => void;
}

export const KamaiView: React.FC<KamaiViewProps> = ({
  kamaiList,
  currentLanguage,
  onAddKamaiVoice,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'month'>('today');

  const todayStr = '2026-08-27';

  // Calculations
  const todayEntries = kamaiList.filter((k) => k.date === todayStr);
  const todayTotal = todayEntries.reduce((sum, k) => sum + k.amount, 0);

  const totalAll = kamaiList.reduce((sum, k) => sum + k.amount, 0);
  const cashTotal = kamaiList
    .filter((k) => k.paymentType === 'cash')
    .reduce((sum, k) => sum + k.amount, 0);
  const upiTotal = kamaiList
    .filter((k) => k.paymentType === 'upi')
    .reduce((sum, k) => sum + k.amount, 0);

  const currentDisplayList =
    activeTab === 'today' ? todayEntries : kamaiList;

  const currentDisplayTotal = currentDisplayList.reduce(
    (sum, k) => sum + k.amount,
    0
  );

  return (
    <div id="kamai-view-container" className="space-y-6 max-w-2xl mx-auto pb-10">
      {/* Header Banner with Huge Voice Button */}
      <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 sm:p-8 text-gray-900 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-extrabold shadow-xs">
            <Sparkles className="w-4 h-4 text-orange-600" />
            <span>Voice Kamai Ledger</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {t.navKamai} (कमाई खाता)
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 font-medium max-w-sm">
            बस बोलिए — "आज दो काम किए, पहला 1500 का और दूसरा 1200 का" और हिसाब
            तुरंत तैयार!
          </p>
        </div>

        {/* 🎙️ Add Earnings Voice Button */}
        <button
          id="kamai-view-voice-add-btn"
          onClick={onAddKamaiVoice}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-base shadow-xl shadow-orange-200 transition-all active:scale-95 group"
        >
          <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span>{t.addEarnings} (बोलकर)</span>
        </button>
      </div>

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
          <div className="text-2xl sm:text-3xl font-black text-green-600 mt-2">
            ₹{todayTotal.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            {todayEntries.length} काम आज पूरे हुए
          </div>
        </div>

        {/* Weekly Total */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              इस हफ्ते
            </span>
            <span className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-gray-900 mt-2">
            ₹{(totalAll).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            Avg. ₹1,800/दिन
          </div>
        </div>

        {/* Monthly Estimate */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              इस महीने (अनुमान)
            </span>
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-600 mt-2">
            ₹{(totalAll * 3.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            लक्ष्य का 84% पूरा
          </div>
        </div>
      </div>

      {/* Payment Method Split Card (Cash vs UPI) */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-gray-900 text-sm">
            भुगतान माध्यम (Payment Method Split)
          </h3>
          <span className="text-xs text-gray-400 font-medium">कुल हिसाब</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {/* UPI */}
          <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-purple-900 block">
                UPI / Online
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
                नकद (Cash)
              </span>
              <span className="text-base sm:text-lg font-black text-green-950">
                ₹{cashTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger History List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex bg-gray-100 p-1.5 rounded-full border border-gray-200 text-xs font-bold text-gray-700">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-4 py-2 rounded-full transition-all ${
                activeTab === 'today'
                  ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                  : 'hover:text-gray-900'
              }`}
            >
              आज (Today)
            </button>
            <button
              onClick={() => setActiveTab('week')}
              className={`px-4 py-2 rounded-full transition-all ${
                activeTab === 'week'
                  ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                  : 'hover:text-gray-900'
              }`}
            >
              सभी प्रविष्टियां ({kamaiList.length})
            </button>
          </div>

          <div className="text-xs text-gray-500 font-semibold">
            दिखाई गई राशि:{' '}
            <strong className="text-gray-900 font-black">
              ₹{currentDisplayTotal.toLocaleString('en-IN')}
            </strong>
          </div>
        </div>

        <div className="space-y-2.5">
          {currentDisplayList.map((item) => (
            <div
              key={item.id}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between gap-3 hover:border-green-300 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-bold ${
                    item.paymentType === 'upi'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {item.paymentType === 'upi' ? 'UPI' : '₹'}
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base text-gray-900">
                    {item.description}
                  </h4>
                  <div className="text-xs text-gray-400 font-medium">
                    {item.date} {item.customerName ? `• ${item.customerName}` : ''}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-base sm:text-lg font-black text-green-600">
                  +₹{item.amount.toLocaleString('en-IN')}
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                    item.paymentType === 'upi'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-green-50 text-green-700'
                  }`}
                >
                  {item.paymentType}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
