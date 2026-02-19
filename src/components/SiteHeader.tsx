import { Link } from "react-router-dom";
import { usePatientContext } from "../contexts/PatientContext";
import { formatDate } from "../utils";

export default function SiteHeader() {
    const {
        selectedPatient,
        selectedPatientSummary
    } = usePatientContext();

    return (
        <header className="border-bottom">
            <div className='d-flex flex-row align-items-center column-gap-3'>
                { selectedPatient && selectedPatientSummary ?
                    <>
                        <i className="bi bi-person-circle text-secondary m-0 lh-1" style={{ fontSize: '2.7rem' }} />
                        <div>
                            <h4 className='m-0'>
                                <Link className="text-decoration-none" to={`/patients/${selectedPatient.id}`}>{selectedPatientSummary.name || 'Unnamed patient'}</Link>
                            </h4>
                            <div className='d-flex flex-row align-items-center column-gap-3 small flex-wrap text-secondary'>
                                <div>
                                    DOB: <span className='text-success'>
                                        {selectedPatientSummary.dob || '—'}
                                    </span> ({selectedPatientSummary.gender && <span className='text-success'>{selectedPatientSummary.gender || 'Unknown gender'}</span> })
                                </div>
                                <div>MRN: <span className='text-success'>{selectedPatientSummary.mrn || 'Unknown MRN'}</span></div>
                                <div>Last encounter: <span className='text-success'>{formatDate(selectedPatientSummary.lastEncounter?.date || '')}</span></div>
                                <div>Allergies: <span className='text-success'>{selectedPatientSummary.allergies.length}</span></div>
                            </div>
                        </div>
                    </> :
                    <>
                        <i className="bi bi-boxes text-secondary m-0 lh-1" style={{ fontSize: '2.7rem' }} />
                        <h2 className="m-0">Patient App</h2>
                    </>
                }
                <Link to="/" className="btn btn-sm btn-primary ms-auto rounded-2 px-3">Select Patient</Link>
            </div>
        </header>
    );
}
