import { useRef, useCallback, useEffect, useMemo } from "react";
import { HighchartsReact }                          from "highcharts-react-official";
import Highcharts                                   from '../../highcharts';


export default function Navigator({
    data,
    onChange,
    selectedResourceTypes,
    start,
    end,
    useEventColors = false,
}: {
    data: any[];
    onChange: (min: number, max: number) => void,
    selectedResourceTypes?: string[];
    start: number;
    end: number;
    useEventColors?: boolean;
}) {
    const chartRef      = useRef<any>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const debouncedOnChange = useCallback((min: number, max: number) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => onChange(min, max), 150);
    }, [onChange]);

    // Pre-aggregate events into ~150 time buckets so we render a small, fixed
    // number of column bars instead of one per event (potentially thousands).
    const BUCKETS = 150;
    const { highlightedData, backgroundData } = useMemo(() => {
        if (data.length === 0) return { highlightedData: [], backgroundData: [] };
        const noFilter = !selectedResourceTypes || selectedResourceTypes.length === 0;

        // Determine full time extent from the data.
        let tMin = Infinity, tMax = -Infinity;
        for (const ev of data) {
            const t = +new Date(ev.date);
            if (t < tMin) tMin = t;
            if (t > tMax) tMax = t;
        }
        const span     = tMax - tMin || 1;
        const bucketMs = span / BUCKETS;

        const hiCounts = new Float64Array(BUCKETS);
        const bgCounts = new Float64Array(BUCKETS);
        for (const ev of data) {
            const t   = +new Date(ev.date);
            const idx = Math.min(BUCKETS - 1, Math.floor((t - tMin) / bucketMs));
            const hi  = useEventColors || noFilter || selectedResourceTypes!.includes(ev.resourceType);
            if (hi) hiCounts[idx]++; else bgCounts[idx]++;
        }

        const highlighted: { x: number; y: number }[] = [];
        const background:  { x: number; y: number }[] = [];
        for (let i = 0; i < BUCKETS; i++) {
            const x = tMin + i * bucketMs;
            if (hiCounts[i] > 0) highlighted.push({ x, y: hiCounts[i] });
            if (bgCounts[i] > 0) background.push({ x, y: bgCounts[i] });
        }
        return { highlightedData: highlighted, backgroundData: background };
    }, [data, selectedResourceTypes, useEventColors]);

    const options: Highcharts.Options = {
        chart: {
            height : 76,
            margin : [0, 5, 0, 5],
            spacing: [0, 0 , -13, 0 ],
            animation: false,
            events: {
                load: function(this: any) {
                    if (Number.isFinite(start) && Number.isFinite(end)) {
                        this.xAxis[0].setExtremes(start, end, true, false);
                    }
                }
            }
        },
        exporting: { enabled: false },
        credits: { enabled: false },
        title: { text: '' },
        subtitle: { text: '' },
        tooltip: {
            enabled: false,
        },
        rangeSelector: {
            enabled: true,
            inputEnabled: true,
            buttonSpacing: 8,
            buttonTheme: {
                fill: '#318ebc22',
                style: {
                    color: '#666',
                },
                states: {
                    hover: {
                        fill: '#318ebc55',
                        style: {
                            color: 'black'
                        }
                    },
                    select: {
                        fill: '#C60',
                        style: {
                            color: 'white',
                            fontWeight: 'bold'
                        }
                    }
                }
            },
            buttons: [
                {
                    type: 'month',
                    count: 1,
                    text: '1m'
                },
                {
                    type: 'month',
                    count: 6,
                    text: '6m'
                },
                {
                    type: 'year',
                    count: 1,
                    text: '1y'
                },
                {
                    type: 'year',
                    count: 2,
                    text: '2y'
                },
                {
                    type: 'year',
                    count: 5,
                    text: '5y'
                },
                {
                    type: 'all',
                    count: 1,
                    text: 'All'
                }
            ],
            selected: undefined,
        },
        navigator: {
            opposite: false,
            height  : 46,
            enabled : true,                        
            stickToMax: false,
            adaptToUpdatedData: false,
            outlineColor: '#318ebc88', // #C60
            outlineWidth: 1,
            maskFill    : '#318ebc33',
            maskInside  : true,
            handles: {
                backgroundColor: '#daeaf2',
                borderColor    : '#318ebc',
                height         : 20,
                width          : 6,
                borderRadius   : 2,
                lineWidth      : 1,
            },
            margin: 0,
            series: {
                type          : 'column',
                // color         : '#C608',
                minPointLength: 6,
                pointPadding  : 0,
                groupPadding  : 0,
                borderWidth   : 0,
                borderRadius  : 0,
                maxPointWidth : 6,
                centerInCategory: true,
                animation: false,
                dataGrouping: {
                    enabled: false,
                },
            },
            yAxis: {
                min: 0.53,
                max: 0.53,
                type: 'category',
            },
            xAxis: {
                reversed         : false,
                type             : 'datetime',
                startOnTick      : false,
                endOnTick        : false,
                maxPadding       : 0,
                tickPixelInterval: 90,
                lineColor        : '#a2cce1',
                gridLineColor    : '#DDD',
                gridLineWidth    : 0,
                lineWidth        : 0,
                ordinal          : false,
                tickLength       : 14,
                tickPosition     : 'inside',
                tickColor        : '#a2cce1',
                labels: {
                    align: 'left',
                    y    : -3,
                    style: {
                        fontSize   : '13px',
                        fontWeight : 'normal',
                        color      : '#888',
                        textOutline: 'none',
                        opacity    : 1,
                    }
                }
            }
        },
        scrollbar: {
            liveRedraw: false,
        },
        xAxis: {
            events: {
                afterSetExtremes: function (e) {
                    if (e.trigger === 'navigator' || e.trigger === 'rangeSelectorButton' || e.trigger === 'pan') {
                        debouncedOnChange(e.min as number, e.max as number);
                    }
                }
            },
            min        : Number.isFinite(start) ? start : undefined,
            max        : Number.isFinite(end)   ? end   : undefined,
            minRange   : 1,      // allow selecting any width down to 1ms
            visible    : false,
            title      : { text: '' },
            height     : 0,
            opposite   : false,
            type       : 'datetime',
            offset     : 0,
            ordinal    : false,
            startOnTick: false,
            endOnTick  : false,
            lineColor  : '#a2cce1',
            lineWidth  : 0,
            tickLength : 0,
            labels: {
                enabled     : true,
                reserveSpace: false,
            }
        },
        yAxis: {
            type: 'category',
            visible: false,
            min: 0,
            max: 0,
            height: 0,
            categories: ['Events'],
        },
        series: [
            // Series 0 – highlighted events (selected resource types or all when no filter)
            {
                type           : 'column',
                color          : '#C608',
                visible        : true,
                opacity        : 1,
                showInLegend   : false,
                showInNavigator: true,
                colorByPoint   : false,
                dataGrouping   : { enabled: false },
                minPointLength : 6,
                pointPadding   : 0,
                groupPadding   : 0,
                borderWidth    : 0,
                borderRadius   : 0,
                maxPointWidth  : 6,
                centerInCategory: true,
                animation      : false,
                data           : highlightedData,
            },
            // Series 1 – background (deselected) events
            {
                type           : 'column',
                color          : '#DDD8',
                visible        : true,
                opacity        : 1,
                showInLegend   : false,
                showInNavigator: false,
                colorByPoint   : false,
                dataGrouping   : { enabled: false },
                minPointLength : 6,
                pointPadding   : 0,
                groupPadding   : 0,
                borderWidth    : 0,
                borderRadius   : 0,
                maxPointWidth  : 6,
                centerInCategory: true,
                animation      : false,
                data           : backgroundData,
            },
        ],
    };

    // Push updated split-series data to the live chart when it changes
    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;
        chart.series[0]?.setData(highlightedData, false, false, false);
        chart.series[1]?.setData(backgroundData,  true,  false, false);
        (chart as any).navigator?.series?.[0]?.setData(highlightedData, true, false, false);
    }, [highlightedData, backgroundData]);

    useEffect(() => {
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        const id = setTimeout(() => {
            try { chartRef.current?.chart?.xAxis[0]?.setExtremes(start, end, true, false); } catch {}
        }, 0);
        return () => clearTimeout(id);
    }, [start, end]);

    return <HighchartsReact
        highcharts={Highcharts}
        constructorType="stockChart"
        options={options}
        allowChartUpdate={false}
        ref={chartRef}
    />;
}