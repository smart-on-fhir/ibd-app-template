import { useState }                  from "react";
import { useParams }                 from "react-router-dom";
import { modelFactory, ModelMap }    from "../data/index";
import { usePatientContext }         from "../contexts/PatientContext";
import DataGrid, { type GridColumn } from "./generic/DataGrid/index";
import { Model }                     from "../data/Model";


export default function ResourceView() {
    const { selectedPatientSummary, selectedPatientResources } = usePatientContext();
    const [useSummary, setUseSummary] = useState(true);
    const { resourceType } = useParams();

    if (!selectedPatientSummary || !selectedPatientResources) return <div>No summary available</div>;

    const modelConstructor = ModelMap[resourceType || ''] || Model;
    const resources = selectedPatientResources[resourceType as keyof typeof selectedPatientResources];

    if (!resources || resources.length === 0) return <div>No resources available for this type</div>;

    return (
        <div className="resource-view">
            <div className="row flex-wrap gap-2">
                <h4 className="col">Resources of type {resourceType} for {selectedPatientSummary.name}</h4>
                <div className="col-auto ms-auto form-check">
                    <label htmlFor="toggle-summary" className="form-check-label small">
                        <span className="me-2">Use summarized view (uncheck for raw JSON)</span>
                        <input type="checkbox" checked={useSummary} onChange={(e) => setUseSummary(e.target.checked)} className="form-check-input-end" id="toggle-summary" />
                    </label>
                </div>
            </div>
            <hr className="mt-0" />
            { useSummary ? (
                <ModelGrid
                    modelConstructor={modelConstructor}
                    data={resources.map(r => modelFactory(r as any)?.toJSON() || r)}
                    pageSize={20}
                />
            ) : (
                <DataGrid
                    items={resources}
                    pageSize={20}
                />
            ) }
        </div>
    );
}

function ModelGrid({
    modelConstructor,
    data,
    pageSize = 20,
}: {
    modelConstructor: typeof ModelMap[keyof typeof ModelMap],
    data: (typeof modelConstructor.attributes)[],
    pageSize?: number,
}) {
    const schema = modelConstructor?.schema;

    if (!schema) {
        return (
            <>
                <div className="text-center text-danger">No schema defined for this model.</div>
                <DataGrid items={data} pageSize={20} />
            </>
        );
    }

    let columns = Object.keys(schema.attributes).map((key) => {
        const descriptor = schema.attributes[key];
        if (!descriptor.summary) return null;
        return {
            key,
            label: descriptor.label || key,
            cellStyle: {
                fontFamily: descriptor.dataType === "date" ? 'monospace' : 'inherit',
                maxWidth: key === 'id' ?
                    '8rem' :
                    descriptor.dataType === "date" ? '12rem' : undefined
            },
            renderer: descriptor.renderer,
            dataType: descriptor.dataType,
        };
    }).filter(Boolean) as GridColumn[];

    return (
        <div className="model-grid">
            <DataGrid items={data} pageSize={pageSize} columns={columns} />
        </div>
    );
}