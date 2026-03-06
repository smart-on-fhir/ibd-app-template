import { usePatientContext }           from '../contexts/PatientContext';
import type { ImmunizationAttributes } from '../data/types';


export default function PatientSummaryView() {
    const { selectedPatientSummary, database } = usePatientContext();
    if (!selectedPatientSummary) return <div>No summary available</div>;

    const observations = (database?.Observation || []) as ObservationAttributes[];

    const latestObservations = observations
        .sort((a, b) => new Date(b.effectiveDateTime ?? 0).getTime() - new Date(a.effectiveDateTime ?? 0).getTime())
        .reduce((acc, o) => {
            if (!acc.length || acc[0].effectiveDateTime?.toDateString() === o.effectiveDateTime?.toDateString()) {
                acc.push(o);
            }
            return acc;
        }, [] as ObservationAttributes[]);
    
    const conditions: ConditionAttributes[] = (database?.Condition || []);
    const medications: MedicationRequestAttributes[] = (database?.MedicationRequest || []);
    const immunizations: ImmunizationAttributes[] = (database?.Immunization || []).sort((a, b) => {
        return new Date(b.occurrenceDateTime ?? 0).getTime() - new Date(a.occurrenceDateTime ?? 0).getTime();
    });

    return (
        <div className="patient-summary">
            <div className='d-flex flex-row flex-wrap gap-4 align-items-stretch mb-3'>
                { conditions.length > 0 && (
                    <div className='flex-grow-1 d-flex flex-column' style={{ flexBasis: '350px' }}>
                        <div className='fw-bold d-flex align-items-center mb-2 gap-2'>
                            <span>
                                <i className="bi bi-file-medical me-1 text-secondary" />
                                Conditions
                            </span>
                            <span className='badge bg-primary rounded-pill'>{ conditions.length }</span>
                        </div>
                        <div className='card-body overflow-auto bg-white p-3 rounded-3 small border flex-grow-1' style={{ maxHeight: '13.1rem' }}>
                        { conditions.length > 0 && (
                            <ul className='mb-0 ps-3'>
                                {conditions.map((c, idx) => (
                                    <li key={idx}>
                                        <div className='d-flex align-items-baseline gap-2'>
                                            <span className={'flex-grow-1' + (c.clinicalStatus === "active" ? '' : ' text-secondary')}>{c.codeDisplay}</span>
                                            <span className='text-secondary small'>{c.clinicalStatus === "active" ?
                                                <span className='text-danger'>active</span> :
                                                c.clinicalStatus || 'unknown status' }
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        </div>
                    </div>
                )}

                { medications.length > 0 && (
                    <div className='flex-grow-1 d-flex flex-column' style={{ flexBasis: '350px' }}>
                        <div className='fw-bold d-flex align-items-center mb-2 gap-2'>
                            <span>
                                <i className="bi bi-capsule me-1 text-secondary" />
                                Medications
                            </span>
                            <span className='badge bg-primary rounded-pill'>{ medications.length }</span>
                        </div>
                        <div className='card-body overflow-auto bg-white p-3 rounded-3 small border flex-grow-1' style={{ maxHeight: '13.1rem' }}>
                        { medications.length > 0 && (
                            <ul className='mb-0 ps-3'>
                                {medications.map((m, idx) => (
                                    <li key={idx}>
                                        <div className='d-flex align-items-baseline gap-2'>
                                            <span className={ 'flex-grow-1' + (m.status === "active" ? '' : ' text-secondary') }>{m.medication}</span>
                                            <span className='text-secondary small'>
                                                { m.status === "active" ? <span className='text-danger'>active</span> : m.status }
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        </div>
                    </div>
                )}

                { immunizations.length > 0 && (
                    <div className='flex-grow-1 d-flex flex-column' style={{ flexBasis: '350px' }}>
                        <div className='fw-bold d-flex align-items-center mb-2 gap-2'>
                            <span>
                                <i className="bi bi-shield-check me-2 text-secondary" />
                                Immunizations
                            </span>
                            <span className='badge bg-primary rounded-pill'>{ immunizations.length }</span>
                        </div>
                        <div className='card-body overflow-auto bg-white p-3 rounded-3 small border flex-grow-1' style={{ maxHeight: '13.1rem' }}>
                        { immunizations.length > 0 && (
                            <ol className='mb-0 ps-3'>
                                {immunizations.map((i, idx) => (
                                    <li key={idx}>
                                        <div className='d-flex align-items-baseline gap-2'>
                                            <span className='flex-grow-1'>{i.vaccineCode}</span>
                                            <span className='text-secondary small'>{i.occurrenceDateTime ? new Date(i.occurrenceDateTime).toLocaleDateString() : 'Unknown date'  }</span>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                        </div>
                    </div>
                )}
            </div>

            { latestObservations.length > 0 && (
                <>
                    <div className="mt-4 mb-2 d-flex align-items-center gap-2">
                        <i className="bi bi-journal-text text-secondary" />
                        <b>Most Recent Observations</b>
                        { latestObservations[0].effectiveDateTime ?
                        <span className='badge bg-primary rounded-pill'>
                            {new Date(latestObservations[0].effectiveDateTime).toLocaleDateString()}</span> :
                            null
                        }
                    </div>
                    <div className='card-body overflow-auto bg-white p-3 rounded-3 small border flex-grow-1'>
                    <table className="table table-sm table-hover my-0">
                        <thead>
                            <tr>
                                <th className='text-success'>Code</th>
                                <th className='text-success'>Observation</th>
                                <th className='text-success'>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {latestObservations.map((o, i) => (
                                <tr key={i}>
                                    <td className='text-secondary'>{o.code}</td>
                                    <td className='fw-semibold'>{o.codeDisplay}</td>
                                    <td>{o.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </>
            ) }
        </div>
    );
}
