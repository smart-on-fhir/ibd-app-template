/**
 * IBD Screen B — Treatment-to-Outcome Timeline Comparison
 * Based on the IBD CDS Dashboard spec (Section 8, Screen B / Figure 2).
 *
 * Present patient CRP trajectory vs. matched cohort median + IQR band.
 * Individual episode lines are toggleable.
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import HighchartsReact                          from 'highcharts-react-official';
import Highcharts                               from '../../highcharts';
import { usePatientContext }                    from '../../contexts/PatientContext';
import { useCohortData }                        from './useCohortData';
import { TreatmentDistChart }                   from './ScreenC';
import { getMedHistory, normalizeMedName, getLabHistory } from './utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrajectoryPoint        { day: number; crp: number; }
interface MedianTrajectoryPoint  { day: number; crp: number; q25_crp: number; q75_crp: number; }

interface TreatmentDist {
    treatment:            string;
    label:                string;
    n:                    number;
    sfr_12m_rate:         number;
    median_days_to_sfr:   number;
    iqr:                  [number, number];
    endo_12m_rate:        number;
    median_days_to_endo:  number;
    iqr_endo:             [number, number];
    surg_12m_rate:        number;
    median_days_to_surg:  number;
    iqr_surg:             [number, number];
    note:                 string;
    median_trajectory:    MedianTrajectoryPoint[];
}

interface Episode {
    episode_id:        string;
    treatment:         string;
    outcome:           string;
    days_to_outcome:   number;
    trajectory:        TrajectoryPoint[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTCOME_COLOR: Record<string, string> = {
    SFR:  '#008800',
    ENDO: '#990099',
    ESC:  '#ff9640',
    SURG: '#dc3545',
    NO:   '#adb5bd',
};

const ENDPOINT_OPTIONS = ['SFR', 'ENDO', 'SURG'] as const;
type Endpoint = typeof ENDPOINT_OPTIONS[number];

const ENDPOINT_LABEL: Record<Endpoint, string> = {
    SFR:  'Steroid-free remission',
    ENDO: 'Endoscopic remission',
    SURG: 'Surgery',
};

function endpointFields(d: TreatmentDist, ep: Endpoint) {
    if (ep === 'ENDO') return { rate: d.endo_12m_rate, median: d.median_days_to_endo, iqr: d.iqr_endo };
    if (ep === 'SURG') return { rate: d.surg_12m_rate, median: d.median_days_to_surg, iqr: d.iqr_surg };
    return { rate: d.sfr_12m_rate, median: d.median_days_to_sfr, iqr: d.iqr };
}

// ── Screen B ──────────────────────────────────────────────────────────────────

export default function IBDScreenB() {
    const cohortData = useCohortData();
    const { selectedPatientResources } = usePatientContext();

    const distributions = cohortData.treatment_distributions as unknown as TreatmentDist[];
    const allEpisodes   = cohortData.episodes as unknown as Episode[];
    const hasEpisodes   = (cohortData as any).data_tier === 'episode';

    const defaultTx = distributions.reduce((a, b) =>
        b.sfr_12m_rate > a.sfr_12m_rate ? b : a
    ).treatment;

    const [candidateTx,      setCandidateTx]      = useState(defaultTx);
    const [endpoint,         setEndpoint]          = useState<Endpoint>('SFR');
    const [showIndividuals,  setShowIndividuals]   = useState(true);
    const [chartHeight,      setChartHeight]       = useState(450);

    // ── Present patient CRP relative to index biologic start (Day 0) ──
    const patientMeds = useMemo(() => getMedHistory(selectedPatientResources), [selectedPatientResources]);
    const crpHistory  = useMemo(() => getLabHistory(selectedPatientResources, 'CRP'), [selectedPatientResources]);

    // Day 0 = most recently initiated biologic that is still active; fallback to
    // most recently initiated regardless of status (mirrors MedTimeline logic).
    const day0Ms = useMemo(() => {
        const biologics = patientMeds.filter(m => m.class === 'biologic');
        if (!biologics.length) return null;
        const now      = Date.now();
        const isActive = (m: typeof biologics[number]) => m.status === 'active' || m.endMs > now;
        function latestFirstStart(subset: typeof biologics): number | null {
            if (!subset.length) return null;
            const firstStartByName = new Map<string, number>();
            for (const m of subset) {
                const key = normalizeMedName(m.name);
                const prev = firstStartByName.get(key);
                if (prev === undefined || m.startMs < prev) firstStartByName.set(key, m.startMs);
            }
            return Math.max(...firstStartByName.values());
        }
        return latestFirstStart(biologics.filter(isActive)) ?? latestFirstStart(biologics);
    }, [patientMeds]);

    const { patientTrajectory, crpSource } = useMemo(() => {
        // Prefer FHIR CRP observations aligned to Day 0
        if (day0Ms !== null && crpHistory.length) {
            const fhirPoints = crpHistory
                .map(p => {
                    const u = p.unit.toLowerCase();
                    // Normalize to mg/L (chart baseline unit)
                    const crp = u === 'mg/dl' || u === 'mg%'   ? p.value * 10
                              : u === 'g/l'                    ? p.value * 1000
                              : p.value;
                    return { day: Math.round((p.date - day0Ms) / 86_400_000), crp };
                })
                .filter(p => p.day >= -180 && p.day <= 365)
                .sort((a, b) => a.day - b.day);
            if (fhirPoints.length) return { patientTrajectory: fhirPoints, crpSource: 'fhir' as const };
        }
        // Fall back to mock CRP trajectory from cohort API response
        const mockPoints = ((cohortData as any).present_patient?.crp_trajectory ?? []) as TrajectoryPoint[];
        return { patientTrajectory: mockPoints, crpSource: mockPoints.length ? 'mock' as const : 'none' as const };
    }, [day0Ms, crpHistory, cohortData]);

    // ── Cohort data for selected treatment ──
    const dist              = distributions.find(d => d.treatment === candidateTx)!;
    const selectedEpisodes  = allEpisodes.filter(e => e.treatment === candidateTx);
    const hasTrajectoryData = (dist.median_trajectory?.length ?? 0) > 0;
    const epFields          = endpointFields(dist, endpoint);

    // ── Highcharts series ──────────────────────────────────────────────────────
    const series = useMemo((): Highcharts.SeriesOptionsType[] => {
        const out: Highcharts.SeriesOptionsType[] = [];

        // IQR band
        out.push({
            type:               'areasplinerange',
            name:               'Cohort IQR (25–75th)',
            data:               dist.median_trajectory.map(p => [p.day, p.q25_crp, p.q75_crp]),
            color:              '#0d6efd',
            fillOpacity:        0.1,
            lineWidth:          0.2,
            marker:             { enabled: false },
            enableMouseTracking: false,
            zIndex:             1,
        });

        // Cohort median
        out.push({
            type:      'spline',
            name:      `${dist.label} — median (n=${dist.n})`,
            data:      dist.median_trajectory.map(p => [p.day, p.crp]),
            color:     '#0d6efd',
            lineWidth: 3,
            dashStyle: 'ShortDash',
            marker:    { enabled: false },
            zIndex:    2,
        });

        // Individual episode lines + outcome markers
        if (showIndividuals) {
            selectedEpisodes.forEach(ep => {
                const color = OUTCOME_COLOR[ep.outcome] ?? '#adb5bd';
                out.push({
                    type:               'spline',
                    name:               ep.episode_id,
                    data:               ep.trajectory.map(p => [p.day, p.crp]),
                    color,
                    lineWidth:          2,
                    opacity:            0.4,
                    marker:             { enabled: false },
                    showInLegend:       false,
                    enableMouseTracking: false,
                    zIndex:             1,
                });
                const last = ep.trajectory.at(-1)!;
                out.push({
                    type:         'scatter',
                    name:         ep.outcome,
                    data:         [{ x: last.day, y: last.crp }],
                    color,
                    marker:             { symbol: 'circle', radius: 4, lineWidth: 0 },
                    opacity:            0.65,
                    showInLegend:       false,
                    zIndex:             3,
                    tooltip:            { pointFormat: `<b>${ep.episode_id}</b><br/>Outcome: ${ep.outcome} at day ${ep.days_to_outcome}<br/>CRP: {point.y} mg/L` },
                });
            });
        }

        // Present patient (dominant, always on top)
        out.push({
            type:      'spline',
            name:      'Present patient',
            data:      patientTrajectory.map(p => [p.day, p.crp]),
            color:     '#b15900',
            lineWidth: 3,
            zIndex:    10,
            marker:    { enabled: true, radius: 4, symbol: 'circle' },
        });

        return out;
    }, [dist, selectedEpisodes, showIndividuals, patientTrajectory]);

    const options: Highcharts.Options = {
        chart: {
            animation:       false,
            backgroundColor: 'transparent',
            style:           { fontFamily: 'inherit' },
            height:          chartHeight,
        },
        title:    { text: undefined },
        credits:  { enabled: false },
        exporting: { enabled: false },
        xAxis: {
            min: -90,
            max: 375,
            title: { text: 'Days from treatment start', style: { fontSize: '0.65rem', color: '#6c757d' } },
            labels: { style: { fontSize: '0.65rem' } },
            plotLines: [
                {
                    value: 0, color: '#00000066', dashStyle: 'ShortDot', width: 1,
                    label: { text: 'Day 0', style: { fontSize: '0.65rem', color: '#6c757d' } },
                },
                {
                    value:     epFields.median,
                    color:     '#198754',
                    dashStyle: 'ShortDash',
                    width:     2,
                    zIndex:    4,
                    label: {
                        text:     `Median ${endpoint} (${epFields.median}d)`,
                        style:    { fontSize: '0.65rem', color: '#198754', fontWeight: '600' },
                        rotation: 0,
                        y:        14,
                    },
                },
            ],
            plotBands: [{
                from:  epFields.iqr[0],
                to:    epFields.iqr[1],
                color: '#19875418',
                zIndex: 1,
                borderWidth: 1,
                borderColor: '#19875440',
                label: {
                    text:  `IQR`,
                    style: { fontSize: '0.6rem', color: '#198754' },
                    align: 'center',
                    y:     14,
                },
            }],
        },
        yAxis: {
            min: 0,
            title: { text: 'CRP (mg/L)', style: { fontSize: '0.65rem', color: '#6c757d' } },
            labels: { style: { fontSize: '0.65rem' } },
            plotLines: [{
                value: 5, color: '#198754', dashStyle: 'ShortDash', width: 2,
                label: { text: 'Normal (<5)', align: 'right', style: { fontSize: '0.65rem', color: '#198754' } },
            }],
        },
        legend: {
            enabled:       true,
            align:         'center',
            verticalAlign: 'bottom',
            itemStyle:     { fontWeight: 'normal', fontSize: '0.68rem' },
        },
        tooltip: {
            outside:       true,
            style:         { fontSize: '0.72rem' },
            headerFormat:  '<span style="font-size:0.68rem">Day {point.key}</span><br/>',
            valueDecimals: 1,
            valueSuffix:   ' mg/L',
            backgroundColor: 'rgba(255,255,255,0.95)',
            useHTML: true,
            borderColor: '#318ebc',
            borderRadius: 5,
            borderWidth: 1,
            shared: false,
            followPointer: false,
            distance: 10,
            shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 1, offsetY: 1, width: 5 },
        },
        series,
    };

    const chartRef     = useRef<HighchartsReact.RefObject>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const width = entries[0].contentRect.width;
            setChartHeight(Math.max(400, Math.round(width * 0.38)));
            chartRef.current?.chart.reflow();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Interpretation ─────────────────────────────────────────────────────────
    const crpNote = crpSource === 'fhir' ? `The present patient's CRP trajectory is overlaid (from FHIR).`
                  : crpSource === 'mock' ? `The present patient's CRP trajectory is overlaid (indicative — no FHIR observations found).`
                  : `No CRP data found for the present patient.`;
    const interpretation = `Among ${dist.n} similar historical episodes treated with ${dist.label}, `
        + `${Math.round(epFields.rate * 100)}% achieved ${ENDPOINT_LABEL[endpoint].toLowerCase()} within 12 months `
        + `(median ${epFields.median} days; IQR ${epFields.iqr[0]}–${epFields.iqr[1]} days). `
        + crpNote;

    return (
        <div className="container-fluid">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="d-flex align-items-baseline gap-3 mb-2">
                <h5 className="mb-0">Treatment-to-Outcome Timelines</h5>
                <span className="text-muted small">Present patient vs. matched historical cohort</span>
            </div>

            <div className="row g-3 flex-nowrap">

                {/* ── Left sidebar ─────────────────────────────────────────── */}
                <div className="col-auto" style={{ width: 240 }}>
                    <div className="card h-100">
                        <div className="card-body p-3 small">

                            <p className="text-primary text-uppercase fw-semibold mb-2" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Candidate therapy</p>
                            {distributions.map(d => (
                                <div key={d.treatment} className="form-check mb-1">
                                    <input className="form-check-input" type="radio"
                                           id={`tx-${d.treatment}`}
                                           checked={candidateTx === d.treatment}
                                           onChange={() => setCandidateTx(d.treatment)} />
                                    <label className="form-check-label" htmlFor={`tx-${d.treatment}`} style={{ fontSize: '0.72rem' }}>
                                        {d.label}
                                        <span className="text-muted ms-1" style={{ fontSize: '0.65rem' }}>
                                            {Math.round(endpointFields(d, endpoint).rate * 100)}% {endpoint}
                                        </span>
                                    </label>
                                </div>
                            ))}

                            <hr className="my-2" />

                            <p className="text-primary text-uppercase fw-semibold mb-2" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Endpoint</p>
                            {ENDPOINT_OPTIONS.map(ep => (
                                <div key={ep} className="form-check mb-1">
                                    <input className="form-check-input" type="radio"
                                           id={`ep-${ep}`}
                                           checked={endpoint === ep}
                                           onChange={() => setEndpoint(ep)} />
                                    <label className="form-check-label" htmlFor={`ep-${ep}`} style={{ fontSize: '0.72rem' }}>{ep}</label>
                                </div>
                            ))}

                            <hr className="my-2" />

                            <p className="text-primary text-uppercase fw-semibold mb-2" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Display</p>
                            <div className={`form-check mb-1 ${!hasEpisodes ? 'opacity-40' : ''}`}>
                                <input className="form-check-input" type="checkbox"
                                       id="show-individuals"
                                       checked={showIndividuals && hasEpisodes}
                                       disabled={!hasEpisodes}
                                       onChange={e => setShowIndividuals(e.target.checked)} />
                                <label className="form-check-label" htmlFor="show-individuals" style={{ fontSize: '0.72rem' }}>
                                    Individual episodes
                                </label>
                            </div>
                            {!hasEpisodes && (
                                <div className="text-muted" style={{ fontSize: '0.65rem' }}>Aggregate data only</div>
                            )}

                            <hr className="my-2" />

                            <p className="text-primary text-uppercase fw-semibold mb-1 opacity-50" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>Censoring</p>
                            <div className="text-muted opacity-50" style={{ fontSize: '0.72rem' }}>Censor at therapy switch</div>

                        </div>
                    </div>
                </div>

                {/* ── Main area ────────────────────────────────────────────── */}
                <div className="col" style={{ minWidth: 0 }}>

                    {/* Chart */}
                    <div className="card mb-3">
                        <div className="card-body p-3 small">
                            {hasTrajectoryData ? (<>
                                <div className="fw-bold mb-1">
                                    CRP over time — {dist.label} cohort&nbsp;
                                    <span className="text-muted fw-normal">vs. present patient</span>
                                </div>
                                <div ref={containerRef}>
                                    <HighchartsReact ref={chartRef} highcharts={Highcharts} options={options}
                                                    containerProps={{ style: { width: '100%' } }} />
                                </div>
                            </>) : (<>
                                <div className="fw-bold mb-1">Outcome distributions by treatment choice</div>
                                <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
                                    CRP trajectory data unavailable — showing outcome distributions
                                </div>
                                <TreatmentDistChart distributions={distributions} endpoint={endpoint} />
                            </>)}
                        </div>
                    </div>

                    {/* Outcome legend for individual episodes */}
                    {showIndividuals && hasEpisodes && (
                        <div className="d-flex gap-3 mb-3 small flex-wrap">
                            {Object.entries(OUTCOME_COLOR).map(([k, v]) => (
                                <span key={k} className="d-flex align-items-center gap-1" style={{ fontSize: '0.68rem' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: v, display: 'inline-block' }} />
                                    {k}
                                </span>
                            ))}
                            <span className="text-muted" style={{ fontSize: '0.68rem' }}>— dots mark outcome day</span>
                        </div>
                    )}

                    {/* Interpretation */}
                    <div className="card">
                        <div className="card-body p-3 small">
                            <div className="fw-bold mb-1">Interpretation</div>
                            <p className="mb-0" style={{ fontSize: '0.78rem' }}>{interpretation}</p>
                            {crpSource === 'none' && (
                                <div className="alert alert-warning py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.68rem' }}>
                                    No CRP data found. Ensure CRP observations and medication start dates are present in FHIR.
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
