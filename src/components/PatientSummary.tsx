import { usePatientContext } from '../contexts/PatientContext';
import {
    ConditionList,
    MedicationList,
    ImmunizationList,
    EventFeed,
    ObservationsPanel,
} from 'clinical-primitives';


export default function PatientSummaryView() {
    const { selectedPatientSummary, selectedPatientResources } = usePatientContext();
    if (!selectedPatientSummary) return <div>No summary available</div>;
    
    const conditions    = selectedPatientResources?.Condition || [];
    const medications   = selectedPatientResources?.MedicationRequest || [];
    const immunizations = selectedPatientResources?.Immunization || [];

    return (
        <div className="d-flex flex-column min-h-100">
            { (conditions.length > 0 || medications.length > 0 || immunizations.length > 0) && (
                <div className='row small' style={{ flex: `1 1 50vh`, minHeight: '300px' }}>
                    <div className='col mb-4'>
                        { conditions.length > 0 && <ConditionList conditions={conditions as any} /> }
                    </div>
                    <div className='col mb-4'>
                        { medications.length > 0 && <MedicationList medications={medications as any} /> }
                    </div>
                    <div className='col mb-4'>
                        { immunizations.length > 0 && <ImmunizationList immunizations={immunizations as any} /> }
                    </div>
                </div>
            )}
            { selectedPatientResources && Object.keys(selectedPatientResources).length > 0 && (
                <div className='row small flex-grow-1'>
                    <div className='col'>
                        <div className='card'>
                            <ObservationsPanel />
                        </div>
                    </div>
                    <div className='col col-4'>
                        <EventFeed resources={selectedPatientResources} />
                    </div>
                </div>
            )}
        </div>
    );
}
