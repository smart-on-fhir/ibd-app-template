import { useState }          from "react";
import { useNavigate }       from "react-router-dom";
import PatientList           from "./PatientList";
import { usePatientContext } from "../contexts/PatientContext";


const SOURCES = {
    localSandbox: {
        label: 'Local Sandbox',
        url: 'https://192.168.66.3',
        description: 'Connect to a local FHIR sandbox server (e.g. HAPI FHIR running in Docker)'
    },
    publicSandbox: {
        label: 'Public Sandbox',
        url: 'https://r4.smarthealthit.org',
        description: 'Connect to a public FHIR sandbox server (HAPI FHIR public instance)'
    },
    upload: {
        label: 'Upload Patient Bundle',
        url: '',
        description: 'Upload a FHIR JSON patient bundle file from your computer'
    }
};

export default function HomePage() {

    const [source, setSource] = useState<keyof typeof SOURCES>('upload');

    return (
        <div className="d-flex flex-column align-items-center h-100 pt-4">
            <h1>Welcome to the Patient App</h1>
            <p className="lead text-secondary">Please select a patient to view their information and timeline.</p>
            <ul className="nav nav-underline mb-4">
                <li className="nav-item" onClick={() => setSource("upload")}>
                    <span className={`nav-link ${source === 'upload' ? 'active' : ''}`} style={{ cursor: 'pointer', userSelect: 'none' }}>Upload Patient Bundle</span>
                </li>
                <li className="nav-item" onClick={() => setSource("localSandbox")}>
                    <span className={`nav-link ${source === 'localSandbox' ? 'active' : ''}`} style={{ cursor: 'pointer', userSelect: 'none' }}>Local Sandbox</span>
                </li>
                <li className="nav-item" onClick={() => setSource("publicSandbox")}>
                    <span className={`nav-link ${source === 'publicSandbox' ? 'active' : ''}`} style={{ cursor: 'pointer', userSelect: 'none' }}>Public Sandbox</span>
                </li>
            </ul>
            
            { source === 'upload' && <BundleImporter /> }
            
            { source === 'localSandbox' && (
                <div className="w-100">
                    <PatientList baseUrl={SOURCES.localSandbox.url} />
                </div>
            )}

            { source === 'publicSandbox' && (
                <div className="w-100">
                    <PatientList baseUrl={SOURCES.publicSandbox.url} />
                </div>
            )}
        </div>
     );
}

function BundleImporter() {

    const { loadPatientBundle } = usePatientContext();
    const navigate = useNavigate();

    function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text === 'string') {
                    const json = JSON.parse(text);
                    console.log('Parsed JSON:', json);
                    loadPatientBundle(json);
                    const patient = json.entry?.find((e: any) => e.resource?.resourceType === 'Patient')?.resource;
                    if (patient) {
                        navigate('/patients/' + patient.id);
                    }
                } else {
                    console.error('File content is not a string');
                }
            } catch (err) {
                console.error('Error parsing JSON:', err);
            }
        };
        reader.readAsText(file);
    }

    return (
        <div className="d-flex flex-column align-items-center h-100 pt-4">
            <input type="file" className="form-control" onChange={handleFileUpload} />
            <p className="form-text text-secondary">Please upload a FHIR JSON patient bundle file.</p>
        </div>
    );
}   
