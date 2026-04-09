import mockNote from '../../modules/ibd/mock/patient-note.json';
import type { PatientNoteResponse } from './types';
export type { PatientNoteResponse } from './types';

const BASE = import.meta.env.VITE_CDS_API_URL ?? '';

/**
 * Fetches the patient note-derived data for a given patient.
 * @param patientId - The ID of the patient.
 * @returns A promise that resolves to the patient note response.
 */
export async function fetchPatientNote(
    patientId: string,
): Promise<PatientNoteResponse> {
    if (!BASE) return mockNote;
    const res = await fetch(`${BASE}/ibd/note?patient=${patientId}`);
    if (!res.ok) throw new Error(`CDS API error ${res.status}`);
    return res.json();
}
