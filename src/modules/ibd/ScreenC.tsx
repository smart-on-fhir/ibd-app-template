/**
 * IBD Screen C — Similar Historical Patient Cohort
 * Based on the IBD CDS Dashboard spec (Section 8, Screen C / Figure 3).
 *
 * Cohort chips and patient-derived context come from real FHIR data.
 * Roster, stats, and distributions are loaded from mockCohort.json,
 * which mirrors the expected backend API response shape.
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import HighchartsReact       from 'highcharts-react-official';
import Highcharts            from '../../highcharts';
import { usePatientContext } from '../../contexts/PatientContext';
import { useCohortData }     from './useCohortData';
import { Term }              from './Tooltip';
import {
    getIBDConditions,
    getIBDSubtype,
    getDiseaseDuration,
    getSteroidExposure,
    hasPriorIBDSurgery,
    hasPerianialDisease,
    getAllIBDMedications,
} from './utils';

// ── Types mirroring the API response ──────────────────────────────────────────

interface TrajectoryPoint {
    day: number;
    crp: number;
}

interface MedianTrajectoryPoint {
    day:      number;
    crp:      number;
    q25_crp:  number;
    q75_crp:  number;
}

interface TreatmentDist {
    treatment:           string;
    label:               string;
    n:                   number;
    sfr_12m_rate:        number;
    median_days_to_sfr:  number;
    iqr:                 number[];
    note:                string;
    median_trajectory:   MedianTrajectoryPoint[];
}

interface MedBarEntry {
    drug:       string;
    drug_class: string;
    start_day:  number;
    end_day:    number;
}

interface Episode {
    episode_id:         string;
    patient_id:         string;
    similarity:         number;
    treatment:          string;
    outcome:            string;
    days_to_outcome:    number;
    matching_features:  string[];
    paris:              { location: string; behavior: string; perianal: boolean; growth: string };
    labs_at_baseline:   { crp: number; esr: number; albumin: number; calprotectin: number };
    activity_score:     { index: string; value: number; severity: string };
    endoscopy_pre:      { ses_cd: number; finding: string };
    note_summary:       { stool_freq_per_day: number; nocturnal: boolean; global_assessment: string };
    trajectory:         TrajectoryPoint[];
    medication_history: MedBarEntry[];
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Chip({ label }: { label: string }) {
    return (
        <span className="badge rounded-pill border me-1 mb-1 fw-normal text-bg-primary bg-opacity-10 border-primary border-opacity-25 text-primary"
              style={{ fontSize: '0.72rem', cursor: 'default' }}>
            {label}
        </span>
    );
}

function OutcomeStat({ label, value, sub, color = '#000' }: { label: string; value: string; sub: string; color?: string }) {
    return (
        <div className="card h-100">
            <div className="card-body p-2 small text-center">
                <div className="text-primary text-uppercase fw-semibold mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>{label}</div>
                <div className="fw-semibold" style={{ fontSize: '2rem', color }}>{value}</div>
                <div className="text-muted" style={{ fontSize: '0.65rem' }}>{sub}</div>
            </div>
        </div>
    );
}

function CRPSparkline({ trajectory }: { trajectory: TrajectoryPoint[] }) {
    const W = 260, H = 52;
    const days = trajectory.map(p => p.day);
    const crps = trajectory.map(p => p.crp);
    const minX = Math.min(...days), maxX = Math.max(...days);
    const maxY = Math.max(...crps);
    const px = (d: number) => ((d - minX) / (maxX - minX || 1)) * W;
    const py = (c: number) => H - (c / (maxY || 1)) * (H - 6);
    const pts = trajectory.map(p => `${px(p.day).toFixed(1)},${py(p.crp).toFixed(1)}`).join(' ');
    return (
        <svg width="100%" viewBox={`0 -14 ${W} ${H + 14}`} style={{ display: 'block', overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke="#0d6efd" strokeWidth="1.5" strokeLinejoin="round" />
            <line x1={px(0).toFixed(1)} y1="0" x2={px(0).toFixed(1)} y2={H} stroke="#C00" strokeWidth="1" strokeDasharray="3,2" />
            {trajectory.map((p, i) => {
                const x = px(p.day);
                const y = py(p.crp);
                const labelY = y < 5 ? y + 5 : y - 5;
                const labelX = x < 7 ? x + 7 : x;
                return (
                    <g key={i}>
                        <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.5" fill="#0d6efd" />
                        <text x={labelX.toFixed(1)} y={labelY.toFixed(1)}
                              textAnchor="middle" fontSize="5" fill="#495057" style={{ background: '#FFF' }}>
                            {p.crp}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

function MedianCRPSparkline({ trajectory }: { trajectory: MedianTrajectoryPoint[] }) {
    const W = 260, H = 56;
    const days  = trajectory.map(p => p.day);
    const allY  = trajectory.flatMap(p => [p.q25_crp, p.q75_crp, p.crp]);
    const minX  = Math.min(...days), maxX = Math.max(...days);
    const maxY  = Math.max(...allY);
    const px    = (d: number) => ((d - minX) / (maxX - minX || 1)) * W;
    const py    = (c: number) => H - (c / (maxY || 1)) * (H - 4);

    const upperPts  = trajectory.map(p => `${px(p.day).toFixed(1)},${py(p.q75_crp).toFixed(1)}`);
    const lowerPts  = [...trajectory].reverse().map(p => `${px(p.day).toFixed(1)},${py(p.q25_crp).toFixed(1)}`);
    const bandPts   = [...upperPts, ...lowerPts].join(' ');
    const medianPts = trajectory.map(p => `${px(p.day).toFixed(1)},${py(p.crp).toFixed(1)}`).join(' ');
    const normalY   = py(5);

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
            <polygon points={bandPts} fill="#0d6efd18" stroke="none" />
            {normalY >= 0 && normalY <= H && (
                <line x1="0" y1={normalY.toFixed(1)} x2={W} y2={normalY.toFixed(1)}
                      stroke="#19875455" strokeWidth="1" strokeDasharray="3,3" />
            )}
            <polyline points={medianPts} fill="none" stroke="#0d6efd" strokeWidth="1.5" strokeLinejoin="round" />
            <line x1={px(0).toFixed(1)} y1="0" x2={px(0).toFixed(1)} y2={H}
                  stroke="#C0000066" strokeWidth="1" strokeDasharray="3,2" />
        </svg>
    );
}

function SFRRangeBar({ iqr, median }: { iqr: number[]; median: number }) {
    const W      = 240, H = 32;
    const maxDay = Math.max(370, iqr[1] + 30);
    const px     = (d: number) => Math.min(Math.max((d / maxDay) * W, 0), W);
    const mid    = 12;

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            <line x1="0" y1={mid} x2={W} y2={mid} stroke="#dee2e6" strokeWidth="2" strokeLinecap="round" />
            <line x1={px(iqr[0])} y1={mid} x2={px(iqr[1])} y2={mid} stroke="#0d6efd55" strokeWidth="7" strokeLinecap="round" />
            <line x1={px(iqr[0])} y1={mid - 6} x2={px(iqr[0])} y2={mid + 6} stroke="#0d6efd" strokeWidth="1.5" />
            <line x1={px(iqr[1])} y1={mid - 6} x2={px(iqr[1])} y2={mid + 6} stroke="#0d6efd" strokeWidth="1.5" />
            <circle cx={px(median)} cy={mid} r="5" fill="#0d6efd" />
            <text x={px(iqr[0])} y={H - 1} textAnchor="middle" fontSize="7" fill="#6c757d">{iqr[0]}d</text>
            <text x={px(median)} y={H - 1} textAnchor="middle" fontSize="7.5" fill="#0d6efd" fontWeight="bold">{median}d</text>
            <text x={px(iqr[1])} y={H - 1} textAnchor="middle" fontSize="7" fill="#6c757d">{iqr[1]}d</text>
        </svg>
    );
}

// ── Treatment distribution chart ──────────────────────────────────────────────

export function TreatmentDistChart({ distributions }: { distributions: TreatmentDist[] }) {
    const maxSFR     = Math.max(...distributions.map(d => d.sfr_12m_rate));
    const maxChars   = Math.max(...distributions.map(d => `${d.label} (n=${d.n})`.length));
    const labelWidth = Math.max(100, Math.min(180, maxChars * 7));

    const options: Highcharts.Options = {
        chart: {
            inverted:        true,
            height:          (distributions.length + 1) * 52 + 60,
            margin:          [10, 16, 80, labelWidth + 24],
            animation:       false,
            backgroundColor: 'transparent',
            style:           { fontFamily: 'inherit' },
            plotBorderWidth: 1,
            spacing: [0, 0, 0, 0],
            plotShadow : {
                width: 2,
                color: '#000',
                opacity: 1,
                offsetX: 3,
                offsetY: 3,
            }
        },
        title:    { text: undefined },
        credits:  { enabled: false },
        exporting: { enabled: false },
        legend: {
            enabled:       true,
            align:         'center',
            verticalAlign: 'bottom',
            layout:        'horizontal',
            itemStyle:     { fontWeight: 'normal', fontSize: '0.68rem' },
            margin:        0,
        },
        xAxis: {
            categories: distributions.map(d => `${d.label} (n=${d.n})`),
            lineWidth:  0,
            tickWidth:  0,
            labels: {
                useHTML:   true,
                formatter() {
                    const raw   = String(this.value);
                    const match = raw.match(/^(.+?)(\s*\(n=\d+\))$/);
                    if (!match) return `<div style="font-size:0.72rem;width:${labelWidth}px;white-space:normal;text-align:right">${raw}</div>`;
                    return `<div style="font-size:0.72rem;width:${labelWidth}px;white-space:normal;text-align:right"><b>${match[1]}</b><span style="font-weight:normal">${match[2]}</span></div>`;
                },
            },
        },
        yAxis: {
            min:   0,
            max:   365,            minPadding: 0.05,
            maxPadding: 0.05,
            title: { text: 'Days from treatment start (day 0 = medication order)', style: { fontSize: '0.6rem', color: '#6c757d' } },
            labels: { style: { fontSize: '0.65rem', color: '#6c757d' }, y: 16 },
            gridLineColor: '#0001',
            tickPositions: [0, 30, 60, 90, 120, 180, 240, 365],
        },
        tooltip: {
            outside:         true,
            backgroundColor: 'rgba(255,255,255,0.95)',
            style:           { fontSize: '0.72rem' },
            useHTML: true,
            borderColor: '#318ebc',
            borderRadius: 5,
            borderWidth: 1,
            shared: false,
            followPointer: false,
            distance: 10,
            shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 1, offsetY: 1, width: 5 },
            formatter() {
                const pt   = (this as any).point;
                const d    = distributions[pt.x as number];
                const note = d.note
                    ? ` <span style="background:#fff3cd;border-radius:3px;padding:1px 5px;font-size:0.68rem;color:#664d03">${d.note}</span>`
                    : '';
                if ((this as any).series.type === 'errorbar') {
                    return `<b>${d.label}</b>${note}<br/>IQR: ${d.iqr[0]}–${d.iqr[1]}d`;
                }
                return `<b>${d.label}</b>${note}<br/>Median: ${d.median_days_to_sfr}d<br/>SFR within 12 mo: <b>${Math.round(d.sfr_12m_rate * 100)}%</b>`;
            },
        },
        series: [
            {
                type:        'errorbar',
                name:        'IQR (25th–75th percentile)',
                data:        distributions.map((d, i) => [i, d.iqr[0], d.iqr[1]]),
                whiskerLength: '40%',
                stemWidth    : 3,
                whiskerWidth : 3,
                color        : '#0d6efd44',
                whiskerColor : '#0d6efd',
            },
            {
                type: 'scatter',
                name: 'Median days to SFR',
                data: distributions.map((d, i) => ({
                    x:      i,
                    y:      d.median_days_to_sfr,
                    custom: { sfr: d.sfr_12m_rate, note: d.note },
                })),
                marker: {
                    symbol: 'circle',
                    radius: 7,
                    // states: {
                    //     hover: {
                    //         lineWidth: 5,
                    //         lineColor: 'rgba(13, 110, 253, 0.22)',
                    //     },
                    // },
                },
                states: {
                    hover: {
                        halo: { size: 12, opacity: 0.3 },
                    },
                },
                color: '#0d6efd',
                clip:  false,
                dataLabels: {
                    enabled:   true,
                    formatter() {
                        const pt   = (this as any).point;
                        const best = pt.custom.sfr === maxSFR;
                        const rate = `${Math.round(pt.custom.sfr * 100)}% SFR`;
                        const note = pt.custom.note
                            ? `<span style="background:#fff3cd;border-radius:3px;padding:1px 5px;margin-left:5px;font-size:0.62rem;color:#664d03">${pt.custom.note}</span>`
                            : '';
                        return best
                            ? `<b style="color:#198754">${rate} ▲</b>${note}`
                            : `<span style="color:#666666">${rate}</span>${note}`;
                    },
                    useHTML:   true,
                    align:     'left',
                    x:         10,
                    y: -4,
                    style:     { fontSize: '0.68rem', fontWeight: 'normal', textOutline: 'none' },
                },
            },
        ],
    };

    const chartRef = useRef<HighchartsReact.RefObject>(null);

    useEffect(() => {
        chartRef.current?.chart.reflow();
    }, []);

    return <HighchartsReact ref={chartRef} highcharts={Highcharts} options={options} containerProps={{ style: { width: '100%' } }} />;
}

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
    SFR:  { label: 'SFR',  cls: 'text-success' },
    ENDO: { label: 'ENDO', cls: 'text-primary'  },
    ESC:  { label: 'ESC',  cls: 'text-warning'  },
    SURG: { label: 'SURG', cls: 'text-danger'   },
    NO:   { label: 'No event', cls: 'text-muted' },
};

const pct = (r: number) => `${Math.round(r * 100)}%`;

// ── Screen C ──────────────────────────────────────────────────────────────────

export default function IBDScreenC() {
    const cohortData = useCohortData();
    const { selectedPatientResources } = usePatientContext();
    const [selected, setSelected] = useState<Episode | null>(null);

    // ── Real patient features (for "Why matched" context) ──
    const ibdConditions = useMemo(() => getIBDConditions(selectedPatientResources), [selectedPatientResources]);
    const subtype       = useMemo(() => getIBDSubtype(ibdConditions),               [ibdConditions]);
    const duration      = useMemo(() => getDiseaseDuration(ibdConditions),          [ibdConditions]);
    const steroidExp    = useMemo(() => getSteroidExposure(selectedPatientResources),[selectedPatientResources]);
    const priorSurgery  = useMemo(() => hasPriorIBDSurgery(selectedPatientResources),[selectedPatientResources]);
    const perianal      = useMemo(() => hasPerianialDisease(selectedPatientResources),[selectedPatientResources]);
    const allMeds       = useMemo(() => getAllIBDMedications(selectedPatientResources),[selectedPatientResources]);
    const hasBiologic   = allMeds.some(m => m.class === 'biologic');
    const hasImmunomod  = allMeds.some(m => m.class === 'immunomodulator');

    // ── API response (mock) ──
    const { data_tier, outcomes, treatment_distributions, episodes, treatment_start_rule } = cohortData as {
        data_tier:                'aggregate' | 'episode';
        cohort_size:              number;
        matching_chips:           string[];
        treatment_start_rule:     string;
        outcomes:                 {
            sfr_12m_rate: number;
            endo_12m_rate: number;
            surg_12m_rate: number;
        };
        treatment_distributions:  TreatmentDist[];
        episodes:                 Episode[];
    };

    const hasEpisodes = data_tier === 'episode';
    const maxSFR  = Math.max(...treatment_distributions.map(d => d.sfr_12m_rate));
    const bestTx  = treatment_distributions.reduce((a, b) => b.sfr_12m_rate > a.sfr_12m_rate ? b : a);
    const [selectedTxCode, setSelectedTxCode] = useState(bestTx.treatment);
    const selectedTx = treatment_distributions.find(d => d.treatment === selectedTxCode) ?? bestTx;


    return (
        <div className="container-fluid">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="d-flex align-items-baseline gap-3 mb-1">
                <h5 className="mb-0">Similar Historical Patients</h5>
                <span className="text-muted small">Inspect who is in the cohort, why they matched, and how treatments performed</span>
            </div>

            {/* ── Cohort chips (from API) ───────────────────────────────── */}
            <div className="mb-3">
                <span className="text-muted me-2" style={{ fontSize: '0.72rem' }}>Cohort chips:</span>
                {cohortData.matching_chips.map(c => <Chip key={c} label={c} />)}
                <span className="text-muted ms-2 fst-italic" style={{ fontSize: '0.65rem' }}>
                    Day 0 = {treatment_start_rule.replace(/_/g, ' ')}
                </span>
            </div>

            {/* ── Summary stat cards ───────────────────────────────────── */}
            <div className="row g-3 mb-3">
                <div className="col-3"><OutcomeStat label="Historical cohort size" color="#66C"  value={String(cohortData.cohort_size)} sub="episodes after filters" /></div>
                <div className="col-3"><OutcomeStat label="Steroid-free remission" color="#28a745" value={pct(outcomes.sfr_12m_rate)}    sub="within 12 months" /></div>
                <div className="col-3"><OutcomeStat label="Endoscopic remission"   color="#17a2b8" value={pct(outcomes.endo_12m_rate)}   sub="within 12 months" /></div>
                <div className="col-3"><OutcomeStat label="IBD surgery"            color="#dc3545" value={pct(outcomes.surg_12m_rate)}   sub="within 12 months" /></div>
            </div>

            <div className="row g-3 flex-nowrap">

                {/* ── Left: Roster (episode) or Treatment table (aggregate) ── */}
                <div className="col col-3">
                    <div className="card h-100">
                        <div className="card-body p-2 small">
                            {hasEpisodes ? (<>
                                <div className="fw-bold mb-1">Matched cohort roster</div>
                                <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
                                    {cohortData.cohort_size} episodes · sorted by similarity · click to inspect
                                </div>
                                <div className='table-responsive'>
                                    <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.72rem' }}>
                                        <thead>
                                            <tr>
                                                <th className="text-secondary">Episode</th>
                                                <th className='text-secondary text-end'>Sim</th>
                                                <th className="text-secondary">Tx</th>
                                                <th className="text-secondary">Outcome</th>
                                                <th className='text-secondary text-end'>Days</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {episodes.map(ep => (
                                                <tr key={ep.episode_id}
                                                    onClick={() => setSelected(ep === selected ? null : ep)}
                                                    className={ep === selected ? 'table-primary' : ''}
                                                    style={{ cursor: 'pointer' }}>
                                                    <td className='text-truncate'>{ep.episode_id}</td>
                                                    <td className='text-end'>{ep.similarity.toFixed(2)}</td>
                                                    <td>{ep.treatment}</td>
                                                    <td className={OUTCOME_META[ep.outcome]?.cls ?? ''}>
                                                        <Term term={ep.outcome}>{OUTCOME_META[ep.outcome]?.label ?? ep.outcome}</Term>
                                                    </td>
                                                    <td className='text-end'>{ep.days_to_outcome}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>) : (<>
                                <div className="fw-bold mb-1">Treatment comparison</div>
                                <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
                                    Aggregate outcomes across {cohortData.cohort_size} episodes
                                </div>
                                <table className="table table-sm mb-0" style={{ fontSize: '0.72rem' }}>
                                    <thead>
                                        <tr>
                                            <th className="text-secondary">Treatment</th>
                                            <th className="text-secondary text-end">n</th>
                                            <th className="text-secondary text-end">SFR</th>
                                            <th className="text-secondary text-end">Median</th>
                                            <th className="text-secondary text-end">IQR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...treatment_distributions]
                                            .sort((a, b) => b.sfr_12m_rate - a.sfr_12m_rate)
                                            .map(d => (
                                                <tr key={d.treatment}
                                                    className={d.treatment === selectedTxCode ? 'table-primary' : d.sfr_12m_rate === maxSFR ? 'table-success' : ''}
                                                    onClick={() => setSelectedTxCode(d.treatment)}
                                                    style={{ cursor: 'pointer' }}>
                                                    <td>
                                                        <div className="fw-semibold">{d.treatment}</div>
                                                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>{d.label}</div>
                                                    </td>
                                                    <td className="text-end text-muted">{d.n}</td>
                                                    <td className={`text-end fw-semibold ${d.sfr_12m_rate === maxSFR ? 'text-success' : ''}`}>
                                                        {pct(d.sfr_12m_rate)}
                                                    </td>
                                                    <td className="text-end text-muted">{d.median_days_to_sfr}d</td>
                                                    <td className="text-end text-muted" style={{ fontSize: '0.65rem' }}>
                                                        {d.iqr[0]}–{d.iqr[1]}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </>)}
                        </div>
                    </div>
                </div>

                {/* ── Right ───────────────────────────────────────────── */}
                <div className="col col-9">

                    {/* Outcome distributions */}
                    <div className="card mb-3">
                        <div className="card-body p-3 small">
                            <div className="fw-bold mb-1">Outcome distributions by treatment choice</div>
                            <div className="text-muted mb-3" style={{ fontSize: '0.68rem' }}>
                                Steroid-free remission rate within 12 months · median days shown, among those who responded· day 0 = {treatment_start_rule.replace(/_/g, ' ')}
                            </div>
                            <TreatmentDistChart distributions={treatment_distributions} />
                        </div>
                    </div>

                    {/* Why matched + Evidence drawer */}
                    <div className="row g-2">
                        <div className="col-md-6">
                            <div className="card h-100">
                                <div className="card-body p-3 small">
                                    <div className="fw-bold mb-2">Why patients matched</div>
                                    <ul className="mb-0 ps-3" style={{ fontSize: '0.72rem' }}>
                                        <li className="mb-1">
                                            <span className="fw-semibold">Primary:</span>{' '}
                                            {subtype}{perianal ? ' with perianal involvement' : ''}{hasBiologic ? ', prior biologic exposure' : ''}.
                                        </li>
                                        <li className="mb-1">
                                            <span className="fw-semibold">Secondary:</span>{' '}
                                            {duration ? `disease duration ~${duration}` : 'disease duration unknown'},{' '}
                                            {steroidExp.totalCourses > 0 ? `${steroidExp.totalCourses} steroid course${steroidExp.totalCourses > 1 ? 's' : ''}` : 'no steroid history'},{' '}
                                            {hasImmunomod ? 'prior immunomodulator' : 'no prior immunomodulator'},{' '}
                                            {priorSurgery ? 'prior IBD surgery' : 'no prior surgery'}.
                                        </li>
                                        <li className="text-muted">
                                            Every match exposes a contribution breakdown so clinicians can reject spurious similar cases.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6">
                            <div className="card h-100">
                                <div className="card-body p-3 small">
                                    <div className="fw-bold mb-2 d-flex justify-content-between align-items-start">
                                        <span>{hasEpisodes ? 'Episode detail' : 'Treatment detail'}</span>
                                        {hasEpisodes && selected && <button className="btn-close btn-sm" onClick={() => setSelected(null)} />}
                                    </div>
                                    {!hasEpisodes ? (
                                        <div style={{ fontSize: '0.72rem' }}>
                                            <div className="mb-2">
                                                <span className="fw-bold" style={{ fontSize: '0.85rem' }}>{selectedTx.label}</span>
                                                <span className="text-muted ms-2">n={selectedTx.n}</span>
                                                {selectedTx.sfr_12m_rate === maxSFR && (
                                                    <span className="badge bg-success ms-2" style={{ fontSize: '0.6rem' }}>Best SFR</span>
                                                )}
                                                {selectedTx.note && (
                                                    <span className="ms-2 fst-italic text-muted">{selectedTx.note}</span>
                                                )}
                                            </div>

                                            <div className="mb-3">
                                                <div className="d-flex justify-content-between mb-1">
                                                    <span className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.6rem', letterSpacing: '0.04em' }}>SFR at 12 months</span>
                                                    <span className={`fw-semibold ${selectedTx.sfr_12m_rate === maxSFR ? 'text-success' : ''}`}>
                                                        {pct(selectedTx.sfr_12m_rate)}
                                                    </span>
                                                </div>
                                                <div className="progress" style={{ height: 6 }}>
                                                    <div className={`progress-bar ${selectedTx.sfr_12m_rate === maxSFR ? 'bg-success' : 'bg-primary'}`}
                                                         style={{ width: pct(selectedTx.sfr_12m_rate) }} />
                                                </div>
                                            </div>

                                            <div className="mb-3">
                                                <div className="text-muted text-uppercase fw-semibold mb-2" style={{ fontSize: '0.6rem', letterSpacing: '0.04em' }}>Time to SFR — median + IQR (days)</div>
                                                <SFRRangeBar iqr={selectedTx.iqr} median={selectedTx.median_days_to_sfr} />
                                            </div>

                                            {(selectedTx.median_trajectory?.length ?? 0) > 0 && (
                                                <div>
                                                    <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.04em' }}>CRP trajectory — median ± IQR</div>
                                                    <MedianCRPSparkline trajectory={selectedTx.median_trajectory} />
                                                    <div className="d-flex justify-content-between text-muted mt-1" style={{ fontSize: '0.6rem' }}>
                                                        <span>Day 0</span>
                                                        <span>Day {selectedTx.median_trajectory.at(-1)!.day}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : selected ? (<>
                                        <div className="mb-2" style={{ fontSize: '0.68rem' }}>
                                            <span className="text-muted">{selected.episode_id} · similarity {selected.similarity.toFixed(2)}</span>
                                            <span className="ms-3">Tx: <strong>{selected.treatment}</strong></span>
                                            <span className="ms-3">Outcome: <strong className={OUTCOME_META[selected.outcome]?.cls}><Term term={selected.outcome}>{OUTCOME_META[selected.outcome]?.label}</Term></strong> in {selected.days_to_outcome}d</span>
                                        </div>

                                        <div className="mb-2">
                                            <div className="text-uppercase text-muted fw-semibold mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Matched on</div>
                                            <div className="d-flex flex-wrap gap-1">
                                                {selected.matching_features.map(f => (
                                                    <Chip key={f} label={f} />
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mb-2">
                                            <div className="text-uppercase text-muted fw-semibold mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Clinical baseline</div>
                                            {[
                                                [`${selected.activity_score.index}`, `${selected.activity_score.value} (${selected.activity_score.severity})`],
                                                ['CRP',     `${selected.labs_at_baseline.crp} mg/L`],
                                                ['Albumin', `${selected.labs_at_baseline.albumin} g/dL`],
                                                ['Stool',   `${selected.note_summary.stool_freq_per_day}/day${selected.note_summary.nocturnal ? ' + nocturnal' : ''}`],
                                                ['SES-CD',  String(selected.endoscopy_pre.ses_cd)],
                                                ['Paris',   [selected.paris.location, selected.paris.behavior + (selected.paris.perianal ? 'p' : ''), selected.paris.growth !== 'N/A' ? selected.paris.growth : ''].filter(Boolean).join(' ')],
                                            ].map(([label, value], i) => (
                                                <div key={i} className="d-flex justify-content-between align-items-baseline"
                                                     style={{ fontSize: '0.68rem', borderBottom: '1px solid #8882', padding: '0.1rem 0' }}>
                                                    <span className="text-muted">
                                                        {label === 'SES-CD' || label === selected.activity_score.index
                                                            ? <Term term={label}>{label}</Term>
                                                            : label}
                                                    </span>
                                                    <span>{value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {selected.medication_history?.length > 0 && (
                                            <div className="mb-2">
                                                <div className="text-uppercase text-muted fw-semibold mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Medications</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '4px' }}>
                                                    {selected.medication_history.map((m, i) => (
                                                        <div key={i} className="border rounded px-2 py-1" style={{ fontSize: '0.65rem', background: '#f8f9fa' }}>
                                                            <div className="fw-semibold text-truncate">{m.drug}</div>
                                                            <div className="text-muted">D{m.start_day} → {m.end_day}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selected.trajectory?.length > 0 && (
                                            <div>
                                                <div className="text-uppercase text-muted fw-semibold mb-1" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>CRP trajectory</div>
                                                <CRPSparkline trajectory={selected.trajectory} />
                                                <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.6rem' }}>
                                                    <span>Day {selected.trajectory[0].day}</span>
                                                    <span>Day {selected.trajectory[selected.trajectory.length - 1].day}</span>
                                                </div>
                                            </div>
                                        )}
                                    </>) : (
                                        <div className="text-muted fst-italic" style={{ fontSize: '0.68rem' }}>
                                            Select a patient row to inspect episode details
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
