import { formatDate } from "../utils";


export function PatientHeader({ patient }: { patient: Patient }) {
    return (
        <div>
            <div className="fs-1 text-primary">
                <i className="bi bi-person-circle"></i>
            </div>
            <div>
                <div className="fw-bold fs-4">{patient.name}</div>
                <div className="text-muted">
                    <span className="text-muted">Gender: </span>{patient.gender}
                    <span className="text-muted">&nbsp;&nbsp;&nbsp;DOB: </span>{formatDate(patient.dob)}
                    <span className="text-muted">&nbsp;&nbsp;&nbsp;MRN: </span>{patient.mrn}
                </div>
            </div>
        </div>
    );
}
