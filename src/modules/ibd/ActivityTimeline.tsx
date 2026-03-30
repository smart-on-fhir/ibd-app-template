/**
 * Recent disease activity timeline.
 * Plots CRP and Calprotectin over time using Highcharts.
 * Single-patient data only — no cohort data required.
 */
import { useMemo }           from 'react';
import HighchartsReact       from 'highcharts-react-official';
import Highcharts            from '../../highcharts';
import { usePatientContext } from '../../contexts/PatientContext';
import { getLabHistory }     from './utils';

export default function ActivityTimeline() {
    const { selectedPatientResources } = usePatientContext();

    const crpPoints  = useMemo(() => getLabHistory(selectedPatientResources, 'CRP'),          [selectedPatientResources]);
    const fcalPoints = useMemo(() => getLabHistory(selectedPatientResources, 'Calprotectin'), [selectedPatientResources]);

    const hasData = crpPoints.length > 0 || fcalPoints.length > 0;

    const options: Highcharts.Options = useMemo(() => ({
        chart: {
            height:           150,
            margin:           [20, 12, 50, 44],
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
            // CRP axis (left)
            {
                title:    { text: 'CRP (mg/L)', style: { fontSize: '0.6rem', color: '#dc3545' }, margin: 4 },
                min:      0,
                labels:   { style: { fontSize: '0.65rem', color: '#6c757d' } },
                gridLineColor: '#f0f0f0',
                id:       'crp',
            },
            // Calprotectin axis (right)
            {
                title:    { text: 'Fcal (μg/g)', style: { fontSize: '0.6rem', color: '#0d6efd' }, margin: 4 },
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
                name:        'CRP (mg/L)',
                yAxis:       'crp',
                data:        crpPoints.map(p => [p.date, p.value]),
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
        ],
    }), [crpPoints, fcalPoints]);

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
