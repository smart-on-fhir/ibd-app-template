import { useState, useMemo, useEffect } from 'react';
import { useSearchParams }       from 'react-router-dom';
import TimelineChart             from './TimelineChart';
import MedicationTimeline        from './MedicationTimeline';
import TreatmentOutcomeChart     from './TreatmentOutcomeChart';
import TimelineEventsPanel       from './TimelineEventsPanel';
import ConditionPresetFilter     from './ConditionPresetFilter';
import ResourceTypeSelector      from '../ResourceTypeSelector';
import ViewModeSelector          from './ViewModeSelector';
import { usePatientContext }     from '../../contexts/PatientContext';
import { CONDITION_PRESETS }     from './conditionPresets';
import { ALL_LENSES }            from './lenses';
import { normalizeToTimelineEvent, type TimelineEvent } from './utils';
import type { FhirResource } from 'fhir/r4';


function fhirResourcesToTimelineEvents(resources: FhirResource[]): TimelineEvent[] {
    return resources.map(normalizeToTimelineEvent).filter(Boolean) as TimelineEvent[];
}

function getEventsRange(events: TimelineEvent[]): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (const e of events) {
        const start = (e as any)._start ?? +new Date(e.date);
        const end   = (e as any)._end   ?? +(e.endDate ?? e.date ? new Date(e.endDate ?? e.date) : NaN);
        if (start < min) min = start;
        if (end   > max) max = end;
    }
    return { min, max };
}


export default function PatientTimeline() {

    const { selectedPatientResources }                      = usePatientContext();
    const [searchParams, setSearchParams]                   = useSearchParams();
    const [chartSelection, setChartSelection]               = useState<TimelineEvent[]>([]);
    const [chartClickedEvent, setChartClickedEvent]         = useState<TimelineEvent | null>(null);
    const [selectedResourceTypes, setSelectedResourceTypes] = useState<string[]>([]);
    const [selectedPresets, setSelectedPresets]             = useState<string[]>([]);
    const [viewMode, setViewMode]                           = useState<string>('resources');
    

    // Count of resources by type for the selected patient
    // -------------------------------------------------------------------------
    const resourceCounts = new Map<string, number>();
    
    // Exit early if no patient is selected
    // -------------------------------------------------------------------------
    if (!selectedPatientResources) return <div>No patient selected</div>;

    // All FHIR resources for the selected patient
    // Memoized so the array reference is stable — enrichedAllData (and all
    // downstream memos) only recompute when the patient actually changes.
    // -------------------------------------------------------------------------
    const allFhirResources = useMemo(
        () => Object.values(selectedPatientResources).flat() as FhirResource[],
        [selectedPatientResources],
    );

    // Convert to timeline events (not all resources will yield valid events)
    // Memoize the conversion + numeric timestamp enrichment to avoid repeated work
    // on every React render.
    // -------------------------------------------------------------------------
    const enrichedAllData = useMemo(() => {
        console.time('[PatientTimeline] convertToEvents');
        const res = fhirResourcesToTimelineEvents(allFhirResources).map(e => ({
            ...e,
            _start: +new Date(e.date),
            _end:   +(e.endDate ? new Date(e.endDate) : new Date(e.date)),
        } as any));
        console.timeEnd('[PatientTimeline] convertToEvents');
        return res;
    }, [allFhirResources]);

    // Parse URL date-range params — ignored when a single resource is selected
    // -------------------------------------------------------------------------
    const urlRange = useMemo((): [number, number] | null => {
        if (searchParams.get('resource')) return null;   // resource selection wins
        const s = searchParams.get('start');
        const e = searchParams.get('end');
        if (!s || !e) return null;
        const start = +new Date(s);
        const end   = +new Date(e);
        return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : null;
    }, [searchParams]);

    // If the URL somehow has both ?resource= and ?start=/?end=, clean up the stale range params
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (searchParams.get('resource') && (searchParams.get('start') || searchParams.get('end'))) {
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('start');
                next.delete('end');
                return next;
            }, { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Derive the active selection: URL range takes precedence over chart interaction
    // -------------------------------------------------------------------------
    const selection = useMemo(() => {
        if (urlRange) {
            const [start, end] = urlRange;
            return enrichedAllData.filter((ev: any) => {
                const s = ev._start ?? +new Date(ev.date);
                const e = ev._end   ?? s;
                return s <= end && e >= start;
            }) as TimelineEvent[];
        }
        return chartSelection;
    }, [urlRange, enrichedAllData, chartSelection]);

    const handleSelectionRangeChange = (start: number | null, end: number | null) => {
        setChartClickedEvent(null);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (start === null || end === null) {
                next.delete('start');
                next.delete('end');
            } else {
                next.set('start', new Date(start).toISOString().slice(0, 10));
                next.set('end',   new Date(end).toISOString().slice(0, 10));
                next.delete('resource');
            }
            return next;
        }, { replace: true });
        if (start === null) setChartSelection([]);
    };

    // Parse ?resource=ResourceType/id param
    // -------------------------------------------------------------------------
    const urlResource = useMemo(() => {
        const r = searchParams.get('resource');
        if (!r) return null;
        const slash = r.lastIndexOf('/');
        if (slash < 0) return null;
        return { type: r.slice(0, slash), id: r.slice(slash + 1) };
    }, [searchParams]);

    const urlResourceEvent = useMemo((): TimelineEvent | null => {
        if (!urlResource) return null;
        return (enrichedAllData as TimelineEvent[]).find(
            ev => ev.resourceType === urlResource.type && ev.resourceId === urlResource.id
        ) ?? null;
    }, [urlResource, enrichedAllData]);

    // Derive clickedEvent: URL resource takes precedence over chart interaction
    const clickedEvent = urlResourceEvent ?? chartClickedEvent;

    // Single-resource selection: write ?resource= to URL, clear range
    const handleEventClick = (ev: TimelineEvent | null) => {
        setChartClickedEvent(ev ?? null);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (ev) {
                next.set('resource', `${ev.resourceType}/${ev.resourceId}`);
                next.delete('start');
                next.delete('end');
            } else {
                next.delete('resource');
            }
            return next;
        }, { replace: true });
    };

    // Stable "type/id" string for chart initialization
    const initialResourceId = urlResource ? `${urlResource.type}/${urlResource.id}` : undefined;

    // Keep a copy of all data before filtering for navigator
    // -------------------------------------------------------------------------
    let allData = enrichedAllData.slice();

    // Base data reference (will be filtered/memoized below)
    let data: TimelineEvent[] = enrichedAllData as any;

    // Compute global extent from data
    // -------------------------------------------------------------------------
    const { min: globalStart, max: globalEnd } = getEventsRange(allData);

    // Count events by type (memoized map)
    // -------------------------------------------------------------------------
    const countsMap = useMemo(() => {
        const m = new Map<string, number>();
        for (const d of enrichedAllData) {
            m.set(d.raw.resourceType, (m.get(d.raw.resourceType) || 0) + 1);
        }
        return m;
    }, [enrichedAllData]);
    // copy into resourceCounts to preserve existing reference usage
    for (const [k, v] of countsMap) resourceCounts.set(k, v);

    // Apply condition preset filters
    // -------------------------------------------------------------------------
    const activePresets = useMemo(() => CONDITION_PRESETS.filter(p => selectedPresets.includes(p.id)), [selectedPresets]);
    if (activePresets.length > 0) {
        const matches = (ev: any) => activePresets.some((p: any) => p.matches(ev));
        data    = data.filter(matches);
        allData = allData.filter(matches);
    }

    // Resource types that have events after preset filters (but before
    // resource-type filter). Used to disable resource type options that have no
    // results under the active condition preset
    // -------------------------------------------------------------------------
    const enabledResourceTypes = useMemo(() => new Set(data.map(d => d.resourceType)), [data]);

    // Apply resource type filters
    // -------------------------------------------------------------------------
    if (selectedResourceTypes.length !== 0) {
        data = data.filter(d => selectedResourceTypes.includes(d.resourceType));
    }

    // Sort by numeric start
    // -------------------------------------------------------------------------
    data = data.slice().sort((a: any, b: any) => (a._start ?? +new Date(a.date)) - (b._start ?? +new Date(b.date)));

    // Apply the active view lens — transforms yLabel + color per event, filters to relevant types
    // -------------------------------------------------------------------------
    const activeLens = ALL_LENSES.find(l => l.id === viewMode) ?? ALL_LENSES[0];
    data = useMemo(() => activeLens.apply(data), [activeLens, data]);

    // Apply lens to allData too so Navigator only shows events relevant
    // to this view
    // -------------------------------------------------------------------------
    const navigatorData = useMemo(() => activeLens.apply(allData), [activeLens, allData]);

    // Compute the extent for this specific lens view
    let { min: lensStart, max: lensEnd } = getEventsRange(navigatorData);

    // Fall back to global extent when the lens matches nothing
    // -------------------------------------------------------------------------
    if (!Number.isFinite(lensStart)) {
        lensStart = globalStart;
        lensEnd   = globalEnd;
    }

    return (
        <div className='patient-timeline'>
            <div className='d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2'>
                {/* <div><h5 className="m-0"><i className="bi bi-person-lines-fill me-2" />Patient Timeline</h5></div> */}
                <div className='d-flex align-items-center gap-2 flex-wrap text-muted small'>
                    <ConditionPresetFilter
                        presets={CONDITION_PRESETS}
                        selected={selectedPresets}
                        onChange={setSelectedPresets}
                    />
                </div>
                <div className='d-flex align-items-center gap-2 flex-wrap text-muted small'>
                    <ViewModeSelector
                        modes={ALL_LENSES}
                        selected={viewMode}
                        onChange={(id) => { setViewMode(id); }}
                    />
                    {viewMode === 'resources' && (
                        <ResourceTypeSelector
                            map={resourceCounts}
                            selection={selectedResourceTypes}
                            onChange={setSelectedResourceTypes}
                            enabled={activePresets.length > 0 ? enabledResourceTypes : undefined}
                        />
                    )}
                </div>
            </div>
            <div className='p-2 pt-1 pb-0 bg-white rounded-3 w-100 border'>
                {viewMode === 'medications' ? (
                    <MedicationTimeline
                        data={data}
                        navigatorData={navigatorData}
                        lensStart={lensStart}
                        lensEnd={lensEnd}
                        onSelectionChange={setChartSelection}
                        onEventClick={handleEventClick}
                        initialSelectedResourceId={initialResourceId}
                        key={selectedPresets.join(',') + '|medications'}
                    />
                ) : viewMode === 'treatment-outcome' ? (
                    <TreatmentOutcomeChart
                        data={data}
                        navigatorData={navigatorData}
                        lensStart={lensStart}
                        lensEnd={lensEnd}
                        clickedEvent={chartClickedEvent}
                        onSelectionChange={setChartSelection}
                        onEventClick={(ev) => setChartClickedEvent(ev ?? null)}
                        key={selectedPresets.join(',') + '|treatment-outcome'}
                    />
                ) : (
                    <TimelineChart
                        data={data}
                        navigatorData={navigatorData}
                        lensStart={lensStart}
                        lensEnd={lensEnd}
                        onSelectionChange={setChartSelection}
                        onSelectionRangeChange={handleSelectionRangeChange}
                        initialSelectionRange={urlRange}
                        onEventClick={handleEventClick}
                        initialSelectedResourceId={initialResourceId}
                        resourceCounts={resourceCounts}
                        selectedResourceTypes={selectedResourceTypes}
                        key={selectedResourceTypes.join(',') + '|' + selectedPresets.join(',') + '|' + viewMode}
                    />
                )}
                <TimelineEventsPanel
                    events={selection}
                    allResources={selectedPatientResources}
                    clickedEvent={clickedEvent}

                    onNodeClick={(_raw) => {
                        // TODO: do something with the clicked diagram node
                    }}
                />
            </div>
        </div>
    );
}


