
import { Link, useParams } from 'react-router-dom';
import { patients }        from '../data'
import PatientListItem     from "./PatientListItem";
import BoxPlot             from './BoxPlot';


export default function PatientView() {
    const { id } = useParams();
    const patient = patients.find(p => p.mrn === id) as Patient | undefined;
    
    if (!patient) {
        return <div>Patient not found</div>;
    }

    return (
        <div>
            <Link to="../"><i className="bi bi-arrow-left-circle me-2"></i>Back to list</Link>
            <PatientListItem patient={patient} />

            <div className="table-responsive">
                <table className="table table-hover w-100 mb-0">
                    <thead>
                        <tr>
                            <td className="text-start text-success" style={{width: "auto"}}>
                                <b>{patient.name} Features</b>
                            </td>
                            <td style={{width: "20px"}} className="no-hover"></td>
                            <td style={{width: "250px"}}>
                                <span className="text-success">
                                    IBD Surgery<br/>
                                    <b>required</b>
                                </span>
                                <br/>
                                <small className="text-muted">(Bowel Resection)</small>
                            </td>
                            <td style={{width: "20px"}} className="no-hover"></td>
                            <td style={{width: "250px"}}>
                                <span className="text-success">
                                    Chance of anti-TNF<br/>
                                    <b>response</b>
                                </span>
                                <br/>
                                <small className="text-muted">(Never Failed)</small>
                            </td>
                            <td style={{width: "250px"}}>
                                <span className="text-success">
                                    Chance of anti-TNF<br/>
                                    <b>non-response</b>
                                </span>
                                <br/>
                                <small className="text-muted">(Ever Failed)</small>
                            </td>
                        </tr>
                    </thead>
                    <tbody id="data-table-body">
                        { patient.populationData.map((dataRow, index) => {
                            const { label, surgery, responder, nonResponder } = dataRow;
                            return (
                                <tr key={index}>
                                    <td className="text-start ps-0"><i className="bi bi-caret-right-fill text-success me-1" />{label}</td>
                                    <td className="no-hover" />
                                    <td className="bg-pale-primary">{ surgery }</td>
                                    <td className="no-hover"></td>
                                    <td className="bg-pale-success">{ responder }</td>
                                    <td className="bg-pale-success">{ nonResponder }</td>
                                </tr>
                            );
                        }) }
                    </tbody>
                    <tbody>
                        <tr className="no-hover no-border">
                            <td colSpan={6} style={{height: "20px"}}></td>
                        </tr>
                        <tr className="no-hover no-border">
                            <td colSpan={3} className="bg-pale-primary" style={{verticalAlign: "middle"}}>
                                {patient.population.screenshot}
                            </td>
                            <td className="no-hover"></td>
                            <td colSpan={2} className="bg-pale-success" style={{verticalAlign: "top"}}>
                                <table className="table table-sm small w-100 table-hover mt-2">
                                    <thead>
                                        <tr>
                                            <th className="text-start pb-2 text-success">IBD Drug Class</th>
                                            <th className="text-center pb-2 text-success" style={{width: "7em"}}># Patients</th>
                                            <th className="text-start pb-2 text-success text-nowrap" colSpan={2} style={{width: "160px"}}>Surgery free survival years</th>
                                        </tr>
                                    </thead>
                                    <tbody id="population-table-body">
                                        { patient.population.tableRows.map((row, index) => (
                                            <tr key={index}>
                                                <td className="text-start fw-semibold">{row.drugClass}</td>
                                                <td className="text-center text-muted">{row.patients}</td>
                                                <td className="text-start hc-container-small" style={{minWidth: 120}}>
                                                    <BoxPlot data={row.boxplot} />
                                                </td>
                                                <td className="text-start text-muted px-2" style={{width:"4em"}}>
                                                    <span className="badge bg-success d-block">{row.boxplot[2]}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
