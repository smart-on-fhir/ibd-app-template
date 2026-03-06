import { useRef, useState, useEffect } from 'react';
import HighchartsReact                 from 'highcharts-react-official';
import { type TimelineEvent }          from './utils';
import { humanizeDuration }            from '../../utils';
import Highcharts                      from '../../highcharts'
import 'highcharts/modules/timeline';
import 'highcharts/modules/accessibility';


function getDataInRange(data: TimelineEvent[], start: number, end: number) {
    return data.filter(d => {
        const eventStart = new Date(d.date).valueOf();
        const eventEnd   = new Date(d.endDate ?? d.date).valueOf();
        return eventStart <= end && eventEnd >= start;
    });
}

export default function TimelineChart({
    data,
    start,
    end,
    onSelectionChange = () => {},
    resourceCounts,
    selectedResourceTypes
}: {
    data: any[];
    start: number;
    end: number;
    onSelectionChange?: (resources: TimelineEvent[]) => void;
    resourceCounts: Map<string, number>;
    selectedResourceTypes: string[];
}) {
    const chartRef  = useRef<any>(null);
    const resources = Array.from(resourceCounts.keys());
    const [selection, setSelection] = useState<[number, number] | null>(null);
    // Categories = resource types actually present in data, in original resource order
    const presentTypes = new Set(data.map((d: TimelineEvent) => d.resourceType));
    const categories = (selectedResourceTypes.length > 0 ? selectedResourceTypes : resources)
        .filter(rt => presentTypes.has(rt));
    const options: Highcharts.Options = {
        chart: {
            height: 30 + categories.length * 28,
            margin: [8, 10, 30, 170],
            zooming: {
                singleTouch: true,
                type: 'x',
                mouseWheel: {
                    enabled: true,
                    type: 'x'
                }
            },
            animation: false,
            plotBorderColor: '#318ebc66',
            plotBorderWidth: 1,
            plotBackgroundColor: '#318ebc11',
            plotShadow: false,
            borderWidth: 0,
            borderColor: '#318ebc66',
            backgroundColor: '#FFF',
            borderRadius: 5,
            shadow: false,
            panning: {
                enabled: true,
                type: 'x',                
            },
            panKey: 'shift',
            scrollablePlotArea: {
                minWidth: 800,
                scrollPositionX: 1,
                scrollPositionY: 0,
                opacity: 1,
            },
            selectionMarkerFill: '#318ebc22',
            events: {
                selection: function(event) {
                    const x1 = event.xAxis[0].min;
                    const x2 = event.xAxis[0].max;
                    setSelection([x1, x2]); 
                    const events = getDataInRange(data, x1, x2);
                    onSelectionChange(events as TimelineEvent[]);
                    return false
                },
                click: function(this: any) {
                    this.series[0]?.data.forEach((p: any) => p.selected && p.select(false, false));
                    setSelection(null);
                    onSelectionChange([]);
                }
            }
        },
        exporting: { enabled: false },
        credits: { enabled: false },
        title: { text: '' },
        subtitle: { text: '' },
        xAxis: [{
            type: 'datetime',
            title: { text: '' },
            ordinal: false,
            lineWidth: 1,
            lineColor: '#318ebc66',
            gridLineWidth: 1,
            gridLineColor: '#0001',
            gridZIndex: 0,
            tickColor: '#DDD',
            tickLength: 18,
            endOnTick: false,
            startOnTick: false,
            minPadding: 0.01,
            maxPadding: 0.01,
            labels: {
                align: 'left',
                x: 4,
                y: 16,
                style: {
                    color: '#888',
                    fontSize: '13px',
                    fontWeight: 'normal',
                }
            },
            crosshair: {
                color: '#8888',
                zIndex: 3,
                snap: false,
                dashStyle: 'ShortDash',
            },
            plotBands: selection ? [{
                color: '#F903',
                from : selection[0],
                to   : selection[1],
                zIndex: 2,
                borderColor: '#C60',
                borderWidth: 1,
            }] : undefined,
        }],
        yAxis: {
            type: 'category',
            reversed: false,
            categories,
            title: { text: '' },
            lineWidth: 1,
            lineColor: '#318ebc66',
            startOnTick: false,
            endOnTick: false,
            gridLineColor: '#DDD',
            gridLineWidth: 1,
            gridLineDashStyle: 'ShortDash',
            gridZIndex: 0,
            labels: {
                style: {
                    fontSize  : '15px',
                    fontWeight: '500',
                    color     : '#444',
                }
            },
            crosshair: {
                color: '#318ebc22',
            }
        },
        tooltip: {
            enabled: true,
            borderColor: '#318ebc',
            borderRadius: 5,
            borderWidth: 1,
            shared: false,
            followPointer: false,
            outside: true,
            distance: 10,
            useHTML: true,
            shadow: {
                color: 'rgba(0, 0, 0, 0.3)',
                offsetX: 1,
                offsetY: 1,
                width: 5
            },
            formatter: function (this: any) {
                const html: string[] = [];
                
                html.push(`<table><tbody>`);

                if (this.point.options.custom.display) {
                    html.push(`<tr><th colspan="2">${this.point.options.custom.display}<hr style="margin: 4px 0"/></th></tr>`);
                }

                const startDate = new Date(this.x);

                if (this.point.options.x2 !== this.point.options.x) {
                    const endDate = new Date(this.point.options.x2);
                    html.push(`<tr><th style="text-align:right;">From: </th><td> ${startDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>`);
                    html.push(`<tr><th style="text-align:right;">To: </th><td> ${endDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>`);

                    html.push(`<tr><th style="text-align:right;">Duration: </th><td> ${humanizeDuration(startDate, endDate)}</td></tr>`);
                } else {
                    html.push(`<tr><th style="text-align:right;">Date: </th><td> ${startDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>`);
                }

                html.push(`<tr><th style="text-align:right;">Type: </th><td> ${this.point.options.custom.resourceType}</td></tr>`);

                const items = getDataInRange(data, this.x - 1000*60*60*12, this.x2 + 1000*60*60*12).filter((d => d.resourceType === this.point.options.custom.resourceType));
                if (items.length > 1) {
                    html.push(`<tr><th style="text-align:right;">Events: </th><td> ${items.length}</td></tr>`);
                }

                html.push(`</tbody></table>`);

                return html.join('');
            }
        },
        plotOptions: {
            xrange: {
                animation: false,
                states: {
                    select: {
                        enabled: true,
                        color: '#F80',
                        borderColor: '#C30',
                        borderWidth: 1,
                    }
                }
            },
        },
        series: [{
            type: 'xrange',
            minPointLength: 8,
            maxPointWidth : 20,
            enableMouseTracking: true,
            borderRadius  : 2,
            borderWidth   : 0,
            showInLegend : false,
            pointRange    : 2,
            allowPointSelect: true,
            centerInCategory: true,
            zIndex: 8,
            dataLabels: {
                enabled: false,
                format: `{point.name}`,
                overflow: 'justify',
                align: 'left',
                crop: true,
                inside: false,
                verticalAlign: 'top',
                padding: 0,
                allowOverlap: false,
                x: 9,
                y: -13,
                zIndex: 3,
                style: {
                    fontSize: '12px',
                    fontWeight: 'normal',
                    color: '#3338',
                    textOutline: 'none',
                },
            },
            userOptions: {
                selection
            },
            id: 'periods' + (selection ? selection.join('-') : ''),
            data: data.map((d: TimelineEvent) => {
                return ({
                    x     : d.date,
                    x2    : d.endDate ?? d.date,
                    y     : categories.indexOf(d.resourceType),
                    color: '#318ebc88',
                    name  : d.display || d.category || d.resourceType,
                    custom: d,
                    selected: selection ?
                    !!(
                        +new Date(d.date             ) <= selection[1] &&
                        +new Date(d.endDate ?? d.date) >= selection[0]
                    ) : false,
                });
            }),
            point: {
                events: {
                    click: function(this: any) {
                        if (this.selected) {
                            // already selected → clicking again deselects
                            setSelection(null);
                            onSelectionChange([]);
                        } else {
                            setSelection([this.x, this.x2]);
                            const events = this.series.data
                                .filter((p: any) => p.x >= this.x - 1000*60*60 && p.x2 <= this.x2 + 1000*60*60)
                                .map((p: any) => p.custom);
                            onSelectionChange(events as TimelineEvent[]);
                        }
                    }
                }
            }
        }] as unknown as Highcharts.SeriesXrangeOptions[],
    };

    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        try {
            const axis = chart.xAxis && chart.xAxis[0];
            if (axis && typeof axis.setExtremes === 'function') {
                const pad = Math.max((end - start) * 0.01, 1000 * 60 * 60 * 24);
                axis.setExtremes(start - pad, end + pad, true, false);
            }
        } catch (err) {
            // ignore setExtremes errors
        }
    }, [start, end]);

    return <HighchartsReact
        highcharts={Highcharts}
        constructorType="chart"
        options={options}
        ref={chartRef}
    />;
}
