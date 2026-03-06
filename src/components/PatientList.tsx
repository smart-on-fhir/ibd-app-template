import { Link }               from 'react-router-dom';
import { useEffect }          from 'react';
import Loader                 from './Loader';
import { summarizeHumanName } from '../utils';
import { usePatientContext }  from '../contexts/PatientContext';


export default function PatientList({ baseUrl }: { baseUrl?: string }) {
    return (
        <div id="patient-list" className='bg-white rounded-3 p-3 border small mb-3'>
            <FhirPatientLinks baseUrl={baseUrl} />
        </div>
    );
}

function FhirPatientLinks({ baseUrl }: { baseUrl?: string }) {
    const { patients, patientsLoading, loadPatients } = usePatientContext();

    useEffect(() => {
        // if (!patients || !patients.length) {
            loadPatients(baseUrl).catch(console.error);
        // }
    }, [baseUrl]);

    if (patientsLoading) {
        return (
            <div className='text-secondary'>
                <Loader className="me-1" />
                Loading patients...
            </div>
        );
    }

    if (!patients.length)
        return <div>No patients found</div>;

    return (
        <div style={{
            columnGap  : '1.5rem',
            columnWidth: '14em',
            columnRule : '1px dotted #CCC',
            whiteSpace : 'nowrap',
        }}>
            { patients.map((p) => (
                <div key={p.id} className='text-truncate'>
                    <Link to={`/patients/${p.id}`}>{p?.name?.[0] ? summarizeHumanName(p.name[0]) : p.id}</Link>
                </div>
            ))}
        </div>
    );
}
