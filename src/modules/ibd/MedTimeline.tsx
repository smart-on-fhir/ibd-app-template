/**
 * IBD Screen — Treatment Trajectories (medication Gantt)
 * Shows biologic and steroid transitions before and after the index treatment.
 *
 * Present patient: derived from FHIR MedicationRequest resources via getMedHistory().
 * Historical cohort: medication_history from mockCohort.json (one row per episode).
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import HighchartsReact                           from 'highcharts-react-official';
import Highcharts                                from '../../highcharts';
import { usePatientContext }                     from '../../contexts/PatientContext';
import { getMedHistory }                         from './utils';
import { IBD_MED_CLASS_COLORS }                  from './config';
import cohortData                                from './mockCohort.json';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_H          = 22;   // px per Gantt row
const MARGIN_L       = 200;  // px for y-axis labels
const PATIENT_HEADER = '▼ Present patient';
const COHORT_HEADER  = '▼ Matched cohort';

interface MedBar {
    drug:       string;
    drug_class: string;
    start_day:  number;
    end_day:    number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MedTimeline() {
    const { selectedPatientResources } = usePatientContext();

    const chartRef     = useRef<HighchartsReact.RefObject>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [chartHeight, setChartHeight] = useState(500);

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

    // Day 0 = start of the most recent biologic (the index treatment for this patient)
    const day0Ms = useMemo(() => {
        const biologics = patientMeds.filter(m => m.class === 'biologic');
        return biologics.length ? Math.max(...biologics.map(m => m.startMs)) : null;
    }, [patientMeds]);

    // ── Build chart rows + data ───────────────────────────────────────────────

    const { categories, seriesData, cohortHeaderRow } = useMemo(() => {
        const categories: string[] = [];
        const seriesData: Highcharts.XrangePointOptionsObject[] = [];

        // ── Patient section ────────────────────────────────────────────────────
        categories.push(PATIENT_HEADER);   // row 0 — styled header, no bars

        // ── Patient rows ──────────────────────────────────────────────────────
        if (day0Ms !== null && patientMeds.length > 0) {
            // Deduplicate by name while preserving chronological order
            const seen = new Set<string>();
            const uniqueNames: string[] = [];
            for (const m of patientMeds) {
                if (!seen.has(m.name)) { seen.add(m.name); uniqueNames.push(m.name); }
            }

            uniqueNames.forEach(name => {
                const rowIdx = categories.length;
                categories.push(name);
                patientMeds
                    .filter(m => m.name === name)
                    .forEach(m => {
                        seriesData.push({
                            x:      (m.startMs - day0Ms) / 864e5,
                            x2:     (m.endMs   - day0Ms) / 864e5,
                            y:      rowIdx,
                            color:  IBD_MED_CLASS_COLORS[m.class] ?? IBD_MED_CLASS_COLORS.other,
                            name:   m.name,
                            custom: {
                                class:        m.class,
                                status:       m.status,
                                durationDays: m.durationDays,
                                endIsExact:   m.endIsExact,
                            },
                        });
                    });
            });
        } else {
            categories.push('(no FHIR med data)');
        }

        // ── Spacer + cohort header ────────────────────────────────────────────
        categories.push('');
        const cohortHeaderRow = categories.length;
        categories.push(COHORT_HEADER);    // styled header, no bars

        // ── Cohort episode rows ───────────────────────────────────────────────
        cohortData.episodes.forEach(ep => {
            const rowIdx = categories.length;
            categories.push(`${ep.episode_id}  ${ep.outcome}`);
            (ep.medication_history as MedBar[]).forEach(m => {
                seriesData.push({
                    x:      m.start_day,
                    x2:     m.end_day,
                    y:      rowIdx,
                    color:  IBD_MED_CLASS_COLORS[m.drug_class] ?? IBD_MED_CLASS_COLORS.other,
                    name:   m.drug,
                    custom: { class: m.drug_class },
                });
            });
        });

        return { categories, seriesData, cohortHeaderRow };
    }, [patientMeds, day0Ms]);

    // ── Chart options ─────────────────────────────────────────────────────────

    useEffect(() => {
        setChartHeight(categories.length * ROW_H + 60);
    }, [categories.length]);

    const options: Highcharts.Options = {
        chart: {
            type:            'xrange',
            animation:       false,
            backgroundColor: 'transparent',
            style:           { fontFamily: 'inherit' },
            height:          chartHeight,
            marginLeft:      MARGIN_L,
            zooming:         { type: 'x' },
            panning:         { enabled: true, type: 'x' },
            panKey:          'shift',
        },
        title:   { text: undefined },
        credits: { enabled: false },
        legend:  { enabled: false },
        exporting: { enabled: false },
        xAxis: {
            title:         { text: 'Days from index treatment start', style: { fontSize: '0.8rem', fontWeight: '500' } },
            gridLineWidth: 1,
            labels:        { style: { fontSize: '0.65rem' } },
            lineColor: '#CCCCCC',
            tickColor: '#CCCCCC',
            plotLines: [{
                value:     0,
                color:     '#C00',
                width:     2,
                zIndex:    5,
                label:     { text: 'Day 0', style: { fontWeight: 'bold', fontSize: '0.62rem', color: '#C00', textShadow: '0 0 2px #fff' }, y: 14, useHTML: true, rotation: 0 },
            }],
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
            plotBands: [
                {
                    from:  -0.5,
                    to:    cohortHeaderRow - 1.5,   // covers PATIENT_HEADER + drug rows
                    color: 'rgba(13, 110, 253, 0.05)',
                },
                {
                    from:  cohortHeaderRow - 0.5,   // covers COHORT_HEADER + episode rows
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
            borderRadius: 3,
            borderWidth:  0,
            dataLabels: {
                enabled:  true,
                inside:   true,
                overflow: 'allow' as any,
                crop:     false,
                style: { fontSize: '0.58rem', fontWeight: 'normal', textOutline: 'none' },
                color:    '#fff',
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
                                background: color, display: 'inline-block', flexShrink: 0,
                            }} />
                            {cls.charAt(0).toUpperCase() + cls.slice(1)}
                        </span>
                    ))}
                <span className="text-muted ms-2" style={{ fontSize: '0.68rem' }}>
                    Dashed end = estimated duration
                </span>
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
