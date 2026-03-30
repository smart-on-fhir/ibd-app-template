import { useEffect, useRef, useState } from 'react';
import HighchartsReact                 from 'highcharts-react-official';
import Navigator                       from './Navigator';
import { type TimelineEvent }          from './utils';
import Highcharts                      from '../../highcharts';
import { humanizeDuration }            from '../../utils';
import {
    DRUG_CLASS_WINDOWS,
    PROCEDURE_WINDOWS,
    DAY,
    TREATMENT_TYPES,
    MEDICATION_RESOURCE_TYPES
} from './config';
import '../ResourceTypeSelector/ResourceTypeSelector.scss';



// ─── Types ───────────────────────────────────────────────────────────────────
type MetricPoint = { x: number; y: number; event: TimelineEvent } |
                   { x: number; low: number; high: number; event: TimelineEvent };

type Metric = { values: MetricPoint[]; unit: string; isRange: boolean };


// ─── Constants ───────────────────────────────────────────────────────────────
const ML            = 280; // shared left margin — keeps both panels x-aligned
const TREAT_ROW_H   = 22;  // px per treatment row
const OUTCOME_ROW_H = 60; // px per outcome metric sparkline
const MAX_METRICS   = 500;   // cap to avoid a impossibly tall chart
const COLORS = [
    '#2980b9',
    '#e67e22',
    '#27ae60',
    '#8e44ad',
    '#c0392b',
    '#16a085',
    '#d35400',
    '#2c3e50'
];


// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Like medicationPeriod in MedicationTimeline — checks FHIR-specific period
 * fields
 */
function treatmentPeriod(e: TimelineEvent): { x: number; x2: number } {
    const raw = e.raw;
    if (raw.resourceType === 'MedicationRequest') {
        
        const vp = raw.dispenseRequest?.validityPeriod;
        if (vp?.start)
            return {
                x : +new Date(vp.start),
                x2: +(vp.end ? new Date(vp.end) : new Date(vp.start))
            };
        
        const bp = raw.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod;
        if (bp?.start)
            return {
                x: +new Date(bp.start),
                x2: +(bp.end ? new Date(bp.end) : new Date(bp.start))
            };
        
        // Derive duration from timing.repeat: count × (period / frequency) in days
        const rep = raw.dosageInstruction?.[0]?.timing?.repeat;
        if (rep?.count && rep?.period && rep?.periodUnit) {
            const unitMs: Record<string, number> = {
                s  : 1e3,
                min: 6e4,
                h  : 36e5,
                d  : 864e5,
                wk : 6048e5,
                mo : 2592e6,
                a  : 31536e6
            };
            const ms = rep.count * (rep.period / (rep.frequency ?? 1)) * (unitMs[rep.periodUnit] ?? 864e5);
            const x = +new Date(e.date);
            return { x, x2: x + ms };
        }
    }

    return {
        x:  +new Date(e.date),
        x2: +(e.endDate ? new Date(e.endDate) : new Date(e.date)),
    };
}

// ─── Default observation windows ─────────────────────────────────────────────

/**
 * Like treatmentPeriod but expands zero-width (single-point) events using
 * drug-class / procedure heuristics so relevance scoring has a useful window.
 */
function effectivePeriod(e: TimelineEvent): { x: number; x2: number } {
    const p = treatmentPeriod(e);
    if (p.x2 > p.x) return p;
    return { x: p.x, x2: defaultObservationWindow(e, p.x) };
}

/**
 * Returns x2 for a single-point treatment event using FHIR data first,
 * then drug-class / procedure heuristics, then resource-type defaults.
 */
function defaultObservationWindow(e: TimelineEvent, x: number): number {
    const name = normalizeDrugName(e).toLowerCase();
    const rt   = e.raw.resourceType as string;

    if (MEDICATION_RESOURCE_TYPES.has(rt)) {
        for (const [keywords, ms] of DRUG_CLASS_WINDOWS) {
            if (keywords.some(k => name.includes(k))) return x + ms;
        }
        return x + 7 * DAY; // generic medication default
    }

    if (rt === 'Procedure') {
        const code = (e.raw.code?.text ?? e.raw.code?.coding?.[0]?.display ?? '').toLowerCase();
        const haystack = name + ' ' + code;
        for (const [keywords, ms] of PROCEDURE_WINDOWS) {
            if (keywords.some(k => haystack.includes(k))) return x + ms;
        }
        return x + 3 * DAY; // generic procedure default
    }

    if (rt === 'Immunization') return x + 365 * DAY;

    return x + 7 * DAY; // catch-all
}

/**
 * Extracts a numeric value from a FHIR observation resource.
 * @param raw The raw FHIR resource
 * @returns The numeric value if present, otherwise null
 */
function extractNumeric(raw: any): number | null {
    if (typeof raw.valueQuantity?.value === 'number') return raw.valueQuantity.value;
    if (typeof raw.valueInteger === 'number') return raw.valueInteger;
    return null;
}

/**
 * Detects blood pressure observations (two components with LOINC 8480-6 / 8462-4).
 * Falls back to first two components if LOINC codes are absent but two components exist.
 */
function extractBP(raw: any): { systolic: number; diastolic: number } | null {
    if (!Array.isArray(raw.component) || raw.component.length < 2) return null;
    let sys: number | null = null;
    let dia: number | null = null;
    for (const comp of raw.component) {
        const code = comp.code?.coding?.[0]?.code;
        const val  = comp.valueQuantity?.value;
        if (typeof val !== 'number') continue;
        if      (code === '8480-6') sys = val;  // systolic
        else if (code === '8462-4') dia = val;  // diastolic
    }
    // Fallback: first two components when LOINC codes are absent
    if (sys === null && typeof raw.component[0]?.valueQuantity?.value === 'number')
        sys = raw.component[0].valueQuantity.value;
    if (dia === null && typeof raw.component[1]?.valueQuantity?.value === 'number')
        dia = raw.component[1].valueQuantity.value;
    if (sys !== null && dia !== null) return { systolic: sys, diastolic: dia };
    return null;
}

/**
 * Builds a map of metrics from a list of timeline events.
 * Each metric is keyed by its label and contains an array of metric points.
 * @param data The list of timeline events
 * @returns A map of metrics keyed by label
 */
function buildMetrics(data: TimelineEvent[]): Map<string, Metric> {
    const map = new Map<string, Metric>();
    for (const e of data.filter(e => !TREATMENT_TYPES.has(e.resourceType))) {
        const label = e.yLabel ?? e.resourceType;
        const bp = extractBP(e.raw);
        if (bp !== null) {
            if (!map.has(label)) map.set(label, { values: [], unit: 'mmHg', isRange: true });
            const x = +new Date(e.date);
            const values = map.get(label)!.values as any[];
            // Deduplicate: skip if exact same x, low, high already exists
            if (!values.some(v => v.x === x && v.low === bp.diastolic && v.high === bp.systolic)) {
                values.push({ x, low: bp.diastolic, high: bp.systolic, event: e });
            }
            continue;
        }
        const val = extractNumeric(e.raw);
        if (val === null) continue;
        const unit = (e.raw.valueQuantity?.unit ?? e.raw.valueQuantity?.code ?? '') as string;
        if (!map.has(label)) map.set(label, { values: [], unit, isRange: false });
        const x = +new Date(e.date);
        const values = map.get(label)!.values as any[];
        // Deduplicate: skip if exact same x, y already exists
        if (!values.some(v => v.x === x && v.y === val)) {
            values.push({ x, y: val, event: e });
        }
    }
    return map;
}

/**
 * Sorts metrics by the number of data points in descending order and limits to
 * the top N metrics.
 * @param map A map of metrics keyed by label
 * @returns An array of [label, metric] tuples sorted by the number of data points
 */
function sortedMetrics(map: Map<string, Metric>): [string, Metric][] {
    return [...map.entries()]
        .sort((a, b) => b[1].values.length - a[1].values.length)
        .slice(0, MAX_METRICS);
}

/**
 * Returns a dose-agnostic drug name for grouping same medications across doses.
 * B: looks for a coding entry whose display has no digits (ingredient-level RxNorm).
 * A: strips dose amounts, units, and route/form suffixes from the display text.
 */
function normalizeDrugName(e: TimelineEvent): string {
    if (!MEDICATION_RESOURCE_TYPES.has(e.resourceType)) return e.yLabel ?? e.display ?? e.resourceType;
    // B: ingredient-level coding has no digit in its display
    const codings: any[] = e.raw.medicationCodeableConcept?.coding
        ?? e.raw.medication?.concept?.coding
        ?? [];
    for (const c of codings) {
        const d: string = c.display ?? '';
        if (d && !/\d/.test(d)) return d.trim();
    }
    // A: regex strip dose and form tokens
    const src = e.yLabel ?? e.display ?? e.resourceType;
    return src
        .replace(/\s+\d[\d.,]*\s*(mg|mcg|ug|g|ml|mmol|meq|units?|u|iu|%)[^,]*/gi, '')
        .replace(/\b(oral|tablets?|capsules?|solution|injection|patch|cream|ointment|inhal\w*|extended.release|\ber\b|\bsr\b|\bxr\b|hydrochloride|hcl|calcium|sodium|sulfate|succinate|maleate|fumarate)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Scores each metric's relevance to a treatment period.
 * A: observation density — fraction of observations that fall inside the window.
 * B: Cohen's d — standardised mean shift from before-treatment to during-treatment.
 * Final score = 0.6 × density + 0.4 × cohensD (both normalised to [0,1]).
 */
function computeRelevance(
    metrics: [string, Metric][],
    period: { x: number; x2: number },
): Map<string, number> {
    const scores = new Map<string, number>();
    const toVal = (v: MetricPoint) => 'y' in v ? v.y : ((v as any).low + (v as any).high) / 2;
    for (const [label, { values }] of metrics) {
        if (!values.length) { scores.set(label, 0); continue; }
        const inWindow = values.filter(v => v.x >= period.x && v.x <= period.x2);
        // A: density
        const density = inWindow.length / values.length;
        // B: Cohen's d (before-treatment baseline vs during-treatment)
        const before = values.filter(v => v.x < period.x).map(toVal);
        const during = inWindow.map(toVal);
        let cohensD = 0;
        if (before.length >= 2 && during.length >= 1) {
            const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
            const mb   = mean(before);
            const std  = Math.sqrt(before.reduce((a, b) => a + (b - mb) ** 2, 0) / before.length);
            if (std > 0) cohensD = Math.min(Math.abs(mean(during) - mb) / std, 3) / 3;
        }
        scores.set(label, 0.6 * density + 0.4 * cohensD);
    }
    return scores;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TreatmentOutcomeChart({
    data,
    navigatorData,
    lensStart,
    lensEnd,
    clickedEvent      = null,
    onSelectionChange = () => {},
    onEventClick      = () => {},
}: {
    data:                       TimelineEvent[];
    navigatorData:               TimelineEvent[];
    lensStart:                   number;
    lensEnd:                     number;
    clickedEvent?:               TimelineEvent | null;
    onSelectionChange?:          (events: TimelineEvent[]) => void;
    onEventClick?:               (event: TimelineEvent | null) => void;
}) {
    const treatRef        = useRef<any>(null);
    const outcomeRef      = useRef<any>(null);
    const panelWrapperRef = useRef<HTMLDivElement>(null);
    // Current visible x-range — kept in a ref so pan sync never triggers React re-renders
    const rangeRef        = useRef<[number, number]>([lensStart, lensEnd]);
    // Viewport state — updated by the Navigator, drives treatment filtering
    const [viewport, setViewport] = useState<[number, number]>([lensStart, lensEnd]);
    // Stable ref for onEventClick — keeps the Highcharts click handler from changing identity
    const onEventClickRef = useRef(onEventClick);
    onEventClickRef.current = onEventClick;
    // SVG connector — updated via direct DOM mutation so panning has zero lag
    const connectorSvgRef   = useRef<SVGSVGElement>(null);
    const connectorFillRef  = useRef<SVGPathElement>(null);
    const connectorLeftRef  = useRef<SVGPathElement>(null);
    const connectorRightRef = useRef<SVGPathElement>(null);
    // Refreshed every render so chart render events call it with fresh closures
    const computeConnectorRef = useRef<() => void>(() => {});

    // Compute metrics before hiddenMetrics hook so the lazy initializer can reference them
    const metricMap = buildMetrics(data);
    const metrics   = sortedMetrics(metricMap);

    // Hide everything beyond the first 5 by default
    const [hiddenMetrics, setHiddenMetrics] = useState<Set<string>>(
        () => new Set(metrics.slice(5).map(([l]) => l))
    );
    const toggleMetric = (label: string) =>
        setHiddenMetrics(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });

    const [focusedTreatment, setFocusedTreatment] = useState<TimelineEvent | null>(null);

    // Derive the focused period for plotBands/plotLines
    const focusedPeriod = focusedTreatment ? effectivePeriod(focusedTreatment) : null;
    // Read current range from ref — updated imperatively, no re-render needed
    const [rangeStart, rangeEnd] = rangeRef.current;

    // ── Split data ─────────────────────────────────────────────────────────
    // Only include treatments that start within the currently selected time window
    const [viewStart, viewEnd] = viewport;
    const treatments = data.filter(e => {
        if (!TREATMENT_TYPES.has(e.resourceType)) return false;
        const { x } = treatmentPeriod(e);
        return x >= viewStart && x <= viewEnd;
    });

    // ── Treatment rows (ordered by first occurrence, deduplicated by normalised drug name) ─
    const treatmentRows: string[] = [];
    const seenRows = new Set<string>();
    for (const e of treatments) {
        const label = normalizeDrugName(e);
        if (!seenRows.has(label)) { seenRows.add(label); treatmentRows.push(label); }
    }
    const treatHeight = Math.max(60, treatmentRows.length * TREAT_ROW_H + 16);
    // When a treatment is focused, re-sort metrics by relevance (density + Cohen's d)
    const relevanceScores = focusedPeriod ? computeRelevance(metrics, focusedPeriod) : new Map<string, number>();
    const displayMetrics  = focusedPeriod && relevanceScores.size > 0
        ? [...metrics].sort((a, b) => (relevanceScores.get(b[0]) ?? 0) - (relevanceScores.get(a[0]) ?? 0))
        : metrics;
    const visibleMetrics = displayMetrics.filter(([label]) => !hiddenMetrics.has(label));
    const N = metrics.length;
    const NVisible = visibleMetrics.length;
    const outcomeHeight = Math.max(80, NVisible * OUTCOME_ROW_H);

    const handleMouseMove = (e: React.MouseEvent) => {
        [treatRef, outcomeRef].forEach(ref => {
            const chart = ref.current?.chart;
            if (!chart) return;
            try {
                const evt = chart.pointer.normalize(e.nativeEvent);
                chart.xAxis[0].drawCrosshair(evt as any);
            } catch {}
        });
    };
    const handleMouseLeave = () => {
        [treatRef, outcomeRef].forEach(ref => {
            try { ref.current?.chart?.xAxis[0]?.hideCrosshair(); } catch {}
        });
    };

    // ── Per-chart afterSetExtremes handlers — each syncs only the OTHER chart ──
    // This avoids any React round-trip (no setState, no useEffect) so pan is smooth.
    const onTreatAfterSetExtremes = (e: any) => {
        if (!e.trigger || !Number.isFinite(e.min) || !Number.isFinite(e.max)) return;
        rangeRef.current = [e.min, e.max];
        try { outcomeRef.current?.chart?.xAxis[0]?.setExtremes(e.min, e.max, true, false); } catch {}
    };
    const onOutcomeAfterSetExtremes = (e: any) => {
        if (!e.trigger || !Number.isFinite(e.min) || !Number.isFinite(e.max)) return;
        rangeRef.current = [e.min, e.max];
        try { treatRef.current?.chart?.xAxis[0]?.setExtremes(e.min, e.max, true, false); } catch {}
    };

    // Updated every render — captures fresh focusedPeriod/treatmentRows closures
    computeConnectorRef.current = () => {
        const svg = connectorSvgRef.current;
        if (!focusedPeriod || !svg) {
            if (svg) svg.style.visibility = 'hidden';
            return;
        }
        try {
            const wrapper      = panelWrapperRef.current;
            const treatChart   = treatRef.current?.chart;
            const outcomeChart = outcomeRef.current?.chart;
            if (!wrapper || !treatChart || !outcomeChart) return;
            const wRect = wrapper.getBoundingClientRect();
            const tRect = (treatChart.container as HTMLElement).getBoundingClientRect();
            const oRect = (outcomeChart.container as HTMLElement).getBoundingClientRect();
            const tx1 = tRect.left - wRect.left + treatChart.xAxis[0].toPixels(focusedPeriod.x,  false);
            const tx2 = tRect.left - wRect.left + treatChart.xAxis[0].toPixels(focusedPeriod.x2, false);
            const bx1 = oRect.left - wRect.left + outcomeChart.xAxis[0].toPixels(focusedPeriod.x,  false);
            const bx2 = oRect.left - wRect.left + outcomeChart.xAxis[0].toPixels(focusedPeriod.x2, false);
            const barRowIdx  = treatmentRows.indexOf(normalizeDrugName(focusedTreatment!));
            const barCenterY = tRect.top - wRect.top + treatChart.yAxis[0].toPixels(barRowIdx, false);
            const halfBarH   = (TREAT_ROW_H - 4) / 2;
            const topY    = barCenterY + halfBarH;
            const bottomY = oRect.top - wRect.top + outcomeChart.plotTop + outcomeChart.plotHeight;
            const midY = (topY + bottomY) / 2;
            connectorFillRef.current?.setAttribute('d',
                `M ${tx1} ${topY} L ${tx2} ${topY} C ${tx2} ${midY}, ${bx2} ${midY}, ${bx2} ${bottomY} L ${bx1} ${bottomY} C ${bx1} ${midY}, ${tx1} ${midY}, ${tx1} ${topY} Z`);
            connectorLeftRef.current?.setAttribute('d',
                `M ${tx1} ${topY} C ${tx1} ${midY}, ${bx1} ${midY}, ${bx1} ${bottomY}`);
            connectorRightRef.current?.setAttribute('d',
                `M ${tx2} ${topY} C ${tx2} ${midY}, ${bx2} ${midY}, ${bx2} ${bottomY}`);
            svg.style.visibility = 'visible';
        } catch { svg.style.visibility = 'hidden'; }
    };

    // Show/hide connector when focused treatment changes; render events handle repositioning
    useEffect(() => {
        if (!focusedPeriod) {
            if (connectorSvgRef.current) connectorSvgRef.current.style.visibility = 'hidden';
            return;
        }
        // Fallback: also compute after outcome chart has had time to mount and zoom
        const id = setTimeout(() => computeConnectorRef.current(), 100);
        return () => clearTimeout(id);
    }, [focusedTreatment]); // eslint-disable-line react-hooks/exhaustive-deps

    // Recompute connector when the selected outcome point changes (chart update may not fire render)
    useEffect(() => {
        computeConnectorRef.current();
    }, [clickedEvent]); // eslint-disable-line react-hooks/exhaustive-deps

    // Recompute connector on window resize — getBoundingClientRect values change
    useEffect(() => {
        const onResize = () => computeConnectorRef.current();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Recompute connector after metric visibility changes — chart remounts with new plotHeight
    useEffect(() => {
        const id = setTimeout(() => computeConnectorRef.current(), 50);
        return () => clearTimeout(id);
    }, [hiddenMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

    // Focus a treatment and auto-select the top 5 most relevant outcomes
    const focusTreatment = (e: TimelineEvent) => {
        const period  = effectivePeriod(e);
        const scores  = computeRelevance(metrics, period);
        const sorted  = [...metrics].sort((a, b) => (scores.get(b[0]) ?? 0) - (scores.get(a[0]) ?? 0));
        setFocusedTreatment(e);
        setHiddenMetrics(new Set(sorted.slice(5).map(([l]) => l)));
    };

    // Clear focus and restore default (top 5 by observation count)
    const clearFocus = () => {
        setFocusedTreatment(null);
        setHiddenMetrics(new Set(metrics.slice(5).map(([l]) => l)));
    };

    // ── Treatment chart options ────────────────────────────────────────────
    const treatOptions: Highcharts.Options = {
        chart: {
            height: treatHeight,
            marginLeft: ML, marginRight: 20, marginTop: 10, marginBottom: 10,
            animation: false, backgroundColor: '#FFF', borderWidth: 0, plotBorderWidth: 0,
            panning: { enabled: false },
            zooming: { type: 'x', mouseWheel: { enabled: false } },
            events: {
                click(this: any, event: any) {
                    // Reset Zoom button clicks bubble to chart.events.click — ignore them
                    if ((event?.target as Element | null)?.closest?.('.highcharts-reset-zoom')) return;
                    clearFocus(); onSelectionChange([]); onEventClick(null);
                },
                render() { computeConnectorRef.current(); },
            },
        },
        exporting: { enabled: false }, credits: { enabled: false },
        title: { text: '' }, subtitle: { text: '' },
        xAxis: {
            type: 'datetime', ordinal: false,
            min: Number.isFinite(lensStart) ? lensStart : undefined,
            max: Number.isFinite(lensEnd)   ? lensEnd   : undefined,
            labels: { enabled: false }, tickLength: 0, lineWidth: 0, lineColor: '#EEE',
            gridLineWidth: 1, gridLineColor: '#0001',
            crosshair: { color: '#8886', dashStyle: 'ShortDash', snap: false, zIndex: 3 },
            events: { afterSetExtremes: onTreatAfterSetExtremes },
        },
        yAxis: {
            type: 'category', reversed: true, categories: treatmentRows,
            title: { text: '' },
            labels: { style: { fontSize: '13px', color: '#444' } },
            lineWidth: 0, lineColor: '#318ebc44',
            gridLineColor: '#EEE', gridLineWidth: 1,
            startOnTick: true, endOnTick: true,
            min: 0, max: treatmentRows.length,
            tickPositions: treatmentRows.map((_, i) => i),
        },
        tooltip: {
            useHTML: true,
            outside: true,
            snap: 0,
            borderColor: '#318ebc', borderRadius: 5, borderWidth: 1,
            distance: 10,
            shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 1, offsetY: 1, width: 5 },
            formatter(this: any) {
                const e = this.point.options.custom as TimelineEvent;
                const { x, x2 } = treatmentPeriod(e);
                const startDate  = new Date(x);
                const endDate    = x2 !== x ? new Date(x2) : null;
                const fmt        = (d: Date) => d.toLocaleString('en-US', { dateStyle: 'medium' });
                const rows: string[] = [];
                rows.push(`<table><tbody>`);
                rows.push(`<tr><th colspan="2">${e.yLabel ?? e.resourceType}<hr style="margin:4px 0"/></th></tr>`);
                if (endDate) {
                    rows.push(`<tr><th style="text-align:right">From: </th><td>${fmt(startDate)}</td></tr>`);
                    rows.push(`<tr><th style="text-align:right">To: </th><td>${fmt(endDate)}</td></tr>`);
                    rows.push(`<tr><th style="text-align:right">Duration: </th><td>${humanizeDuration(startDate, endDate)}</td></tr>`);
                } else {
                    rows.push(`<tr><th style="text-align:right">Date: </th><td>${fmt(startDate)}</td></tr>`);
                }
                rows.push(`<tr><th style="text-align:right">Type: </th><td>${e.resourceType}</td></tr>`);
                if (e.raw.status) rows.push(`<tr><th style="text-align:right">Status: </th><td>${e.raw.status}</td></tr>`);
                rows.push(`</tbody></table>`);
                return rows.join('');
            },
        },
        plotOptions: {
            xrange: {
                animation: false, dataGrouping: { enabled: false },
                turboThreshold: 99999, clip: false,
                minPointLength: 6, maxPointWidth: TREAT_ROW_H - 4,
                borderRadius: 3, borderWidth: 1, borderColor: '#0004',
                allowPointSelect: true,
                inactiveOtherPoints: false,
                states: {
                    select: { color: '#F80', borderColor: '#C30', borderWidth: 1 },
                    hover:  { brightness: -0.15 },
                },
            },
        },
        series: [{
            type: 'xrange', showInLegend: false, enableMouseTracking: true,
            data: treatments.flatMap(e => {
                const { x, x2 } = treatmentPeriod(e);
                const y = treatmentRows.indexOf(normalizeDrugName(e));
                if (y < 0) return [];
                return [{ x, x2, y,
                    color: e.color ?? COLORS[Array.from(TREATMENT_TYPES).indexOf(e.resourceType) % COLORS.length] ?? '#318ebc88',
                    selected: e.resourceId === focusedTreatment?.resourceId,
                    custom: e }];
            }),
            point: {
                events: {
                    click(this: any) {
                        const e = this.options.custom as TimelineEvent;
                        focusTreatment(e);
                        onEventClick(e);
                        onSelectionChange([e]);
                    },
                },
            },
        }] as any,
    };

    // ── Outcome chart options ──────────────────────────────────────────────
    const pct = (i: number, of: number) => `${(i / of) * 100}%`;

    // Outcome chart inner margins — must stay in sync with outcomeOptions.chart below
    const OC_MARGIN_TOP    = 8;
    const OC_MARGIN_BOTTOM = 28;
    const plotAreaHeight   = outcomeHeight - OC_MARGIN_TOP - OC_MARGIN_BOTTOM;
    const panelPx          = NVisible > 0 ? plotAreaHeight / NVisible : 0;

    const outcomeYAxes: Highcharts.YAxisOptions[] = displayMetrics.map(([label]) => {
        if (hiddenMetrics.has(label)) return {
            title: { text: '' }, visible: false, height: 0, top: '0%', offset: 0,
            labels: { enabled: false },
        };
        const vi = visibleMetrics.findIndex(([l]) => l === label);
        return {
            title: { text: '' },
            top: pct(vi, NVisible), height: pct(1, NVisible), offset: 0,
            lineWidth: 0, lineColor: '#E8E8E8',
            gridLineWidth: 0,
            labels: { enabled: false },
            startOnTick: false, endOnTick: false,
            minPadding: 0.1, maxPadding: 0.1,
        };
    });

    const outcomeSeries: Highcharts.SeriesOptionsType[] = displayMetrics.flatMap(([label, { values, isRange }], i) => {
        // Stable color tied to original metrics order so colors don't shift on re-sort
        const color      = COLORS[metrics.findIndex(([l]) => l === label) % COLORS.length];
        const visible    = !hiddenMetrics.has(label);
        const isSelected = (e: TimelineEvent) => !!clickedEvent && e.resourceId === clickedEvent.resourceId;

        // console.log(label, values.length);
        if (isRange) {
            const sortedValues = [...values].sort((a: any, b: any) => a.x - b.x);
            const single = values.length === 1;
            const base = { yAxis: i, color, showInLegend: false, connectNulls: false, visible, lineWidth: 2, dataGrouping: { enabled: false } };

            return [
                {
                    ...base, name: `${label} Systolic`,
                    type: 'spline', marker: { enabled: single },
                    data: sortedValues.map((v: any) => ({ x: v.x, y: v.high, custom: v.event, selected: isSelected(v.event) }))
                },
                {
                    ...base, name: `${label} Diastolic`, dashStyle: 'ShortDash',
                    type: 'spline', marker: { enabled: single },
                    data: sortedValues.map((v: any) => ({ x: v.x, y: v.low, custom: v.event, selected: isSelected(v.event) }))
                }
            ] as any;
        } else {
            const sortedValues = [...values].sort((a: any, b: any) => a.x - b.x);
            const single = values.length === 1;
            const marker = { enabled: single };
            return [{
                name: label, yAxis: i, color, showInLegend: false, connectNulls: false, visible, lineWidth: 2,
                type: 'spline', marker,
                dataGrouping: { enabled: false },
                data: sortedValues.map((v: any) => ({ x: v.x, y: v.y, custom: v.event, selected: isSelected(v.event) }))
            }] as any;
        }
    });

    const outcomeOptions: Highcharts.Options = {
        chart: {
            height: outcomeHeight,
            marginLeft: ML, marginRight: 20, marginTop: 8, marginBottom: 28,
            animation: false, backgroundColor: '#FFF', borderWidth: 0, plotBorderWidth: 0,
            panning: { enabled: true, type: 'x' },
            events: {
                render() { computeConnectorRef.current(); },
            },
        },
        exporting: { enabled: false }, credits: { enabled: false },
        title: { text: '' }, subtitle: { text: '' },
        legend: { enabled: false },
        xAxis: {
            type: 'datetime', ordinal: false,
            min: Number.isFinite(rangeStart) ? rangeStart : undefined,
            max: Number.isFinite(rangeEnd)   ? rangeEnd   : undefined,
            lineWidth: 0, lineColor: '#318ebc44',
            gridLineWidth: 0, gridLineColor: '#0001',
            tickLength: 0, 
            crosshair: { color: '#8886', dashStyle: 'ShortDash', snap: false, zIndex: 3 },
            labels: { style: { color: '#888', fontSize: '11px' } },
            events: { afterSetExtremes: onOutcomeAfterSetExtremes },
        },
        yAxis: outcomeYAxes.length > 0
            ? outcomeYAxes
            : [{ title: { text: '' }, visible: false }],
        tooltip: {
            useHTML: true,
            outside: true,
            shared: false,
            split: false,
            borderColor: '#318ebc', borderRadius: 5, borderWidth: 1,
            distance: 10,
            shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 1, offsetY: 1, width: 5 },
            formatter(this: any) {
                
                const date = new Date(this.x).toLocaleString('en-US', { dateStyle: 'medium' });
                const baseName = this.series.name.replace(/ Systolic$/, '').replace(/ Diastolic$/, '');
                const unit = metricMap.get(baseName)?.unit ?? '';
                const u    = unit ? ` ${unit}` : '';
                const rows: string[] = [];
                rows.push(`<table><tbody>`);
                rows.push(`<tr><th colspan="2">${baseName}<hr style="margin:4px 0"/></th></tr>`);
                rows.push(`<tr><th style="text-align:right">Date: </th><td>${date}</td></tr>`);
                const isSystolic  = this.series.name.endsWith(' Systolic');
                const isDiastolic = this.series.name.endsWith(' Diastolic');
                if (isSystolic || isDiastolic) {
                    const type = isSystolic ? 'Systolic' : 'Diastolic';
                    rows.push(`<tr><th style="text-align:right">${type}: </th><td>${this.y}${u}</td></tr>`);
                } else {
                    rows.push(`<tr><th style="text-align:right">Value: </th><td>${this.y}${u}</td></tr>`);
                }
                rows.push(`</tbody></table>`);
                return rows.join('');
            },
        },
        plotOptions: {
            series: { boostThreshold: Infinity, states: { inactive: { opacity: 1 } } },
            scatter: {
                animation: false,
                marker: {
                    enabled: true,
                    radius: 5,
                    symbol: 'circle',
                    states: {
                        hover: { enabled: true, radius: 4 },
                        select: { enabled: true, radius: 5 },
                        inactive: { opacity: 1 },
                        normal: { animation: false }
                    }
                },
                dataGrouping: { enabled: false },
                point: {
                    events: {
                        click(this: any) {
                            const e = this.options.custom as TimelineEvent | undefined;
                            if (e) onEventClickRef.current(e);
                        },
                    },
                },
            },
            spline: {
                animation: false, allowPointSelect: true,
                dataGrouping: { enabled: true, approximation: 'average', groupPixelWidth: 12 },
                point: {
                    events: {
                        click(this: any) {
                            const e = this.options.custom as TimelineEvent | undefined;
                            if (e) onEventClickRef.current(e);
                        },
                    },
                },
                marker: {
                    enabled: false,
                    radius: 5,
                    symbol: 'circle',
                    // states: {
                    //     hover: { enabled: true, radius: 4 },
                    //     select: { enabled: true, radius: 5 },
                    //     inactive: { opacity: 1 },
                    //     normal: { animation: false }
                    // }
                },
            },
        },
        series: outcomeSeries.length > 0
            ? outcomeSeries
            : [{ type: 'scatter', data: [], showInLegend: false, name: 'empty' } as any],
    };

    console.log(outcomeOptions)

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* Navigator */}
            <div style={{ borderBottom: '1px solid #318ebc44', marginBottom: 4 }}>
                <Navigator
                    data={navigatorData}
                    start={lensStart}
                    end={lensEnd}
                    useEventColors
                    onChange={(min, max) => {
                        rangeRef.current = [min, max];
                        setViewport([min, max]);
                        try { treatRef.current?.chart?.xAxis[0]?.setExtremes(min, max, true, false); } catch {}
                        try { outcomeRef.current?.chart?.xAxis[0]?.setExtremes(min, max, true, false); } catch {}
                    }}
                />
            </div>

            {/* Treatment + Outcome panels — shared wrapper for crosshair sync */}
            <div ref={panelWrapperRef} style={{ position: 'relative' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>

            {/* Treatment panel */}
            <div>
                <div style={{ paddingLeft: 8, paddingTop: 4, paddingBottom: 2, fontSize: 13, fontWeight: 700, color: '#318ebc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Treatments &amp; Interventions
                </div>
                <HighchartsReact
                    highcharts={Highcharts}
                    constructorType="chart"
                    options={treatOptions}
                    ref={treatRef}
                    allowChartUpdate
                />
            </div>

            {/* Outcome panel */}
            <div style={{ marginTop: 0, borderTop: '1px solid #318ebc44', paddingTop: 4 }}>
            {N === 0 ? (
                <div style={{ padding: '12px 8px', color: '#999', fontSize: 13 }}>
                    No numeric outcome data found. Observations with <code>valueQuantity</code> will appear here.
                </div>
            ) : !focusedTreatment ? (
                <div style={{ padding: '20px 8px 20px', color: '#aaa', fontSize: 13, textAlign: 'center' }}>
                    <i className="bi bi-hand-index me-2" style={{ fontSize: 18, verticalAlign: 'middle' }} />
                    Click a treatment bar to see correlated outcomes
                </div>
            ) : (
                <>
                    {/* Focused header */}
                    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8, paddingBottom: 4, gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#318ebc', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                            Outcomes
                        </span>
                        <span style={{ fontSize: 13, color: '#aaa', flexShrink: 0 }}>for</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {focusedTreatment.yLabel ?? focusedTreatment.display ?? focusedTreatment.resourceType}
                        </span>
                        <span style={{ fontSize: 11, color: '#888', background: '#f0f0f0', borderRadius: 10, padding: '1px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {humanizeDuration(new Date(focusedPeriod!.x), new Date(focusedPeriod!.x2))}
                        </span>
                        <div style={{ flex: 1 }} />
                        <div className="resource-type-selector" tabIndex={-1}>
                            <div className="d-inline-flex align-items-center gap-1 dropdown-toggle small">
                                <i className="bi bi-funnel" />
                                {hiddenMetrics.size > 0 &&
                                    <small className="badge rounded-pill bg-primary fw-normal">
                                        {metrics.length - hiddenMetrics.size}/{metrics.length}
                                    </small>
                                }
                            </div>
                            <div className="backdrop" onClick={e => e.currentTarget.parentElement?.blur()} />
                            <ul className="dropdown-menu dropdown-menu-end shadow-sm" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                                {metrics.map(([label, { unit }], i) => {
                                    const hidden = hiddenMetrics.has(label);
                                    const color  = COLORS[i % COLORS.length];
                                    return (
                                        <li key={label} className="dropdown-item small" style={{ cursor: 'pointer' }}
                                            onClick={() => toggleMetric(label)}>
                                            <div className="d-flex align-items-center gap-2">
                                                <i className={'bi ' + (hidden ? 'bi-square opacity-50' : 'bi-check-square-fill')}
                                                   style={{ color: hidden ? undefined : color }} />
                                                <span className="flex-grow-1">{unit ? `${label} (${unit})` : label}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                                <li><hr className="dropdown-divider" /></li>
                                <li className="dropdown-item small" style={{ cursor: 'pointer' }}
                                    onClick={() => setHiddenMetrics(hiddenMetrics.size > 0 ? new Set() : new Set(metrics.map(([l]) => l)))}>
                                    <div className="d-flex align-items-center gap-2">
                                        <i className="bi bi-square opacity-0" />
                                        <span>Toggle All</span>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <button
                            className="btn btn-sm btn-outline-secondary py-0 px-2"
                            style={{ fontSize: 11, flexShrink: 0 }}
                            onClick={() => clearFocus()}>
                            <i className="bi bi-x" /> Clear
                        </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <HighchartsReact
                            highcharts={Highcharts}
                            constructorType="chart"
                            options={outcomeOptions}
                            ref={outcomeRef}
                            allowChartUpdate
                            key={[...hiddenMetrics].sort().join(',') + '|' + (focusedTreatment?.resourceId ?? '')}
                        />
                        {/* Full-width panel separators */}
                        <div style={{ position: 'absolute', top: OC_MARGIN_TOP, left: 0, right: 0, pointerEvents: 'none' }}>
                            {visibleMetrics.slice(1).map(([label], i) => (
                                <div key={label} style={{
                                    position: 'absolute', top: (i + 1) * panelPx,
                                    left: 6, right: 18, height: 1, backgroundColor: '#0001',
                                }} />
                            ))}
                        </div>
                        {/* Metric name labels */}
                        <div style={{ position: 'absolute', top: OC_MARGIN_TOP, left: 0, width: ML, pointerEvents: 'none' }}>
                            {visibleMetrics.map(([label, { unit }], i) => (
                                <div key={label} style={{
                                    position: 'absolute', top: i * panelPx, height: panelPx,
                                    left: 0, width: ML - 10,
                                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                    paddingLeft: 6, paddingRight: 4, boxSizing: 'border-box',
                                }}>
                                    <span style={{
                                        fontSize: 13, fontWeight: 600, textAlign: 'left', lineHeight: 1.2,
                                        color: COLORS[metrics.findIndex(([l]) => l === label) % COLORS.length],
                                        // color: '#666'
                                    }}>
                                        {(() => { const t = unit ? `${label} (${unit})` : label; return t.length > 50 ? t.slice(0, 49) + '…' : t; })()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
            </div>

            {/* SVG connector: links selected treatment bar to outcome plot band */}
            <svg ref={connectorSvgRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', visibility: 'hidden' }}>
                <path ref={connectorFillRef} fill="#00a2ff12" />
                <path ref={connectorLeftRef}  fill="none" stroke="#007fc866" strokeWidth="0.5" />
                <path ref={connectorRightRef} fill="none" stroke="#007fc866" strokeWidth="0.5" />
            </svg>

            </div>{/* end crosshair-sync wrapper */}
        </div>
    );
}
