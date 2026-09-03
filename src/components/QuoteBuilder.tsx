import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, LoaderCircle, Share2 } from 'lucide-react';
import type { WorkerProfile } from '../types';
import { api, ApiError, type PricingBandResult } from '../lib/api';

interface QuoteBuilderProps {
  profile: WorkerProfile;
}

const TRADE_LABELS: Record<string, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
};

const TASK_LABELS: Record<string, string> = {
  fan_install: 'Ceiling fan installation',
  fan_repair: 'Fan repair',
  switchboard_install: 'Switchboard installation',
  mcb_replace: 'MCB replacement',
  light_fitting: 'Light fitting',
  tap_replace: 'Tap replacement',
  leak_repair: 'Leak repair',
  toilet_install: 'Toilet installation',
  water_tank_clean: 'Water tank cleaning',
  drain_unblock: 'Drain unblocking',
};

function labelForTask(taskCode: string): string {
  return TASK_LABELS[taskCode] ?? taskCode.replace(/_/g, ' ');
}

function rupees(value: number): string {
  return `₹${Math.max(0, value).toLocaleString('en-IN')}`;
}

export const QuoteBuilder: React.FC<QuoteBuilderProps> = ({ profile }) => {
  const [tasks, setTasks] = useState<Array<{ trade: string; taskCode: string }>>([]);
  const [trade, setTrade] = useState('electrician');
  const [taskCode, setTaskCode] = useState('');
  const [band, setBand] = useState<PricingBandResult | null>(null);
  const [bandLoading, setBandLoading] = useState(false);
  const [error, setError] = useState('');
  const [labour, setLabour] = useState(0);
  const [material, setMaterial] = useState(0);
  const [visit, setVisit] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void api.listPricingTasks().then((result) => {
      if (!active) return;
      const mvpTasks = result.filter((item) => item.trade === 'electrician' || item.trade === 'plumber');
      setTasks(mvpTasks);
      if (mvpTasks.length > 0) {
        setTrade(mvpTasks[0].trade);
        setTaskCode(mvpTasks[0].taskCode);
      }
    }).catch((e) => {
      if (!active) return;
      setError(e instanceof Error ? e.message : 'Could not load the sourced rate list.');
    });
    return () => { active = false; };
  }, []);

  const tradeTasks = useMemo(
    () => tasks.filter((item) => item.trade === trade),
    [tasks, trade]
  );

  useEffect(() => {
    if (tradeTasks.length > 0 && !tradeTasks.some((item) => item.taskCode === taskCode)) {
      setTaskCode(tradeTasks[0].taskCode);
    }
  }, [tradeTasks, taskCode]);

  useEffect(() => {
    if (!trade || !taskCode) return;
    let active = true;
    setBandLoading(true);
    setBand(null);
    setError('');
    void api.getPricingBand(trade, taskCode, profile.location || undefined).then((result) => {
      if (!active) return;
      setBand(result);
      if (typeof result.p50 === 'number') setLabour(result.p50);
    }).catch((e) => {
      if (!active) return;
      setError(e instanceof ApiError ? e.message : 'Could not load the cited rate band.');
    }).finally(() => {
      if (active) setBandLoading(false);
    });
    return () => { active = false; };
  }, [trade, taskCode, profile.location]);

  const total = labour + material + visit;
  const selectedTaskLabel = labelForTask(taskCode);
  const quoteText = [
    'KAARIGAR QUOTE',
    `${selectedTaskLabel} • ${TRADE_LABELS[trade] ?? trade}`,
    `Labour: ${rupees(labour)}`,
    `Materials: ${rupees(material)}`,
    `Visit charge: ${rupees(visit)}`,
    `Total: ${rupees(total)}`,
    band ? `Fair-price band: ${rupees(band.p25 ?? 0)}–${rupees(band.p75 ?? 0)}` : '',
    band?.seededFrom ? `Basis: ${band.seededFrom}` : '',
  ].filter(Boolean).join('\n');

  const handleShare = () => {
    setNotice('');
    if (navigator.share) {
      void navigator.share({ title: 'Kaarigar quote', text: quoteText }).catch(() => {});
      return;
    }
    void navigator.clipboard?.writeText(quoteText).then(() => setNotice('Quote copied to clipboard.'));
  };

  const handleDownload = () => {
    const blob = new Blob([quoteText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kaarigar-quote.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice('Quote downloaded.');
  };

  return (
    <div id="quote-builder" className="space-y-5 max-w-2xl mx-auto pb-32">
      <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-orange-700 text-xs font-extrabold uppercase tracking-wider">
          <FileText className="w-4 h-4" /> Mol-Bhav quote
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">Build a fair, itemised quote</h2>
        <p className="text-xs sm:text-sm text-gray-600 mt-2">
          Choose one supported job, compare the cited band, then add labour, materials and a visit charge.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6 space-y-5">
        {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-xs font-extrabold text-gray-700">
            Trade
            <select value={trade} onChange={(e) => setTrade(e.target.value)} className="mt-1.5 w-full h-12 rounded-2xl border-2 border-gray-200 px-3 text-sm bg-gray-50">
              {['electrician', 'plumber'].map((value) => <option key={value} value={value}>{TRADE_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="text-xs font-extrabold text-gray-700">
            Task (per job)
            <select value={taskCode} onChange={(e) => setTaskCode(e.target.value)} className="mt-1.5 w-full h-12 rounded-2xl border-2 border-gray-200 px-3 text-sm bg-gray-50" disabled={tradeTasks.length === 0}>
              {tradeTasks.map((item) => <option key={item.taskCode} value={item.taskCode}>{labelForTask(item.taskCode)}</option>)}
            </select>
          </label>
        </div>

        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider font-extrabold text-gray-500">Cited fair-price band</div>
              <div className="text-base font-extrabold text-gray-900 mt-1">{selectedTaskLabel}</div>
            </div>
            {bandLoading ? <LoaderCircle className="w-5 h-5 text-orange-500 animate-spin" /> : band && !band.suppressed ? <div className="text-lg font-black text-orange-600">{rupees(band.p25 ?? 0)}–{rupees(band.p75 ?? 0)}</div> : null}
          </div>
          {band && !band.suppressed && <p className="text-[11px] text-gray-500 mt-2">{band.basis} · median {rupees(band.p50 ?? 0)} · {band.sampleN} local observations</p>}
          {band?.suppressed && <p className="text-xs text-amber-700 mt-2">Not enough observations to publish a band. Quote from experience.</p>}
          {band?.seededFrom && <p className="text-[11px] text-gray-500 mt-2">Source: {band.seededFrom}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ['Labour', labour, setLabour],
            ['Materials', material, setMaterial],
            ['Visit charge', visit, setVisit],
          ].map(([label, value, setter]) => (
            <label key={String(label)} className="text-xs font-extrabold text-gray-700">
              {String(label)}
              <input type="number" min="0" step="50" value={Number(value)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<number>>)(Math.max(0, Number(e.target.value) || 0))} className="mt-1.5 w-full h-12 rounded-2xl border-2 border-gray-200 px-3 text-sm bg-gray-50" />
            </label>
          ))}
        </div>

        <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
          <span className="text-sm font-extrabold text-gray-600">Quote total</span>
          <span className="text-3xl font-black text-green-600">{rupees(total)}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={handleShare} className="flex-1 h-12 rounded-2xl bg-gray-900 text-white font-extrabold text-sm flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Share quote</button>
          <button type="button" onClick={handleDownload} className="flex-1 h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Download quote</button>
        </div>
        {notice && <p className="text-xs text-green-700 font-bold text-center">{notice}</p>}
      </div>
    </div>
  );
};
