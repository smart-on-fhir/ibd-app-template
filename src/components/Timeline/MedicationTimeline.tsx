import { useRef, useState, useEffect } from 'react';
import HighchartsReact        from 'highcharts-react-official';
import Highcharts             from '../../highcharts';
import Navigator              from './Navigator';
import { type TimelineEvent } from './utils';
import { humanizeDuration }   from '../../utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H = 23;   // px per medication row
const CAP   = 250;  // max visible chart height before scrolling kicks in
const DOT_R = 6;    // scatter dot radius

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the best start/end pair for a medication event.
 * utils.ts resolveDate() only hits `authoredOn` for MedicationRequest (an instant),
 * so we check the actual duration fields here.
 */
function medicationPeriod(e: TimelineEvent): { start: string; end?: string } {
    const raw = e.raw;
    if (raw.resourceType === 'MedicationRequest') {
        const vp = raw.dispenseRequest?.validityPeriod;
        if (vp?.start) return { start: vp.start, end: vp.end };
        const bp = raw.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod;
        if (bp?.start) return { start: bp.start, end: bp.end };
    }
    return { start: e.date, end: e.endDate };
}

/** True when the event spans a real interval (not just a single instant). */
function isPeriod(e: TimelineEvent): boolean {
    const { start, end } = medicationPeriod(e);
    return !!end && end !== start;
}


// Status priority: lower = more active/urgent
const STATUS_PRIORITY: Record<string, number> = {
    'active'          : 0,
    'in-progress'     : 0,
    'on-hold'         : 1,
    'completed'       : 2,
    'inactive'        : 2,
    'resolved'        : 2,
    'unknown'         : 2,
    'stopped'         : 3,
    'cancelled'       : 3,
    'revoked'         : 3,
    'entered-in-error': 3,
};

type StatusGroup = 'active' | 'inactive';

function statusGroup(events: TimelineEvent[]): StatusGroup {
    let best = 99;
    for (const e of events) {
        const p = STATUS_PRIORITY[e.raw.status?.toLowerCase() ?? ''] ?? 2;
        if (p < best) best = p;
    }
    return best <= 1 ? 'active' : 'inactive';
}

// ─── MedicationTimeline ───────────────────────────────────────────────────────

export default function MedicationTimeline({
    data,
    navigatorData,
    lensStart,
    lensEnd,
    onSelectionChange = () => {},
    onEventClick      = () => {},
    initialSelectedResourceId,
}: {
    data:                       TimelineEvent[];
    navigatorData:               TimelineEvent[];
    lensStart:                   number;
    lensEnd:                     number;
    onSelectionChange?:          (events: TimelineEvent[]) => void;
    onEventClick?:               (event: TimelineEvent | null) => void;
    initialSelectedResourceId?:  string;
}) {
    const chartRef     = useRef<any>(null);
    const firstIdRef   = useRef<Map<string, string>>(new Map());
    const wrapperRef   = useRef<HTMLDivElement>(null);
    const crosshairRef = useRef<HTMLDivElement>(null);

    const clearSelection = () => {
        chartRef.current?.chart?.getSelectedPoints()
            ?.forEach((p: any) => p.select(false, true));
    };
    const [chartRange, setChartRange]             = useState<[number, number] | null>(null);
    const [singleSelectedId, setSingleSelectedId] = useState<string | null>(null);

    useEffect(() => {
        const newId = !initialSelectedResourceId ? null : (() => {
            const slash = initialSelectedResourceId.lastIndexOf('/');
            return slash >= 0 ? initialSelectedResourceId.slice(slash + 1) : initialSelectedResourceId;
        })();
        // Bail out if already correct to avoid a redundant chart update.
        setSingleSelectedId(prev => prev === newId ? prev : newId);
    }, [initialSelectedResourceId]);
    const [showInactive, setShowInactive]         = useState(false);
    const [showTopHint, setShowTopHint]           = useState(false);
    const [showBottomHint, setShowBottomHint]     = useState(false);

    const navStart = chartRange ? chartRange[0] : lensStart;
    const navEnd   = chartRange ? chartRange[1] : lensEnd;

    // Navigator / chart zoom sync — imperative to avoid React options fighting Highcharts state
    useEffect(() => {
        if (!chartRange) return;
        const [min, max] = chartRange;
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;
        const id = setTimeout(() => {
            try { chartRef.current?.chart?.xAxis[0]?.setExtremes(min, max, true, false); } catch {}
        }, 0);
        return () => clearTimeout(id);
    }, [chartRange]);

    // ── Group events by medication name (deduplicates across resource types) ──
    const eventsByMed = new Map<string, TimelineEvent[]>();
    for (const e of data) {
        const label = e.yLabel ?? e.resourceType;
        if (!eventsByMed.has(label)) eventsByMed.set(label, []);
        eventsByMed.get(label)!.push(e);
    }

    // Earliest start date across all events for a medication
    const medEarliestDate = (k: string) =>
        Math.min(...eventsByMed.get(k)!.map(e => +new Date(medicationPeriod(e).start)));

    // ── Sort: active meds first, inactive after; by earliest date within each group
    const byDate = (a: string, b: string) => medEarliestDate(a) - medEarliestDate(b);
    const activeMeds   = [...eventsByMed.keys()].filter(k => statusGroup(eventsByMed.get(k)!) === 'active').sort(byDate);
    const inactiveMeds = [...eventsByMed.keys()].filter(k => statusGroup(eventsByMed.get(k)!) === 'inactive').sort(byDate);
    const hiddenCount  = inactiveMeds.length;

    const categories = showInactive
        ? [...activeMeds, ...inactiveMeds]
        : activeMeds;

    const catIndex = (label: string) => categories.indexOf(label);

    // ── Split events into bars (periods) and dots (point events) ─────────────
    const visibleEvents = data.filter(e => catIndex(e.yLabel ?? e.resourceType) >= 0);

    // Only the earliest item per medication name gets a label
    const firstIdByMed = new Map<string, string>();
    for (const e of [...visibleEvents].sort((a, b) => a.date.localeCompare(b.date))) {
        const label = e.yLabel ?? e.resourceType;
        if (!firstIdByMed.has(label)) firstIdByMed.set(label, e.resourceId);
    }
    firstIdRef.current = firstIdByMed;

    const barData = visibleEvents.filter(isPeriod).map(e => {
        const { start, end } = medicationPeriod(e);
        return {
            x       : +new Date(start),
            x2      : +new Date(end!),
            y       : catIndex(e.yLabel ?? e.resourceType),
            color   : e.color ?? '#318ebc88',
            name    : e.yLabel ?? e.resourceType,
            selected: e.resourceId === singleSelectedId,
            custom  : e,
        };
    });

    const dotData = visibleEvents.filter(e => !isPeriod(e)).map(e => ({
        x       : +new Date(e.date),
        y       : catIndex(e.yLabel ?? e.resourceType),
        color   : e.color ?? '#318ebc88',
        name    : e.yLabel ?? e.resourceType,
        selected: e.resourceId === singleSelectedId,
        custom  : e,
    }));

    // ── Sizing ────────────────────────────────────────────────────────────────
    const leftMargin    = 8;
    const MARGIN_TOP    = 16;
    const MARGIN_BOTTOM = 0;
    const naturalHeight = Math.max(90, MARGIN_TOP + (categories.length + 2) * ROW_H + MARGIN_BOTTOM);
    const needsScroll   = naturalHeight > CAP;

    const scrollRef = useRef<HTMLDivElement>(null);

    // Scroll hints via a plain div — reliable native scroll
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            setShowTopHint(el.scrollTop > 10);
            setShowBottomHint(el.scrollTop + el.clientHeight < el.scrollHeight - 10);
        };
        onScroll();
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [categories.length]);

    useEffect(() => { setShowBottomHint(needsScroll); }, [needsScroll]);

    // ── Chart options ─────────────────────────────────────────────────────────
    const options: Highcharts.Options = {
        chart: {
            type           : 'xrange',
            height         : naturalHeight,
            animation      : false,
            backgroundColor: '#FFF',
            borderWidth    : 0,
            margin         : [MARGIN_TOP, 20, MARGIN_BOTTOM, leftMargin],
            spacing        : [4, 4, 4, 4],
            zooming        : { type: 'x', mouseWheel: { enabled: false } },
            events: {
                click(e: any) {
                    if (!e.point) {
                        setSingleSelectedId(null);
                        onSelectionChange([]);
                        onEventClick(null);
                    }
                },
            },
        },
        exporting: { enabled: false },
        credits  : { enabled: false },
        title    : { text: '' },
        legend   : { enabled: false },

        xAxis: {
            type         : 'datetime',
            ordinal      : false,
            min          : Number.isFinite(lensStart) ? lensStart : undefined,
            max          : Number.isFinite(lensEnd)   ? lensEnd   : undefined,
            lineWidth    : 0,
            tickLength  : 0,
            labels      : { enabled: false },
            gridLineColor: '#EEE',
            events: {
                afterSetExtremes(e: any) {
                    if (Number.isFinite(e.min) && Number.isFinite(e.max)) {
                        setChartRange([e.min, e.max]);
                    }
                },
            },
        },

        yAxis: {
            categories,
            reversed     : false,
            gridLineColor: '#EEE',
            labels       : { enabled: false },
            min          : -1,
            max          : categories.length,
            startOnTick  : false,
            endOnTick    : false,
        },

        tooltip: {
            useHTML      : true,
            outside      : true,
            snap         : 0,
            borderColor  : '#318ebc',
            borderRadius : 5,
            borderWidth  : 1,
            distance     : 10,
            shadow       : { color: 'rgba(0,0,0,0.3)', offsetX: 1, offsetY: 1, width: 5 },
            formatter() {
                const e   = (this as any).point.custom as TimelineEvent;
                const { start, end } = medicationPeriod(e);
                const startDate = new Date(start);
                const endDate   = end && end !== start ? new Date(end) : null;
                const rows: string[] = [];
                rows.push(`<table><tbody>`);
                rows.push(`<tr><th colspan="2">${e.yLabel ?? e.resourceType}<hr style="margin:4px 0"/></th></tr>`);
                if (endDate) {
                    rows.push(`<tr><th style="text-align:right;">From: </th><td>${startDate.toLocaleString('en-US', { dateStyle: 'medium' })}</td></tr>`);
                    rows.push(`<tr><th style="text-align:right;">To: </th><td>${endDate.toLocaleString('en-US', { dateStyle: 'medium' })}</td></tr>`);
                    rows.push(`<tr><th style="text-align:right;">Duration: </th><td>${humanizeDuration(startDate, endDate)}</td></tr>`);
                } else {
                    rows.push(`<tr><th style="text-align:right;">Date: </th><td>${startDate.toLocaleString('en-US', { dateStyle: 'medium' })}</td></tr>`);
                }
                rows.push(`<tr><th style="text-align:right;">Type: </th><td>${e.resourceType}</td></tr>`);
                if (e.raw.status) rows.push(`<tr><th style="text-align:right;">Status: </th><td>${e.raw.status}</td></tr>`);
                rows.push(`</tbody></table>`);
                return rows.join('');
            },
        },

        plotOptions: {
            series: {
                inactiveOtherPoints: false,
                states: { inactive: { enabled: false } },
            },
            xrange: {
                borderRadius    : 2,
                cursor          : 'pointer',
                grouping        : false,
                minPointLength  : 6,
                clip            : false,
                allowPointSelect: true,
                borderWidth     : 0.5,
                groupPadding    : 0,
                borderColor     : 'rgba(0,0,0,0.2)',
                dataLabels: {
                    enabled      : true,
                    align        : 'right',
                    verticalAlign: 'middle',
                    x            : -16,
                    y            : -1,
                    formatter() {
                        const p = (this as any).point;
                        return firstIdRef.current.get(p.name) === p.custom?.resourceId ? '&nbsp;&nbsp;&nbsp;&nbsp;' + p.name : null;
                    },
                    style: {
                        fontSize  : '13px',
                        fontWeight: '400',
                        color     : '#000D',
                        textOutline: 'none',
                    },
                    useHTML : true,
                    overflow: 'allow',
                    crop    : false,
                },
                states: {
                    hover : { brightness: -0.3 },
                    select: { enabled: true, color: '#F80', borderColor: '#C30', borderWidth: 1 },
                },
                point: {
                    events: {
                        click() {
                            const e = (this as any).custom as TimelineEvent;
                            clearSelection();
                            if ((this as any).selected) {
                                setSingleSelectedId(null);
                                onSelectionChange([]);
                                onEventClick(null);
                            } else {
                                setSingleSelectedId(e.resourceId);
                                onEventClick(e);
                                onSelectionChange([e]);
                            }
                        },
                    },
                },
            },
            scatter: {
                cursor          : 'pointer',
                allowPointSelect: true,
                states: {
                    hover: { halo: { size: 14, opacity: 0.25 } },
                },
                dataLabels: {
                    enabled   : true,
                    align     : 'right',
                    verticalAlign: 'middle',
                    x         : -(DOT_R + 4),
                    y         : -1,
                    useHTML  : true,
                    formatter() {
                        const p = (this as any).point;
                        return firstIdRef.current.get(p.name) === p.custom?.resourceId ? '&nbsp;&nbsp;&nbsp;&nbsp;' + p.name : null;
                    },
                    style     : {
                        fontSize  : '13px',
                        fontWeight: '400',
                        color     : '#000',
                        textOutline: 'none',
                    },
                },
                marker: {
                    radius   : DOT_R,
                    symbol   : 'circle',
                    lineWidth: 0.5,
                    lineColor: 'rgba(0,0,0,0.25)',
                    states: {
                        hover: {
                            enabled    : true,
                            radiusPlus : 2,
                            lineWidthPlus: 0,
                        } as any,
                        select: {
                            enabled  : true,
                            fillColor: '#F80',
                            lineColor: '#C30',
                            lineWidth: 2,
                            radius   : DOT_R + 2,
                        },
                    },
                },
                point: {
                    events: {
                        click() {
                            const e = (this as any).custom as TimelineEvent;
                            clearSelection();
                            if ((this as any).selected) {
                                setSingleSelectedId(null);
                                onSelectionChange([]);
                                onEventClick(null);
                            } else {
                                setSingleSelectedId(e.resourceId);
                                onEventClick(e);
                                onSelectionChange([e]);
                            }
                        },
                    },
                },
            },
        },

        series: [
            { type: 'xrange', name: 'Medication periods', data: barData } as any,
            { type: 'scatter', name: 'Administrations',   data: dotData } as any,
        ],
    };

    return (
        <div
            ref={wrapperRef}
            style={{ position: 'relative' }}
            onMouseMove={e => {
                const rect = wrapperRef.current?.getBoundingClientRect();
                if (rect && crosshairRef.current) {
                    crosshairRef.current.style.left    = `${e.clientX - rect.left}px`;
                    crosshairRef.current.style.display = 'block';
                }
            }}
            onMouseLeave={() => {
                if (crosshairRef.current) crosshairRef.current.style.display = 'none';
            }}
        >
            {/* ── Crosshair spanning chart + navigator ─────────────────── */}
            <div ref={crosshairRef} style={{
                display      : 'none',
                position     : 'absolute',
                top          : 0,
                bottom       : 0,
                width        : 1,
                background   : '#318ebc33',
                pointerEvents: 'none',
                zIndex       : 1,
            }} />
            {/* ── Chart inside native scroll wrapper ───────────────────── */}
            <div style={{ position: 'relative' }}>
                <div
                    ref={scrollRef}
                    style={{ maxHeight: CAP, overflowY: needsScroll ? 'auto' : 'visible' }}
                >
                    <HighchartsReact
                        ref={chartRef}
                        highcharts={Highcharts}
                        options={options}
                    />
                </div>
                {showTopHint && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        height: 32, pointerEvents: 'none',
                        background: 'linear-gradient(to top, transparent, #ffffffdd)',
                        display: 'flex', alignItems: 'flex-start', padding: '4px 10px',
                    }}>
                        <span style={{
                            background: '#318ebc', color: '#fff', borderRadius: 20,
                            padding: '2px 10px', fontSize: 11, fontWeight: 600,
                        }}>↑ scroll</span>
                    </div>
                )}
                {showBottomHint && (
                    <div style={{
                        position: 'absolute', bottom: 4, left: 0, right: 0,
                        height: 32, pointerEvents: 'none',
                        background: 'linear-gradient(to bottom, transparent, #ffffffdd)',
                        display: 'flex', alignItems: 'flex-end', padding: '4px 10px',
                    }}>
                        <span style={{
                            background: '#318ebc', color: '#fff', borderRadius: 20,
                            padding: '2px 10px', fontSize: 11, fontWeight: 600,
                        }}>↓ scroll</span>
                    </div>
                )}
            </div>

            {/* ── Show/hide inactive toggle ─────────────────────────────── */}
            {hiddenCount > 0 && (
                <div className='text-center' style={{ marginTop: 2, marginBottom: 4 }}>
                    <button
                        className='btn btn-sm btn-link text-muted p-0'
                        style={{ fontSize: 11 }}
                        onClick={() => setShowInactive(v => !v)}
                    >
                        {showInactive
                            ? `Hide ${hiddenCount} inactive medication${hiddenCount > 1 ? 's' : ''}`
                            : `Show ${hiddenCount} inactive medication${hiddenCount > 1 ? 's' : ''}`
                        }
                    </button>
                </div>
            )}

            <Navigator
                data={navigatorData}
                start={navStart}
                end={navEnd}
                selectedResourceTypes={[]}
                useEventColors={true}
                onChange={(min, max) => setChartRange([min, max])}
            />
        </div>
    );
}
