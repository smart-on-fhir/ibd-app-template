/**
 * IBD Screen — Treatment Trajectories (medication Gantt)
 * Shows biologic and steroid transitions before and after the index treatment.
 *
 * Present patient: cohortData.present_patient.medication_history (day-aligned by CDS backend).
 * Historical cohort: medication_history from the cohort API response (one row per episode).
 */

import { useMemo, useRef, useEffect, useState }  from 'react';
import HighchartsReact                           from 'highcharts-react-official';
import Highcharts                                from '../../highcharts';
import { IBD_MED_CLASS_COLORS }                  from './config';
import { useCohortData }                         from './useCohortData';
import type { DrugClass }                        from '../../api/ibd/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_H          = 32;   // px per Gantt row
const MARGIN_L       = 250;  // px for y-axis labels
const PATIENT_HEADER = '▼ Present patient';
const COHORT_HEADER  = '▼ Matched cohort';

interface MedBar {
    drug:       string;
    drug_class: DrugClass;
    start_day:  number;
    end_day:    number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function medianOf(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Lane-splitting ────────────────────────────────────────────────────────────

/**
 * Greedy bin-packing: distribute bars into the minimum number of non-overlapping
 * lanes. Items are sorted by start; each bar goes into the first lane where it
 * fits (i.e. starts at or after that lane's current end).
 */
function splitIntoLanes<T extends { start: number; end: number }>(items: T[]): T[][] {
    const lanes: T[][] = [];
    const laneEnds: number[] = [];
    for (const item of [...items].sort((a, b) => a.start - b.start)) {
        const i = laneEnds.findIndex(e => item.start >= e);
        if (i >= 0) { lanes[i].push(item); laneEnds[i] = item.end; }
        else         { lanes.push([item]);  laneEnds.push(item.end); }
    }
    return lanes;
}

// Transparent-left → coloured-right gradient for a hex drug-class colour.
// alpha controls the opacity at the right (solid) end.
function fadeLeft(hex: string, alpha = 0.75): Highcharts.GradientColorObject {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return {
        linearGradient: { x1: 0, y1: 0, x2: 1, y2: 0 },
        stops: [[0, `rgba(${r},${g},${b},0.2)`], [1, `rgba(${r},${g},${b},${alpha})`]],
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MedTimeline() {
    const { data: cohortData, loading, error } = useCohortData();
    const chartRef                      = useRef<HighchartsReact.RefObject>(null);
    const containerRef                  = useRef<HTMLDivElement>(null);
    const [chartHeight,      setChartHeight]      = useState(520);
    const [showFullHistory,  setShowFullHistory]  = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => chartRef.current?.chart.reflow());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Present patient medication history from the cohort API response (day-aligned to Day 0)
    const presentPatientMeds = useMemo(
        () => ((cohortData as any)?.present_patient?.medication_history ?? []) as MedBar[],
        [cohortData],
    );

    // ── Build chart rows + data ───────────────────────────────────────────────

    const { categories, seriesData, cohortHeaderRow } = useMemo(() => {
        const categories: string[] = [];
        const seriesData: Highcharts.XrangePointOptionsObject[] = [];

        // ── Patient section ────────────────────────────────────────────────────
        categories.push(PATIENT_HEADER);   // row 0 — styled header, no bars

        // ── Patient rows ──────────────────────────────────────────────────────
        if (presentPatientMeds.length > 0) {
            const uniqueDrugs = [...new Set(presentPatientMeds.map(m => m.drug))];
            uniqueDrugs.forEach(drug => {
                const bars = presentPatientMeds
                    .filter(m => m.drug === drug)
                    .map(m => ({ start: m.start_day, end: m.end_day, bar: m }));
                splitIntoLanes(bars).forEach((lane, laneIdx) => {
                    const rowIdx = categories.length;
                    categories.push(laneIdx === 0 ? drug : '');
                    lane.forEach(({ start, end, bar: m }) => {
                        seriesData.push({
                            x:      start,
                            x2:     end,
                            y:      rowIdx,
                            color:  fadeLeft(IBD_MED_CLASS_COLORS[m.drug_class] ?? IBD_MED_CLASS_COLORS.other, end <= 0 ? 0.3 : 0.75),
                            name:   m.drug,
                            custom: { class: m.drug_class },
                        });
                    });
                });
            });
        } else {
            categories.push('(no medication history)');
        }

        // ── Spacer + cohort header ───────────────────────────────────────────
        const episodes    = ((cohortData as any)?.episodes ?? []) as any[];
        const hasEpisodes = (cohortData as any)?.data_tier === 'episode' && episodes.length > 0;
        const dists       = ((cohortData as any)?.treatment_distributions ?? []) as Array<{
            treatment: string; label: string; n: number; sfr_12m_rate: number;
        }>;

        categories.push('');
        const cohortHeaderRow = categories.length;

        if (hasEpisodes) {
            categories.push(COHORT_HEADER);

            // One row per treatment group — single bar spanning median episode window
            const groups = new Map<string, any[]>();
            for (const ep of episodes) {
                if (!groups.has(ep.treatment)) groups.set(ep.treatment, []);
                groups.get(ep.treatment)!.push(ep);
            }

            for (const [treatment, eps] of groups) {
                const dist  = dists.find(d => d.treatment === treatment);
                const label = dist?.label ?? treatment;
                const sfr   = dist ? Math.round(dist.sfr_12m_rate * 100) : null;

                // Per-episode full window: earliest drug start → latest drug end
                const epStarts = eps.map((ep: any) =>
                    Math.min(...(ep.medication_history as MedBar[]).map(m => m.start_day)));
                const epEnds   = eps.map((ep: any) =>
                    Math.max(...(ep.medication_history as MedBar[]).map(m => m.end_day)));

                const medStart = Math.round(medianOf(epStarts));
                const medEnd   = Math.round(medianOf(epEnds));

                // Mode drug class among index-period meds (start_day ≥ 0) across all episodes
                const classCounts = new Map<string, number>();
                for (const ep of eps)
                    for (const m of ep.medication_history as MedBar[])
                        if (m.start_day >= 0)
                            classCounts.set(m.drug_class, (classCounts.get(m.drug_class) ?? 0) + 1);
                const drugClass = [...classCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';

                const rowIdx = categories.length;
                categories.push(`${label}${sfr !== null ? `  ·  ${sfr}% SFR` : ''}  (n=${eps.length})`);
                seriesData.push({
                    x:      medStart,
                    x2:     medEnd,
                    y:      rowIdx,
                    color:  fadeLeft(IBD_MED_CLASS_COLORS[drugClass] ?? IBD_MED_CLASS_COLORS.other),
                    name:   label,
                    custom: { class: drugClass, n: eps.length, medStart, medEnd },
                });
            }
        }

        return { categories, seriesData, cohortHeaderRow };
    }, [presentPatientMeds, cohortData]);

    // ── Chart options ─────────────────────────────────────────────────────────

    useEffect(() => {
        setChartHeight(categories.length * ROW_H + 60);
    }, [categories.length]);

    // SFR expectation annotations derived from treatment_distributions
    const sfrAnnotations = useMemo(() => {
        const dists = (cohortData as any)?.treatment_distributions as Array<{
            label: string; sfr_12m_rate: number; median_days_to_sfr: number; iqr: [number, number];
        }> | undefined;
        if (!dists?.length) return { plotLines: [] as Highcharts.XAxisPlotLinesOptions[], plotBands: [] as Highcharts.XAxisPlotBandsOptions[] };

        const maxSFR  = Math.max(...dists.map(d => d.sfr_12m_rate));
        const palette = ['#198754', '#0d6efd', '#6f42c1', '#fd7e14'];

        const sorted = [...dists].sort((a, b) => a.median_days_to_sfr - b.median_days_to_sfr);
        const n = sorted.length;

        const plotLines: Highcharts.XAxisPlotLinesOptions[] = sorted.map((d, i) => ({
            value:     d.median_days_to_sfr,
            color:     palette[i % palette.length],
            width:     1,
            dashStyle: 'ShortDash',
            zIndex:    4,
            label: {
                text:     `${d.label} ${Math.round(d.sfr_12m_rate * 100)}% SFR ●`,
                style:    {
                    fontSize: '0.65rem', color: palette[i % palette.length],
                    fontWeight: '600',
                    textShadow: '0 0 3px #fff',
                    background: '#FFFC'
                },
                rotation: 0,
                align:    'right',
                y: -(6 + (n - 1 - i) * 20),  // smallest x → top, largest x → bottom
                x: 5,
                useHTML: true
            },
        }));

        // IQR band only for best-SFR treatment
        const plotBands: Highcharts.XAxisPlotBandsOptions[] = dists
            .filter(d => d.sfr_12m_rate === maxSFR)
            .map(d => ({
                from:  d.iqr[0],
                to:    d.iqr[1],
                color: '#19875412',
                zIndex: 2,
                borderWidth: 1,
                borderColor: '#19875444',
            }));

        return { plotLines, plotBands };
    }, [cohortData]);

    // Keep a ref so the chart render event always sees the latest annotations
    const sfrAnnotationsRef = useRef(sfrAnnotations);
    sfrAnnotationsRef.current = sfrAnnotations;

    // Choose time unit based on data span so labels don't crowd on long timelines
    const xUnit = useMemo(() => {
        const allX = seriesData.flatMap(d => [d.x ?? 0, d.x2 ?? 0]);
        const span = allX.length ? Math.max(...allX) - Math.min(...allX) : 0;
        if (span > 730) return { label: 'Months', interval: 30  };
        if (span > 90)  return { label: 'Weeks',  interval: 14  };
        return               { label: 'Days',   interval: undefined as number | undefined };
    }, [seriesData]);

    if (loading) return (
        <div className="d-flex align-items-center justify-content-center text-muted py-5">
            <span className="spinner-border spinner-border-sm me-2" />
            Loading cohort data…
        </div>
    );
    if (error) return (
        <div className="alert alert-danger m-3" style={{ fontSize: '0.85rem' }}>
            <i className="bi bi-exclamation-triangle me-2" />
            {error.message}
        </div>
    );

    const hasEpisodes = (cohortData as any)?.data_tier === 'episode';

    // Mirror the post-day-0 extent on the left so day 0 stays centred by default.
    // Include SFR plotLine positions so annotations near the right edge stay visible.
    const maxPostDay0 = Math.max(
        0,
        ...seriesData.map(d => d.x2 ?? 0),
        ...sfrAnnotations.plotLines.map(pl => pl.value as number),
        ...sfrAnnotations.plotBands.map(pb => pb.to as number),
    );
    const padding    = Math.round(maxPostDay0 * 0.12);
    const focusedMin = -(maxPostDay0 + padding);
    const focusedMax =   maxPostDay0 + padding;

    const options: Highcharts.Options = {
        chart: {
            type:                'xrange',
            animation:           false,
            backgroundColor:     'transparent',
            plotBackgroundColor: '#F8F8F8',
            plotBorderWidth: 1,
            style:           { fontFamily: 'inherit' },
            height:          hasEpisodes ? chartHeight + 72 : chartHeight + 72,
            marginLeft:      MARGIN_L,
            marginTop:       80,   // headroom for staggered SFR labels above plot
            marginBottom:    60,   // footroom for x-axis labels
            zooming:         { type: 'x' },
            panning:         { enabled: true, type: 'x' },
            panKey:          'shift',
            events: {
                render(this: Highcharts.Chart) {
                    const chart  = this;
                    const annotations = sfrAnnotationsRef.current;
                    const exts        = (chart as any)._sfrExts as Highcharts.SVGElement[] | undefined;
                    exts?.forEach(el => el.destroy());
                    const n = annotations.plotLines.length;
                    (chart as any)._sfrExts = annotations.plotLines.map((pl, i) => {
                        const xPx = chart.xAxis[0].toPixels(pl.value as number, false);
                        const h   = 6 + (n - 1 - i) * 20;   // mirrors label y: smallest x → tallest
                        return chart.renderer
                            .path(['M', xPx, chart.plotTop -2, 'L', xPx, chart.plotTop - h] as any)
                            .attr({
                                stroke: pl.color as string,
                                'stroke-width': 1,
                                'stroke-dasharray': '3,1',
                                'image-rendering': 'crisp-edges',
                                zIndex: 4
                            })
                            .add();
                    });
                },
            },
        },
        title:   { text: undefined },
        credits: { enabled: false },
        legend:  { enabled: false },
        exporting: { enabled: false },
        xAxis: {
            min:           showFullHistory ? undefined : focusedMin,
            max:           showFullHistory ? undefined : focusedMax,
            title:         { text: 'Time from index treatment', style: { fontSize: '0.9rem', fontWeight: '500' }, offset: 0, rotation: 0, y: 40 },
            gridLineWidth: 0,
            labels:        {
                style: { fontSize: '0.65rem' },
                formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
                    const days = this.value as number;
                    if (days === 0) return '0';
                    const sign = days < 0 ? '\u2212' : '';
                    const abs  = Math.abs(days);
                    if (xUnit.label === 'Months') {
                        const mo = Math.round(abs / 30);
                        return mo >= 12 && mo % 12 === 0
                            ? `${sign}${mo / 12} yr`
                            : `${sign}${mo} mo`;
                    }
                    if (xUnit.label === 'Weeks') return `${sign}${Math.round(abs / 7)} wk`;
                    return `${sign}${abs} d`;
                },
            },
            tickInterval: xUnit.interval,
            lineColor: '#CCCCCC',
            tickColor: '#CCCCCC',
            lineWidth: 0,
            plotLines: [
                {
                    value:  0,
                    color:  '#C00',
                    width:  2,
                    zIndex: 5,
                    label:  { text: 'Day 0', style: { fontWeight: 'bold', fontSize: '0.62rem', color: '#C00', textShadow: '0 0 2px #fff' } },
                },
                ...sfrAnnotations.plotLines,
            ],
            plotBands: sfrAnnotations.plotBands,
        },

        yAxis: {
            title:         { text: undefined },
            categories,
            reversed:      true,
            gridLineWidth: 0,
            gridLineColor: '#e9ecef',
            lineWidth: 0,
            labels: {
                useHTML: true,
                step:    1,
                formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
                    const v = String(this.value);
                    if (v === PATIENT_HEADER)
                        return `<span style="color:#0d6efd;font-size:0.75rem;font-weight:700;letter-spacing:0.03em;text-transform:uppercase">${v}</span>`;
                    if (v === COHORT_HEADER)
                        return `<span style="color:#F60;font-size:0.75rem;font-weight:700;letter-spacing:0.03em;text-transform:uppercase">${v}</span>`;
                    return `<span style="font-size:0.75rem">${v}</span>`;
                },
            },
            plotLines: hasEpisodes ? [
                {
                    value:     cohortHeaderRow - 1,
                    color:     '#CCCCCC',
                    width:     1,
                    zIndex:    1,
                    dashStyle: 'LongDash',
                },
            ] : [],
            plotBands: [
                // {
                //     from:  -1,
                //     to:    0.5,
                //     color: '#FFFFFF',
                //     zIndex: 1,
                // },
                // {
                //     from:  0.5, // skip PATIENT_HEADER row
                //     to:    cohortHeaderRow - 1.5,
                //     color: 'rgba(0, 100, 255, 0.06)',
                // },
                // {
                //     from:  cohortHeaderRow - 1.5,
                //     to:    cohortHeaderRow + 0.5,
                //     color: '#FFFFFF',
                //     zIndex: 1,
                // },
                // {
                //     from:  cohortHeaderRow + 0.5, // skip COHORT_HEADER row
                //     to:    categories.length - 0.5,
                //     color: 'rgba(108, 117, 125, 0.04)',
                // },
            ],
        },

        tooltip: {
            outside:   true,
            useHTML:   true,
            style:     { fontSize: '0.72rem' },
            formatter(this: any) {
                const p   = this.point as any;
                const x1  = Math.round(p.x);
                const x2  = Math.round(p.x2);
                const dur  = x2 - x1;
                const cls  = p.custom?.class ?? '';
                const n    = p.custom?.n as number | undefined;
                const est  = p.custom?.endIsExact === false ? ' <span style="color:#6c757d">(estimated)</span>' : '';
                const nStr = n !== undefined ? `<br/><span style="color:#6c757d">across ${n} episodes — median timing</span>` : '';
                return `<b>${p.name}</b>${cls ? `<br/><span style="color:#6c757d">${cls}</span>` : ''}`
                     + `<br/>Day ${x1} → ${x2} &nbsp;·&nbsp; ${dur}d${est}${nStr}`;
            },
        },

        series: [{
            type:        'xrange',
            data:        seriesData,
            pointWidth:  ROW_H - 10,
            minPointLength: 4,
            borderRadius: 3,
            borderWidth:  0.5,
            borderColor:  '#00000044',
            dataLabels: {
                enabled:  true,
                inside:   true,
                overflow: 'justify',
                crop:     true,
                color:    '#000000',
                style: {
                    fontSize:    '0.68rem',
                    fontWeight:  '600',
                    textOutline: '1px #FFF8',
                },
                formatter(this: any) {
                    const p = this.point as any;
                    const w = (p.x2 - p.x) as number;
                    return w >= 20 ? p.name : '';     // suppress label on very narrow bars
                },
            },
        } as Highcharts.SeriesXrangeOptions],
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="container-fluid" style={{ minWidth: 0 }}>

            <div className="d-flex align-items-baseline justify-content-between mb-2">
                <div className="d-flex align-items-baseline gap-3">
                    <h5 className="mb-0">Treatment Trajectories</h5>
                    <span className="text-muted small">
                        Biologic &amp; steroid transitions — present patient vs. matched cohort
                    </span>
                </div>
                <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                        const next = !showFullHistory;
                        setShowFullHistory(next);
                        chartRef.current?.chart.xAxis[0].setExtremes(
                            next ? undefined : focusedMin,
                            next ? undefined : focusedMax,
                        );
                    }}
                >
                    {showFullHistory ? 'Focus on treatment period' : 'Show full history'}
                </button>
            </div>

            {/* Drug class legend */}
            <div className="d-flex gap-3 mb-3 flex-wrap">
                {Object.entries(IBD_MED_CLASS_COLORS)
                    .filter(([k]) => k !== 'other')
                    .map(([cls, color]) => (
                        <span key={cls} className="d-flex align-items-center gap-1" style={{ fontSize: '0.7rem' }}>
                            <span style={{
                                width: 10, height: 10, borderRadius: 2,
                                background: color + '66', display: 'inline-block', flexShrink: 0,
                                border: '1px solid ' + color
                            }} />
                            {cls.charAt(0).toUpperCase() + cls.slice(1)}
                        </span>
                    ))}
            </div>

            {!presentPatientMeds.length && (
                <div className="alert alert-warning py-1 px-2 mb-2" style={{ fontSize: '0.72rem' }}>
                    No medication history available for the present patient.
                </div>
            )}

            <div className="card">
                <div className="card-body px-2 py-3">
                    <div ref={containerRef}>
                        <HighchartsReact
                            ref={chartRef}
                            highcharts={Highcharts}
                            options={options}
                            containerProps={{ style: { width: '100%' } }}
                        />
                    </div>
                </div>
            </div>

            <div className="mt-3 px-1 text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
                <p className="mb-2">
                    The <strong>present patient</strong> section shows the biologic and steroid history
                    retrieved from the EHR, aligned so that Day&nbsp;0 marks the start of the current
                    index treatment. Bars fade toward the left to indicate pre-treatment history.
                    The <strong>matched cohort</strong> section (if available) summarizes each candidate treatment
                    as a single bar spanning the median episode window across all similar historical
                    patients, colored by drug class. The dashed vertical lines and labels above the
                    chart mark the median time to steroid-free remission (SFR) for each treatment option.
                </p>
                <p className="mb-0">
                    Use the scroll wheel to zoom; hold <strong>Shift</strong> and drag to pan when zoomed in.
                    {' '}<strong>Show full history</strong> removes the default time window and reveals
                    all available medication history before the index treatment.
                    Hover over any bar for exact day ranges and episode counts.
                </p>
            </div>
        </div>
    );
}
