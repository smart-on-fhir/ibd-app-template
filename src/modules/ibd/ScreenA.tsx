/**
 * IBD Screen A — Present Patient Summary
 * Based on the IBD CDS Dashboard spec (Section 8, Screen A / Figure 1).
 *
 * Shows all fields derivable from structured FHIR data.
 * Fields requiring LLM extraction or population data are shown as "—" / "Not available".
 */
import { useMemo }            from 'react';
import { Link, useParams }    from 'react-router-dom';
import { usePatientContext }  from '../../contexts/PatientContext';
import ActivityTimeline       from './ActivityTimeline';
import { formatDate }         from '../../utils';
import {
    getIBDConditions,
    getIBDSubtype,
    getDiseaseDuration,
    getCurrentRegimen,
    getSteroidExposure,
    hasPriorIBDSurgery,
    hasPerianialDisease,
    getAllLabs,
    type LabResult,
} from './utils';

// ── Small helpers ─────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: LabResult['trend'] }) {
    if (trend === 'up')     return <i className="bi bi-arrow-up-short text-danger"    title="Increasing"  />;
    if (trend === 'down')   return <i className="bi bi-arrow-down-short text-success" title="Decreasing" />;
    if (trend === 'stable') return <i className="bi bi-dash text-muted"               title="Stable"      />;
    return null;
}

function DataRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="d-flex justify-content-between align-items-baseline" style={{ fontSize: '0.78rem', padding: '0.1rem 0', borderBottom: '1px solid #8882' }}>
            <span className="text-muted opacity-75 text-truncate" style={{ minWidth: 0 }}>{label}</span>
            <span className="text-end ms-2">{children}</span>
        </div>
    );
}

function LabRow({ label, result }: { label: string; result: LabResult | null }) {
    return (
        <DataRow label={label}>
            {result ? (
                <span title={formatDate(result.date, { month: 'short', year: 'numeric' })}>
                    {result.value}
                    <TrendIcon trend={result.trend} />
                    {/* <span className="text-muted ms-1" style={{ fontSize: '0.65rem' }}>
                        {formatDate(result.date, { month: 'numeric', year: 'numeric' })}
                    </span> */}
                </span>
            ) : <span className="text-muted opacity-25">—</span>}
        </DataRow>
    );
}


// ── Screen A ──────────────────────────────────────────────────────────────────

export default function IBDScreenA() {
    const { selectedPatientResources } = usePatientContext();
    const { id } = useParams();

    const ibdConditions = useMemo(() => getIBDConditions(selectedPatientResources), [selectedPatientResources]);
    const subtype       = useMemo(() => getIBDSubtype(ibdConditions),               [ibdConditions]);
    const duration      = useMemo(() => getDiseaseDuration(ibdConditions),          [ibdConditions]);
    const regimen       = useMemo(() => getCurrentRegimen(selectedPatientResources), [selectedPatientResources]);
    const steroidExp    = useMemo(() => getSteroidExposure(selectedPatientResources),[selectedPatientResources]);
    const priorSurgery  = useMemo(() => hasPriorIBDSurgery(selectedPatientResources),[selectedPatientResources]);
    const perianal      = useMemo(() => hasPerianialDisease(selectedPatientResources),[selectedPatientResources]);
    const labs          = useMemo(() => getAllLabs(selectedPatientResources),         [selectedPatientResources]);


    const biomarkerTrend = (() => {
        const r = (label: string, cls: string) => <span className={cls}>{label}</span>;
        if (labs.CRP?.trend === 'up')     return r('CRP worsening',         'text-danger');
        if (labs.CRP?.trend === 'down')   return r('CRP improving',         'text-success');
        if (labs.CRP?.trend === 'stable') return r('CRP stable',            'text-muted');
        if (labs.Calprotectin?.trend === 'up')   return r('Calprotectin worsening', 'text-danger');
        if (labs.Calprotectin?.trend === 'down') return r('Calprotectin improving', 'text-success');
        return null;
    })();

    const steroidDependenceLabel = (() => {
        if (steroidExp.activeCourses > 0) return 'Possible — currently on steroid';
        if (steroidExp.totalCourses >= 2) return `${steroidExp.totalCourses} courses historically`;
        if (steroidExp.totalCourses === 1) return '1 course historically';
        return 'None identified';
    })();

    return (
        <div className="container-fluid">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="d-flex align-items-baseline gap-3 mb-2">
                <h5 className="mb-0">IBD Dashboard – Patient Summary</h5>
                <span className="text-muted small">Structured FHIR data only · note-derived fields shown as "—"</span>
            </div>
            <div className="d-flex align-items-center gap-2 mb-3 small">
                <span className="badge text-bg-warning bg-opacity-50 border border-warning">{subtype}</span>
                {duration && <span className="text-muted">Disease duration: {duration}</span>}
                {perianal && <span className="badge text-bg-warning fw-normal">Perianal disease</span>}
                {priorSurgery && <span className="badge text-bg-danger fw-normal">Prior IBD surgery</span>}
            </div>

            <div className="d-grid gap-3" style={{ gridTemplateColumns: '240px repeat(auto-fit, minmax(240px, 1fr))' }}>

                {/* ── Left rail ────────────────────────────────────────────── */}
                <div className="">
                    <div className="card h-100">
                        <div className="card-body p-3 small">

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Diagnosis</p>
                            <div className="mb-3">
                                <DataRow label="IBD type">{subtype}</DataRow>
                                <DataRow label="Duration"><span className={duration ? '' : 'text-muted'}>{duration ?? '—'}</span></DataRow>
                                <DataRow label="Paris class"><span className="text-muted opacity-25">—</span></DataRow>
                                <DataRow label="Endoscopy"><span className="text-muted opacity-25">—</span></DataRow>
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Current symptoms</p>
                            <div className="mb-3">
                                <DataRow label="Abdominal pain"><span className="text-muted opacity-25">—</span></DataRow>
                                <DataRow label="Stool frequency"><span className="text-muted opacity-25">—</span></DataRow>
                                <DataRow label="Weight loss"><span className="text-muted opacity-25">—</span></DataRow>
                                <DataRow label="Nocturnal stool"><span className="text-muted opacity-25">—</span></DataRow>
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Recent labs</p>
                            <div className="mb-3">
                                <LabRow label="CRP"          result={labs.CRP} />
                                <LabRow label="ESR"          result={labs.ESR} />
                                <LabRow label="Albumin"      result={labs.Albumin} />
                                <LabRow label="Calprotectin" result={labs.Calprotectin} />
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Key facts</p>
                            <div>
                                <DataRow label="Steroid exposure">
                                    {steroidExp.totalCourses > 0
                                        ? `${steroidExp.totalCourses} course${steroidExp.totalCourses > 1 ? 's' : ''}`
                                        : <span className="text-muted">None</span>}
                                </DataRow>
                                <DataRow label="Adherence"><span className="text-muted opacity-25">—</span></DataRow>
                                <DataRow label="Prior surgery">
                                    {priorSurgery ? <span className="text-danger">Yes</span> : <span className="text-muted">No</span>}
                                </DataRow>
                                <DataRow label="Perianal disease">
                                    {perianal ? <span className="text-warning">Yes</span> : <span className="text-muted">No</span>}
                                </DataRow>
                            </div>

                        </div>
                    </div>
                </div>

                {/* ── Main area ────────────────────────────────────────────── */}
                <div className="">

                    {/* ── Top summary cards ── */}
                    <div className="row g-2 mb-3">
                        {/* Current regimen — real data */}
                        <div className="col-6 col-xl-3">
                            <div className="card h-100">
                                <div className="card-body p-2 small">
                                    <div className="d-flex align-items-center gap-2 mb-1">
                                        <i className="bi bi-capsule text-primary" />
                                        <span className="text-primary text-uppercase fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Current regimen</span>
                                        {/* <span className="text-muted" style={{ fontSize: '0.72rem' }}>Current regimen</span> */}
                                    </div>
                                    {regimen.length > 0 ? (
                                        regimen.map((m, i) => (
                                            <DataRow key={i} label={<span className='text-black' title={m.name}>{m.name}</span>}>
                                                {m.startDate
                                                    ? <span className="text-muted opacity-75 text-nowrap">{formatDate(m.startDate)}</span>
                                                    : <span className="text-muted opacity-75">—</span>}
                                            </DataRow>
                                        ))
                                    ) : (
                                        <div className="text-muted">No active IBD medications</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Historical cohort / response / risk — no population data */}
                        {[
                            { label: 'Historical cohort',        icon: 'bi-people', className: 'text-success' },
                            { label: 'Best historical response', icon: 'bi-graph-up', className: 'text-info' },
                            { label: 'Risk signal',              icon: 'bi-exclamation-triangle', className: 'text-warning' },
                        ].map(card => (
                            <div className="col-6 col-xl-3" key={card.label}>
                                <div className="card h-100">
                                    <div className="card-body p-2 small">
                                        <div className="d-flex align-items-center gap-2 mb-1">
                                            <i className={`bi ${card.icon} ${card.className}`} />
                                            <span className={`${card.className} text-uppercase fw-semibold`} style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>{card.label}</span>
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>Not available</div>
                                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>No population data loaded</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Current medications detail + Phenotype context ── */}
                    <div className="row g-2 mb-3">
                        <div className="col-md-6">
                            <div className="card h-100">
                                <div className="card-body p-3 small">
                                    <p className="fw-bold mb-2">Phenotype and treatment context</p>
                                    <div>
                                        <DataRow label="Disease phenotype">{subtype}{perianal ? ' + perianal' : ''}</DataRow>
                                        <DataRow label="Severity trend"><span className="text-muted opacity-25">— (note-derived)</span></DataRow>
                                        <DataRow label="Biomarker trend">{biomarkerTrend ?? <span className="text-muted opacity-25">—</span>}</DataRow>
                                        <DataRow label="Steroid dependence">{steroidDependenceLabel}</DataRow>
                                        <DataRow label="Data confidence"><span className="text-muted">Structured only</span></DataRow>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <div className="col-md-6">
                            <div className="card h-100">
                                <div className="card-body p-3 small">
                                    <p className="fw-bold mb-2">Recommended next views</p>
                                    {[
                                        { n: 1, label: 'Compare outcome timelines',     desc: 'Days from treatment start to remission, surgery, or escalation.',      available: false },
                                        { n: 2, label: 'Inspect matched cohort',         desc: 'Review why patients were considered similar.',                         available: false },
                                        { n: 3, label: 'Review treatment trajectories',  desc: 'All biologic and steroid transitions before the chosen endpoint.',     available: false },
                                        { n: 4, label: 'Open source evidence',           desc: 'Inspect FHIR resources behind any label or lab value.',                available: true,
                                          link: `/patients/${id}/timeline` },
                                    ].map(item => (
                                        <div key={item.n} className={`d-flex gap-2 mb-2 align-items-center lh-sm ${!item.available ? 'opacity-50' : ''}`}>
                                            <span className="badge text-bg-primary rounded-circle flex-shrink-0"
                                                  style={{ width: '1.4rem', height: '1.4rem', fontSize: '0.7rem', lineHeight: '1.4rem', padding: 0, textAlign: 'center' }}>
                                                {item.n}
                                            </span>
                                            <div>
                                                {item.available && item.link
                                                    ? <Link to={item.link} className="fw-semibold text-decoration-none" style={{ fontSize: '0.78rem' }}>{item.label}</Link>
                                                    : <div className="fw-semibold" style={{ fontSize: '0.78rem' }}>{item.label}</div>}
                                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>{item.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Recent disease activity timeline placeholder ── */}
                    <div className="card">
                        <div className="card-body p-3 small">
                            <p className="fw-bold mb-1">Recent disease activity timeline</p>
                            <p className="text-muted mb-2" style={{ fontSize: '0.72rem' }}>
                                Compact orientation chart showing inflammation and symptom burden before the current decision point.
                            </p>
                            <ActivityTimeline />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
