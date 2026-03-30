import { useRef, useState, useEffect } from 'react';
import HighchartsReact        from 'highcharts-react-official';
import Highcharts             from '../../highcharts';
import Navigator              from './Navigator';
import { type TimelineEvent } from './utils';
import { humanizeDuration }   from '../../utils';


function getDataInRange(data: TimelineEvent[], start: number, end: number) {
    return data.filter(d => {
        const eventStart = new Date(d.date).valueOf();
        const eventEnd   = new Date(d.endDate ?? d.date).valueOf();
        return eventStart <= end && eventEnd >= start;
    });
}

// ─── Thin fixed X-axis header ─────────────────────────────────────────────

function XAxisHeader({ leftMargin, start, end, syncRef }: {
    leftMargin: number;
    start: number;
    end: number;
    // The main chart registers a sync callback here so pan/wheel updates propagate
    syncRef: React.MutableRefObject<((min: number, max: number) => void) | null>;
}) {
    const headerRef = useRef<any>(null);

    // Imperatively apply range whenever start/end change (declarative min/max
    // in options doesn't reliably call setExtremes under Highcharts update)
    useEffect(() => {
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        try { headerRef.current?.chart?.xAxis[0]?.setExtremes(start, end, true, false); } catch {}
    }, [start, end]);

    const headerOptions: Highcharts.Options = {
        chart: {
            height: 28,
            margin: [0, 20, 28, leftMargin],
            spacing: [0, 0, 0, 0],
            animation: false,
            backgroundColor: '#FFF',
            borderWidth: 0,
            plotBorderWidth: 0,
            plotBackgroundColor: 'transparent' as any,
        },
        exporting: { enabled: false },
        credits:   { enabled: false },
        title:     { text: '' },
        subtitle:  { text: '' },
        xAxis: {
            type: 'datetime',
            ordinal: false,
            min: Number.isFinite(start) ? start : undefined,
            max: Number.isFinite(end)   ? end   : undefined,
            lineWidth: 1,
            lineColor: '#318ebc66',
            gridLineWidth: 0,
            tickColor: '#DDD',
            tickLength: 16,
            endOnTick: false,
            startOnTick: false,
            labels: {
                align: 'left',
                x: 4,
                y: 14,
                style: { color: '#888', fontSize: '13px', fontWeight: 'normal' },
            },
        },
        yAxis: {
            height: 0,
            labels:      { enabled: false },
            title:       { text: '' },
            lineWidth:   0,
            gridLineWidth: 0,
        },
        // Dummy invisible series — prevents the "No data to display" message
        series: [{
            type: 'scatter',
            data: [{ x: Number.isFinite(start) ? start : 0, y: 0 }],
            marker: { enabled: false },
            enableMouseTracking: false,
            showInLegend: false,
        }] as any,
    };

    // Register the sync callback so pan/wheel in the main chart propagates to the header
    useEffect(() => {
        syncRef.current = (min: number, max: number) => {
            try { headerRef.current?.chart?.xAxis[0]?.setExtremes(min, max, true, false); } catch {}
        };
    }, [syncRef]);

    return <HighchartsReact
        highcharts={Highcharts}
        constructorType="chart"
        options={headerOptions}
        ref={headerRef}
    />;
}

// ─── Main timeline chart ───────────────────────────────────────────────────

export default function TimelineChart({
    data,
    navigatorData,
    lensStart,
    lensEnd,
    onRangeChange = () => {},
    onSelectionChange = () => {},
    onSelectionRangeChange,
    onEventClick = () => {},
    resourceCounts,
    selectedResourceTypes,
    initialSelectionRange,
    initialSelectedResourceId,
}: {
    data:                    TimelineEvent[];
    navigatorData:           TimelineEvent[];
    lensStart:               number;
    lensEnd:                 number;
    onRangeChange?:           (min: number, max: number) => void;
    onSelectionChange?:       (resources: TimelineEvent[]) => void;
    onSelectionRangeChange?:  (start: number | null, end: number | null) => void;
    onEventClick?:            (event: TimelineEvent) => void;
    resourceCounts:           Map<string, number>;
    selectedResourceTypes:    string[];
    initialSelectionRange?:   [number, number] | null;
    initialSelectedResourceId?: string;
}) {
    const chartRef   = useRef<any>(null);
    const syncExtRef = useRef<((min: number, max: number) => void) | null>(null);
    // Keep a ref to the latest data so Highcharts click closures never go stale
    const dataRef    = useRef(data);
    dataRef.current  = data;
    const resources  = Array.from(resourceCounts.keys());
    const [selection, setSelection]   = useState<[number, number] | null>(initialSelectionRange ?? null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // Refs so click closures always read the pre-click state (xrange bars toggle
    // `this.selected` before firing the click event, unlike scatter points).
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;
    const selectionRef = useRef(selection);
    selectionRef.current = selection;

    // When the externally-controlled range is cleared (e.g. user navigates to ?resource=),
    // clear the internal plotBand selection so it doesn't linger visually.
    useEffect(() => {
        if (!initialSelectionRange) setSelection(null);
    }, [initialSelectionRange]);

    // Sync single-resource selection from URL param — reactive so navigating
    // to ?resource= after a range selection highlights the correct point.
    useEffect(() => {
        const newIds: string[] = (() => {
            if (!initialSelectedResourceId) return [];
            const slash = initialSelectedResourceId.lastIndexOf('/');
            const initId = slash >= 0 ? initialSelectedResourceId.slice(slash + 1) : initialSelectedResourceId;
            const matching = dataRef.current.filter(e => e.resourceId === initId);
            return matching.map(e => e.resourceId);
        })();
        // Bail out if the set is already correct — avoids a redundant Highcharts
        // update when the click handler already called setSelectedIds with the same value.
        setSelectedIds(prev => {
            if (prev.size === newIds.length && newIds.every(id => prev.has(id))) return prev;
            return new Set(newIds);
        });
    }, [initialSelectedResourceId]);

    // Row key: when a lens sets yLabel on events, that drives Y-axis grouping
    const rowKey = (d: TimelineEvent) => d.yLabel ?? d.resourceType;
    const hasLensLabels = data.some((d: TimelineEvent) => d.yLabel !== undefined);
    const presentLabels = new Set(data.map(rowKey));
    const categories = hasLensLabels
        // lens mode: alphabetical so long clinical-notes lists are easy to scan
        ? [...new Set(data.map(rowKey))].sort((a, b) => a.localeCompare(b))
        // resource type mode: respect selection order / resourceCounts order
        : (selectedResourceTypes.length > 0 ? selectedResourceTypes : resources)
              .filter(rt => presentLabels.has(rt));

    // Dynamic left margin: estimate label width from longest category string.
    const longestLabel = categories.reduce((max, c) => Math.max(max, c.length), 0);
    const leftMargin   = Math.min(320, Math.max(130, longestLabel * 10 + 28));

    // naturalHeight is the full height for all rows.
    // visibleHeight clips at a half-row boundary so the truncated row is
    // obviously half-visible — a clear affordance that more rows exist.
    const ROW_H      = 24;
    const MARGIN_TOP = 5;
    const CAP        = 300;
    const naturalHeight = Math.max(90, MARGIN_TOP + categories.length * ROW_H);
    const fullRowsFit   = Math.floor((CAP - MARGIN_TOP) / ROW_H);
    // If all rows fit, use natural height; otherwise clip mid-way through the next row
    const visibleHeight = naturalHeight <= CAP
        ? naturalHeight
        : MARGIN_TOP + fullRowsFit * ROW_H + ROW_H / 2;
    const hiddenRows = Math.max(0, categories.length - fullRowsFit);

    const [showTopHint, setShowTopHint]       = useState(false);
    const [showBottomHint, setShowBottomHint] = useState(hiddenRows > 0);

    // Attach a scroll listener to Highcharts' internal scrolling container.
    // We try chart.scrollingContainer first, then fall back to a DOM query for
    // .highcharts-scrolling, retrying every 50ms until the element appears.
    useEffect(() => {
        if (hiddenRows <= 0) return; // no scrollable content — skip
        let cleanup: (() => void) | undefined;
        let retries = 0;

        const attach = (): boolean => {
            const chartInstance = chartRef.current?.chart;
            const domRoot = (chartRef.current?.container?.current ?? chartRef.current?.container) as HTMLElement | undefined;
            const container: HTMLElement | undefined =
                (chartInstance as any)?.scrollingContainer ??
                domRoot?.querySelector('.highcharts-scrolling') as HTMLElement | undefined ??
                undefined;
            if (!container) return false;

            const onScroll = () => {
                const { scrollTop, scrollHeight, clientHeight } = container;
                setShowTopHint(scrollTop > 10);
                setShowBottomHint(scrollTop + clientHeight < scrollHeight - 10);
            };
            onScroll(); // set initial state
            container.addEventListener('scroll', onScroll, { passive: true });
            cleanup = () => container.removeEventListener('scroll', onScroll);
            return true;
        };

        const tryAttach = () => {
            if (attach()) return;
            if (++retries < 20) {
                const id = setTimeout(tryAttach, 50);
                cleanup = () => clearTimeout(id);
            }
        };
        tryAttach();
        return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories.length, hiddenRows]);

    const options = {
        chart: {
            height:       visibleHeight,
            marginLeft:   leftMargin,
            marginRight:  20,
            marginTop:    5,
            marginBottom: 0,
            animation: false,
            plotBorderWidth: 0,
            plotBackgroundColor: '#FFF',
            plotShadow: false,
            borderWidth: 0,
            backgroundColor: '#FFF',
            shadow: false,
            scrollablePlotArea: {
                minHeight: naturalHeight,
                scrollPositionY: 0,
                opacity: 1,
            },
            zooming: {
                singleTouch: true,
                type: 'x' as const,
                mouseWheel: { enabled: true, type: 'x' as const },
            },
            panning: { enabled: true, type: 'x' as const },
            panKey: 'shift' as const,
            selectionMarkerFill: '#318ebc22',
            events: {
                selection: function(this: any, event: any) {
                    const x1 = event.xAxis[0].min;
                    const x2 = event.xAxis[0].max;
                    setSelection([x1, x2]);
                    setSelectedIds(new Set());
                    onEventClick(null as any);
                    onSelectionChange(getDataInRange(dataRef.current, x1, x2) as TimelineEvent[]);
                    onSelectionRangeChange?.(x1, x2);
                    return false;
                },
                click: function(this: any) {
                    this.series[0]?.data.forEach((p: any) => p.selected && p.select(false, false));
                    setSelection(null);
                    setSelectedIds(new Set());
                    onSelectionChange([]);
                    onSelectionRangeChange?.(null, null);
                    onEventClick(null as any);
                },
            },
        },
        exporting: { enabled: false },
        credits:   { enabled: false },
        title:     { text: '' },
        subtitle:  { text: '' },
        xAxis: [{
            type: 'datetime' as const,
            ordinal: false,
            min: Number.isFinite(lensStart) ? lensStart : undefined,
            max: Number.isFinite(lensEnd)   ? lensEnd   : undefined,
            minRange: 1,
            labels:    { enabled: false },
            tickLength: 0,
            lineWidth: 0,
            gridLineWidth: 1,
            gridLineColor: '#0001',
            gridZIndex: 0,
            endOnTick: false,
            startOnTick: false,

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
            events: {
                // Push pan/wheel zoom changes to the fixed header
                afterSetExtremes: function(this: any, e: any) {
                    if (syncExtRef.current && Number.isFinite(e.min) && Number.isFinite(e.max)) {
                        syncExtRef.current(e.min, e.max);
                    }
                }
            }
        }],
        yAxis: {
            type: 'category',
            reversed: true,
            opposite: false,
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
                style: { fontSize: '15px', fontWeight: '500', color: '#444' }
            },
            crosshair: { color: '#318ebc22' }
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
            shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 1, offsetY: 1, width: 5 },
            formatter: function (this: any) {
                const html: string[] = [];
                html.push(`<table><tbody>`);
                if (this.point.options.custom.display) {
                    html.push(`<tr><th colspan="2">${this.point.options.custom.display}<hr style="margin:4px 0"/></th></tr>`);
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
                const items = getDataInRange(data, this.x - 1000*60*60*12, this.x2 + 1000*60*60*12)
                    .filter(d => d.resourceType === this.point.options.custom.resourceType);
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
                dataGrouping: { enabled: false },
                cropThreshold: 99999,
                states: {
                    select: { enabled: true, color: '#F80', borderColor: '#C30', borderWidth: 1 }
                }
            },
        },
        series: [
            // ── Series 0: xrange rows ─────────────────────────────────────
            {
                type: 'xrange',
                minPointLength: 8,
                maxPointWidth:  20,
                enableMouseTracking: true,
                borderRadius:   2,
                borderWidth:    0,
                showInLegend:   false,
                showInNavigator: false,
                allowPointSelect: true,
                centerInCategory: true,
                zIndex: 8,
                dataLabels: { enabled: false },
                id: 'periods' + (selection ? selection.join('-') : ''),
                data: data.flatMap((d: TimelineEvent) => {
                    const x  = +new Date(d.date);
                    const x2 = +(d.endDate ? new Date(d.endDate) : new Date(d.date));
                    const y  = categories.indexOf(rowKey(d));
                    if (y < 0) return [];
                    return [{
                        x, x2, y,
                        color:  d.color ?? '#318ebc88',
                        name:   d.display || d.category || d.resourceType,
                        custom: d,
                        selected: selection
                            ? (x <= selection[1] && x2 >= selection[0])
                            : selectedIds.has(d.resourceId),
                    }];
                }),
                point: {
                    events: {
                        click: function(this: any) {
                            const clickedEvent = this.custom as TimelineEvent;
                            const wasSelected = !selectionRef.current
                                && selectedIdsRef.current.has(clickedEvent.resourceId);
                            setSelection(null);
                            if (wasSelected) {
                                setSelectedIds(new Set());
                                onSelectionChange([]);
                                onEventClick(null as any);
                            } else {
                                setSelectedIds(new Set([clickedEvent.resourceId]));
                                onSelectionChange([clickedEvent]);
                                onEventClick(clickedEvent);
                            }
                        },
                    },
                },
            },
        ],
    } as unknown as Highcharts.Options;

    const [chartRange, setChartRange] = useState<[number, number] | null>(null);
    const chartStart = chartRange ? chartRange[0] : lensStart;
    const chartEnd   = chartRange ? chartRange[1] : lensEnd;

    // Keep chart in sync imperatively when range changes
    useEffect(() => {
        if (!Number.isFinite(chartStart) || !Number.isFinite(chartEnd)) return;
        const id = setTimeout(() => {
            try { chartRef.current?.chart?.xAxis[0]?.setExtremes(chartStart, chartEnd, true, false); } catch {}
        }, 0);
        return () => clearTimeout(id);
    }, [chartStart, chartEnd]);

    return <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ borderBottom: '1px solid #318ebc88', marginBottom: 4 }}>
            <Navigator
                onChange={(min, max) => { setChartRange([min, max]); onRangeChange(min, max); }}
                data={navigatorData}
                selectedResourceTypes={selectedResourceTypes}
                start={lensStart}
                end={lensEnd}
            />
        </div>
        <div style={{ lineHeight: 0, position: 'relative' }}>
            <HighchartsReact
                highcharts={Highcharts}
                constructorType="chart"
                options={options}
                ref={chartRef}
                allowChartUpdate={true}
            />
            {/* ── Top hint: appears after scrolling down ── */}
            {showTopHint && <>
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: leftMargin,
                    height: 40, pointerEvents: 'none',
                    background: 'linear-gradient(to top, transparent, #ffffffcc 70%, #fff)',
                }} />
                <div style={{
                    position: 'absolute', top: 6, left: 8,
                    background: '#318ebc', color: '#fff', borderRadius: 20,
                    padding: '8px 10px', fontSize: 12, fontWeight: 600,
                    boxShadow: '0 10px 6px -7px #0006',
                    whiteSpace: 'nowrap', cursor: 'default',
                    maxWidth: leftMargin - 16, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    ↑ scroll to see more
                </div>
            </>}
            {/* ── Bottom hint: appears when rows are hidden below ── */}
            {showBottomHint && <>
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, width: leftMargin,
                    height: 48, pointerEvents: 'none',
                    background: 'linear-gradient(to bottom, transparent, #ffffffcc 70%, #fff)',
                }} />
                <div style={{
                    position: 'absolute', bottom: 6, left: 8,
                    background: '#318ebc', color: '#fff', borderRadius: 20,
                    padding: '8px 10px', fontSize: 12, fontWeight: 600,
                    boxShadow: '0 1px 4px #0003', whiteSpace: 'nowrap', cursor: 'default',
                    maxWidth: leftMargin - 16, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    ↓ scroll to see more
                </div>
            </>}
        </div>
        <XAxisHeader leftMargin={leftMargin} start={chartStart} end={chartEnd} syncRef={syncExtRef} />
    </div>;
}

