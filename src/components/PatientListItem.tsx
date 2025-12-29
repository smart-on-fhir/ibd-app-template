import { Link }       from "react-router-dom";
import { formatDate } from "../utils";


export default function PatientListItem({ patient }: { patient: Patient }) {
    return (
        <div className="my-5">
            <h4><Link to={`./${patient.mrn}`}>{patient.name}</Link></h4>
            <p className="text-success">
                <span className="text-muted">Gender: </span>{patient.gender}
                <span className="text-muted">&nbsp;&nbsp;&nbsp;DOB: </span>{formatDate(patient.dob)}
                <span className="text-muted">&nbsp;&nbsp;&nbsp;MRN: </span>{patient.mrn}
            </p>
            <p className="small">{patient.description}</p>
        </div>
    );
}