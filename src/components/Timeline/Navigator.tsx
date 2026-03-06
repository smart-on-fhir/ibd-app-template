import { useRef, useCallback, useEffect } from "react";
import { HighchartsReact }                from "highcharts-react-official";
import Highcharts                         from 'highcharts/highstock';
import "highcharts/modules/accessibility"


export default function Navigator({
    data,
    onChange,
    selectedResourceTypes,
    start,
    end,
}: {
    data: any[];
    onChange: (min: number, max: number) => void,
    selectedResourceTypes?: string[];
    start: number;
    end: number;
}) {
    const chartRef     = useRef<any>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const debouncedOnChange = useCallback((min: number, max: number) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => onChange(min, max), 150);
    }, [onChange]);

    const getPointColor = (ev: any) =>
        (!selectedResourceTypes || selectedResourceTypes.length === 0 || selectedResourceTypes.includes(ev.resourceType))
            ? '#C608' : '#EEE';

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
            liveRedraw: true,
        },
        xAxis: {
            events: {
                afterSetExtremes: function (e) {
                    if (e.trigger === 'navigator' || e.trigger === 'rangeSelectorButton' || e.trigger === 'pan') {
                        const min = (e.userMin ?? e.min) as number;
                        const max = (e.userMax ?? e.max) as number;
                        debouncedOnChange(min, max);
                    }
                }
            },
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
        series: [{
            type           : 'column',
            visible        : true,
            opacity        : 1,
            showInLegend   : false,
            showInNavigator: true,
            colorByPoint   : true,
            dataGrouping   : { enabled: false },
            data: data.map(ev => ({
                x     : +new Date(ev.date),
                y     : 1,
                color : getPointColor(ev),
                zIndex: getPointColor(ev) === '#C608' ? 2 : 1
            })),
        }],
    };

    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;
        const newData = data.map(ev => ({
            x     : +new Date(ev.date),
            y     : 1,
            color : getPointColor(ev),
            zIndex: getPointColor(ev) === '#C608' ? 2 : 1,
        }));
        chart.series[0]?.setData(newData, true, false, false);
        (chart as any).navigator?.series?.[0]?.setData(newData, true, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(selectedResourceTypes)]);

    return <HighchartsReact
        key={String(start)}
        highcharts={Highcharts}
        constructorType="stockChart"
        options={options}
        allowChartUpdate={false}
        ref={chartRef}
    />;
}