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
    CRP:          { loincs: ['1988-5', '14959-1', '71426-1'],  keywords: ['c reactive protein', 'crp'] },
    ESR:          { loincs: ['30341-2', '4537-7'],              keywords: ['erythrocyte sedimentation', 'esr', 'sed rate', 'sedimentation rate'] },
    Albumin:      { loincs: ['1751-7', '3519-7', '2862-1'],    keywords: ['albumin'] },
    Calprotectin: { loincs: ['35896-1', '27818-8'],             keywords: ['calprotectin'] },
    Hemoglobin:   { loincs: ['718-7', '20509-6'],               keywords: ['hemoglobin', 'haemoglobin'] },
    Platelets:    { loincs: ['777-3', '26515-7'],               keywords: ['platelet'] },
    Weight:       { loincs: ['29463-7', '3141-9'],              keywords: ['body weight', 'weight'] },
} as const;

export type LabKey = keyof typeof LAB_DEFS;
