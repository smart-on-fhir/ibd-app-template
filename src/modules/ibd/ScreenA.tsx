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
import { useCohortData }     from './useCohortData';
import { usePatientNote }    from './usePatientNote';
import './ibd.scss';
import { Term, Tip }         from './Tooltip';
import {
    getIBDConditions,
    getIBDSubtype,
    getDiseaseDuration,
    getCurrentRegimen,
    getSteroidExposure,
    hasPriorIBDSurgery,
    hasPerianialDisease,
    getAllLabs,
    getDerivedBMI,
    getParisByFHIR,
    getLatestEndoscopy,
    normalizeMedName,
    type LabResult,
} from './utils';

// ── Small helpers ─────────────────────────────────────────────────────────────

function TrendIcon({ trend, goodDirection }: { trend: LabResult['trend']; goodDirection: LabResult['goodDirection'] }) {
    if (!trend || trend === 'stable')
        return trend === 'stable' ? <i className="ms-1 bi bi-stop-fill text-secondary opacity-50" title="Stable" /> : null;
    const good = goodDirection === null ? null : trend === goodDirection;
    const cls  = good === null ? 'text-secondary' : good ? 'text-success' : 'text-danger';
    return trend === 'up'
        ? <i className={`ms-1 bi bi-caret-up-fill ${cls}`}   title="Increasing" />
        : <i className={`ms-1 bi bi-caret-down-fill ${cls}`} title="Decreasing" />;
}

function DataRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="d-flex justify-content-between align-items-baseline ibd-data-row">
            <span className="text-muted opacity-75 text-truncate" style={{ minWidth: 0 }}>{label}</span>
            <span className="text-end ms-2">{children}</span>
        </div>
    );
}

function LabRow({ label, result }: { label: React.ReactNode; result: LabResult | null }) {
    return (
        <DataRow label={label}>
            {result ? (
                <span title={formatDate(result.date, { month: 'short', year: 'numeric' })}>
                    {result.value}
                    <TrendIcon trend={result.trend} goodDirection={result.goodDirection} />
                    {/* <span className="text-muted ms-1" style={{ fontSize: '0.65rem' }}>
                        {formatDate(result.date, { month: 'numeric', year: 'numeric' })}
                    </span> */}
                </span>
            ) : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>no data</span>}
        </DataRow>
    );
}


// ── Screen A ──────────────────────────────────────────────────────────────────

export default function IBDScreenA() {
    const { selectedPatientResources } = usePatientContext();
    const { id } = useParams();
    const { data: cohortData, loading: cohortLoading, error: cohortError } = useCohortData();
    const { data: noteData,   loading: noteLoading,   error: noteError   } = usePatientNote();

    const ibdConditions = useMemo(() => getIBDConditions(selectedPatientResources), [selectedPatientResources]);
    const subtype       = useMemo(() => getIBDSubtype(ibdConditions),               [ibdConditions]);
    const duration      = useMemo(() => getDiseaseDuration(ibdConditions),          [ibdConditions]);
    const regimen       = useMemo(() => getCurrentRegimen(selectedPatientResources), [selectedPatientResources]);
    const steroidExp    = useMemo(() => getSteroidExposure(selectedPatientResources),[selectedPatientResources]);
    const priorSurgery  = useMemo(() => hasPriorIBDSurgery(selectedPatientResources),[selectedPatientResources]);
    const perianal      = useMemo(() => hasPerianialDisease(selectedPatientResources),[selectedPatientResources]);
    const labs          = useMemo(() => getAllLabs(selectedPatientResources),         [selectedPatientResources]);
    const derivedBMI    = useMemo(() => labs.BMI ?? getDerivedBMI(selectedPatientResources), [labs.BMI, selectedPatientResources]);
    const paris         = useMemo(() => getParisByFHIR(ibdConditions, subtype, perianal), [ibdConditions, subtype, perianal]);
    const endoscopy     = useMemo(() => getLatestEndoscopy(selectedPatientResources), [selectedPatientResources]);

    // Merge FHIR-derived with note data (FHIR wins where it has data)
    const effectiveParis = useMemo(() => ({
        location: paris.location,
        behavior: paris.behavior ?? noteData?.paris?.behavior ?? null,
        perianal: paris.perianal,
        growth:   noteData?.paris?.growth ?? null,
    }), [paris, noteData]);

    const effectiveEndoscopy = useMemo(() => {
        if (endoscopy) return { ...endoscopy, ses_cd: noteData?.endoscopy?.ses_cd ?? null };
        return {
            date:    noteData?.endoscopy?.date    ?? null,
            finding: noteData?.endoscopy?.finding ?? null,
            ses_cd:  noteData?.endoscopy?.ses_cd  ?? null,
        };
    }, [endoscopy, noteData]);


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

    if (cohortLoading || noteLoading) return (
        <div className="d-flex align-items-center justify-content-center text-muted py-5">
            <span className="spinner-border spinner-border-sm me-2" />
            Loading…
        </div>
    );
    if (cohortError || noteError) return (
        <div className="alert alert-danger m-3" style={{ fontSize: '0.85rem' }}>
            <i className="bi bi-exclamation-triangle me-2" />
            {(cohortError ?? noteError)!.message}
        </div>
    );
    if (!cohortData || !noteData) return null;

    const bestTx   = cohortData.treatment_distributions.reduce((a, b) =>
        b.sfr_12m_rate > a.sfr_12m_rate ? b : a
    );
    const surgRate = cohortData.outcomes.surg_12m_rate != null
        ? Math.round(cohortData.outcomes.surg_12m_rate * 100)
        : null;

    return (
        <div className="container-fluid">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="d-flex align-items-baseline gap-3 mb-2">
                <h5 className="mb-0">IBD Dashboard – Patient Summary</h5>
                <span className="text-muted small">FHIR + note-derived (mock) · structured sources preferred</span>
            </div>
            <div className="d-flex align-items-center gap-2 mb-3 small">
                <span className="badge text-bg-warning bg-opacity-50 border border-warning">{subtype}</span>
                {duration && <span className="text-muted">Disease duration: {duration}</span>}
                {perianal && <span className="badge text-bg-warning fw-normal">Perianal disease</span>}
                {priorSurgery && <span className="badge text-bg-danger fw-normal">Prior IBD surgery</span>}
            </div>

            <div className="d-grid gap-3" style={{ gridTemplateColumns: '260px repeat(auto-fit, minmax(240px, 1fr))' }}>

                {/* ── Left rail ────────────────────────────────────────────── */}
                <div className="">
                    <div className="card h-100">
                        <div className="card-body px-3 py-2 small">

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Diagnosis</p>
                            <div className="mb-3">
                                <DataRow label="IBD type">{subtype}</DataRow>
                                <DataRow label="Duration"><span className={duration ? '' : 'text-muted'}>{duration ?? '—'}</span></DataRow>
                                <DataRow label={<Term term="Paris class">Paris class</Term>}>
                                    {effectiveParis.location
                                        ? <span>
                                            <Term term={`Paris_${effectiveParis.location}`}>{effectiveParis.location}</Term>
                                            {effectiveParis.behavior && <>{' '}<Term term={`Paris_${effectiveParis.behavior}`}>{effectiveParis.behavior}{effectiveParis.perianal ? 'p' : ''}</Term></>}
                                            {effectiveParis.growth   && <>{' '}<Term term={`Paris_${effectiveParis.growth}`}>{effectiveParis.growth}</Term></>}
                                          </span>
                                        : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>no data</span>}
                                </DataRow>
                                <DataRow label="Endoscopy">
                                    <span data-tooltip={effectiveEndoscopy.finding}>
                                        {effectiveEndoscopy.date
                                            ? formatDate(effectiveEndoscopy.date, { month: 'short', year: 'numeric' })
                                            : 'On file'}
                                        {effectiveEndoscopy.ses_cd != null &&
                                            <span className="text-muted ms-1">· <Term term="SES-CD">SES-CD</Term> {effectiveEndoscopy.ses_cd}</span>}
                                    </span>
                                </DataRow>
                                <DataRow label="Activity score">
                                    {noteData.activity_score ? (
                                        <span>
                                            <Term term={noteData.activity_score.index}>{noteData.activity_score.index}</Term>{' '}{noteData.activity_score.value}
                                            <span className="text-muted ms-1">({noteData.activity_score.severity})</span>
                                        </span>
                                    ) : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                </DataRow>
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Current symptoms</p>
                            <div className="mb-3">
                                <DataRow label="Abdominal pain">
                                    {noteData.symptoms?.abdominal_pain ? (
                                        <span className={
                                            noteData.symptoms.abdominal_pain === 'severe'   ? 'text-danger'  :
                                            noteData.symptoms.abdominal_pain === 'moderate' ? 'text-warning' : 'text-muted'}>
                                            {noteData.symptoms.abdominal_pain[0].toUpperCase() + noteData.symptoms.abdominal_pain.slice(1)}
                                        </span>
                                    ) : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                </DataRow>
                                <DataRow label="Stool frequency">
                                    {noteData.symptoms?.stool_freq_per_day != null
                                        ? `${noteData.symptoms.stool_freq_per_day}/day`
                                        : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                </DataRow>
                                <DataRow label="Weight loss">
                                    {noteData.symptoms?.weight_loss_kg_since_last_visit != null
                                        ? noteData.symptoms.weight_loss_kg_since_last_visit > 0
                                            ? `${noteData.symptoms.weight_loss_kg_since_last_visit} kg`
                                            : <span className="text-muted">None</span>
                                        : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                </DataRow>
                                <DataRow label="Nocturnal stool">
                                    {noteData.symptoms?.nocturnal_stool != null
                                        ? noteData.symptoms.nocturnal_stool
                                            ? <span className="text-warning">Yes</span>
                                            : <span className="text-muted">No</span>
                                        : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                </DataRow>
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Recent labs</p>
                            <div className="mb-3">
                                <LabRow label={<Term term="CRP">CRP</Term>}                  result={labs.CRP} />
                                <LabRow label={<Term term="ESR">ESR</Term>}                  result={labs.ESR} />
                                <LabRow label="Albumin"                                      result={labs.Albumin} />
                                <LabRow label={<Term term="Calprotectin">Calprotectin</Term>} result={labs.Calprotectin} />
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Growth / nutrition</p>
                            <div className="mb-3">
                                <LabRow label="Weight"                                        result={labs.Weight} />
                                <LabRow label="Height"                                        result={labs.Height} />
                                <LabRow label={<Term term="BMI">BMI</Term>}                   result={derivedBMI} />
                                <LabRow label={<Term term="Pre-albumin">Pre-albumin</Term>}   result={labs.PreAlbumin} />
                            </div>

                            <p className="text-primary text-uppercase mb-1 fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Key facts</p>
                            <div>
                                <DataRow label="Steroid exposure">
                                    {steroidExp.totalCourses > 0
                                        ? `${steroidExp.totalCourses} course${steroidExp.totalCourses > 1 ? 's' : ''}`
                                        : <span className="text-muted">None</span>}
                                </DataRow>
                                <DataRow label="Adherence">
                                    {noteData.adherence ? (
                                        <span className={
                                            noteData.adherence === 'poor'    ? 'text-danger'  :
                                            noteData.adherence === 'partial' ? 'text-warning' : 'text-success'}>
                                            {noteData.adherence[0].toUpperCase() + noteData.adherence.slice(1)}
                                        </span>
                                    ) : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                </DataRow>
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
                <div className="d-flex flex-column">

                    {/* ── Top summary cards ── */}
                    <div className="row g-2 mb-3">
                        {/* Current regimen — real data */}
                        <div className="col-6 col-xl-3">
                            <Tip term="card:regimen">
                                <div className="card h-100">
                                    <div className="card-body px-3 py-2 small">
                                        <div className="text-primary text-uppercase fw-semibold mb-2 text-center" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Current regimen</div>
                                        {regimen.length > 0 ? (
                                            regimen.map((m, i) => (
                                                <DataRow key={i} label={<span className='text-black' title={m.name}>{normalizeMedName(m.name)}</span>}>
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
                            </Tip>
                        </div>

                        {/* Historical cohort */}
                        <div className="col-6 col-xl-3">
                            <Link to="cohort" className="text-decoration-none text-center">
                                <Tip term="card:cohort" cursor="pointer">
                                    <div className="card h-100">
                                        <div className="card-body px-3 py-2" style={{ color: '#A6A' }}>
                                            <div className="text-uppercase fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Historical cohort</div>
                                            <div className="fw-semibold my-2" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{cohortData.cohort_size}</div>
                                            <div className="text-muted" style={{ fontSize: '0.68rem' }}>similar episodes matched</div>
                                        </div>
                                    </div>
                                </Tip>
                            </Link>
                        </div>

                        {/* Best historical response */}
                        <div className="col-6 col-xl-3 text-center">
                            <Tip term="card:best-response">
                                <div className="card h-100">
                                    <div className="card-body px-3 py-2">
                                        <div className="text-uppercase fw-semibold text-success" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Best {/*historical*/} response</div>
                                        <div className="fw-semibold text-success my-2" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{bestTx.label}</div>
                                        <div style={{ fontSize: '0.72rem' }}>
                                            <span className="text-muted fw-semibold">{Math.round(bestTx.sfr_12m_rate * 100)}% SFR</span>
                                            <span className="text-muted ms-1">· median {bestTx.median_days_to_sfr}d</span>
                                        </div>
                                    </div>
                                </div>
                            </Tip>
                        </div>

                        {/* Risk signal */}
                        <div className="col-6 col-xl-3 text-center">
                            <Tip term="card:risk-signal">
                                <div className="card h-100">
                                    <div className="card-body px-3 py-2" style={{ color: surgRate != null && surgRate >= 20 ? '#dc3545' : '#fd7e14' }}>
                                        <div className="text-uppercase fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Risk signal</div>
                                        <div className="fw-semibold my-2" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{surgRate != null ? `${surgRate}%` : '—'}</div>
                                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>surgery within 12 mo in cohort</div>
                                    </div>
                                </div>
                            </Tip>
                        </div>
                    </div>

                    {/* ── Current medications detail + Phenotype context ── */}
                    <div className="row g-2 mb-3">
                        <div className="col-md-6">
                            <div className="card h-100">
                                <div className="card-body p-3 small">
                                    <p className="fw-bold mb-2">Phenotype and treatment context</p>
                                    <div>
                                        <DataRow label="Disease phenotype">{subtype}{perianal ? ' + perianal' : ''}</DataRow>
                                        <DataRow label="Severity trend">
                                            {noteData.severity_trend ? (
                                                <span className={
                                                    noteData.severity_trend === 'worsening' ? 'text-danger'  :
                                                    noteData.severity_trend === 'improving' ? 'text-success' : 'text-muted'}>
                                                    {noteData.severity_trend[0].toUpperCase() + noteData.severity_trend.slice(1)}
                                                </span>
                                            ) : <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>—</span>}
                                        </DataRow>
                                        <DataRow label="Biomarker trend">{biomarkerTrend ?? <span className="text-muted fst-italic opacity-50" style={{ fontSize: '0.72em' }}>no data</span>}</DataRow>
                                        <DataRow label="Steroid dependence">{steroidDependenceLabel}</DataRow>
                                        <DataRow label="Data confidence"><span className="text-muted">FHIR + note mock</span></DataRow>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <div className="col-md-6">
                            <div className="card h-100">
                                <div className="card-body p-3 small">
                                    <p className="fw-bold mb-2">Recommended next views</p>
                                    {[
                                        { n: 1, label: 'Compare outcome timelines',     desc: 'Days from treatment start to remission, surgery, or escalation.',      available: true,
                                          link: 'timeline' },
                                        { n: 2, label: 'Inspect matched cohort',         desc: 'Review why patients were considered similar.',                         available: true,
                                          link: 'cohort' },
                                        { n: 3, label: 'Review treatment trajectories',  desc: 'All biologic and steroid transitions before the chosen endpoint.',     available: true,
                                          link: 'meds' },
                                        { n: 4, label: 'View raw data evidence',           desc: 'Inspect FHIR resources behind any label or lab value.',                available: true,
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
                    <div className="card" style={{ flex: '1 0 0'}}>
                        <div className="card-body p-3 small d-flex flex-column">
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
