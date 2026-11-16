'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog } from './dialog';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const QUARTER_MINUTES = new Set(['00', '15', '30', '45']);

const TIME_EXACT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface TimePreset {
  id: string;
  labelLo: string;
  resolve: () => { start: string; end: string };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function recentWindowPreset(hoursBack: number): { start: string; end: string } {
  const now = new Date();
  const end = formatHm(now);
  const startMinutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - hoursBack * 60);
  const start = `${pad2(Math.floor(startMinutes / 60))}:${pad2(startMinutes % 60)}`;
  return { start, end };
}

const PRESETS: TimePreset[] = [
  { id: 'morning', labelLo: 'ເຊົ້າ 08:00–12:00', resolve: () => ({ start: '08:00', end: '12:00' }) },
  { id: 'afternoon', labelLo: 'ບ່າຍ 12:00–17:00', resolve: () => ({ start: '12:00', end: '17:00' }) },
  { id: 'evening', labelLo: 'ແລງ 17:00–21:00', resolve: () => ({ start: '17:00', end: '21:00' }) },
  { id: 'last1h', labelLo: '1 ຊມ. ຫຼ້າສຸດ', resolve: () => recentWindowPreset(1) },
  { id: 'last3h', labelLo: '3 ຊມ. ຫຼ້າສຸດ', resolve: () => recentWindowPreset(3) },
];

function splitTime(value: string): { hour: string; minute: string } {
  const match = value.match(TIME_EXACT_RE);
  if (!match) return { hour: '', minute: '' };
  return { hour: match[1], minute: match[2] };
}

/** ແປງການພິມຕົວເລກລ້ວນ (ເຊັ່ນ `0830` -> `08:30`) ໃຫ້ພິມໄວ. */
function normalizeTimeTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d:]/g, '');
  if (!cleaned.includes(':') && cleaned.length >= 3) {
    return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
  }
  return cleaned.slice(0, 5);
}

interface TimeColumnProps {
  labelLo: string;
  value: string;
  onChange: (next: string) => void;
  onSubmitEnter: () => void;
  defaultHour?: string;
  isOpen: boolean;
}

function scrollOptionIntoContainer(container: HTMLElement | null, selector: string) {
  if (!container) return;
  const target = container.querySelector<HTMLElement>(selector);
  if (!target) return;
  container.scrollTop = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
}

function TimeColumn({
  labelLo,
  value,
  onChange,
  onSubmitEnter,
  defaultHour = '08',
  isOpen,
}: TimeColumnProps) {
  const inputId = useId();
  const [textValue, setTextValue] = useState(value);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const { hour, minute } = splitTime(value);

  useEffect(() => {
    setTextValue(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const targetHour = hour || defaultHour;
    scrollOptionIntoContainer(hourListRef.current, `[data-hour="${targetHour}"]`);
    if (minute) {
      scrollOptionIntoContainer(minuteListRef.current, `[data-minute="${minute}"]`);
    }
  }, [isOpen, hour, minute, defaultHour]);

  const handleTextChange = (raw: string) => {
    const next = normalizeTimeTyping(raw);
    setTextValue(next);
    if (next === '') {
      onChange('');
      return;
    }
    if (TIME_EXACT_RE.test(next)) {
      onChange(next);
    }
  };

  const handleTextBlur = () => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      onChange('');
      setTextValue('');
      return;
    }
    if (TIME_EXACT_RE.test(trimmed)) {
      onChange(trimmed);
    } else {
      setTextValue(value);
    }
  };

  const pickHour = (h: string) => {
    const nextMin = minute || '00';
    onChange(`${h}:${nextMin}`);
  };

  const pickMinute = (m: string) => {
    const nextHour = hour || defaultHour;
    onChange(`${nextHour}:${m}`);
  };

  const isTypingInvalid = Boolean(textValue && !TIME_EXACT_RE.test(textValue));

  return (
    <div className="rounded-xl border border-line bg-recessed p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-semibold text-gold">
          {labelLo}
        </label>
        {value && (
          <button
            type="button"
            className="text-[11px] font-medium text-muted hover:text-fg cursor-pointer transition-colors"
            onClick={() => onChange('')}
          >
            ລ້າງ
          </button>
        )}
      </div>

      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder="HH:mm (ເຊັ່ນ 08:30)"
        value={textValue}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleTextBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmitEnter();
          }
        }}
        className={`input h-9 text-sm num font-medium ${
          isTypingInvalid ? 'border-warning' : ''
        }`}
      />

      <div className="flex items-center gap-1">
        {(['00', '15', '30', '45'] as const).map((qm) => {
          const active = minute === qm;
          return (
            <button
              key={qm}
              type="button"
              onClick={() => pickMinute(qm)}
              className={`flex-1 min-h-[26px] rounded-md border text-[11px] num cursor-pointer transition-colors duration-150 ${
                active
                  ? 'border-[var(--gold)] bg-[var(--gold-tint)] font-semibold text-[var(--gold)]'
                  : 'border-line bg-surface text-muted hover:text-fg hover:bg-[var(--row-hover)]'
              }`}
            >
              :{qm}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <div className="px-1.5 pb-1 text-[11px] font-medium text-muted">ຊົ່ວໂມງ</div>
          <div
            ref={hourListRef}
            role="listbox"
            aria-label={`${labelLo} — ຊົ່ວໂມງ`}
            className="h-40 overflow-y-auto rounded-lg border border-line bg-surface p-1 space-y-0.5 relative"
          >
            {HOURS.map((h) => {
              const active = hour === h;
              return (
                <button
                  key={h}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-hour={h}
                  onClick={() => pickHour(h)}
                  className={`w-full min-h-[30px] rounded-md px-2 text-center text-xs num cursor-pointer transition-colors duration-150 ${
                    active
                      ? 'bg-[var(--gold-tint)] font-semibold text-[var(--gold)]'
                      : 'text-fg hover:bg-[var(--row-hover)]'
                  }`}
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="px-1.5 pb-1 text-[11px] font-medium text-muted">ນາທີ</div>
          <div
            ref={minuteListRef}
            role="listbox"
            aria-label={`${labelLo} — ນາທີ`}
            className="h-40 overflow-y-auto rounded-lg border border-line bg-surface p-1 space-y-0.5 relative"
          >
            {MINUTES.map((m) => {
              const active = minute === m;
              const isQuarter = QUARTER_MINUTES.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-minute={m}
                  onClick={() => pickMinute(m)}
                  className={`w-full min-h-[30px] rounded-md px-2 text-center text-xs num cursor-pointer transition-colors duration-150 ${
                    active
                      ? 'bg-[var(--gold-tint)] font-semibold text-[var(--gold)]'
                      : isQuarter
                        ? 'font-medium text-fg hover:bg-[var(--row-hover)]'
                        : 'text-muted hover:text-fg hover:bg-[var(--row-hover)]'
                  }`}
                >
                  :{m}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface TimeRangePickerProps {
  startTime: string;
  endTime: string;
  onApply: (start: string, end: string) => void;
  fromDate?: string;
  toDate?: string;
}

function getRangeWarning(
  fromDate: string | undefined,
  toDate: string | undefined,
  start: string,
  end: string,
): string | null {
  if (!start || !end) return null;
  if (fromDate && toDate && `${fromDate}T${start}` > `${toDate}T${end}`) {
    return 'ເວລາເລີ່ມຕົ້ນ ຕ້ອງບໍ່ຫຼັງ ເວລາສິ້ນສຸດ';
  }
  return null;
}

export function TimeRangePicker({
  startTime,
  endTime,
  onApply,
  fromDate,
  toDate,
}: TimeRangePickerProps) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startTime);
  const [draftEnd, setDraftEnd] = useState(endTime);

  const draftWarning = getRangeWarning(fromDate, toDate, draftStart, draftEnd);

  const openPanel = () => {
    setDraftStart(startTime);
    setDraftEnd(endTime);
    setOpen(true);
  };

  const cancelAndClose = useCallback(() => {
    setOpen(false);
  }, []);

  const commitAndClose = useCallback(() => {
    if (draftWarning) return;
    onApply(draftStart, draftEnd);
    setOpen(false);
  }, [draftStart, draftEnd, draftWarning, onApply]);

  const hasValue = Boolean(startTime || endTime);
  const displayLabel =
    startTime && endTime
      ? `${startTime} – ${endTime}`
      : startTime
        ? `ຕັ້ງແຕ່ ${startTime}`
        : endTime
          ? `ເຖິງ ${endTime}`
          : 'ທຸກເວລາ (Start – End)';

  const handlePresetClick = (preset: TimePreset) => {
    const { start, end } = preset.resolve();
    setDraftStart(start);
    setDraftEnd(end);
    onApply(start, end);
    setOpen(false);
  };

  const handleClearAll = () => {
    setDraftStart('');
    setDraftEnd('');
    onApply('', '');
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <div className="relative flex items-center">
        <button
          id={triggerId}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? cancelAndClose() : openPanel())}
          className={`filter-date group inline-flex min-h-[40px] sm:min-h-[38px] min-w-[210px] items-center justify-between gap-2.5 text-left cursor-pointer ${
            hasValue ? 'pr-14 border-[var(--gold)] bg-[var(--gold-tint)]' : 'pr-9'
          }`}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[var(--gold-icon)]"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className={`truncate ${hasValue ? 'num font-semibold text-fg' : 'text-muted'}`}>
              {displayLabel}
            </span>
          </span>
        </button>

        {hasValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClearAll();
            }}
            aria-label="ລ້າງຊ່ວງເວລາ"
            title="ລ້າງຊ່ວງເວລາ"
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-fg hover:bg-[var(--row-hover)] cursor-pointer transition-colors"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--gold-icon)] transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      <Dialog
        open={open}
        onClose={cancelAndClose}
        dismissOnScrim
        size="md"
        title={
          <span className="flex flex-wrap items-baseline gap-2.5">
            <span>ເລືອກຊ່ວງເວລາ</span>
            <span className="num text-sm font-medium text-muted">
              ({draftStart || '--:--'} – {draftEnd || '--:--'})
            </span>
          </span>
        }
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClearAll}
              className="filter-clear cursor-pointer"
            >
              ລ້າງຊ່ວງເວລາ
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelAndClose}
                className="btn-secondary h-9 py-0 px-4 text-sm cursor-pointer"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                disabled={Boolean(draftWarning)}
                onClick={commitAndClose}
                className="btn-primary h-9 py-0 px-5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ນຳໃຊ້
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Quick Presets */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted block">ຊ່ວງເວລາດ່ວນ</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const resolved = p.resolve();
                const isStaticMatch =
                  !p.id.startsWith('last') &&
                  draftStart === resolved.start &&
                  draftEnd === resolved.end;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetClick(p)}
                    className={`min-h-[34px] rounded-lg border px-3 text-xs font-medium cursor-pointer transition-colors duration-150 ${
                      isStaticMatch
                        ? 'border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)] font-semibold'
                        : 'border-line bg-recessed text-fg hover:border-[var(--gold)] hover:bg-[var(--gold-tint)]'
                    }`}
                  >
                    {p.labelLo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Side-by-side Start & End columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TimeColumn
              labelLo="ເວລາເລີ່ມຕົ້ນ (Start)"
              value={draftStart}
              onChange={setDraftStart}
              onSubmitEnter={commitAndClose}
              defaultHour="08"
              isOpen={open}
            />
            <TimeColumn
              labelLo="ເວລາສິ້ນສຸດ (End)"
              value={draftEnd}
              onChange={setDraftEnd}
              onSubmitEnter={commitAndClose}
              defaultHour="17"
              isOpen={open}
            />
          </div>

          {draftWarning && (
            <div
              role="alert"
              className="rounded-lg border border-warning bg-recessed px-3 py-2 text-xs font-medium text-warning"
            >
              {draftWarning}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
