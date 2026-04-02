/**
 * IBD-specific configuration.
 *
 * The drug lists below are duplicated from src/components/Timeline/config.ts.
 * The generic copies in that file will be deprecated once each condition module
 * owns its own configuration.
 */

// ── IBD condition codes ───────────────────────────────────────────────────────

/** ICD-10 prefixes that indicate Crohn's disease */
export const ICD10_CROHNS   = ['K50'];
/** ICD-10 prefixes that indicate Ulcerative Colitis */
export const ICD10_UC       = ['K51'];
/** ICD-10 prefixes that indicate unclassified/other IBD */
export const ICD10_IBD_U    = ['K52'];

/** SNOMED codes for specific IBD subtypes */
export const SNOMED_CROHNS  = new Set(['34000006']);
export const SNOMED_UC      = new Set(['64766004']);
export const SNOMED_IBD     = new Set(['24526004', '420789003']);

/** ICD-10 prefixes for perianal/perirectal conditions */
export const ICD10_PERIANAL = ['K60', 'K61', 'K62'];
export const PERIANAL_KEYWORDS = ['perianal', 'fistula', 'abscess', 'fissure', 'perirectal', 'anal'];

/** Keywords indicating prior IBD-related surgery */
export const IBD_SURGERY_KEYWORDS = [
    'colectomy', 'ileostomy', 'colostomy', 'resection',
    'proctectomy', 'j-pouch', 'ileal pouch',
];

// ── IBD medication classes ────────────────────────────────────────────────────

export const IBD_BIOLOGICS: string[] = [
    'infliximab', 'adalimumab', 'ustekinumab', 'vedolizumab',
    'risankizumab', 'ozanimod', 'filgotinib', 'tofacitinib',
    'upadacitinib', 'etrasimod', 'mirikizumab',
];

export const IBD_IMMUNOMODULATORS: string[] = [
    'azathioprine', 'mercaptopurine', '6-mp', 'methotrexate',
];

export const IBD_AMINOSALICYLATES: string[] = [
    'mesalamine', 'mesalazine', 'sulfasalazine', 'balsalazide', 'olsalazine',
];

export const IBD_STEROIDS: string[] = [
    'prednisone', 'prednisolone', 'budesonide', 'methylprednisolone', 'dexamethasone',
];

export const IBD_ANTIBIOTICS: string[] = [
    'ciprofloxacin', 'metronidazole', 'rifaximin', 'amoxicillin', 'clarithromycin', 'flagyl',
];

// ── IBD-relevant lab LOINC codes ─────────────────────────────────────────────

export const LAB_DEFS = {
    CRP:          { loincs: ['1988-5', '14959-1', '71426-1'],  keywords: ['c reactive protein', 'crp'],                    goodDirection: 'down' as const },
    ESR:          { loincs: ['30341-2', '4537-7'],              keywords: ['erythrocyte sedimentation', 'esr', 'sed rate', 'sedimentation rate'], goodDirection: 'down' as const },
    Albumin:      { loincs: ['1751-7', '3519-7', '2862-1'],    keywords: ['albumin'],                                      goodDirection: 'up'   as const },
    Calprotectin: { loincs: ['35896-1', '27818-8'],             keywords: ['calprotectin'],                                 goodDirection: 'down' as const },
    Hemoglobin:   { loincs: ['718-7', '20509-6'],               keywords: ['hemoglobin', 'haemoglobin'],                    goodDirection: 'up'   as const },
    Platelets:    { loincs: ['777-3', '26515-7'],               keywords: ['platelet'],                                     goodDirection: null },
    Weight:       { loincs: ['29463-7', '3141-9'],              keywords: ['body weight', 'weight'],                        goodDirection: 'up'   as const },
    Height:       { loincs: ['8302-2', '3137-7'],               keywords: ['body height', 'height'],                        goodDirection: null },
    BMI:          { loincs: ['39156-5'],                        keywords: ['body mass index', 'bmi'],                       goodDirection: null },
    PreAlbumin:   { loincs: ['1809-3', '2857-1'],               keywords: ['prealbumin', 'pre-albumin', 'transthyretin'],   goodDirection: 'up'   as const },
} as const;

export type LabKey = keyof typeof LAB_DEFS;

// ── Medication Gantt ──────────────────────────────────────────────────────────

/** Color per MedClass for use in the medication Gantt chart. */
export const IBD_MED_CLASS_COLORS: Record<string, string> = {
    biologic:        '#0d6efd',
    immunomodulator: '#6f42c1',
    aminosalicylate: '#20c997',
    steroid:         '#fd7e14',
    antibiotic:      '#dc3545',
    other:           '#adb5bd',
};

/**
 * Fallback display duration (days) keyed by drug name fragment for the
 * medication Gantt chart — used when no FHIR period can be extracted.
 * Represents realistic IBD treatment windows for chart display.
 * First match wins (checked case-insensitively).
 */
export const IBD_MED_DISPLAY_DAYS: [string[], number][] = [
    // Short steroid bursts
    [['prednisone', 'prednisolone', 'methylprednisolone', 'dexamethasone'], 21],
    [['budesonide'], 28],
    // Antibiotics
    [['ciprofloxacin', 'metronidazole', 'rifaximin', 'amoxicillin', 'clarithromycin', 'flagyl'], 14],
    // Chronic background therapies
    [['azathioprine', 'mercaptopurine', '6-mp', 'methotrexate'], 365],
    [['mesalamine', 'mesalazine', 'sulfasalazine', 'balsalazide', 'olsalazine'], 365],
    // Advanced therapies — 6-month treatment window
    [['infliximab', 'adalimumab', 'vedolizumab', 'ustekinumab', 'risankizumab',
      'ozanimod', 'filgotinib', 'tofacitinib', 'upadacitinib', 'etrasimod', 'mirikizumab'], 180],
];
