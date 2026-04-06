/**
 * IBD Screen — Treatment Trajectories (medication Gantt)
 * Shows biologic and steroid transitions before and after the index treatment.
 *
 * Present patient: derived from FHIR MedicationRequest resources via getMedHistory().
 * Historical cohort: medication_history from mockCohort.json (one row per episode).
 */

import { useMemo, useRef, useEffect, useState }  from 'react';
import HighchartsReact                           from 'highcharts-react-official';
import Highcharts                                from '../../highcharts';
import { usePatientContext }                     from '../../contexts/PatientContext';
import { getMedHistory, normalizeMedName }       from './utils';
import { IBD_MED_CLASS_COLORS }                  from './config';
import { useCohortData }                         from './useCohortData';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_H          = 22;   // px per Gantt row
const MARGIN_L       = 170;  // px for y-axis labels
const PATIENT_HEADER = '▼ Present patient';
const COHORT_HEADER  = '▼ Matched cohort';

interface MedBar {
    drug:       string;
    drug_class: string;
    start_day:  number;
    end_day:    number;
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function MedTimeline() {
    const cohortData                    = useCohortData();
    const { selectedPatientResources }  = usePatientContext();
    const chartRef                      = useRef<HighchartsReact.RefObject>(null);
    const containerRef                  = useRef<HTMLDivElement>(null);
    const [chartHeight, setChartHeight] = useState(520);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => chartRef.current?.chart.reflow());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Present patient medication history ────────────────────────────────────

    const patientMeds = useMemo(
        () => getMedHistory(selectedPatientResources),
        [selectedPatientResources],
    );

    // Day 0 = first prescription of the current index biologic.
    // Strategy: prefer the most recently initiated biologic that is still active
    // (status === 'active' or endMs in the future). If none are active — patient
    // is between therapies — fall back to the most recently initiated regardless
    // of status, so the chart still anchors on the last known treatment.
    //
    // In both passes we group by normalised drug name and take the earliest
    // startMs per name (ignoring renewals/refills), then pick the latest start.
    const day0Ms = useMemo(() => {
        const biologics = patientMeds.filter(m => m.class === 'biologic');
        if (!biologics.length) return null;

        const now = Date.now();
        const isActive = (m: typeof biologics[number]) =>
            m.status === 'active' || m.endMs > now;

        function latestFirstStart(subset: typeof biologics): number | null {
            if (!subset.length) return null;
            const firstStartByName = new Map<string, number>();
            for (const m of subset) {
                const key  = normalizeMedName(m.name);
                const prev = firstStartByName.get(key);
                if (prev === undefined || m.startMs < prev) firstStartByName.set(key, m.startMs);
            }
            return Math.max(...firstStartByName.values());
        }

        return latestFirstStart(biologics.filter(isActive)) ?? latestFirstStart(biologics);
    }, [patientMeds]);

    // ── Build chart rows + data ───────────────────────────────────────────────

    const { categories, seriesData, cohortHeaderRow } = useMemo(() => {
        const categories: string[] = [];
        const seriesData: Highcharts.XrangePointOptionsObject[] = [];

        // ── Patient section ────────────────────────────────────────────────────
        categories.push(PATIENT_HEADER);   // row 0 — styled header, no bars

        // ── Patient rows ──────────────────────────────────────────────────────
        if (day0Ms !== null && patientMeds.length > 0) {
            // Deduplicate by normalised name (groups originator + brand variants together), preserving chronological order
            const seen = new Set<string>();
            const uniqueNormNames: string[] = [];
            for (const m of patientMeds) {
                const norm = normalizeMedName(m.name);
                if (!seen.has(norm)) { seen.add(norm); uniqueNormNames.push(norm); }
            }

            uniqueNormNames.forEach(normName => {
                const bars = patientMeds
                    .filter(m => normalizeMedName(m.name) === normName)
                    .map(m => ({
                        start: (m.startMs - day0Ms) / 864e5,
                        end:   (m.endMs   - day0Ms) / 864e5,
                        med:   m,
                    }));
                splitIntoLanes(bars).forEach((lane, laneIdx) => {
                    const rowIdx = categories.length;
                    categories.push(laneIdx === 0 ? normName : '');
                    lane.forEach(({ start, end, med: m }) => {
                        seriesData.push({
                            x:      start,
                            x2:     end,
                            y:      rowIdx,
                            color:  (IBD_MED_CLASS_COLORS[m.class] ?? IBD_MED_CLASS_COLORS.other) + (end <= 0 ? '44' : '88'),
                            name:   normName,
                            custom: {
                                fullName:     m.name,
                                class:        m.class,
                                status:       m.status,
                                durationDays: m.durationDays,
                                endIsExact:   m.endIsExact,
                            },
                        });
                    });
                });
            });
        } else {
            categories.push('(no FHIR med data)');
        }

        // ── Spacer + cohort header ───────────────────────────────────────────
        const hasEpisodes = (cohortData as any).data_tier === 'episode';
        categories.push('');
        const cohortHeaderRow = categories.length;

        if (hasEpisodes) {
            categories.push(COHORT_HEADER);    // styled header, no bars

            // ── Cohort episode rows (lane-split to avoid overlaps) ───────────
            cohortData.episodes.forEach(ep => {
                const bars = (ep.medication_history as MedBar[]).map(m => ({
                    start: m.start_day,
                    end:   m.end_day,
                    bar:   m,
                }));
                splitIntoLanes(bars).forEach((lane, laneIdx) => {
                    const rowIdx = categories.length;
                    categories.push(laneIdx === 0 ? `${ep.episode_id}  ${ep.outcome}` : '');
                    lane.forEach(({ bar: m }) => {
                        seriesData.push({
                            x:      m.start_day,
                            x2:     m.end_day,
                            y:      rowIdx,
                            color:  (IBD_MED_CLASS_COLORS[m.drug_class] ?? IBD_MED_CLASS_COLORS.other) + (m.end_day <= 0 ? '33' : '66'),
                            name:   m.drug,
                            custom: { class: m.drug_class },
                        });
                    });
                });
            });
        }

        return { categories, seriesData, cohortHeaderRow };
    }, [patientMeds, day0Ms, cohortData]);

    // ── Chart options ─────────────────────────────────────────────────────────

    useEffect(() => {
        setChartHeight(categories.length * ROW_H + 60);
    }, [categories.length]);

    // SFR expectation annotations derived from treatment_distributions
    const sfrAnnotations = useMemo(() => {
        const dists = (cohortData as any).treatment_distributions as Array<{
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
            dashStyle: 'Dash',
            zIndex:    4,
            label: {
                text:     `● ${d.label} ${Math.round(d.sfr_12m_rate * 100)}% SFR`,
                style:    {
                    fontSize: '0.57rem', color: palette[i % palette.length],
                    fontWeight: '600',
                    textShadow: '0 0 3px #fff',
                    background: '#FFF8'
                },
                rotation: 0,
                y: -(6 + (n - 1 - i) * 16),  // smallest x → top, largest x → bottom
                x: -4.85,
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

    const hasEpisodes = (cohortData as any).data_tier === 'episode';
    const options: Highcharts.Options = {
        chart: {
            type:                'xrange',
            animation:           false,
            backgroundColor:     'transparent',
            plotBackgroundColor: '#ffffff',
            style:           { fontFamily: 'inherit' },
            height:          hasEpisodes ? chartHeight : chartHeight + 72,
            marginLeft:      MARGIN_L,
            marginTop:       72,   // headroom for staggered SFR labels above plot
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
                        const h   = 6 + (n - 1 - i) * 16;   // mirrors label y: smallest x → tallest
                        return chart.renderer
                            .path(['M', xPx, chart.plotTop -2, 'L', xPx, chart.plotTop - h] as any)
                            .attr({
                                stroke: pl.color as string,
                                'stroke-width': 1,
                                'stroke-dasharray': '4,2',
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
            title:         { text: 'Time from index treatment', style: { fontSize: '0.8rem', fontWeight: '500' } },
            gridLineWidth: 1,
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
            plotLines: [
                {
                    value:  0,
                    color:  '#C00',
                    width:  2,
                    zIndex: 5,
                    label:  { text: 'Day 0', style: { fontWeight: 'bold', fontSize: '0.62rem', color: '#C00', textShadow: '0 0 2px #fff' }, y: 14, useHTML: true, rotation: 0 },
                },
                ...sfrAnnotations.plotLines,
            ],
            plotBands: sfrAnnotations.plotBands,
        },

        yAxis: {
            title:         { text: undefined },
            categories,
            reversed:      true,
            gridLineWidth: 1,
            gridLineColor: '#e9ecef',
            labels: {
                useHTML:   true,
                step:      1,
                formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
                    const v = String(this.value);
                    if (v === PATIENT_HEADER)
                        return `<span style="color:#0d6efd;font-size:0.62rem;font-weight:700;letter-spacing:0.03em;text-transform:uppercase">${v}</span>`;
                    if (v === COHORT_HEADER)
                        return `<span style="color:#F60;font-size:0.62rem;font-weight:700;letter-spacing:0.03em;text-transform:uppercase">${v}</span>`;
                    return `<span style="font-size:0.65rem">${v}</span>`;
                },
            },
            plotLines: hasEpisodes ? [
                {
                    value:     cohortHeaderRow - 0.5,
                    color:     '#FFFFFF',
                    width:     35,
                    zIndex:    1,
                },
            ] : [],
            plotBands: [
                {
                    from:  0.5, // skip PATIENT_HEADER row
                    to:    cohortHeaderRow - 1.5,
                    color: 'rgba(0, 100, 255, 0.06)',
                },
                {
                    from:  cohortHeaderRow + 0.5, // skip COHORT_HEADER row
                    to:    categories.length - 0.5,
                    color: 'rgba(108, 117, 125, 0.04)',
                },
            ],
        },

        tooltip: {
            outside:   true,
            useHTML:   true,
            style:     { fontSize: '0.72rem' },
            formatter(this: any) {
                const p  = this.point as any;
                const x1 = Math.round(p.x);
                const x2 = Math.round(p.x2);
                const dur = x2 - x1;
                const est = p.custom?.endIsExact === false ? ' <span class="text-muted">(estimated)</span>' : '';
                const cls = p.custom?.class ?? '';
                return `<b>${p.name}</b>${cls ? `<br/><span class="text-muted">${cls}</span>` : ''}`
                     + `<br/>Day ${x1} → ${x2} &nbsp;·&nbsp; ${dur}d${est}`;
            },
        },

        series: [{
            type:        'xrange',
            data:        seriesData,
            pointWidth:  ROW_H - 6,
            minPointLength: 4,
            borderRadius: 3,
            borderWidth:  0.5,
            dataLabels: {
                enabled:  true,
                inside:   true,
                overflow: 'justify',
                crop:     true,
                color:    '#000000',
                style: {
                    fontSize:    '0.58rem',
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

            <div className="d-flex align-items-baseline gap-3 mb-2">
                <h5 className="mb-0">Treatment Trajectories</h5>
                <span className="text-muted small">
                    Biologic &amp; steroid transitions — present patient vs. matched cohort
                </span>
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

            {!patientMeds.length && (
                <div className="alert alert-warning py-1 px-2 mb-2" style={{ fontSize: '0.72rem' }}>
                    No IBD medication history found in FHIR for the present patient.
                </div>
            )}

            <div className="card">
                <div className="card-body p-2">
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
        </div>
    );
}
