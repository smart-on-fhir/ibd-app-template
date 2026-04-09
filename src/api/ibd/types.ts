/** Shared type definitions for all IBD CDS API responses. */

// ---------------------------------------------------------------------------
// Domain union types
// ---------------------------------------------------------------------------

/** Severity band used for symptom and activity-score fields. */
export type SeverityLevel  = 'none' | 'mild' | 'moderate' | 'severe';

/** Medication adherence self-report or clinician assessment. */
export type AdherenceLevel = 'good' | 'partial' | 'poor';

/** Direction of disease activity change since last visit. */
export type SeverityTrend  = 'improving' | 'stable' | 'worsening';

/**
 * Discrete outcomes recorded for a cohort episode at the end of the
 * observation window. Used in the Similar Patients roster and trajectory chart.
 */
export type EpisodeOutcome = 'SFR' | 'ENDO' | 'ESC' | 'SURG' | 'NO';

/**
 * The three measurable clinical endpoints shown in the outcome charts.
 * A subset of EpisodeOutcome — only the endpoints with rate/IQR data.
 */
export type Endpoint = 'SFR' | 'ENDO' | 'SURG';

/** Cohort response granularity: full episode rows or aggregate statistics only. */
export type DataTier = 'episode' | 'aggregate';

/**
 * Pharmacological class of an IBD medication.
 * Mirrors `MedClass` in utils.ts (FHIR classification) — same value set,
 * separate type because this comes from the CDS API, not FHIR extraction.
 */
export type DrugClass =
    | 'biologic'
    | 'immunomodulator'
    | 'aminosalicylate'
    | 'steroid'
    | 'antibiotic'
    | 'other';

/** Disease behavior modifier per Paris classification (Crohn's disease only). */
export type ParisBehavior = 'B1' | 'B2' | 'B3';

/** Growth modifier per Paris classification. */
export type ParisGrowth = 'G0' | 'G1' | 'G2';

/**
 * Disease location per Paris classification.
 * L1–L4b are Crohn's disease locations; E1–E3 are UC extent categories.
 */
export type ParisLocation = 'L1' | 'L2' | 'L3' | 'L4a' | 'L4b' | 'E1' | 'E2' | 'E3';

/** Validated clinical scoring index used to quantify IBD disease activity. */
export type ActivityIndex = 'HBI' | 'PCDAI' | 'CDAI' | 'MAYO' | 'SCCAI' | 'UCEIS';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * A single drug exposure record used in both the present patient and matched
 * cohort episodes. Day numbers are pre-aligned by the CDS backend so that day 0
 * always corresponds to the current decision-point, enabling the Treatment
 * History Gantt chart to plot all rows on a common timeline without any
 * date arithmetic in the frontend.
 */
export interface MedicationHistoryItem {
    /** Generic drug name (e.g. "Ustekinumab"). */
    drug:       string;
    /** Pharmacological class of the drug. */
    drug_class: DrugClass;
    /** Days relative to the decision-point (day 0). Negative = prior to start. */
    start_day:  number;
    /** Days relative to day 0 when the drug was stopped (or projected to stop). */
    end_day:    number;
}

/**
 * A single CRP observation on a day-relative timeline. Used for both the
 * present patient's biomarker series and cohort episode trajectories displayed
 * in the disease activity chart and the Timelines page.
 */
export interface CrpPoint {
    /** Days relative to day 0. */
    day: number;
    /** CRP value in mg/L. */
    crp: number;
}

/**
 * A single procalcitonin (PCT) observation on a day-relative timeline. PCT is
 * an optional infection/inflammation marker plotted alongside CRP in
 * the disease activity chart when the data is present.
 */
export interface PctPoint {
    /** Days relative to day 0. */
    day: number;
    /** Procalcitonin value in ng/mL. */
    pct: number;
}

// ---------------------------------------------------------------------------
// Cohort response — /ibd/cohort
// ---------------------------------------------------------------------------

/**
 * One time-point in a treatment arm's median CRP trajectory, including the
 * interquartile spread. The Timelines page plots these as an IQR band with a
 * median line so the clinician can see how quickly each therapy suppressed
 * inflammation across the matched cohort.
 */
export interface TrajectoryPoint {
    /** Days relative to treatment start (day 0). */
    day:      number;
    /** Cohort median CRP in mg/L at this time point. */
    crp:      number;
    /** 25th-percentile CRP across cohort episodes. */
    q25_crp?: number;
    /** 75th-percentile CRP across cohort episodes. */
    q75_crp?: number;
}

/**
 * Outcome statistics for one candidate treatment arm within the matched cohort.
 * The Timelines page uses this to render the therapy selector and CRP trajectory
 * chart; Similar Patients uses it for the outcome distribution bar chart and the
 * treatment comparison table in aggregate mode; Treatment Outcomes uses it to
 * display per-endpoint outcome bars with lab-normalised context.
 */
export interface TreatmentDistribution {
    /** Short treatment code used as a stable key (e.g. "UST", "VDZ"). */
    treatment:            string;
    /** Human-readable drug name displayed in the UI. */
    label:                string;
    /** Number of matched cohort episodes on this treatment. */
    n:                    number;
    /** Steroid-free remission rate at 12 months (0–1). */
    sfr_12m_rate:         number;
    /** Median days from treatment start to SFR. */
    median_days_to_sfr:   number;
    /** [Q25, Q75] interquartile range for days-to-SFR. */
    iqr:                  [number, number];
    /** Endoscopic remission rate at 12 months (0–1). */
    endo_12m_rate?:       number;
    /** Median days from treatment start to endoscopic remission. */
    median_days_to_endo?: number;
    /** [Q25, Q75] interquartile range for days-to-endoscopic remission. */
    iqr_endo?:            [number, number];
    /** Surgical intervention rate at 12 months (0–1). */
    surg_12m_rate?:       number;
    /** Median days from treatment start to surgery. */
    median_days_to_surg?: number;
    /** [Q25, Q75] interquartile range for days-to-surgery. */
    iqr_surg?:            [number, number];
    /** Free-text clinical note shown alongside the distribution (e.g. "best overall"). */
    note?:                string;
    /** Cohort median CRP trajectory over time for this treatment arm. */
    median_trajectory?:   TrajectoryPoint[];
}

/**
 * Aggregate outcome rates pooled across all treatments in the matched cohort.
 * Displayed as the three summary stat cards on the IBD Summary page ("Matched
 * Cohort") and as context numbers in the cohort header on Similar Patients.
 */
export interface CohortOutcomes {
    /** Overall SFR rate across all treatments in the matched cohort (0–1). */
    sfr_12m_rate:   number;
    /** Overall endoscopic remission rate across the cohort (0–1). Absent when endoscopy follow-up was not available for this cohort. */
    endo_12m_rate?: number;
    /** Overall surgical rate across the cohort (0–1). Absent when surgical outcome data was not collected. */
    surg_12m_rate?: number;
}

/**
 * CDS-backend data for the patient currently under review. Unlike the FHIR
 * resources (which come from PatientContext), this data is pre-aligned by the
 * CDS backend to day 0 and may be supplemented with indicative trajectories
 * when real biomarker observations are absent. Used by Treatment History
 * (medication bars) and the disease activity chart (CRP / PCT fallback series).
 */
export interface PresentPatient {
    /** CDS-aligned medication history for the current patient, relative to day 0. */
    medication_history: MedicationHistoryItem[];
    /** CRP trajectory from FHIR or mock data, used when no FHIR observations exist. */
    crp_trajectory?:    CrpPoint[];
    /** PCT trajectory from FHIR or mock data, used when no FHIR observations exist. */
    pct_trajectory?:    PctPoint[];
}

/**
 * Paris classification for a matched cohort episode. Shown in the episode
 * detail panel on Similar Patients to help the clinician judge how closely a
 * historical case resembles the present patient's phenotype.
 */
export interface EpisodeParis {
    /** Disease location per Paris classification. */
    location:  ParisLocation;
    /** Disease behavior modifier. */
    behavior:  ParisBehavior;
    /** Whether perianal disease was present. */
    perianal:  boolean;
    /** Growth modifier. */
    growth:    ParisGrowth;
}

/**
 * Disease activity index score for a matched cohort episode at baseline.
 * Displayed in the episode detail panel on Similar Patients so the clinician
 * can compare disease severity at the time of the historical treatment decision.
 */
export interface EpisodeActivityScore {
    /** Scoring index used. */
    index:    ActivityIndex;
    /** Numeric score value. */
    value:    number;
    /** Interpreted severity band. */
    severity: SeverityLevel;
}

/**
 * Pre-treatment endoscopy data for a matched cohort episode. Surfaced in the
 * episode detail panel on Similar Patients to give the clinician objective
 * mucosal severity context for the historical case.
 */
export interface EpisodeEndoscopyPre {
    /** Simple Endoscopic Score for Crohn's Disease at baseline. */
    ses_cd:  number;
    /** Free-text endoscopy finding summary. */
    finding: string;
}

/**
 * Key symptom observations extracted from the baseline clinic note for a
 * matched cohort episode. Displayed in the episode detail panel on Similar
 * Patients to support qualitative comparison with the present patient.
 */
export interface EpisodeNoteSummary {
    /** Average stool frequency per day at baseline. Absent if not mentioned in the clinic note. */
    stool_freq_per_day?: number;
    /** Whether nocturnal stools were reported. Absent if not mentioned in the clinic note. */
    nocturnal?:          boolean;
    /** Clinician global assessment. Absent if not documented. */
    global_assessment?:  SeverityLevel;
}

/**
 * One historical treatment episode from the matched cohort. Each episode
 * represents a single decision-point for a de-identified past patient who
 * received a specific therapy. Episodes are listed in the Similar Patients
 * roster (episode mode), used to plot individual trajectories on the Timelines
 * page when the "show individuals" toggle is on, and drive the cohort Gantt
 * rows in Treatment History.
 */
export interface Episode {
    /** Unique identifier for this decision-point episode. */
    episode_id:        string;
    /** De-identified patient identifier (not displayed in the UI). */
    patient_id:        string;
    /** Cosine-similarity score to the present patient (0–1). */
    similarity:        number;
    /** Treatment code matching a key in `treatment_distributions`. */
    treatment:         string;
    /** Outcome achieved within the observation window. */
    outcome:           EpisodeOutcome;
    /** Days from treatment start to the recorded outcome. */
    days_to_outcome:   number;
    /** Human-readable features that drove the similarity match. */
    matching_features: string[];
    /** Paris classification at the time of this episode. */
    paris?:            EpisodeParis;
    /** Key lab values recorded at treatment baseline. */
    labs_at_baseline?: {
        /** CRP in mg/L. */
        crp:          number;
        /** ESR in mm/hr. */
        esr:          number;
        /** Serum albumin in g/dL. */
        albumin:      number;
        /** Fecal calprotectin in μg/g. */
        calprotectin: number;
    };
    /** Activity index score at baseline. */
    activity_score?:    EpisodeActivityScore;
    /** Pre-treatment endoscopy findings. */
    endoscopy_pre?:     EpisodeEndoscopyPre;
    /** Key clinical observations extracted from the baseline clinic note. */
    note_summary?:      EpisodeNoteSummary;
    /** CRP values observed during this episode, relative to treatment start. */
    trajectory:         CrpPoint[];
    /** Full medication history for this episode, relative to day 0. */
    medication_history: MedicationHistoryItem[];
}

/**
 * Top-level response from `GET /ibd/cohort`. This is the central data structure
 * for the IBD dashboard — it drives IBD Summary (summary cards), Timelines
 * (trajectory chart and therapy selector), Similar Patients (cohort roster and
 * outcome distributions), Treatment History (Gantt chart), and the disease
 * activity chart (CRP/PCT fallback series). Consumed via `useCohortData`, which
 * fetches it once per patient/tier and caches it for the lifetime of the component tree.
 */
export interface CohortResponse {
    /** Indicates whether episode-level rows or aggregate-only stats are present. */
    data_tier:               DataTier;
    /** Total number of matched historical episodes in the cohort. */
    cohort_size:             number;
    /** Labels describing the features used for patient matching. */
    matching_chips:          string[];
    /** Rule that defines day 0 for time-alignment (e.g. "medication_order"). */
    treatment_start_rule:    string;
    /** Aggregate outcome rates across the whole matched cohort. */
    outcomes:                CohortOutcomes;
    /** Per-treatment outcome statistics and trajectories. */
    treatment_distributions: TreatmentDistribution[];
    /** Present patient's CDS-aligned medication and biomarker data. */
    present_patient:         PresentPatient;
    /** Individual episode rows; empty in aggregate tier. */
    episodes:                Episode[];
}

// ---------------------------------------------------------------------------
// Patient note response — /ibd/note
// ---------------------------------------------------------------------------

/**
 * Top-level response from `GET /ibd/note`. Contains structured clinical data
 * extracted by the CDS backend from the patient's most recent clinic note — fields
 * that are not reliably encoded in FHIR (symptoms, Paris classification, activity
 * score, endoscopy). Used exclusively by the IBD Summary page to populate the
 * left-rail summary (disease subtype, Paris, symptoms) and the "Recent disease
 * activity" section. Fetched via `usePatientNote`.
 */
export interface PatientNoteResponse {
    /**
     * Patient-reported and clinician-recorded symptoms at the time of the note.
     * Absent if the NLP extractor found no symptom section. Individual sub-fields
     * may also be absent if a specific symptom was not mentioned.
     */
    symptoms?: {
        /** Severity of abdominal pain. Absent if not mentioned. */
        abdominal_pain?:     SeverityLevel;
        /** Average number of stools per day. Absent if not mentioned. */
        stool_freq_per_day?: number;
        /** Weight loss in kg since the last clinic visit. Absent if not mentioned. */
        weight_loss_kg_since_last_visit?: number;
        /** Whether nocturnal stools were reported. Absent if not mentioned. */
        nocturnal_stool?:    boolean;
    };
    /**
     * Paris classification extracted from the note.
     * Absent if the note contains no Paris classification. If present, all fields are populated.
     */
    paris?: {
        /** Disease behavior modifier. */
        behavior: ParisBehavior;
        /** Growth modifier. */
        growth:   ParisGrowth;
    };
    /**
     * Disease activity index recorded in the note.
     * Absent if no scoring index was documented. If present, all fields are populated.
     */
    activity_score?: {
        /** Index name. */
        index:    ActivityIndex;
        /** Numeric score. */
        value:    number;
        /** Interpreted severity. */
        severity: SeverityLevel;
    };
    /**
     * Most recent endoscopy results referenced in the note.
     * Absent if no endoscopy was referenced. If present, all fields are populated.
     */
    endoscopy?: {
        /** ISO 8601 date of the procedure. */
        date:    string;
        /** Simple Endoscopic Score for Crohn's Disease. */
        ses_cd:  number;
        /** Free-text finding summary. */
        finding: string;
    };
    /** Medication adherence assessment. Absent if not documented in the note. */
    adherence?:      AdherenceLevel;
    /** Direction of disease trend. Absent if not determinable from the note. */
    severity_trend?: SeverityTrend;
}
