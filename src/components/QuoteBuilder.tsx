import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, LoaderCircle, Share2 } from 'lucide-react';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-gurmukhi/400.css';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { SupportedLanguage, WorkerProfile } from '../types';
import { api, ApiError, type PricingBandResult } from '../lib/api';
import { RATE_BAND_TASKS, getCatalogRateBand } from '../data/rateBands';
import { getScreenCopy, localizeDisplayValue, localizeWorkerName } from '../data/uiCopy';

interface QuoteBuilderProps {
  profile: WorkerProfile;
  currentLanguage?: SupportedLanguage;
}

function labelForTask(taskCode: string, labels: Record<string, string>, language: SupportedLanguage): string {
  return labels[taskCode] ?? localizeDisplayValue(taskCode.replace(/_/g, ' '), language);
}

function rupees(value: number): string {
  return `₹${Math.max(0, value).toLocaleString('en-IN')}`;
}

function pdfRupees(value: number, language: SupportedLanguage): string {
  return `₹${Math.max(0, value).toLocaleString('en-IN')}`;
}

function amountFromInput(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function normalizeAmount(value: string): string {
  return String(amountFromInput(value));
}

interface PdfBillCopy {
  documentTitle: string;
  documentLabel: string;
  issued: string;
  preparedBy: string;
  trade: string;
  location: string;
  service: string;
  item: string;
  description: string;
  amount: string;
  materialsDescription: string;
  visitDescription: string;
  subtotal: string;
  total: string;
  fairBand: string;
  source: string;
  note: string;
  footer: string;
}

function getPdfBillCopy(language: SupportedLanguage): PdfBillCopy {
  if (language === 'pa') {
    return {
      documentTitle: 'ਕਾਰੀਗਰ ਕੋਟੇਸ਼ਨ',
      documentLabel: 'ਕੋਟੇਸ਼ਨ',
      issued: 'ਜਾਰੀ ਮਿਤੀ',
      preparedBy: 'ਤਿਆਰ ਕਰਨ ਵਾਲਾ',
      trade: 'ਕੰਮ ਦੀ ਕਿਸਮ',
      location: 'ਥਾਂ',
      service: 'ਸੇਵਾ',
      item: 'ਆਈਟਮ',
      description: 'ਵੇਰਵਾ',
      amount: 'ਰਕਮ',
      materialsDescription: 'ਸਮੱਗਰੀ',
      visitDescription: 'ਆਉਣ ਦਾ ਖਰਚਾ',
      subtotal: 'ਉਪ-ਕੁੱਲ',
      total: 'ਕੁੱਲ ਰਕਮ',
      fairBand: 'ਦਿੱਤੀ ਉਚਿਤ-ਦਾਮ ਹੱਦ',
      source: 'ਸਰੋਤ',
      note: 'ਇਹ ਇੱਕ ਪਾਰਦਰਸ਼ੀ ਅੰਦਾਜ਼ਾ ਹੈ। ਅੰਤਿਮ ਰਕਮ ਕੰਮ ਦੀ ਅਸਲ ਲੋੜ ਅਨੁਸਾਰ ਬਦਲ ਸਕਦੀ ਹੈ।',
      footer: 'ਕਾਰੀਗਰ • ਨਿਰਪੱਖ ਅਤੇ ਪਾਰਦਰਸ਼ੀ ਅੰਦਾਜ਼ਾ',
    };
  }
  if (language === 'hi') {
    return {
      documentTitle: 'कारीगर कोटेशन',
      documentLabel: 'कोटेशन',
      issued: 'जारी तारीख',
      preparedBy: 'तैयार करने वाला',
      trade: 'काम की किस्म',
      location: 'जगह',
      service: 'सेवा',
      item: 'आइटम',
      description: 'विवरण',
      amount: 'रकम',
      materialsDescription: 'सामग्री',
      visitDescription: 'आने का खर्च',
      subtotal: 'उप-योग',
      total: 'कुल रकम',
      fairBand: 'संदर्भित उचित-दाम सीमा',
      source: 'स्रोत',
      note: 'यह एक पारदर्शी अनुमान है। काम की वास्तविक जरूरत के अनुसार अंतिम रकम बदल सकती है।',
      footer: 'कारीगर • निष्पक्ष और पारदर्शी अनुमान',
    };
  }
  return {
    documentTitle: 'Kaarigar Quotation',
    documentLabel: 'Quotation',
    issued: 'Issued',
    preparedBy: 'Prepared by',
    trade: 'Trade',
    location: 'Location',
    service: 'Service',
    item: 'Item',
    description: 'Description',
    amount: 'Amount',
    materialsDescription: 'Materials',
    visitDescription: 'Visit charge',
    subtotal: 'Subtotal',
    total: 'Total amount',
    fairBand: 'Cited fair-price band',
    source: 'Source',
    note: 'This is a transparent estimate. The final amount may change according to the actual work required.',
    footer: 'Kaarigar • Fair and transparent estimate',
  };
}

function pdfDate(language: SupportedLanguage): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
}

function isPlaceholderCitation(source?: string): boolean {
  return !source || /placeholder|unsourced/i.test(source);
}

function catalogBandResult(trade: string, taskCode: string): PricingBandResult | null {
  const fallback = getCatalogRateBand(trade, taskCode);
  if (!fallback) return null;
  return {
    ...fallback,
    suppressed: false,
    confidence: 'seeded',
    minObservations: 5,
    floored: false,
    floorApplicable: true,
  };
}

export const QuoteBuilder: React.FC<QuoteBuilderProps> = ({ profile, currentLanguage = 'hi' }) => {
  const copy = getScreenCopy(currentLanguage).quote;
  const billCopy = getPdfBillCopy(currentLanguage);
  const billRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Array<{ trade: string; taskCode: string }>>(() => [...RATE_BAND_TASKS]);
  const [trade, setTrade] = useState(RATE_BAND_TASKS[0]?.trade ?? 'electrician');
  const [taskCode, setTaskCode] = useState(RATE_BAND_TASKS[0]?.taskCode ?? '');
  const [band, setBand] = useState<PricingBandResult | null>(null);
  const [bandLoading, setBandLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingFallbackRates, setUsingFallbackRates] = useState(false);
  const [labour, setLabour] = useState('0');
  const [material, setMaterial] = useState('0');
  const [visit, setVisit] = useState('0');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void api.listPricingTasks().then((result) => {
      if (!active) return;
      const mvpTasks = result.filter((item) => item.trade === 'electrician' || item.trade === 'plumber');
      setTasks(mvpTasks.length > 0 ? mvpTasks : [...RATE_BAND_TASKS]);
      setUsingFallbackRates(mvpTasks.length === 0);
    }).catch((e) => {
      if (!active) return;
      setTasks([...RATE_BAND_TASKS]);
      setUsingFallbackRates(true);
      if (e instanceof ApiError && e.status === 401) {
        setError(e.message);
      }
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
    const selectedTrade = trade;
    const selectedTaskCode = taskCode;
    const fallback = catalogBandResult(selectedTrade, selectedTaskCode);
    setBandLoading(true);
    setBand(null);
    setError('');
    setLabour('');

    const useCatalogBand = () => {
      if (!fallback) return false;
      setBand(fallback);
      setUsingFallbackRates(true);
      setLabour(String(fallback.p50));
      return true;
    };

    void api.getPricingBand(trade, taskCode, profile.location || undefined).then((result) => {
      if (!active) return;
      const matchesSelection = result.trade === selectedTrade && result.taskCode === selectedTaskCode;
      const hasCitedSource = !isPlaceholderCitation(result.seededFrom);
      if ((!matchesSelection || !hasCitedSource) && useCatalogBand()) return;
      if (!matchesSelection) {
        setError('The returned rate did not match the selected trade and task.');
        return;
      }
      setBand(result);
      if (typeof result.p50 === 'number') setLabour(String(result.p50));
    }).catch((e) => {
      if (!active) return;
      if (!(e instanceof ApiError && e.status === 401) && useCatalogBand()) return;
      setError(e instanceof ApiError ? e.message : copy.loadBandError);
    }).finally(() => {
      if (active) setBandLoading(false);
    });
    return () => { active = false; };
  }, [trade, taskCode, profile.location]);

  const labourAmount = amountFromInput(labour);
  const materialAmount = amountFromInput(material);
  const visitAmount = amountFromInput(visit);
  const total = labourAmount + materialAmount + visitAmount;
  const quoteAboveBand = Boolean(band && !band.suppressed && band.p75 && total > band.p75 * 1.2);
  const selectedTaskLabel = labelForTask(taskCode, copy.taskNames, currentLanguage);
  const selectedTradeLabel = copy.tradeNames[trade] ?? trade;
  const quoteTitle = currentLanguage === 'en'
    ? 'KAARIGAR QUOTE'
    : currentLanguage === 'pa'
      ? 'ਕਾਰੀਗਰ ਕੋਟ'
      : 'कारीगर कोट';
  const bandBasis = band?.confidence === 'observed'
    ? copy.localObservations(band.sampleN)
    : copy.noLocalObservations;
  const quoteText = [
    quoteTitle,
    `${selectedTaskLabel} • ${selectedTradeLabel}`,
    `${copy.labour}: ${rupees(labourAmount)}`,
    `${copy.materials}: ${rupees(materialAmount)}`,
    `${copy.visitCharge}: ${rupees(visitAmount)}`,
    `${copy.total}: ${rupees(total)}`,
    band ? `${copy.band}: ${rupees(band.p25 ?? 0)}–${rupees(band.p75 ?? 0)}` : '',
    band?.seededFrom ? `${copy.source}: ${localizeDisplayValue(band.seededFrom, currentLanguage)}` : '',
  ].filter(Boolean).join('\n');

  const handleShare = () => {
    setNotice('');
    if (navigator.share) {
      void navigator.share({ title: quoteTitle, text: quoteText }).catch(() => {});
      return;
    }
    void navigator.clipboard?.writeText(quoteText).then(() => setNotice(copy.copied));
  };

  const handleDownload = () => {
    void (async () => {
      try {
        const bill = billRef.current;
        if (!bill) throw new Error('Quote bill template is unavailable.');
        if (document.fonts) await document.fonts.ready;
        const canvas = await html2canvas(bill, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
        pdf.save('kaarigar-quote.pdf');
        setNotice(copy.downloaded);
      } catch (error) {
        console.error('Quote PDF generation failed:', error);
        setNotice(copy.loadBandError);
      }
    })();
  };

  return (
    <div id="quote-builder" className="space-y-5 max-w-2xl mx-auto pb-32">
      <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-orange-700 text-xs font-extrabold uppercase tracking-wider">
          <FileText className="w-4 h-4" /> {copy.eyebrow}
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">{copy.title}</h2>
        <p className="text-xs sm:text-sm text-gray-600 mt-2">
          {copy.description}
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6 space-y-5">
        {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>}
        {usingFallbackRates && !error && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 px-3 py-2.5 text-sm text-blue-800">
            {copy.fallbackRates}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-xs font-extrabold text-gray-700">
            {copy.trade}
              <select value={trade} onChange={(e) => {
                const nextTrade = e.target.value;
                const firstTask = tasks.find((item) => item.trade === nextTrade);
                setTrade(nextTrade);
                if (firstTask) setTaskCode(firstTask.taskCode);
              }} className="mt-1.5 w-full h-12 rounded-2xl border-2 border-gray-200 px-3 text-sm bg-gray-50">
              {['electrician', 'plumber'].map((value) => <option key={value} value={value}>{copy.tradeNames[value] ?? value}</option>)}
            </select>
          </label>
          <label className="text-xs font-extrabold text-gray-700">
            {copy.task}
            <select value={taskCode} onChange={(e) => {
              setTaskCode(e.target.value);
            }} className="mt-1.5 w-full h-12 rounded-2xl border-2 border-gray-200 px-3 text-sm bg-gray-50" disabled={tradeTasks.length === 0}>
              {tradeTasks.map((item) => <option key={item.taskCode} value={item.taskCode}>{labelForTask(item.taskCode, copy.taskNames, currentLanguage)}</option>)}
            </select>
          </label>
        </div>

        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider font-extrabold text-gray-500">{copy.band}</div>
              <div className="text-base font-extrabold text-gray-900 mt-1">{selectedTaskLabel}</div>
            </div>
            {bandLoading ? <LoaderCircle className="w-5 h-5 text-orange-500 animate-spin" /> : band && !band.suppressed ? <div className="text-lg font-black text-orange-600">{rupees(band.p25 ?? 0)}–{rupees(band.p75 ?? 0)}</div> : null}
          </div>
          {band && !band.suppressed && <p className="text-[11px] text-gray-500 mt-2">{bandBasis} · {copy.median} {rupees(band.p50 ?? 0)}</p>}
          {band?.suppressed && <p className="text-xs text-amber-700 mt-2">{copy.noBand}</p>}
          {band?.seededFrom && <p className="text-[11px] text-gray-500 mt-2">{copy.source}: {band.seededFrom}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: copy.labour, value: labour, setter: setLabour },
            { label: copy.materials, value: material, setter: setMaterial },
            { label: copy.visitCharge, value: visit, setter: setVisit },
          ].map(({ label, value, setter }) => (
            <label key={label} className="text-xs font-extrabold text-gray-700">
              {label}
              <input
                type="number"
                min="0"
                step="50"
                value={value}
                onChange={(e) => setter(e.target.value)}
                onBlur={(e) => setter(normalizeAmount(e.target.value))}
                className="mt-1.5 w-full h-12 rounded-2xl border-2 border-gray-200 px-3 text-sm bg-gray-50"
              />
            </label>
          ))}
        </div>
        {quoteAboveBand && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {copy.aboveBandWarning}
          </div>
        )}

        <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
          <span className="text-sm font-extrabold text-gray-600">{copy.total}</span>
          <span className="text-3xl font-black text-green-600">{rupees(total)}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={handleShare} className="flex-1 h-12 rounded-2xl bg-gray-900 text-white font-extrabold text-sm flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> {copy.share}</button>
          <button type="button" onClick={handleDownload} className="flex-1 h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm flex items-center justify-center gap-2"><Download className="w-4 h-4" /> {copy.download}</button>
        </div>
        {notice && <p className="text-xs text-green-700 font-bold text-center">{notice}</p>}
      </div>

      <div
        ref={billRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: '794px',
          height: '1123px',
          boxSizing: 'border-box',
          padding: '52px',
          background: '#ffffff',
          color: '#111827',
          fontFamily: currentLanguage === 'hi' ? '"Noto Sans Devanagari", sans-serif' : currentLanguage === 'pa' ? '"Noto Sans Gurmukhi", sans-serif' : '"Plus Jakarta Sans", Arial, sans-serif',
        }}
      >
        <div style={{ borderTop: '8px solid #f97316', paddingTop: '24px', height: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #dbe1e8', paddingBottom: '22px' }}>
            <div style={{ maxWidth: '420px' }}>
              <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '0.04em', color: '#f97316' }}>KAARIGAR</div>
              <div style={{ marginTop: '6px', fontSize: '14px', lineHeight: 1.5, color: '#64748b' }}>{copy.description}</div>
            </div>
            <div style={{ textAlign: 'right', marginLeft: '18px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827' }}>{billCopy.documentTitle}</div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}>{billCopy.issued}: {pdfDate(currentLanguage)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '28px', padding: '20px', border: '1px solid #dbe1e8', borderRadius: '12px', background: '#f8fafc' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{billCopy.preparedBy}</div>
              <div style={{ marginTop: '5px', fontSize: '17px', fontWeight: 700 }}>{localizeWorkerName(profile.name, currentLanguage)}</div>
              <div style={{ marginTop: '5px', fontSize: '13px', color: '#475569' }}>{selectedTradeLabel}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{billCopy.location}</div>
              <div style={{ marginTop: '5px', fontSize: '15px', fontWeight: 600 }}>{localizeDisplayValue(profile.location, currentLanguage)}</div>
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b' }}>{billCopy.service}</div>
              <div style={{ marginTop: '4px', fontSize: '15px', fontWeight: 700 }}>{selectedTaskLabel}</div>
            </div>
          </div>

          <div style={{ marginTop: '30px', fontSize: '15px', fontWeight: 800, color: '#334155' }}>{billCopy.documentLabel}</div>
          <table style={{ width: '100%', marginTop: '12px', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                {[billCopy.item, billCopy.description, billCopy.amount].map((heading, index) => (
                  <th key={heading} style={{ padding: '12px 14px', textAlign: index === 2 ? 'right' : 'left', fontWeight: 700 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                [copy.labour, selectedTaskLabel, pdfRupees(labourAmount, currentLanguage)],
                [copy.materials, billCopy.materialsDescription, pdfRupees(materialAmount, currentLanguage)],
                [copy.visitCharge, billCopy.visitDescription, pdfRupees(visitAmount, currentLanguage)],
              ].map(([item, description, amount]) => (
                <tr key={item} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '15px 14px', fontWeight: 700 }}>{item}</td>
                  <td style={{ padding: '15px 14px', color: '#475569' }}>{description}</td>
                  <td style={{ padding: '15px 14px', textAlign: 'right', fontWeight: 700 }}>{amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {quoteAboveBand && (
            <div style={{ marginTop: '16px', padding: '12px 14px', border: '1px solid #fbbf24', borderRadius: '8px', background: '#fffbeb', color: '#92400e', fontSize: '12px' }}>
              {copy.aboveBandWarning}
            </div>
          )}

          <div style={{ marginTop: '20px', marginLeft: 'auto', width: '310px', borderTop: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '14px', color: '#475569' }}>
              <span>{billCopy.subtotal}</span><span>{pdfRupees(total, currentLanguage)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '8px', background: '#fff7ed', color: '#c2410c', fontSize: '19px', fontWeight: 800 }}>
              <span>{billCopy.total}</span><span>{pdfRupees(total, currentLanguage)}</span>
            </div>
          </div>

          <div style={{ marginTop: '30px', padding: '18px 20px', border: '1px solid #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>{billCopy.fairBand}</div>
            <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, color: '#ea580c' }}>
              {band && !band.suppressed ? pdfRupees(band.p25 ?? 0, currentLanguage) + '–' + pdfRupees(band.p75 ?? 0, currentLanguage) : copy.noBand}
            </div>
            {band?.seededFrom && <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', wordBreak: 'break-word' }}>{billCopy.source}: {localizeDisplayValue(band.seededFrom, currentLanguage)}</div>}
          </div>

          <div style={{ position: 'absolute', left: '52px', right: '52px', bottom: '50px', borderTop: '1px solid #dbe1e8', paddingTop: '14px', fontSize: '11px', lineHeight: 1.5, color: '#64748b' }}>
            <div>{billCopy.note}</div>
            <div style={{ marginTop: '8px', fontWeight: 700 }}>{billCopy.footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
