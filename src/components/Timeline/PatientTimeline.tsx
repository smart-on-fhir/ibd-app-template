import { useCallback, useState } from 'react';
import Navigator                 from './Navigator';
import TimelineChart             from './TimelineChart';
import TimelineEventsPanel       from './TimelineEventsPanel';
import ConditionPresetFilter     from './ConditionPresetFilter';
import ResourceTypeSelector      from '../ResourceTypeSelector';
import { usePatientContext }     from '../../contexts/PatientContext';
import { CONDITION_PRESETS }     from '../../data/conditionPresets';
import { normalizeToTimelineEvent, type TimelineEvent } from './utils';


export default function PatientTimeline() {

    const { selectedPatientResources }                      = usePatientContext();
    const [selection, setSelection]                         = useState<TimelineEvent[]>([]);
    const [selectedResourceTypes, setSelectedResourceTypes] = useState<string[]>([]);
    const [selectedPresets, setSelectedPresets]             = useState<string[]>([]);
    const [range, setRange]                                 = useState<number[] | null>(null);
    const resourceCounts                                    = new Map<string, number>();
    
    if (!selectedPatientResources) return <div>No patient selected</div>;

    const getData = useCallback((): { allData: TimelineEvent[]; data: TimelineEvent[] } => {
        let allData: TimelineEvent[] = [];
        let out: TimelineEvent[] = [];
        for (const resources of Object.values(selectedPatientResources)) {
            (resources as any[]).map(normalizeToTimelineEvent).forEach((e) => {
                if (!e) return;
                allData.push(e);
                out.push(e);
            });
        }
        return { allData, data: out };
    }, [selectedPatientResources]);

    let { data, allData } = getData();

    // Compute global extent from data
    let globalStart = Infinity;
    let globalEnd   = -Infinity;
    for (const e of allData) {
        const x1 = +new Date(e.date);
        const x2 = +new Date(e.endDate ?? e.date);
        if (x1 < globalStart) globalStart = x1;
        if (x2 > globalEnd  ) globalEnd   = x2;
    }

    data.forEach(d => {
        resourceCounts.set(d.raw.resourceType, (resourceCounts.get(d.raw.resourceType) || 0) + 1);
    });

    // Apply condition preset filters
    const activePresets = CONDITION_PRESETS.filter(p => selectedPresets.includes(p.id));
    if (activePresets.length > 0) {
        const matches = (ev: TimelineEvent) => activePresets.some(p => p.matches(ev));
        data    = data.filter(matches);
        allData = allData.filter(matches);
    }

    // Resource types that have events after preset filters (but before resource-type filter)
    // Used to disable resource type options that have no results under the active condition preset
    const enabledResourceTypes = new Set(data.map(d => d.resourceType));

    if (selectedResourceTypes.length !== 0) {
        data = data.filter(d => selectedResourceTypes.includes(d.resourceType));
    }

    data = data.sort((a, b) => a.date.localeCompare(b.date));
    


    return (
        <div className='patient-timeline'>
            <div className='d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2'>
                <div><h5 className="m-0"><i className="bi bi-person-lines-fill me-2" />Patient Timeline</h5></div>
                <div className='d-flex align-items-center gap-2 flex-wrap text-muted small'>
                    <ConditionPresetFilter
                        presets={CONDITION_PRESETS}
                        selected={selectedPresets}
                        onChange={setSelectedPresets}
                    />
                </div>
                <div className='text-muted small'>
                    <ResourceTypeSelector map={resourceCounts} selection={selectedResourceTypes} onChange={setSelectedResourceTypes} enabled={activePresets.length > 0 ? enabledResourceTypes : undefined} />
                </div>
            </div>
            <div className='p-2 pt-1 pb-0 bg-white rounded-3 w-100 border'>
                <div style={{ margin: '5px 0 15px 0px', borderBottom: '1px solid #318ebc88' }}>
                    <Navigator
                        onChange={(min, max) => setRange([min, max])}
                        data={allData}
                        selectedResourceTypes={selectedResourceTypes}
                        start={globalStart}
                        end={globalEnd}
                    />
                </div>
                <TimelineChart
                    data={data}
                    start={range ? range[0] : globalStart}
                    end={range ? range[1] : globalEnd}
                    onSelectionChange={setSelection}
                    resourceCounts={resourceCounts}
                    selectedResourceTypes={selectedResourceTypes}
                    key={selectedResourceTypes.join(',') + '|' + selectedPresets.join(',')}
                />
                <TimelineEventsPanel events={selection} allResources={selectedPatientResources} />
            </div>
        </div>
    );
}

