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
    ESR:          { loincs: ['30341-2', '4537-7'],             keywords: ['erythrocyte sedimentation', 'esr', 'sed rate', 'sedimentation rate'], goodDirection: 'down' as const },
    Albumin:      { loincs: ['1751-7', '3519-7', '2862-1'],    keywords: ['albumin'],                                      goodDirection: 'up'   as const },
    Calprotectin: { loincs: ['35896-1', '27818-8'],            keywords: ['calprotectin'],                                 goodDirection: 'down' as const },
    Hemoglobin:   { loincs: ['718-7', '20509-6'],              keywords: ['hemoglobin', 'haemoglobin'],                    goodDirection: 'up'   as const },
    Platelets:    { loincs: ['777-3', '26515-7'],              keywords: ['platelet'],                                     goodDirection: null },
    Weight:       { loincs: ['29463-7', '3141-9'],             keywords: ['body weight', 'weight'],                        goodDirection: 'up'   as const },
    Height:       { loincs: ['8302-2', '3137-7'],              keywords: ['body height', 'height'],                        goodDirection: null },
    BMI:          { loincs: ['39156-5'],                       keywords: ['body mass index', 'bmi'],                       goodDirection: null },
    PreAlbumin:   { loincs: ['1809-3', '2857-1'],              keywords: ['prealbumin', 'pre-albumin', 'transthyretin'],   goodDirection: 'up'   as const },
    PCT:          { loincs: ['33959-8', '75241-0', '44372-3'], keywords: ['procalcitonin', 'pct'],                         goodDirection: 'down' as const },
    Ferritin:     { loincs: ['2276-4', '20567-4'],             keywords: ['ferritin'],                                     goodDirection: null },
    VitaminD:     { loincs: ['35365-7', '1989-3', '14635-7'],  keywords: ['vitamin d', '25-oh', '25-hydroxyvitamin'],      goodDirection: 'up'   as const },
    VitaminB12:   { loincs: ['2132-9', '14685-2'],             keywords: ['vitamin b12', 'cobalamin', 'b-12'],             goodDirection: 'up'   as const },
    WBC:          { loincs: ['6690-2', '26464-8'],             keywords: ['white blood cell', 'leukocyte', 'wbc'],         goodDirection: null },
    Neutrophils:  { loincs: ['751-8', '26499-4'],              keywords: ['neutrophil'],                                   goodDirection: null },
    Lymphocytes:  { loincs: ['731-0', '26478-8'],              keywords: ['lymphocyte'],                                   goodDirection: null },
    ALT:          { loincs: ['1742-6', '1743-4'],              keywords: ['alanine aminotransferase', 'alt', 'sgpt'],      goodDirection: 'down' as const },
    AST:          { loincs: ['1920-8', '30239-8'],             keywords: ['aspartate aminotransferase', 'ast', 'sgot'],    goodDirection: 'down' as const },
} as const;

export type LabKey = keyof typeof LAB_DEFS;

// ── Medication Gantt ──────────────────────────────────────────────────────────

/** LOINC codes identifying endoscopy / colonoscopy reports in DiagnosticReport */
export const ENDOSCOPY_LOINCS = ['18745-0', '11528-7', '28574-2', '47045-0', '77432-0'];
/** Keywords for matching endoscopy in DiagnosticReport.code.text / coding.display */
export const ENDOSCOPY_KEYWORDS = [
    'colonoscopy', 'endoscopy', 'sigmoidoscopy', 'ileoscopy', 'enteroscopy', 'capsule endoscopy',
];

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

// ── Glossary ──────────────────────────────────────────────────────────────────

/**
 * Short definitions for IBD-specific abbreviations and codes.
 * Keys are used by the <Term> component to look up tooltip text.
 */
export const IBD_GLOSSARY: Record<string, string> = {

    // ── Paris classification ──
    'Paris class':  'Paris classification: standardised descriptor of IBD phenotype covering disease location, behavior, and growth.',
    'Paris_L1':     "L1 — Ileal: Crohn's disease confined to the small intestine (terminal ileum).",
    'Paris_L2':     "L2 — Colonic: Crohn's disease confined to the large intestine.",
    'Paris_L3':     "L3 — Ileocolonic: Crohn's involving both small and large intestine.",
    'Paris_L4a':    'L4a — Upper GI: disease proximal to the ligament of Treitz.',
    'Paris_L4b':    'L4b — Upper GI distal: disease distal to the ligament of Treitz but proximal to ileum.',
    'Paris_E1':     'E1 — Proctitis: UC limited to the rectum.',
    'Paris_E2':     'E2 — Left-sided colitis: UC extending to the splenic flexure.',
    'Paris_E3':     'E3 — Extensive / pancolitis: UC extending beyond the splenic flexure.',
    'Paris_B1':     'B1 — Non-stricturing, non-penetrating (inflammatory phenotype).',
    'Paris_B2':     'B2 — Stricturing: bowel wall thickening causing narrowing or obstruction.',
    'Paris_B3':     'B3 — Penetrating: fistulas or abscesses.',
    'Paris_G0':     'G0 — Normal growth velocity for age.',
    'Paris_G1':     'G1 — Mild growth retardation (height velocity 1 SD below mean).',
    'Paris_G2':     'G2 — Severe growth retardation (height velocity ≥2 SD below mean).',

    // ── Activity indices ──
    'HBI':      "Harvey-Bradshaw Index (HBI): simplified clinical score for Crohn's disease activity. ≤4 = remission · 5–7 = mild · 8–16 = moderate · ≥17 = severe.",
    'PCDAI':    "Pediatric Crohn's Disease Activity Index (PCDAI): validated activity score for paediatric Crohn's. <10 = remission · 10–27 = mild · 28–40 = moderate · >40 = severe.",
    'CDAI':     "Crohn's Disease Activity Index (CDAI): validated adult Crohn's score. Remission <150.",
    'MAYO':     'Mayo Score: clinical and endoscopic activity score for Ulcerative Colitis. Total 0–12; remission ≤2.',
    'SCCAI':    'Simple Clinical Colitis Activity Index (SCCAI): bedside UC activity score. Remission <2.5.',
    'UCEIS':    'UC Endoscopic Index of Severity (UCEIS): validated endoscopic score for UC severity.',
    'WCDAI':    "Weighted PCDAI: variant of PCDAI emphasising laboratory components.",

    // ── Labs / biomarkers ──
    'CRP':          'C-Reactive Protein (CRP): acute-phase inflammatory protein elevated in active IBD. Normal <5 mg/L.',
    'ESR':          'Erythrocyte Sedimentation Rate (ESR): non-specific marker of systemic inflammation. Rises more slowly than CRP.',
    'Calprotectin': 'Fecal calprotectin: neutrophil protein released in intestinal inflammation. <50 μg/g = normal; 50–200 = borderline; >200 = active mucosal disease.',
    'Pre-albumin':  'Prealbumin (transthyretin): sensitive nutritional marker; falls rapidly in malnutrition or acute inflammation. Normal range 18–45 mg/dL.',
    'BMI':          'Body Mass Index (BMI): weight (kg) ÷ height (m²). Used to assess nutritional status; low BMI in IBD may indicate malabsorption or active disease.',

    // ── Endoscopy scores ──
    'SES-CD':   "Simple Endoscopic Score for Crohn's Disease (SES-CD): endoscopic activity score. 0–2 = inactive · 3–6 = mild · 7–15 = moderate · ≥16 = severe.",
    'CDEIS':    "Crohn's Disease Endoscopic Index of Severity (CDEIS): detailed endoscopic score (0–44).",

    // ── Clinical outcomes ──
    'SFR':  'Steroid-Free Remission (SFR): achieving clinical remission without corticosteroid use — the primary target for IBD therapy optimisation.',
    'ENDO': 'Endoscopic Remission (ENDO): mucosal healing confirmed by colonoscopy — associated with improved long-term outcomes.',
    'SURG': 'Surgical Intervention (SURG): bowel resection, ileostomy, colostomy, or proctectomy.',
    'ESC':  'Therapy Escalation (ESC): step-up to a more intensive treatment class (e.g. biologic after failing immunomodulator).',
    'NO':   'No endpoint event recorded within the observation window.',

    // ── Drug classes ──
    'biologic':        'Biologic therapy: monoclonal antibodies or fusion proteins targeting specific inflammatory pathways (e.g. anti-TNF, anti-integrin, anti-IL-12/23).',
    'immunomodulator': 'Immunomodulator: agents that suppress the immune system broadly (azathioprine, 6-MP, methotrexate). Often combined with biologics.',
    'aminosalicylate': "5-Aminosalicylates (5-ASA): anti-inflammatory drugs for mild-to-moderate UC; limited role in Crohn's.",
    'steroid':         'Corticosteroids: rapid induction agents for IBD flares; not suitable for maintenance therapy due to side-effect profile.',
    'antibiotic':      'Antibiotics used in IBD: particularly for perianal disease and post-surgical prophylaxis (e.g. ciprofloxacin, metronidazole).',

    // ── General ──
    "IBD-U":    "IBD-Unclassified (IBD-U): features of both Crohn's disease and Ulcerative Colitis without definitive classification on available evidence.",
    'IQR':      'Interquartile Range (IQR): the middle 50% of data — from the 25th to 75th percentile. Used to show variability in treatment response times.',

    // ── Summary card descriptions ──
    'card:regimen':       'Current regimen: all IBD medications the patient is actively prescribed, sorted by drug class (biologic → immunomodulator → steroid). Start dates are shown where available.',
    'card:cohort':        'Matched cohort: historical patients with a similar clinical profile (subtype, location, behaviour, lab markers). Matching is episode-level — the same patient may appear more than once at different decision points.',
    'card:best-response': 'Best historical response: the treatment with the highest steroid-free remission (SFR) rate at 12 months across all matched cohort episodes.',
    'card:risk-signal':   'Risk signal: percentage of matched cohort episodes that escalated to surgical intervention within 12 months — a surrogate for refractory or complicated disease course.',
};
