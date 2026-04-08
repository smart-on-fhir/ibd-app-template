/**
 * IBD Screen — Treatment Outcomes
 *
 * Two-pane chart sharing a datetime X axis:
 *   Top: medication Gantt (xrange, FHIR-derived real dates)
 *   Bottom: selected lab trendlines, normalised to % of upper/lower normal limit
 *
 * Click a medication bar → blue plotBand highlights that treatment period in
 * both panes simultaneously. Click again to deselect.
 *
 * Lab selector: dropdown with checkboxes; default = top-5 clinical labs.
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import HighchartsReact                          from 'highcharts-react-official';
import Highcharts                               from '../../highcharts';
import { usePatientContext }                    from '../../contexts/PatientContext';
import { getMedHistory, getLabHistory, normalizeMedName } from './utils';
import { IBD_MED_CLASS_COLORS }                 from './config';
import type { LabKey }                          from './config';

// ── Layout constants ───────────────────────────────────────────────────────────

const ROW_H    = 22;    // px per Gantt row
const MARGIN_L = 148;   // left margin — room for drug name labels
const LAB_H    = 322;   // fixed height of the lab pane (px)
const GAP      = 44;    // px gap between panes (includes space for "LAB TRENDS" label)

// ── Lab configuration ──────────────────────────────────────────────────────────

/** Top-5 labs shown by default. */
const DEFAULT_LABS: LabKey[] = ['CRP', 'Calprotectin', 'Albumin'];

/**
 * All labs available for selection, in clinical-importance order.
 * Weight / Height / BMI intentionally omitted — not disease-activity markers.
 */
const ALL_LAB_KEYS: LabKey[] = [
    'CRP', 'Calprotectin', 'ESR', 'Albumin', 'Hemoglobin',
    'PreAlbumin', 'PCT', 'Ferritin', 'VitaminD', 'VitaminB12',
    'WBC', 'Neutrophils', 'Lymphocytes', 'Platelets', 'ALT', 'AST',
];

/**
 * Per-lab normalizations: `limit` is the upper (or lower, if `inverted`) normal limit
 * in the most common FHIR unit for that lab.
 *
 *   inverted = false  →  % = (value / limit) × 100   (high is bad; 100 % = at limit)
 *   inverted = true   →  % = (limit / value) × 100   (low is bad; 100 % = at limit)
 *
 * In both cases: value < 100 % = within normal range, > 100 % = abnormal.
 */
const LAB_NORM: Partial<Record<LabKey, { limit: number; inverted: boolean; label: string }>> = {
    CRP:          { limit: 5,     inverted: false, label: 'CRP (mg/L)'       },
    ESR:          { limit: 20,    inverted: false, label: 'ESR (mm/h)'       },
    Calprotectin: { limit: 200,   inverted: false, label: 'Fcal (μg/g)'     },
    // Albumin: limit = lower normal (g/dL); inverted so depleted → >100 %
    Albumin:      { limit: 3.5,   inverted: true,  label: 'Albumin (g/dL)'  },
    Hemoglobin:   { limit: 12,    inverted: true,  label: 'Hgb (g/dL)'      },
    PreAlbumin:   { limit: 18,    inverted: true,  label: 'Pre-Alb (mg/dL)' },
    PCT:          { limit: 0.5,   inverted: false, label: 'PCT (ng/mL)'     },
    Ferritin:     { limit: 300,   inverted: false, label: 'Ferritin (ng/mL)'},
    VitaminD:     { limit: 20,    inverted: true,  label: 'Vit D (ng/mL)'   },
    VitaminB12:   { limit: 200,   inverted: true,  label: 'Vit B12 (pg/mL)' },
    WBC:          { limit: 11,    inverted: false, label: 'WBC (×10⁹/L)'    },
    Neutrophils:  { limit: 7.5,   inverted: false, label: 'Neut (×10⁹/L)'  },
    Lymphocytes:  { limit: 4.5,   inverted: false, label: 'Lymph (×10⁹/L)' },
    Platelets:    { limit: 400,   inverted: false, label: 'Plt (×10⁹/L)'   },
    ALT:          { limit: 40,    inverted: false, label: 'ALT (U/L)'       },
    AST:          { limit: 40,    inverted: false, label: 'AST (U/L)'       },
};

/** One distinct colour per lab key. */
const LAB_COLORS: Partial<Record<LabKey, string>> = {
    CRP:          '#dc3545',
    ESR:          '#fd7e14',
    Calprotectin: '#0d6efd',
    Albumin:      '#20c997',
    Hemoglobin:   '#6f42c1',
    PreAlbumin:   '#0dcaf0',
    PCT:          '#e07040',
    Ferritin:     '#d63384',
    VitaminD:     '#f7c948',
    VitaminB12:   '#a8a0e8',
    WBC:          '#198754',
    Neutrophils:  '#5ab08a',
    Lymphocytes:  '#6ea8fe',
    Platelets:    '#adb5bd',
    ALT:          '#6610f2',
    AST:          '#495057',
};

// ── Lane-splitting (greedy bin-pack) ───────────────────────────────────────────

function splitIntoLanes<T extends { start: number; end: number }>(items: T[]): T[][] {
    const result: T[][] = [];
    const laneEnds: number[] = [];
    for (const item of [...items].sort((a, b) => a.start - b.start)) {
        const i = laneEnds.findIndex(e => item.start >= e);
        if (i >= 0) {
            result[i].push(item);
            laneEnds[i] = item.end;
        } else {
            result.push([item]);
            laneEnds.push(item.end);
        }
    }
    return result;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OutcomeTimeline() {
    const { selectedPatientResources }  = usePatientContext();
    const chartRef                      = useRef<HighchartsReact.RefObject>(null);
    const containerRef                  = useRef<HTMLDivElement>(null);
    const dropdownRef                   = useRef<HTMLDivElement>(null);

    const [selectedLabs, setSelectedLabs] = useState<LabKey[]>(DEFAULT_LABS);
    const [selectedBand, setSelectedBand] = useState<{ from: number; to: number; name: string } | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropdownOpen) return;
        function handler(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
                setDropdownOpen(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dropdownOpen]);

    // Reflow on container resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => chartRef.current?.chart.reflow());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Medication Gantt data ─────────────────────────────────────────────────

    const meds = useMemo(() => getMedHistory(selectedPatientResources), [selectedPatientResources]);

    const { categories, ganttData } = useMemo(() => {
        const categories: string[] = [];
        const ganttData: Highcharts.XrangePointOptionsObject[] = [];

        const uniqueDrugs = [...new Set(meds.map(m => m.name))];
        uniqueDrugs.forEach(drug => {
            const bars = meds
                .filter(m => m.name === drug)
                .map(m => ({ start: m.startMs, end: m.endMs, med: m }));
            splitIntoLanes(bars).forEach((lane, laneIdx) => {
                const rowIdx = categories.length;
                categories.push(laneIdx === 0 ? normalizeMedName(drug) : '');
                lane.forEach(({ start, end, med }) => {
                    const opacity = med.status === 'active' ? 'CC' : '77';
                    ganttData.push({
                        x:      start,
                        x2:     end,
                        y:      rowIdx,
                        color:  (IBD_MED_CLASS_COLORS[med.class] ?? IBD_MED_CLASS_COLORS.other) + opacity,
                        name:   med.name,
                        custom: { cls: med.class, start, end },
                    });
                });
            });
        });

        return { categories, ganttData };
    }, [meds]);

    // ── Lab series (% of limit) ───────────────────────────────────────────────

    const labSeries = useMemo((): Highcharts.SeriesSplineOptions[] =>
        selectedLabs.flatMap(key => {
            const norm = LAB_NORM[key];
            if (!norm) return [];
            const pts  = getLabHistory(selectedPatientResources, key);
            if (!pts.length) return [];

            const data = pts.flatMap(p => {
                const pct = norm.inverted
                    ? (p.value > 0 ? (norm.limit / p.value) * 100 : null)
                    : (norm.limit > 0 ? (p.value / norm.limit) * 100 : null);
                if (pct === null) return [];
                // Store raw value in custom so the tooltip can show it
                return [{ x: p.date, y: Math.round(pct * 10) / 10, custom: { raw: p.value, unit: p.unit } }];
            });

            if (!data.length) return [];

            return [{
                type:      'spline' as const,
                name:      norm.label,
                yAxis:     1,
                color:     LAB_COLORS[key] ?? '#666',
                lineWidth: 2,
                marker:    { radius: 3, symbol: 'circle', lineWidth: 0 },
                data,
            }];
        }),
    [selectedLabs, selectedPatientResources]);

    // ── Chart layout geometry ─────────────────────────────────────────────────

    const numRows   = Math.max(categories.length, 1);
    const ganttH    = numRows * ROW_H + 50;
    const totalH    = ganttH + GAP + LAB_H;
    const pctOf     = (px: number) => `${Math.round(px / totalH * 100)}%`;
    const ganttHPct = pctOf(ganttH);
    const labTopPct = pctOf(ganttH + GAP);
    const labHPct   = pctOf(LAB_H);

    // ── Stable click-handler ref (so the series definition is memo-stable) ────

    const onBarClickRef = useRef<((from: number, to: number, name: string) => void) | undefined>(undefined);
    onBarClickRef.current = (from, to, name) =>
        setSelectedBand(prev => prev?.from === from && prev?.to === to ? null : { from, to, name });

    // ── Chart options ─────────────────────────────────────────────────────────

    const options = useMemo((): Highcharts.Options => ({
        chart: {
            animation:       false,
            backgroundColor: 'transparent',
            style:           { fontFamily: 'inherit' },
            height:          totalH,
            marginLeft:      MARGIN_L,
            marginTop:       28,   // headroom for "Patient Treatments" label
            marginBottom:    36,
            zooming:         { type: 'x' },
            panning:         { enabled: true, type: 'x' },
            panKey:          'shift',
            events: {
                render(this: Highcharts.Chart) {
                    const chart = this;
                    ((chart as any)._paneLabels as Highcharts.SVGElement[] | undefined)
                        ?.forEach(el => el.destroy());
                    const ga = chart.yAxis[0] as any;
                    const la = chart.yAxis[1] as any;
                    const style = {
                        fontSize: '0.62rem', fontWeight: '700',
                        color: '#6c757d', letterSpacing: '0.05em',
                    };
                    (chart as any)._paneLabels = [
                        chart.renderer.text('PATIENT TREATMENTS', chart.plotLeft, ga.top - 8).css(style).add(),
                        chart.renderer.text('LAB TRENDS',         chart.plotLeft, la.top - 8).css(style).add(),
                    ];
                },
            },
        },
        title:     { text: undefined },
        credits:   { enabled: false },
        exporting: { enabled: false },
        legend:    { enabled: false },
        xAxis: {
            type:      'datetime',
            lineColor: '#dee2e6',
            tickColor: '#dee2e6',
            labels:    { style: { fontSize: '0.65rem', color: '#6c757d' } },
            plotLines: [{
                value:  Date.now(),
                color:  '#adb5bd',
                width:  1,
                dashStyle: 'Dash',
                zIndex: 3,
                label:  { text: 'Today', style: { fontSize: '0.58rem', color: '#adb5bd' }, rotation: 0, y: -4 },
            }],
            plotBands: selectedBand ? [{
                from:        selectedBand.from,
                to:          selectedBand.to,
                color:       'rgba(13,110,253,0.07)',
                zIndex:      1,
                borderWidth: 1,
                borderColor: 'rgba(13,110,253,0.22)',
            }] : [],
        },
        yAxis: [
            // ── Gantt pane ─────────────────────────────────────────────────────
            {
                top:           '0%',
                height:        ganttHPct,
                reversed:      true,
                categories,
                title:         { text: undefined },
                gridLineWidth: 1,
                gridLineColor: '#f0f0f0',
                labels: {
                    useHTML: true,
                    step:    1,
                    formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
                        const v = String(this.value);
                        if (!v) return '';
                        return `<span style="font-size:0.7rem;white-space:nowrap;max-width:138px;overflow:hidden;display:inline-block;text-overflow:ellipsis" title="${v}">${v}</span>`;
                    },
                },
            },
            // ── Lab pane ──────────────────────────────────────────────────────
            {
                top:           labTopPct,
                height:        labHPct,
                title:         { text: '% of limit', style: { fontSize: '0.8rem', color: '#6c757d' }, margin: 6 },
                min:           0,
                labels:        { style: { fontSize: '0.7rem', color: '#6c757d' }, distance: 0 },
                gridLineWidth: 0,
                plotBands: [
                    {
                        from: 0, to: 100, color: 'rgba(25,135,84,0.07)',
                        label: { text: 'Normal',   align: 'left', x: -58, style: { fontSize: '0.7rem', color: '#198754', fontWeight: '500' } },
                    },
                    {
                        from: 100, to: 200, color: 'rgba(253,126,20,0.08)',
                        label: { text: 'Elevated', align: 'left', x: -58, style: { fontSize: '0.7rem', color: '#fd7e14', fontWeight: '500' } },
                    },
                    {
                        from: 200, to: 999, color: 'rgba(220,53,69,0.09)',
                        label: { text: 'High',     align: 'left', x: -58, style: { fontSize: '0.7rem', color: '#dc3545', fontWeight: '500' } },
                    },
                ],
                plotLines: [
                    {
                        value: 200,
                        color: '#0006',
                        dashStyle: 'ShortDot',
                        width:     1,
                        zIndex:    3,
                    },
                    {
                        value:     100,
                        color:     '#0006',
                        width:     1,
                        dashStyle: 'ShortDot',
                        zIndex:    3,
                        // label: {
                        //     text:  'Borderline',
                        //     style: { fontSize: '0.58rem', color: '#dc3545', fontWeight: '500' },
                        //     align: 'left',
                        //     x:     -60,   // pull into the left margin, before the plot
                        //     y:     3,
                        // },
                    }
                ],
            },
        ],
        tooltip: {
            outside:         true,
            useHTML:         true,
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderColor:     '#dee2e6',
            style:           { fontSize: '0.72rem' },
            formatter(this: any) {
                const p = this.point as any;
                // xrange bar
                if (p.x2 !== undefined) {
                    const dur = Math.round((p.x2 - p.x) / 864e5);
                    return [
                        `<b>${p.name}</b>`,
                        p.custom?.cls ? `<span style="color:#6c757d">${p.custom.cls}</span>` : '',
                        `${Highcharts.dateFormat('%b %Y', p.x)} → ${Highcharts.dateFormat('%b %Y', p.x2)}`,
                        `<span style="color:#6c757d">${dur} days</span>`,
                    ].filter(Boolean).join('<br/>');
                }
                // Lab line point
                const raw  = p.custom?.raw  as number | undefined;
                const unit = p.custom?.unit as string | undefined;
                const rawStr = raw !== undefined
                    ? ` <span style="color:#6c757d">(${raw}${unit ? ' ' + unit : ''})</span>`
                    : '';
                return `<span style="color:${this.series.color}">●</span> `
                     + `${this.series.name}: <b>${(this.y as number).toFixed(1)} %</b>${rawStr}<br/>`
                     + `<span style="color:#6c757d">${Highcharts.dateFormat('%b %d, %Y', this.x as number)}</span>`;
            },
        },
        series: [
            {
                type:         'xrange',
                name:         'Medications',
                yAxis:        0,
                data:         ganttData.map(p => {
                    const sel = selectedBand && p.x === selectedBand.from && p.x2 === selectedBand.to;
                    return sel
                        ? { ...p, borderWidth: 2.5, borderColor: '#0d6efd' }
                        : p;
                }),
                showInLegend: false,
                pointWidth:   ROW_H - 6,
                minPointLength: 4,
                borderRadius: 3,
                borderWidth:  0.5,
                cursor:       'pointer',
                dataLabels: {
                    enabled:  true,
                    inside:   true,
                    align:    'left',
                    x:        4,
                    overflow: 'allow',
                    crop:     true,
                    color:    '#111',
                    style:    { fontSize: '0.55rem', fontWeight: '600', textOutline: '1px rgba(255,255,255,0.6)' },
                    formatter(this: any) {
                        // suppress label on bars narrower than 20 days
                        return (this.point.x2 - this.point.x) >= 20 * 864e5 ? this.point.name : '';
                    },
                },
                point: {
                    events: {
                        click(this: any) {
                            onBarClickRef.current?.(this.x, this.x2, this.name);
                        },
                    },
                },
            } as Highcharts.SeriesXrangeOptions,
            ...labSeries,
        ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [categories, ganttData, ganttHPct, labTopPct, labHPct, totalH, labSeries, selectedBand]);

    // ── Lab selector helpers ──────────────────────────────────────────────────

    function toggleLab(key: LabKey) {
        setSelectedLabs(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    }

    const hasData = meds.length > 0 || labSeries.length > 0;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="container-fluid" style={{ minWidth: 0 }}>

            {/* Header row */}
            <div className="d-flex align-items-start justify-content-between mb-3 gap-2 flex-wrap">
                <div>
                    <h5 className="mb-0">Treatment Outcomes</h5>
                    <span className="text-muted small">
                        Medication timeline vs. lab trends — click a bar to highlight its period
                    </span>
                </div>

                {/* Lab selector dropdown */}
                <div className="dropdown" ref={dropdownRef}>
                    <button
                        className="btn btn-sm btn-outline-secondary dropdown-toggle"
                        type="button"
                        onClick={() => setDropdownOpen(o => !o)}
                    >
                        Labs&nbsp;
                        <span className="badge rounded-pill bg-secondary">{selectedLabs.length}</span>
                    </button>
                    {dropdownOpen && (
                        <div
                            className="dropdown-menu show shadow-sm p-2"
                            style={{ minWidth: 200, right: 0, left: 'auto', maxHeight: '70vh', overflowY: 'auto' }}
                        >
                            <div className="text-muted text-uppercase fw-semibold mb-2 px-1"
                                 style={{ fontSize: '0.6rem', letterSpacing: '0.06em' }}>
                                Select labs to display
                            </div>
                            {ALL_LAB_KEYS.map(key => {
                                const norm = LAB_NORM[key];
                                if (!norm) return null;
                                return (
                                    <div key={key} className="form-check mb-0"
                                         style={{ padding: '2px 8px 2px 28px' }}>
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`lab-cb-${key}`}
                                            checked={selectedLabs.includes(key)}
                                            onChange={() => toggleLab(key)}
                                        />
                                        <label className="form-check-label"
                                               htmlFor={`lab-cb-${key}`}
                                               style={{ fontSize: '0.72rem', cursor: 'pointer' }}>
                                            <span style={{
                                                display: 'inline-block', width: 8, height: 8,
                                                borderRadius: '50%', marginRight: 5, verticalAlign: 'middle',
                                                background: LAB_COLORS[key] ?? '#666',
                                            }} />
                                            {norm.label}
                                        </label>
                                    </div>
                                );
                            })}
                            <div className="dropdown-divider my-2" />
                            <div className="px-1 d-flex gap-2">
                                <button className="btn btn-link btn-sm p-0" style={{ fontSize: '0.68rem' }}
                                        onClick={() => setSelectedLabs(DEFAULT_LABS)}>
                                    Reset defaults
                                </button>
                                <button className="btn btn-link btn-sm p-0 text-muted" style={{ fontSize: '0.68rem' }}
                                        onClick={() => setSelectedLabs([])}>
                                    Clear all
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Drug-class legend */}
            <div className="d-flex gap-3 mb-3 flex-wrap">
                {Object.entries(IBD_MED_CLASS_COLORS)
                    .filter(([k]) => k !== 'other')
                    .map(([cls, color]) => (
                        <span key={cls} className="d-flex align-items-center gap-1"
                              style={{ fontSize: '0.68rem' }}>
                            <span style={{
                                width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                                background: color + '88', border: '1px solid ' + color,
                                display: 'inline-block',
                            }} />
                            {cls.charAt(0).toUpperCase() + cls.slice(1)}
                        </span>
                    ))}
            </div>

            {!hasData && (
                <div className="alert alert-secondary py-2 px-3 mb-3" style={{ fontSize: '0.78rem' }}>
                    No medication or lab data found for this patient.
                </div>
            )}

            {/* Chart card */}
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

            {/* Lab legend — rendered as HTML so wrapping never overlaps the chart */}
            {labSeries.length > 0 && (
                <div className="d-flex flex-wrap gap-3 mt-2 px-1">
                    {labSeries.map(s => (
                        <span key={s.name} className="d-flex align-items-center gap-1"
                              style={{ fontSize: '0.68rem' }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                background: s.color as string, display: 'inline-block',
                            }} />
                            {s.name}
                        </span>
                    ))}
                </div>
            )}

            {/* Selected period badge */}
            {selectedBand && (() => {
                const fmt = (ms: number) =>
                    new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                return (
                    <div className="mt-2 d-flex align-items-center gap-2" style={{ fontSize: '0.7rem' }}>
                        <span className="badge bg-primary-subtle text-primary-emphasis">
                            {selectedBand.name} &nbsp;·&nbsp; {fmt(selectedBand.from)} – {fmt(selectedBand.to)}
                        </span>
                        <button className="btn btn-link btn-sm p-0 text-muted"
                                style={{ fontSize: '0.7rem' }}
                                onClick={() => setSelectedBand(null)}>
                            Clear
                        </button>
                    </div>
                );
            })()}
        </div>
    );
}
