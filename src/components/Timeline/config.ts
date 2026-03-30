/**
 * Number of milliseconds in a day (average regardless of leap years).
 */
export const DAY = 864e5;


/**
 * FHIR resource types that containing medication information.
 */
export const MEDICATION_RESOURCE_TYPES = new Set([
    'MedicationRequest',
    'MedicationStatement',
    'MedicationAdministration',
    'MedicationDispense',
]);

/**
 * Which FHIR resource types are considered treatments in the timeline.
 */
export const TREATMENT_TYPES = new Set([
    'MedicationRequest',
    'MedicationStatement',
    'MedicationAdministration',
    'MedicationDispense',
    'Procedure',
    'Immunization',
]);

/**
 * Mapping of medication statuses to colors used in the timeline chart.
 * The colors indicate the status of the medication:
 * - Green shades for active or in-progress medications
 * - Grey shades for completed, resolved, or stopped medications
 * - Red shades for cancelled, revoked, or error statuses
 */
export const MEDICATION_STATUS_COLORS: Record<string, string> = {
    'active'          : '#33CC00',
    'in-progress'     : '#33CC00',
    'resolved'        : '#d9e7d4',
    'completed'       : '#d9e7d4',
    'stopped'         : '#d9e7d4',
    'inactive'        : '#d4d4d4',
    'unknown'         : '#d4d4d4',
    'cancelled'       : '#efcdd0',
    'revoked'         : '#efcdd0',
    'entered-in-error': '#ff7e7e',
    'on-hold'         : '#ffb45f',
};

/**
 * Configuration mapping for medical procedure types and their associated observation windows.
 * Each entry defines a category of gastrointestinal procedures or treatments and the time period
 * (in days) during which follow-up observations or related procedures should be documented.
 * 
 * @remarks
 * The observation windows represent the recommended timeframe for monitoring and documenting
 * outcomes or complications following each procedure category:
 * - Major surgical interventions: 90 days
 * - Diagnostic endoscopic procedures: 30 days
 * - Medication administration: 14 days
 * - Therapeutic interventions: 7 days
 */
export const PROCEDURE_WINDOWS: [string[], number][] = [

    // -------------------------------------------------------------------------
    // Major surgical interventions: 90 days
    // -------------------------------------------------------------------------
    [
        [
            'colectomy', 'ileostomy', 'colostomy', 'resection', 'surgery',
            'surgical'
        ],
        90 * DAY
    ],

    // -------------------------------------------------------------------------
    // Diagnostic endoscopic procedures: 30 days
    // -------------------------------------------------------------------------
    [
        [
            'colonoscopy', 'endoscopy', 'sigmoidoscopy', 'enteroscopy',
            'ileoscopy'
        ],
        30 * DAY
    ],

    // -------------------------------------------------------------------------
    // Medication administration: 14 days
    // -------------------------------------------------------------------------
    [
        [
            'infusion', 'injection', 'administration'
        ],
        14 * DAY
    ],

    // -------------------------------------------------------------------------
    // Therapeutic interventions: 7 days
    // -------------------------------------------------------------------------
    [
        [
            'biopsy', 'dilation', 'dilatation', 'stent'
        ],
        7 * DAY
    ],
];

/**
 * IBD drug-class lookup: maps lowercase substring → observation window in ms.
 * Matched against the normalized drug name; first match wins.
 */
export const DRUG_CLASS_WINDOWS: [string[], number][] = [
    
    // -------------------------------------------------------------------------
    // Biologics / advanced therapies (dosed every 4–8 weeks)
    // -------------------------------------------------------------------------
    [
        [
            'infliximab', 'adalimumab', 'ustekinumab', 'vedolizumab',
            'risankizumab', 'ozanimod', 'filgotinib', 'tofacitinib',
            'upadacitinib', 'etrasimod', 'mirikizumab'
        ],
        56 * DAY
    ],

    // -------------------------------------------------------------------------
    // Immunomodulators (effect builds over months)
    // -------------------------------------------------------------------------
    [
        [
            'azathioprine', 'mercaptopurine', '6-mp', 'methotrexate'
        ],
        84 * DAY
    ],

    // -------------------------------------------------------------------------
    // Aminosalicylates
    // -------------------------------------------------------------------------
    [
        [
            'mesalamine', 'mesalazine', 'sulfasalazine', 'balsalazide',
            'olsalazine'
        ],
        28 * DAY
    ],

    // -------------------------------------------------------------------------
    // Corticosteroids (short burst)
    // -------------------------------------------------------------------------
    [
        [
            'prednisone', 'prednisolone', 'budesonide', 'methylprednisolone',
            'dexamethasone'
        ],
        21 * DAY
    ],
    
    // -------------------------------------------------------------------------
    // Antibiotics
    // -------------------------------------------------------------------------
    [
        [
            'ciprofloxacin', 'metronidazole', 'rifaximin', 'amoxicillin',
            'clarithromycin', 'flagyl'
        ],
        14 * DAY
    ],
];

export const IBD_PRESET = {
    id         : 'ibd',
    label      : 'IBD',
    color      : '#e67e22',
    description: "Crohn's disease & Ulcerative Colitis",
    icd10   : ['K50', 'K51', 'K52'],
    snomed  : ['34000006', '64766004', '24526004', '420789003'],
    rxnorm  : ['41493', '2122', '121191'], // mesalamine, azathioprine, infliximab
    keywords: [
        'crohn', 'ulcerative colitis', 'inflammatory bowel', 'ibd',
        'mesalamine', 'azathioprine', '6-mercaptopurine', 'mercaptopurine',
        'infliximab', 'adalimumab', 'vedolizumab', 'ustekinumab', 'tofacitinib',
        'budesonide', 'colonoscopy', 'ileostomy', 'colostomy', 'resection',
        'fecal calprotectin', 'calprotectin',
    ],
};

export const GLIOMA_PRESET = {
    id         : 'glioma',
    label      : 'Glioma / CNS',
    color      : '#8e44ad',
    description: 'Brain tumors, glioma, glioblastoma',
    icd10   : ['C71', 'C69', 'C72', 'D33', 'D43'],
    snomed  : ['393563007', '393504003', '372244006', '189161006', '254938000'],
    rxnorm  : ['339489', '1148476'], // temozolomide, bevacizumab
    keywords: [
        'glioma', 'glioblastoma', 'gbm', 'astrocytoma', 'oligodendroglioma',
        'brain tumor', 'brain tumour', 'craniotomy', 'temozolomide',
        'bevacizumab', 'lomustine', 'radiation', 'stereotactic', 'gamma knife',
        'whole brain', 'idh', 'mgmt', 'neuro-oncology',
    ],
};

export const DIABETES_PRESET = {
    id         : 'diabetes',
    label      : 'Diabetes',
    color      : '#009e42',
    description: 'Type 1 & Type 2 diabetes mellitus',
    icd10   : ['E10', 'E11', 'E12', 'E13', 'E08', 'E09'],
    snomed  : ['73211009', '44054006', '46635009', '422034002'],
    rxnorm  : ['5865', '6809', '86009'], // insulin, metformin, glipizide
    keywords: [
        'diabetes', 'diabetic', 'insulin', 'metformin', 'glipizide', 'glimepiride',
        'empagliflozin', 'dapagliflozin', 'liraglutide', 'semaglutide', 'ozempic',
        'hba1c', 'a1c', 'glucose', 'hyperglycemia', 'hypoglycemia',
        'glucagon', 'sglt2', 'glp-1', 'neuropathy', 'retinopathy', 'nephropathy',
    ],
};

export const RESPIRATORY_PRESET = {
    id         : 'respiratory',
    label      : 'Respiratory',
    color      : '#2980b9',
    description: 'Asthma, COPD and other respiratory conditions',
    icd10   : ['J44', 'J45', 'J47', 'J40', 'J41', 'J42', 'J43',
                'J30', 'J31', 'J32', 'J33', 'J34', 'J35', 'J36', 'J38'],
    snomed  : ['195967001', '13645005', '57607007', '22298006'],
    rxnorm  : ['745679', '2108774'], // albuterol, fluticasone
    keywords: [
        'asthma', 'copd', 'bronchitis', 'bronchiectasis', 'emphysema',
        'albuterol', 'salbutamol', 'salmeterol', 'budesonide', 'fluticasone',
        'tiotropium', 'inhaler', 'nebulizer', 'spirometry', 'fev1', 'fvc',
        'bronchodilator', 'pulmonary', 'respiratory',
    ],
};

export const CONDITION_PRESETS = [
    IBD_PRESET,
    GLIOMA_PRESET,
    DIABETES_PRESET,
    RESPIRATORY_PRESET
];

