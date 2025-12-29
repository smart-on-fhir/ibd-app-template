import { patients }    from '../data'
import PatientListItem from "./PatientListItem";


export default function PatientList() {
    return (
        <div id="patient-list">
            { patients.map((patient, index) => (
                <PatientListItem patient={patient} key={index} />
            )) }
        </div>
    );
}
