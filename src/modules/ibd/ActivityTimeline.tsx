/**
 * Recent disease activity timeline.
 * Plots CRP, Calprotectin, and PCT (if available) over time using Highcharts.
 * Single-patient data only — no cohort data required.
 */
import { useMemo }           from 'react';
import HighchartsReact       from 'highcharts-react-official';
import Highcharts            from '../../highcharts';
import { usePatientContext } from '../../contexts/PatientContext';
import { useCohortData }     from './useCohortData';
import { getLabHistory, getMedHistory, normalizeMedName } from './utils';

function normalizeCRP(value: number, unit: string): number {
    const u = unit.toLowerCase();
    if (u === 'mg/dl' || u === 'mg%') return value * 10;
    if (u === 'g/l')                  return value * 1000;
    return value;
}

export default function ActivityTimeline() {
    const { selectedPatientResources } = usePatientContext();
    const { data: cohortData } = useCohortData();

    const crpPoints  = useMemo(() => getLabHistory(selectedPatientResources, 'CRP'),          [selectedPatientResources]);
    const fcalPoints = useMemo(() => getLabHistory(selectedPatientResources, 'Calprotectin'), [selectedPatientResources]);
    const pctPoints  = useMemo(() => getLabHistory(selectedPatientResources, 'PCT'),          [selectedPatientResources]);

    // Day 0 = most recent biologic start (for anchoring mock CRP to real dates)
    const day0Ms = useMemo(() => {
        const biologics = getMedHistory(selectedPatientResources).filter(m => m.class === 'biologic');
        if (!biologics.length) return null;
        const now = Date.now();
        const isActive = (m: typeof biologics[number]) => m.status === 'active' || m.endMs > now;
        const firstStartByName = (subset: typeof biologics) => {
            const map = new Map<string, number>();
            for (const m of subset) {
                const key = normalizeMedName(m.name);
                const prev = map.get(key);
                if (prev === undefined || m.startMs < prev) map.set(key, m.startMs);
            }
            return map.size ? Math.max(...map.values()) : null;
        };
        return firstStartByName(biologics.filter(isActive)) ?? firstStartByName(biologics);
    }, [selectedPatientResources]);

    // Effective CRP: FHIR if available, otherwise mock trajectory anchored to Day 0
    const effectiveCrpPoints = useMemo((): { date: number; value: number; isMock: boolean }[] => {
        if (crpPoints.length) return crpPoints.map(p => ({
            date: p.date,
            value: normalizeCRP(p.value, p.unit),
            isMock: false,
        }));
        const mockTraj: { day: number; crp: number }[] = (cohortData as any)?.present_patient?.crp_trajectory ?? [];
        if (!mockTraj.length || day0Ms === null) return [];
        return mockTraj.map(p => ({
            date: day0Ms + p.day * 86_400_000,
            value: p.crp,
            isMock: true,
        }));
    }, [crpPoints, cohortData, day0Ms]);

    const effectivePctPoints = useMemo((): { date: number; value: number; isMock: boolean }[] => {
        if (pctPoints.length) return pctPoints.map(p => ({ date: p.date, value: p.value, isMock: false }));
        const mockTraj: { day: number; pct: number }[] = (cohortData as any)?.present_patient?.pct_trajectory ?? [];
        if (!mockTraj.length || day0Ms === null) return [];
        return mockTraj.map(p => ({ date: day0Ms + p.day * 86_400_000, value: p.pct, isMock: true }));
    }, [pctPoints, cohortData, day0Ms]);

    const isMockCrp = effectiveCrpPoints.length > 0 && effectiveCrpPoints[0].isMock;
    const isMockPct = effectivePctPoints.length > 0 && effectivePctPoints[0].isMock;
    const hasData = effectiveCrpPoints.length > 0 || fcalPoints.length > 0 || effectivePctPoints.length > 0;

    const options: Highcharts.Options = useMemo(() => ({
        chart: {
            height:           236,
            marginTop:        20,
            marginBottom:     50,
            backgroundColor:  'transparent',
            animation:        false,
            style:            { fontFamily: 'inherit' },
        },
        title:    { text: undefined },
        legend: {
            enabled:         true,
            verticalAlign:   'bottom',
            align:           'center',
            layout:          'horizontal',
            itemStyle:       { fontWeight: 'normal', fontSize: '0.72rem' },
            margin:          0,
            y:               22,
        },
        credits:  { enabled: false },
        exporting: { enabled: false },
        xAxis: {
            type:      'datetime',
            lineColor: '#dee2e6',
            tickColor: '#dee2e6',
            labels:    { style: { fontSize: '0.65rem', color: '#6c757d' } },
        },
        yAxis: [
            // CRP / PCT axis (left) — both in low numeric range
            {
                title:    { text: 'CRP (mg/L) · <span style="color:#6f42c1">PCT (ng/mL)</span>', useHTML: true, style: { fontSize: '0.6rem', color: '#dc3545' }, margin: 10 },
                min:      0,
                labels:   { style: { fontSize: '0.65rem', color: '#6c757d' } },
                gridLineColor: '#f0f0f0',
                id:       'crp',
            },
            // Calprotectin axis (right)
            {
                title:    { text: 'Fcal (μg/g)', style: { fontSize: '0.6rem', color: '#0d6efd' }, margin: 10 },
                min:      0,
                opposite: true,
                labels:   { style: { fontSize: '0.65rem', color: '#6c757d' } },
                gridLineWidth: 0,
                id:       'fcal',
            },
        ],
        tooltip: {
            shared:          true,
            xDateFormat:     '%b %Y',
            valueDecimals:   1,
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderColor:     '#dee2e6',
            style:           { fontSize: '0.72rem' },
        },
        series: [
            {
                type:        'line',
                name:        isMockCrp ? 'CRP (mg/L) — indicative' : 'CRP (mg/L)',
                yAxis:       'crp',
                data:        effectiveCrpPoints.map(p => [p.date, p.value]),
                dashStyle:   isMockCrp ? 'ShortDot' : 'Solid',
                color:       '#dc3545',
                lineWidth:   2,
                marker:      { radius: 3, symbol: 'circle' },
            },
            {
                type:        'line',
                name:        'Fcal (μg/g)',
                yAxis:       'fcal',
                data:        fcalPoints.map(p => [p.date, p.value]),
                color:       '#0d6efd',
                lineWidth:   2,
                marker:      { radius: 3, symbol: 'circle' },
                dashStyle:   'ShortDash',
            },
            ...(effectivePctPoints.length ? [{
                type:        'line' as const,
                name:        isMockPct ? 'PCT (ng/mL) — indicative' : 'PCT (ng/mL)',
                yAxis:       'crp',
                data:        effectivePctPoints.map(p => [p.date, p.value]),
                color:       '#6f42c1',
                lineWidth:   2,
                marker:      { radius: 3, symbol: 'diamond' },
                dashStyle:   isMockPct ? ('Dot' as const) : ('Solid' as const),
            }] : []),
        ],
    }), [effectiveCrpPoints, fcalPoints, effectivePctPoints, isMockCrp, isMockPct]);

    if (!hasData) {
        return (
            <div className="d-flex align-items-center justify-content-center text-muted border rounded"
                 style={{ height: '90px', fontSize: '0.78rem', background: '#f8f9fa' }}>
                <i className="bi bi-graph-up me-2 opacity-50" />
                No CRP or Calprotectin observations found
            </div>
        );
    }

    return (
        <HighchartsReact highcharts={Highcharts} options={options} />
    );
}
