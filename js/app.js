"use strict";

/* =====================================================================
   1. STATE
   ===================================================================== */
const state = {
  page: 'map',                       // 'map' | 'correlation' | 'mvi'
  metric: 'HCR_Upper_pct_HIES_22',   // default reproduces reference (Poverty Headcount Rate)
  bracProgramme: '',
  valueRange: null,                  // [lo, hi] on selected metric, or null = full
  cviRange: null,                    // [lo, hi] on CVI, or null = full
  povertyRange: null,                // [lo, hi] on HCR_Upper_pct_HIES_22, or null = full
  selectedDistrict: null,            // district code
  sortDir: 'desc',
  scatterX: 'UPGP',                  // BRAC response (need vs response framing)
  scatterY: 'HCR_Upper_pct_HIES_22', // BBS need
  showAllMetrics: false,
  activeLevel: 'district',
  quadSortKey: 'y',                  // 'name' | 'x' | 'y' — 4-quadrant table sort column
  quadSortDir: 'desc',
  quadFilter: null,                  // 'HH' | 'HL' | 'LH' | 'LL' | null — active quadrant chip filter
  scatterScale: 'actual',            // 'actual' | 'normalized' — scatter axis value scale

  // ---- MVI (Composite Vulnerability Score tool) — independent of the filters
  // above; MVI always scores getUnits() (all 64 districts), never visibleUnits().
  // Default indicators/weights duplicated here as literals (not a reference to
  // MVI_DEFAULT_SELECTION/MVI_DEFAULT_WEIGHTS, which are declared further down
  // the script and would be in the temporal dead zone at this point) — kept in
  // sync with those consts, which mviResetToDefault() reads from.
  mviSelected: ['HCR_Upper_pct_HIES_22','MPI','CVI','Weighted_avg_composite_score_vulnerability',
    'No_Electricity_Connection_pct','Percent_Returned_Migrant','disability_rate_pct','Kancha_pct',
    'Unsafe_Disposal_with_Flushing_Pouring_Water_pct','Literacy_Rate_7yearplus_Overall'],
  mviWeights: { HCR_Upper_pct_HIES_22:10, MPI:10, CVI:10, Weighted_avg_composite_score_vulnerability:10,
    No_Electricity_Connection_pct:10, Percent_Returned_Migrant:10, disability_rate_pct:10, Kancha_pct:10,
    Unsafe_Disposal_with_Flushing_Pouring_Water_pct:10, Literacy_Rate_7yearplus_Overall:10 },
  mviInverseOverrides: {},        // key -> boolean, user-flipped polarity (overrides MVI_INVERSE_DEFAULTS)
  mviSearch: '',                  // metric repository search text
  mviResults: null,               // cached computeMviScores() output, until next Calculate
  mviSortDir: 'desc',
  mviTableExpanded: false,
  mviSelectedDistrict: null,      // deliberately separate from state.selectedDistrict
  mviResultView: 'grid',          // 'grid' | 'map' — Data grid / Map view toggle
  mviDistrictSearch: '',          // results-header district search (display filter only)
  mviDivisionFilter: ''           // results-header division filter (display filter only)
};

let DATA = null;          // raw json
let DICT = null;          // metric_dictionary
let ALL_UNITS = [];       // all geo units of the active level
let geoLayer = null;      // leaflet layer
let map = null;
let scatterChart = null;
let unitByNorm = {};       // normalized name -> unit (for geojson join)
let layerByCode = {};      // district code -> leaflet layer
let programmeMarkers = null; // leaflet layer group: pins for the selected BRAC programme
let labelLayer = null;     // leaflet layer group: permanent short district labels

// MVI page's own Leaflet instance — Leaflet requires one map per container, so
// this cannot share map/geoLayer/labelLayer/layerByCode with Map view above.
let mviMap = null;
let mviGeoLayer = null;
let mviLabelLayer = null;
let mviLayerByCode = {};
let cachedGeojson = null; // bd_districts.geojson, fetched once, shared by initMap() and initMviMap()

/* District-name aliases: our name <- geojson variants */
const NAME_ALIASES = {
  "Bogura":["Bogra"], "Barisal":["Barishal"], "Chattogram":["Chittagong"],
  "Cumilla":["Comilla"], "Cox's Bazar":["Coxs Bazar","Cox'S Bazar"],
  "Jashore":["Jessore"], "Kishoregonj":["Kishoreganj"],
  "Brahmanbaria":["Brahamanbaria","Brahman Baria"],
  "Chapainawabganj":["Nawabganj","Chapai Nawabganj","Chapainababganj"],
  "Netrakona":["Netrokona"], "Lakshmipur":["Laxmipur","Lakshimpur"],
  "Moulvibazar":["Maulvibazar","Moulavibazar"], "Khagrachhari":["Khagrachari"]
};

/* Consistent categorical palette for climate zones */
const ZONE_COLORS = {
  "Barind":"#FFA100", "CHT":"#80379B", "Coastal":"#3DB7E4", "Haor":"#007161",
  "Other":"#9AA0A6", "River & Char":"#EC008C", "River-Char":"#C2185B"
};

/* Quadrant palette for the scatter (split at median of X and Y) */
const QUAD_COLORS = {
  HH:"#EC008C", // High X · High Y  (magenta)
  HL:"#FFA100", // High X · Low Y   (orange)
  LH:"#3DB7E4", // Low X  · High Y  (blue)
  LL:"#007161"  // Low X  · Low Y   (teal)
};
const QUAD_LABELS = { HH:"High X · High Y", HL:"High X · Low Y", LH:"Low X · High Y", LL:"Low X · Low Y" };

/* =====================================================================
   2. UNITS (geo-level agnostic)
   ===================================================================== */
function getUnits(){
  return ALL_UNITS.filter(u => u.geo_level === state.activeLevel);
}

/* =====================================================================
   3. UTILS
   ===================================================================== */
const $ = id => document.getElementById(id);

/* ---- Readable indicator names ----
   Tier 1: explicit plain-English overrides (units verified against value ranges).
   Tier 2: prettifyLabel() auto-cleans everything else.
   Tier 3 (resolved 2026-06-21): BRAC programme glossary supplied by BRAC — see
           BRAC_PROGRAMMES / BRAC_SUPPORTING_METRICS below, merged into this lookup. */
const NAME_OVERRIDES = {
  HCR_Upper_pct_HIES_22: 'Poverty headcount rate, upper line (%)',
  H_Harmonised_National_MPI: 'Poverty incidence — H, harmonised national MPI',
  MPI: 'Multidimensional Poverty Index (MPI)',
  CVI: 'Climate Vulnerability Index (CVI)',
  Weighted_avg_composite_score_vulnerability: 'Composite vulnerability score',
  Number_of_Poor_000: 'Number of poor people (thousands)',
  Population_Total: 'Total population (count)',
  num_Male: 'Male population (count)',
  num_female: 'Female population (count)',
  Overall_Sex_Ratio: 'Sex ratio (males per 100 females)',
  Average_Rate_of_Child_marriage_pct: 'Child marriage rate (%)',
  Female_Employed_Population: 'Female employed population (count)',
  Unemployment_Rate_Overall_calculated: 'Unemployment rate (%)',
  Literacy_Rate_7yearplus_Overall: 'Literacy rate, age 7+ (%)',
  Literacy_Rate_7yearplus_Female: 'Female literacy rate, age 7+ (%)',
  Literacy_Rate_7yearplus_Male: 'Male literacy rate, age 7+ (%)',
  Have_financial_account_Overall: 'Adults with a financial account (%)',
  Have_financial_account_Female: 'Women with a financial account (%)',
  Mobile_Bank_Account_Overall: 'Adults with a mobile bank account (%)',
  Kancha_pct: 'Kancha (temporary) houses (%)',
  Pucca_pct: 'Pucca (permanent) houses (%)',
  Open_Defecation_No_Latrine_Available_pct: 'Open defecation / no latrine (%)',
  Safe_Disposal_with_Flushing_Pouring_Water_pct: 'Safe sanitation, flushing/pouring water (%)',
  Total_Persons_With_Disability: 'Persons with disability (count)'
};

/* BRAC programme glossary (provided by BRAC, 2026-06-21).
   Data note: only 15 distinct programme metrics exist in master_data.json — MF and
   WASH are real BRAC programmes but are filed under the "population_demography"
   category there (not "brac_programmes"); there is no separate "Migration" metric
   beyond MEP. So this dropdown shows 15, not the 16 originally expected — flagging
   rather than inventing a 16th key that isn't in the data. */
const BRAC_PROGRAMMES = {
  BEP:  'BRAC Education Programme',
  BHP:  'BRAC Health Programme',
  BYP:  'BRAC Youth Programme',
  CCP:  'Climate Change Programme',
  DRMP: 'Disaster Risk Management Programme',
  IDP:  'Integrated Development Programme',
  MEP:  'Migration Programme',
  MF:   'Microfinance Programme',
  SCP:  'Social Community Programme',
  SDP:  'Skills Development Programme',
  SELP: 'Social Empowerment & Legal Protection',
  TBCP: 'Tuberculosis Control Programme',
  UDP:  'Urban Development Programme',
  UPGP: 'Ultra-Poor Graduation Programme',
  WASH: 'Water, Sanitation & Hygiene Programme'
};

// Same category in the data, but these are outcomes/sub-metrics, not programmes themselves —
// kept out of the "BRAC programme" filter dropdown, but still selectable as metrics.
const BRAC_SUPPORTING_METRICS = {
  Total_Brac_Reach: 'Total BRAC reach (all programmes)',
  Child_marriages_prevented: 'Child marriages prevented (count)',
  No_of_Borrower_Dabi: 'MF borrowers — Dabi loan (count)',
  No_of_Borrower_Progoti: 'MF borrowers — Progoti loan (count)',
  numParticipants_in_Apprenticeship_Star_programme: 'SDP apprenticeship/Star participants (count)'
};

Object.assign(NAME_OVERRIDES, BRAC_PROGRAMMES, BRAC_SUPPORTING_METRICS);

function prettifyLabel(s){
  if(!s) return s;
  let t = String(s).trim();
  t = t.replace(/^#\s*/, 'Number of ')          // "# Currently married" -> "Number of ..."
       .replace(/^num[_\s]/i, 'Number of ');     // "num_Male" handled by override; generic safety
  t = t.replace(/_/g, ' ');
  t = t.replace(/\bpct\b/gi, '(%)').replace(/\s*%/g, ' (%)').replace(/\(%\)\s*\(%\)/g,'(%)');
  t = t.replace(/\(\s*'?000\s*'?\)/g, '(thousands)').replace(/\b000\b/g, '(thousands)');
  t = t.replace(/HIES[_\s]?22|_22\b|\bHIES\b/gi, '').replace(/_calculated/gi, '');
  t = t.replace(/\*+/g, '').replace(/\s{2,}/g, ' ').trim();
  if(t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

function metricLabel(key){
  if(NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
  const lbl = DICT[key] ? DICT[key].label : key;
  return prettifyLabel(lbl);
}

// Heuristic: integers (counts/populations) vs rates/indices (2 decimals).
function isRateMetric(key){
  const lbl = (metricLabel(key) || '').toLowerCase();
  return /%|rate|ratio|index|mpi|score|cvi|\bh\b|pct/.test(lbl) ||
         /pct|rate|ratio|mpi|index|score/i.test(key);
}

function fmt(val, key){
  if(val === null || val === undefined || Number.isNaN(val)) return '—'; // em-dash
  if(isRateMetric(key)) return Number(val).toFixed(2);
  return Number(val).toLocaleString('en-US', {maximumFractionDigits:0});
}

function stdDev(arr){ // population stdev
  if(!arr.length) return null;
  const m = arr.reduce((a,b)=>a+b,0)/arr.length;
  const v = arr.reduce((a,b)=>a+(b-m)*(b-m),0)/arr.length;
  return Math.sqrt(v);
}

function median(arr){ // numeric median; returns null for empty input
  const a = arr.filter(v=>v!==null&&v!==undefined&&!Number.isNaN(v)).slice().sort((x,y)=>x-y);
  if(!a.length) return null;
  const mid = Math.floor(a.length/2);
  return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
}

function linReg(pts){ // pts: [{x,y}] -> {m,b,r}
  const n = pts.length;
  if(n < 2) return null;
  let sx=0,sy=0,sxy=0,sxx=0,syy=0;
  for(const p of pts){ sx+=p.x; sy+=p.y; sxy+=p.x*p.y; sxx+=p.x*p.x; syy+=p.y*p.y; }
  const dx = n*sxx - sx*sx;
  if(dx === 0) return null;
  const m = (n*sxy - sx*sy)/dx;
  const b = (sy - m*sx)/n;
  const den = Math.sqrt(dx*(n*syy - sy*sy));
  const r = den === 0 ? 0 : (n*sxy - sx*sy)/den;
  return {m,b,r};
}

function hexToRgba(hex, alpha){
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// light magenta tint -> full BRAC magenta across metric range
function colorScale(val, min, max){
  if(val === null || val === undefined || Number.isNaN(val)) return '#E8E8E4';
  const lo = {r:0xFE,g:0xEB,b:0xF6}, hi = {r:0xEC,g:0x00,b:0x8C};
  let t = (max === min) ? 0.5 : (val - min)/(max - min);
  t = Math.max(0, Math.min(1, t));
  const c = k => Math.round(lo[k] + (hi[k]-lo[k])*t);
  return `rgb(${c('r')},${c('g')},${c('b')})`;
}

function normalizeName(s){
  return (s||'').toString().toLowerCase()
    .replace(/['’`.]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

/* metric values across an array of units, ignoring nulls */
function valuesOf(units, key){
  const out = [];
  for(const u of units){
    const v = u.metrics[key];
    if(v !== null && v !== undefined && !Number.isNaN(v)) out.push(v);
  }
  return out;
}

/* =====================================================================
   MVI: metric repository (Composite Vulnerability Score tool)
   Modeled after the MVI.html prototype's "Metric repository" — searchable
   across ALL 421 metrics (+ 1 derived), not a small curated pool, so a
   director can build the composite from whatever indicators they need.
   `MVI_INVERSE_DEFAULTS` seeds sensible default polarity for a handful of
   well-known "higher = safer" metrics; anything else defaults to direct but
   is user-flippable via the DIRECT/INVERSE tag (state.mviInverseOverrides).
   `disability_rate_pct` is derived at runtime (see init()) and deliberately
   never added to DICT/NAME_OVERRIDES, so it stays invisible to the
   Map/Correlation metric dropdowns (metricKeysForDropdown() iterates
   Object.keys(DICT)) while still being selectable here.
   ===================================================================== */
const MVI_INVERSE_DEFAULTS = {
  Literacy_Rate_7yearplus_Overall: true,
  Literacy_Rate_7yearplus_Female: true,
  Literacy_Rate_7yearplus_Male: true,
  Safe_Disposal_with_Flushing_Pouring_Water_pct: true,
  Have_financial_account_Overall: true,
  Have_financial_account_Female: true,
  Pucca_pct: true,
  National_Grid_pct: true,
  Electricty_pct: true
};

function mviAllMetricKeys(){
  return ['disability_rate_pct'].concat(Object.keys(DICT));
}

function mviMetricMeta(key){
  const derived = key === 'disability_rate_pct';
  const label = derived ? 'Disability rate (%)' : metricLabel(key);
  const category = derived ? 'disability' : ((DICT[key] && DICT[key].category) || 'other');
  const defaultInverse = !!MVI_INVERSE_DEFAULTS[key];
  const inverse = (key in state.mviInverseOverrides) ? state.mviInverseOverrides[key] : defaultInverse;
  return { key, label, category, inverse };
}

// Default MVI loads with 10 indicators (the max-useful set) so the Weights panel
// shows 10 sliders on first load, not a fixed 4. All 10 have 64/64 coverage, so no
// district is dropped from the ranking. Even 10% weights → sum exactly 100% (Calculate
// enabled on load). Directors can still remove/add (1–10) and re-weight or "Distribute
// evenly". Polarity: literacy is INVERSE (higher = less vulnerable); the rest are DIRECT.
const MVI_DEFAULT_SELECTION = [
  'HCR_Upper_pct_HIES_22',                            // poverty (headcount, upper line)
  'MPI',                                              // multidimensional poverty
  'CVI',                                              // climate vulnerability
  'Weighted_avg_composite_score_vulnerability',      // composite vulnerability
  'No_Electricity_Connection_pct',                   // energy access deficit
  'Percent_Returned_Migrant',                        // migration
  'disability_rate_pct',                             // disability (derived)
  'Kancha_pct',                                      // temporary/kacha housing
  'Unsafe_Disposal_with_Flushing_Pouring_Water_pct', // WASH / unsafe waste disposal
  'Literacy_Rate_7yearplus_Overall'                  // education (INVERSE)
];
const MVI_DEFAULT_WEIGHTS = {
  HCR_Upper_pct_HIES_22:10, MPI:10, CVI:10, Weighted_avg_composite_score_vulnerability:10,
  No_Electricity_Connection_pct:10, Percent_Returned_Migrant:10, disability_rate_pct:10,
  Kancha_pct:10, Unsafe_Disposal_with_Flushing_Pouring_Water_pct:10, Literacy_Rate_7yearplus_Overall:10
};
const MVI_MIN_INDICATORS = 1, MVI_MAX_INDICATORS = 10;

/* District -> division lookup (Bangladesh's 8 divisions / 64 districts is
   fixed public administrative geography, not derived from master_data.json —
   the data has no division field, only `parent` which is null for all 64). */
const BD_DISTRICT_DIVISIONS = {
  Barguna:'Barisal', Barisal:'Barisal', Bhola:'Barisal', Jhalokati:'Barisal', Patuakhali:'Barisal', Pirojpur:'Barisal',
  Bandarban:'Chattogram', Brahmanbaria:'Chattogram', Chandpur:'Chattogram', Chattogram:'Chattogram',
  "Cox's Bazar":'Chattogram', Cumilla:'Chattogram', Feni:'Chattogram', Khagrachhari:'Chattogram',
  Lakshmipur:'Chattogram', Noakhali:'Chattogram', Rangamati:'Chattogram',
  Dhaka:'Dhaka', Faridpur:'Dhaka', Gazipur:'Dhaka', Gopalganj:'Dhaka', Kishoregonj:'Dhaka', Madaripur:'Dhaka',
  Manikganj:'Dhaka', Munshiganj:'Dhaka', Narayanganj:'Dhaka', Narsingdi:'Dhaka', Rajbari:'Dhaka',
  Shariatpur:'Dhaka', Tangail:'Dhaka',
  Bagerhat:'Khulna', Chuadanga:'Khulna', Jashore:'Khulna', Jhenaidah:'Khulna', Khulna:'Khulna', Kushtia:'Khulna',
  Magura:'Khulna', Meherpur:'Khulna', Narail:'Khulna', Satkhira:'Khulna',
  Jamalpur:'Mymensingh', Mymensingh:'Mymensingh', Netrakona:'Mymensingh', Sherpur:'Mymensingh',
  Bogura:'Rajshahi', Chapainawabganj:'Rajshahi', Joypurhat:'Rajshahi', Naogaon:'Rajshahi', Natore:'Rajshahi',
  Pabna:'Rajshahi', Rajshahi:'Rajshahi', Sirajganj:'Rajshahi',
  Dinajpur:'Rangpur', Gaibandha:'Rangpur', Kurigram:'Rangpur', Lalmonirhat:'Rangpur', Nilphamari:'Rangpur',
  Panchagarh:'Rangpur', Rangpur:'Rangpur', Thakurgaon:'Rangpur',
  Habiganj:'Sylhet', Moulvibazar:'Sylhet', Sunamganj:'Sylhet', Sylhet:'Sylhet'
};
function districtDivision(name){ return BD_DISTRICT_DIVISIONS[name] || ''; }

/* =====================================================================
   FILTER PIPELINE -> currently visible units
   ===================================================================== */
function passesRange(u, key, range){
  if(!range) return true; // null = this slider isn't filtering
  const [lo,hi] = range;
  const v = u.metrics[key];
  if(v === null || v === undefined || Number.isNaN(v)) return false;
  if(v < lo || v > hi) return false;
  return true;
}

function passesFilters(u){
  if(!u) return false;
  // BRAC programme selection is an independent overlay (map pins only, see
  // renderProgrammeMarkers) — it does NOT gate the choropleth/KPI/table/scatter.
  // The 3 range sliders (Value range on the selected metric, Poverty rate, CVI)
  // all AND together — a district must satisfy every active range to show.
  if(!passesRange(u, state.metric, state.valueRange)) return false;
  if(!passesRange(u, 'CVI', state.cviRange)) return false;
  if(!passesRange(u, 'HCR_Upper_pct_HIES_22', state.povertyRange)) return false;
  return true;
}

function visibleUnits(){
  return getUnits().filter(passesFilters);
}

/* =====================================================================
   4. DROPDOWNS
   ===================================================================== */
function curatedKeys(){
  return Object.keys(DICT).filter(k => DICT[k].curated);
}

function metricKeysForDropdown(){
  return state.showAllMetrics ? Object.keys(DICT) : curatedKeys();
}

function buildOptgroups(selectEl, keys, selectedKey){
  selectEl.innerHTML = '';
  const cats = DATA.meta.categories;
  // group by category, ordered by meta.categories order
  const byCat = {};
  for(const k of keys){
    const c = DICT[k].category;
    (byCat[c] = byCat[c] || []).push(k);
  }
  const catOrder = Object.keys(cats).filter(c => byCat[c]);
  // append any categories present in data but missing from meta.categories
  for(const c of Object.keys(byCat)) if(!catOrder.includes(c)) catOrder.push(c);

  for(const c of catOrder){
    const og = document.createElement('optgroup');
    og.label = cats[c] || c;
    byCat[c].sort((a,b)=> metricLabel(a).localeCompare(metricLabel(b)));
    for(const k of byCat[c]){
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = metricLabel(k);
      if(k === selectedKey) opt.selected = true;
      og.appendChild(opt);
    }
    selectEl.appendChild(og);
  }
  if(selectedKey) selectEl.value = selectedKey; // ensure UI reflects state
}

function buildMetricDropdown(){
  const keys = metricKeysForDropdown();
  // ensure currently-selected metric stays selectable even if filtered out by source
  if(!keys.includes(state.metric)) keys.push(state.metric);
  buildOptgroups($('f-metric'), keys, state.metric);

  // scatter axis dropdowns use the same key pool
  buildOptgroups($('f-scatx'), keys.includes(state.scatterX)?keys:keys.concat(state.scatterX), state.scatterX);
  buildOptgroups($('f-scaty'), keys.includes(state.scatterY)?keys:keys.concat(state.scatterY), state.scatterY);

  // Comboboxes (if already built) mirror whatever the hidden <select>s now contain.
  metricCombo?.refresh();
  scatXCombo?.refresh();
  scatYCombo?.refresh();
}

/* =====================================================================
   SEARCHABLE METRIC COMBOBOX
   A thin search/filter front-end over a hidden native <select>, which stays
   the single source of truth (buildOptgroups/buildMetricDropdown above are
   unchanged). Selecting a row sets the hidden select's value and dispatches
   a real 'change' event, so the existing bindFilters() listeners fire as-is.
   ===================================================================== */
let metricCombo, scatXCombo, scatYCombo;

function buildCombobox(selectEl){
  const baseId = selectEl.id;
  let wrap = document.getElementById(baseId + '-combo');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.className = 'combobox';
    wrap.id = baseId + '-combo';
    wrap.innerHTML =
      `<input type="text" class="combobox-input" id="${baseId}-input"
              role="combobox" aria-expanded="false" aria-autocomplete="list"
              aria-controls="${baseId}-listbox" autocomplete="off" />
       <div class="combobox-list" id="${baseId}-listbox" role="listbox" hidden></div>`;
    selectEl.insertAdjacentElement('afterend', wrap);
    selectEl.style.display = 'none';
  }
  const input = wrap.querySelector('.combobox-input');
  const list = wrap.querySelector('.combobox-list');
  let optionRows = []; // flat cache of {value,label,el} rebuilt on each refresh()
  let activeIndex = -1;

  function refresh(){
    list.innerHTML = '';
    optionRows = [];
    Array.from(selectEl.querySelectorAll('optgroup')).forEach(og => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'combobox-group';
      const label = document.createElement('div');
      label.className = 'combobox-group-label';
      label.textContent = og.label;
      groupDiv.appendChild(label);
      Array.from(og.children).forEach(opt => {
        const row = document.createElement('div');
        row.className = 'combobox-option';
        row.setAttribute('role', 'option');
        row.dataset.value = opt.value;
        row.textContent = opt.textContent;
        groupDiv.appendChild(row);
        optionRows.push({value: opt.value, label: opt.textContent, el: row, groupEl: groupDiv});
      });
      list.appendChild(groupDiv);
    });
    syncInputToSelection();
  }

  function syncInputToSelection(){
    const sel = selectEl.selectedOptions[0];
    input.value = sel ? sel.textContent : '';
  }

  function filterList(query){
    const q = query.trim().toLowerCase();
    activeIndex = -1;
    optionRows.forEach((o, i) => {
      const match = !q || o.label.toLowerCase().includes(q);
      o.el.style.display = match ? '' : 'none';
      if(match && activeIndex === -1) activeIndex = i;
    });
    list.querySelectorAll('.combobox-group').forEach(g => {
      const anyVisible = Array.from(g.querySelectorAll('.combobox-option')).some(el => el.style.display !== 'none');
      g.style.display = anyVisible ? '' : 'none';
    });
    highlightActive();
  }

  function highlightActive(){
    optionRows.forEach((o, i) => o.el.classList.toggle('active', i === activeIndex));
    if(activeIndex >= 0) optionRows[activeIndex].el.scrollIntoView({block: 'nearest'});
  }

  function openList(){ list.hidden = false; input.setAttribute('aria-expanded', 'true'); filterList(''); }
  function closeList(){ list.hidden = true; input.setAttribute('aria-expanded', 'false'); syncInputToSelection(); }

  function commitValue(value){
    selectEl.value = value;
    selectEl.dispatchEvent(new Event('change', {bubbles: true}));
    closeList();
  }

  input.addEventListener('focus', () => { input.select(); openList(); });
  input.addEventListener('input', () => filterList(input.value));
  input.addEventListener('keydown', e => {
    const visible = optionRows.filter(o => o.el.style.display !== 'none');
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      if(!visible.length) return;
      const idx = (visible.findIndex(o => o.el.classList.contains('active')) + 1) % visible.length;
      activeIndex = optionRows.indexOf(visible[idx]); highlightActive();
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      if(!visible.length) return;
      const idx = (visible.findIndex(o => o.el.classList.contains('active')) - 1 + visible.length) % visible.length;
      activeIndex = optionRows.indexOf(visible[idx]); highlightActive();
    } else if(e.key === 'Enter'){
      e.preventDefault();
      if(activeIndex >= 0) commitValue(optionRows[activeIndex].value);
    } else if(e.key === 'Escape'){
      closeList(); input.blur();
    }
  });
  list.addEventListener('mousedown', e => {
    const row = e.target.closest('.combobox-option');
    if(row) commitValue(row.dataset.value);
  });
  document.addEventListener('click', e => {
    if(!wrap.contains(e.target)) closeList();
  });

  refresh();
  return {refresh};
}

function buildProgrammeDropdown(){
  const sel = $('f-programme');
  sel.innerHTML = '';
  const all = document.createElement('option');
  all.value = ''; all.textContent = 'BRAC programme (All)';
  sel.appendChild(all);
  // Only the true programmes (BRAC_PROGRAMMES) — supporting/outcome metrics like
  // Total_Brac_Reach stay out of this filter even though they share the data category.
  Object.keys(BRAC_PROGRAMMES)
    .filter(k => DICT[k])
    .sort((a,b)=> metricLabel(a).localeCompare(metricLabel(b)))
    .forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = metricLabel(k);
      sel.appendChild(o);
    });
}

/* =====================================================================
   RANGE SLIDERS (Value range on the selected metric, Poverty rate, CVI)
   ===================================================================== */
function metricBounds(key){
  const vals = valuesOf(getUnits(), key);
  if(!vals.length) return [0,0];
  return [Math.min(...vals), Math.max(...vals)];
}

// One reusable dual-handle slider, parametrized so the same logic backs the
// dynamic Value-range slider (tracks whatever state.metric currently is) and
// the 2 fixed sliders (always CVI / always poverty), without 3x copy-paste.
function createRangeSlider({getKey, getState, setState, ids, onCommit}){
  function setup(){
    const [min,max] = metricBounds(getKey());
    const lo = $(ids.lo), hi = $(ids.hi);
    const rate = isRateMetric(getKey());
    const step = rate ? Math.max((max-min)/200, 0.01) : Math.max(Math.round((max-min)/200),1);
    [lo,hi].forEach(r => { r.min = min; r.max = max; r.step = step; });
    lo.value = min; hi.value = max;
    setState(null); // full range = no filter
    paint();
  }

  function paint(){
    const lo = $(ids.lo), hi = $(ids.hi);
    let a = parseFloat(lo.value), b = parseFloat(hi.value);
    if(a > b){ [a,b] = [b,a]; }
    const min = parseFloat(lo.min), max = parseFloat(lo.max);
    const span = (max - min) || 1;
    $(ids.fill).style.left = ((a-min)/span*100) + '%';
    $(ids.fill).style.width = ((b-a)/span*100) + '%';
    $(ids.vals).textContent = fmt(a, getKey()) + ' – ' + fmt(b, getKey());
  }

  function commit(){
    let a = parseFloat($(ids.lo).value), b = parseFloat($(ids.hi).value);
    if(a > b)[a,b] = [b,a];
    const [min,max] = metricBounds(getKey());
    setState((a<=min && b>=max) ? null : [a,b]);
    onCommit();
  }

  $(ids.lo).addEventListener('input', paint);
  $(ids.hi).addEventListener('input', paint);
  $(ids.lo).addEventListener('change', commit);
  $(ids.hi).addEventListener('change', commit);

  return {setup, paint, commit};
}

const valueRangeSlider = createRangeSlider({
  getKey: () => state.metric,
  getState: () => state.valueRange,
  setState: v => { state.valueRange = v; },
  ids: {lo:'range-lo', hi:'range-hi', fill:'range-fill', vals:'range-vals'},
  onCommit: reRenderAll
});

const povertyRangeSlider = createRangeSlider({
  getKey: () => 'HCR_Upper_pct_HIES_22',
  getState: () => state.povertyRange,
  setState: v => { state.povertyRange = v; },
  ids: {lo:'poverty-range-lo', hi:'poverty-range-hi', fill:'poverty-range-fill', vals:'poverty-range-vals'},
  onCommit: reRenderAll
});

const cviRangeSlider = createRangeSlider({
  getKey: () => 'CVI',
  getState: () => state.cviRange,
  setState: v => { state.cviRange = v; },
  ids: {lo:'cvi-range-lo', hi:'cvi-range-hi', fill:'cvi-range-fill', vals:'cvi-range-vals'},
  onCommit: reRenderAll
});

/* =====================================================================
   5. MAP + CHOROPLETH
   ===================================================================== */
function buildNormLookup(){
  unitByNorm = {};
  for(const u of getUnits()){
    unitByNorm[normalizeName(u.name)] = u;
    unitByNorm[normalizeName(u.name_google)] = u;
    const aliases = NAME_ALIASES[u.name] || [];
    for(const a of aliases) unitByNorm[normalizeName(a)] = u;
  }
}

function geoNameFromProps(props){
  // geoBoundaries uses shapeName; other sets use NAME_2 / ADM2_EN etc.
  return props.shapeName || props.shapeName_1 || props.NAME_2 ||
         props.ADM2_EN || props.name || props.District || props.DISTRICT || '';
}

function matchUnit(props){
  const raw = geoNameFromProps(props);
  return unitByNorm[normalizeName(raw)] || null;
}

async function initMap(){
  map = L.map('map', {
    // Zoom/pan re-enabled 2026-07-02 (was TEMP-locked 2026-06-21). Custom
    // zoomControl stays off since the card has its own #map-zoom-in button.
    zoomControl:false, scrollWheelZoom:true, doubleClickZoom:true,
    touchZoom:true, boxZoom:true, keyboard:true,
    // Fractional zoom so fitBounds can fill the card tightly instead of rounding
    // down to the nearest whole zoom level (which left large margins of India/Myanmar visible).
    zoomSnap:0.1, zoomDelta:0.1,
    attributionControl:true
  }).setView([23.7, 90.35], 6.4);
  // nolabels variant: drops basemap place-name labels (Meghalaya, Assam, Tripura,
  // Kolkata, etc.) that otherwise clutter the area around Bangladesh.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; OpenStreetMap, &copy; CARTO', subdomains:'abcd', maxZoom:19
  }).addTo(map);

  let geojson = null;
  // Primary: bundled bd_districts.geojson (geoBoundaries ADM2, same folder) — reliable, no CORS issues.
  try{
    geojson = await fetch('./bd_districts.geojson').then(r=>{ if(!r.ok) throw new Error('no bundle'); return r.json(); });
  }catch(e){
    console.warn('Bundled bd_districts.geojson missing, trying geoBoundaries API', e);
    // Fallback: fetch live from geoBoundaries (note: the geoboundaries.org API may block browser CORS).
    try{
      const meta = await fetch('https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM2/').then(r=>r.json());
      geojson = await fetch(meta.gjDownloadURL).then(r=>r.json());
    }catch(e2){
      showMapMessage('District boundaries could not be loaded. Other panels remain fully functional.');
      return;
    }
  }

  cachedGeojson = geojson; // shared with the MVI page's Leaflet instance, so it fetches only once
  renderChoropleth(geojson);
}

function showMapMessage(msg){
  const el = $('map-msg');
  el.textContent = msg;
  el.style.display = 'block';
}

// 3-letter district abbreviation for the permanent map labels, e.g.
// "Dhaka" -> "Dha", "Cox's Bazar" -> "Cox" (always Titlecase regardless of source casing).
function shortDistrictLabel(name){
  const s = (name || '').replace(/[^A-Za-z]/g, '').slice(0,3);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function renderChoropleth(geojson){
  buildNormLookup();
  if(geoLayer){ map.removeLayer(geoLayer); }
  if(labelLayer){ map.removeLayer(labelLayer); labelLayer = null; }
  layerByCode = {};

  const unmatched = [];
  const labelMarkers = [];
  geoLayer = L.geoJSON(geojson, {
    style: feature => styleFor(matchUnit(feature.properties)),
    onEachFeature: (feature, layer) => {
      const u = matchUnit(feature.properties);
      if(!u){ unmatched.push(geoNameFromProps(feature.properties)); return; }
      layerByCode[u.code] = layer;
      layer.on('mouseover', () => { if(u.code!==state.selectedDistrict) layer.setStyle({weight:2, color:'#fff'}); layer.bindTooltip(tooltipHTML(u),{sticky:true}).openTooltip(); });
      layer.on('mouseout',  () => { if(u.code!==state.selectedDistrict) geoLayer.resetStyle(layer); });
      layer.on('click', () => selectDistrict(u.code));
      try{
        const center = layer.getBounds().getCenter();
        labelMarkers.push(L.marker(center, {
          icon: L.divIcon({
            className:'district-label-icon',
            html:`<span>${shortDistrictLabel(u.name)}</span>`,
            iconSize:[26,14], iconAnchor:[13,7]
          }),
          interactive:false, keyboard:false
        }));
      }catch(e){}
    }
  }).addTo(map);

  labelLayer = L.layerGroup(labelMarkers).addTo(map);

  try{ map.invalidateSize(); map.fitBounds(geoLayer.getBounds(), {padding:[4,4]}); }catch(e){}
  if(unmatched.length) console.warn('Unmatched GeoJSON district features:', unmatched);
  applyMapSelection();
  renderProgrammeMarkers();
}

function styleFor(u){
  const [min,max] = metricBounds(state.metric);
  // Districts excluded by the value-range / BRAC-programme filters are hidden
  // (no-data gray) on the map, same as the table/scatter/KPIs already do.
  const val = passesFilters(u) ? u.metrics[state.metric] : null;
  return {
    fillColor: colorScale(val, min, max),
    fillOpacity: 0.85,
    color: '#FFFFFF',
    weight: 0.6
  };
}

function tooltipHTML(u){
  const v = u.metrics[state.metric];
  return `<strong>${u.name}</strong><br>`+
    `${metricLabel(state.metric)}: ${v===null?'no data':fmt(v,state.metric)}<br>`+
    `MPI: ${fmt(u.metrics['MPI'],'MPI')}<br>`+
    `Vulnerability: ${fmt(u.metrics['Weighted_avg_composite_score_vulnerability'],'Weighted_avg_composite_score_vulnerability')}<br>`+
    `Total BRAC reach: ${fmt(u.metrics['Total_Brac_Reach'],'Total_Brac_Reach')}`;
}

function recolorMap(){
  if(!geoLayer) return;
  geoLayer.eachLayer(layer => {
    const u = matchUnit(layer.feature.properties);
    layer.setStyle(styleFor(u));
  });
  applyMapSelection();
  renderProgrammeMarkers();
}

// When a BRAC programme is selected, pin every district where that programme is
// active (non-null value = active, same convention used elsewhere). Pins always
// show; the district name + reach value only shows on hover, to stay readable for
// high-coverage programmes (e.g. BHP is active in 61/64 districts).
const PIN_RADIUS_MIN = 5, PIN_RADIUS_MAX = 16;

function renderProgrammeMarkers(){
  if(programmeMarkers){ map.removeLayer(programmeMarkers); programmeMarkers = null; }
  if(!state.bracProgramme || !geoLayer) return;
  const progKey = state.bracProgramme;
  const progLabel = metricLabel(progKey);
  // Bubble radius scales with this programme's own reach value per district
  // (more reach = bigger bubble) — never with the district polygon's size.
  const [vmin, vmax] = metricBounds(progKey);
  const span = (vmax - vmin) || 1;
  const markers = [];
  for(const u of getUnits()){
    const v = u.metrics[progKey];
    if(v === null || v === undefined || Number.isNaN(v)) continue;
    const layer = layerByCode[u.code];
    if(!layer) continue;
    let center;
    try{ center = layer.getBounds().getCenter(); }catch(e){ continue; }
    const t = (v - vmin) / span;
    const radius = PIN_RADIUS_MIN + t * (PIN_RADIUS_MAX - PIN_RADIUS_MIN);
    const m = L.circleMarker(center, { radius, fillColor:'#80379B', color:'#FFFFFF', weight:1.5, fillOpacity:0.95 });
    m.bindTooltip(`<strong>${u.name}</strong><br>${progLabel}: ${fmt(v, progKey)}`, {sticky:true});
    m.on('click', () => selectDistrict(u.code));
    markers.push(m);
  }
  programmeMarkers = L.layerGroup(markers).addTo(map);
}

function applyMapSelection(){
  if(!geoLayer) return;
  geoLayer.eachLayer(layer => {
    const u = matchUnit(layer.feature.properties);
    if(u && u.code === state.selectedDistrict){
      layer.setStyle({weight:3, color:'#EC008C'});
      layer.bringToFront();
    }
  });
}

/* =====================================================================
   6. KPI STRIP
   ===================================================================== */
function renderKPIs(){
  const k = state.metric;
  const withValue = visibleUnits().filter(u=>{
    const v = u.metrics[k];
    return v !== null && v !== undefined && !Number.isNaN(v);
  });
  if(!withValue.length){
    $('kpi-max').textContent = $('kpi-min').textContent = $('kpi-avg').textContent = $('kpi-std').textContent = '—';
    $('kpi-max-district').textContent = '';
    $('kpi-min-district').textContent = '';
    return;
  }
  const vals = withValue.map(u=>u.metrics[k]);
  const max = Math.max(...vals), min = Math.min(...vals);
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const maxUnit = withValue.find(u=>u.metrics[k]===max);
  const minUnit = withValue.find(u=>u.metrics[k]===min);
  $('kpi-max').textContent = fmt(max,k);
  $('kpi-min').textContent = fmt(min,k);
  $('kpi-avg').textContent = fmt(avg,k);
  $('kpi-std').textContent = fmt(stdDev(vals),k);
  setKpiDistrict('kpi-max-district', maxUnit);
  setKpiDistrict('kpi-min-district', minUnit);
}

function setKpiDistrict(elId, unit){
  const el = $(elId);
  el.textContent = unit ? unit.name : '';
  el.onclick = unit ? (()=>selectDistrict(unit.code)) : null;
}

/* =====================================================================
   7. TABLE
   ===================================================================== */
let tableExpanded = false;

function renderTable(){
  const k = state.metric;
  $('th-value').textContent = 'Value';

  let units = visibleUnits().slice();
  units.sort((a,b)=>{
    const va = a.metrics[k], vb = b.metrics[k];
    const na = va===null||va===undefined||Number.isNaN(va);
    const nb = vb===null||vb===undefined||Number.isNaN(vb);
    if(na && nb) return 0;
    if(na) return 1;          // nulls always last
    if(nb) return -1;
    return state.sortDir==='desc' ? vb-va : va-vb;
  });

  const rows = tableExpanded ? units : units.slice(0,10);
  const tb = $('table-body');
  tb.innerHTML = '';
  for(const u of rows){
    const tr = document.createElement('tr');
    tr.dataset.code = u.code;
    if(u.code === state.selectedDistrict) tr.classList.add('selected');
    tr.innerHTML = `<td class="dist">${u.name}</td><td class="num">${fmt(u.metrics[k],k)}</td>`;
    tr.addEventListener('click', ()=>selectDistrict(u.code));
    tb.appendChild(tr);
  }
  $('table-scroll').classList.toggle('expanded', tableExpanded);
  $('viewall-btn').textContent = tableExpanded ? 'Show top 10' : `View all ${units.length} regions`;
}

/* =====================================================================
   8. SCATTER
   ===================================================================== */
function initScatter(){
  const ctx = $('scatter').getContext('2d');
  scatterChart = new Chart(ctx, {
    type:'scatter',
    data:{datasets:[]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:8, right:8, left:2}}, // small breathing space around the plot
      scales:{
        x:{title:{display:true,text:''}, grid:{color:'rgba(211,209,199,0.4)'}},
        y:{title:{display:true,text:''}, grid:{color:'rgba(211,209,199,0.4)'}}
      },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1A1B16', titleColor:'#fff', bodyColor:'#fff',
          padding:10, cornerRadius:8, displayColors:false,
          titleFont:{weight:'700', size:13}, bodyFont:{size:12},
          callbacks:{
            title:(items)=>{ const d = items[0] && items[0].raw; return d ? `${d.name},` : ''; },
            label:(c)=>{
              const d = c.raw, ax = d.ax!==undefined?d.ax:d.x, ay = d.ay!==undefined?d.ay:d.y;
              return [`${metricLabel(state.scatterX)}: ${fmt(ax,state.scatterX)}`, `${metricLabel(state.scatterY)}: ${fmt(ay,state.scatterY)}`];
            }
          }
        }
      },
      onClick: (evt, elements) => {
        const hit = elements.find(el => scatterChart.data.datasets[el.datasetIndex].label === 'Districts');
        if(!hit) return;
        const p = scatterChart.data.datasets[hit.datasetIndex].data[hit.index];
        selectDistrict(p.code);
      }
    }
  });
}

function updateScatter(){
  const xk = state.scatterX, yk = state.scatterY;
  const units = visibleUnits();
  const pts = [];
  for(const u of units){
    const x = u.metrics[xk], y = u.metrics[yk];
    if(x===null||x===undefined||Number.isNaN(x)) continue;
    if(y===null||y===undefined||Number.isNaN(y)) continue;
    pts.push({x,y,name:u.name,code:u.code,zone:u.climate_zone});
  }

  // quadrant split at the median of each axis
  const mx = median(pts.map(p=>p.x)), my = median(pts.map(p=>p.y));
  const quadOf = p => (mx===null||my===null) ? 'LL'
    : (p.x>=mx ? (p.y>=my?'HH':'HL') : (p.y>=my?'LH':'LL'));

  const quadrantGroups = {HH:[],HL:[],LH:[],LL:[]};
  pts.forEach(p => quadrantGroups[quadOf(p)].push(p));

  const selPt = pts.find(p => p.code === state.selectedDistrict);
  const selQuad = selPt ? quadOf(selPt) : null;

  const reg = linReg(pts);

  // Axis scale toggle: 'actual' plots raw values; 'normalized' min-max scales
  // each axis to 0–1 so the two very-different-scale metrics become comparable.
  // Min-max is monotonic, so quadrant membership / medians are unchanged — only
  // the plotted coordinate (and the displayed axis ticks) differ.
  const norm = state.scatterScale === 'normalized';
  const xs0 = pts.map(p=>p.x), ys0 = pts.map(p=>p.y);
  const xMin = Math.min(...xs0), xMax = Math.max(...xs0);
  const yMin = Math.min(...ys0), yMax = Math.max(...ys0);
  const normX = v => (xMax===xMin) ? 0.5 : (v - xMin)/(xMax - xMin);
  const normY = v => (yMax===yMin) ? 0.5 : (v - yMin)/(yMax - yMin);
  const projX = v => norm ? normX(v) : v;
  const projY = v => norm ? normY(v) : v;
  // Plotted points carry projected coords for position + actual (ax/ay) for tooltips.
  const plotPts = pts.map(p => ({x:projX(p.x), y:projY(p.y), ax:p.x, ay:p.y, name:p.name, code:p.code}));

  // A quadrant chip filter (state.quadFilter) dims the other 3 quadrants'
  // points instead of hiding them, so the trend line / axes stay stable.
  const main = {
    label:'Districts',
    data:plotPts,
    pointBackgroundColor: pts.map(p=>{
      const base = QUAD_COLORS[quadOf(p)]||'#9AA0A6';
      return (state.quadFilter && quadOf(p)!==state.quadFilter) ? hexToRgba(base,0.15) : base;
    }),
    pointBorderColor: pts.map(p=>p.code===state.selectedDistrict?'#EC008C':'rgba(0,0,0,0)'),
    pointBorderWidth: pts.map(p=>p.code===state.selectedDistrict?3:0),
    pointRadius: pts.map(p=>p.code===state.selectedDistrict?8:5),
    pointHoverRadius:7
  };

  const datasets=[main];

  // trend line (endpoints projected into the current scale — projection is affine
  // per-axis, so a straight line stays straight under it)
  if(reg && pts.length>1){
    const x0 = xMin, x1 = xMax;
    datasets.push({
      label:'Trend', type:'line',
      data:[{x:projX(x0), y:projY(reg.m*x0+reg.b)}, {x:projX(x1), y:projY(reg.m*x1+reg.b)}],
      borderColor:'#007161', borderWidth:1.5, borderDash:[5,4],
      pointRadius:0, fill:false
    });
  }

  // outlier labels via a tiny plugin-free approach: separate labelled dataset
  scatterChart.data.datasets = datasets;
  scatterChart.options.scales.x.title.text = metricLabel(xk) + (norm ? '  (normalized 0–1)' : '');
  scatterChart.options.scales.y.title.text = metricLabel(yk) + (norm ? '  (normalized 0–1)' : '');
  // In normalized mode pin both axes to a 0–1 baseline; in actual mode auto-scale.
  scatterChart.options.scales.x.min = norm ? 0 : undefined;
  scatterChart.options.scales.x.max = norm ? 1 : undefined;
  scatterChart.options.scales.y.min = norm ? 0 : undefined;
  scatterChart.options.scales.y.max = norm ? 1 : undefined;
  scatterChart.options.plugins.tooltip.callbacks.title = (items)=>{
    const d = items[0] && items[0].raw;
    return d ? `${d.name},` : '';
  };
  scatterChart.options.plugins.tooltip.callbacks.label = (c)=>{
    if(c.dataset.label==='Trend') return null;
    const d=c.raw;
    if(norm) return [`${metricLabel(xk)}: ${fmt(d.ax,xk)} (norm ${d.x.toFixed(2)})`,
                     `${metricLabel(yk)}: ${fmt(d.ay,yk)} (norm ${d.y.toFixed(2)})`];
    return [`${metricLabel(xk)}: ${fmt(d.ax,xk)}`, `${metricLabel(yk)}: ${fmt(d.ay,yk)}`];
  };

  // outlier name labels turned off for a cleaner chart (kept the computation
  // harmless above in case we re-enable it later).
  scatterChart.$outliers = [];
  // median split for the quadrant divider plugin (null when too few points);
  // carry projected positions (for line placement) + display labels (actual or
  // normalized depending on the active scale).
  scatterChart.$quadrant = (pts.length>1 && mx!==null && my!==null) ? {
    mxPlot: projX(mx), myPlot: projY(my),
    mxLabel: norm ? normX(mx).toFixed(2) : fmt(mx, xk),
    myLabel: norm ? normY(my).toFixed(2) : fmt(my, yk)
  } : null;
  scatterChart.$quadrantGroups = quadrantGroups;
  // glowing halo plugin (see selectedHalo registration below) draws around this point
  scatterChart.$selectedPoint = selPt ? {code:selPt.code, color:QUAD_COLORS[selQuad]} : null;
  scatterChart.update();

  // Pearson r sits inline on the title line; the subtitle is just the relationship.
  const r = reg ? reg.r.toFixed(2) : '—';
  $('scatter-pearson').textContent = `Pearson r ${r}`;
  $('scatter-subtitle').textContent = `Relationship between ${metricLabel(xk)} and ${metricLabel(yk)}`;

  // Live insight card for whichever district is currently selected (any panel
  // can set it) — replaces a once-static "High X · High Y" legend. Short,
  // labeled sections (selected district, each axis, interpretation) rather
  // than a long write-up — real metric names, template-generated, no AI call.
  $('quad-legend').innerHTML = selPt
    ? buildInsightHtml(selPt, selQuad, mx, my, xk, yk)
    : `<div class="quad-insight quad-insight-empty"><p class="quad-insight-text" style="margin:0;">Click a district (here, on the map, or in the table) to see its quadrant breakdown</p></div>`;

  renderQuadChips(quadrantGroups);
  renderQuadrantList();
}

/* =====================================================================
   INSIGHT ENGINE (offline, template-based but polarity- & domain-aware)
   No AI/API call — but reads "AI-like" because it reasons about whether a
   high value is good or bad (polarity), names the real domain (from each
   metric's own category), and ends with a BRAC-targeting recommendation.
   Scales to any X×Y of the 421 metrics: ~15 domains × 3 roles, not 1000s of
   per-pair templates.
   ===================================================================== */

// Category -> human domain name + the action you'd take about it.
const CATEGORY_DOMAIN = {
  poverty_vulnerability:   {name:'poverty', action:'poverty-reduction and resilience support'},
  literacy_education:      {name:'education', action:'education access and learning support'},
  wash:                    {name:'WASH', action:'water, sanitation and hygiene services'},
  energy_fuel:             {name:'energy', action:'clean-energy access'},
  employment_work:         {name:'livelihood', action:'livelihood and employment programmes'},
  financial_inclusion:     {name:'financial-inclusion', action:'financial-inclusion services'},
  digital_access:          {name:'digital-access', action:'digital-access initiatives'},
  housing_quality:         {name:'housing', action:'housing-improvement support'},
  disability:              {name:'disability', action:'disability-inclusive services'},
  brac_programmes:         {name:'programme', action:'programme expansion'},
  household_structure:     {name:'household', action:'targeted household support'},
  population_demography:   {name:'demographic', action:'context-tailored support'},
  marriage_child_marriage: {name:'child-protection', action:'child-protection and early-marriage prevention'},
  religion_ethnicity:      {name:'community', action:'community-tailored support'},
  remittance_migration:    {name:'migration', action:'migration and remittance support'}
};

// Cross-category themes detected by keyword (climate/health span several categories).
function metricDomain(key){
  const s = (metricLabel(key)||'').toLowerCase() + ' ' + String(key).toLowerCase();
  if(/cvi|climat|flood|cyclone|vulnerab|disaster|hazard/.test(s)) return {name:'climate', action:'climate resilience and adaptation measures'};
  if(/mortal|nutrition|stunt|wasting|health|disease|immuniz|immunis|tuberculosis/.test(s)) return {name:'health', action:'health and nutrition services'};
  const cat = (DICT[key] && DICT[key].category) || '';
  return CATEGORY_DOMAIN[cat] || {name:'', action:'targeted support'};
}

// Polarity: does a higher value mean a worse situation, a better one, or neither?
function metricPolarity(key){
  const s = (metricLabel(key)||'').toLowerCase() + ' ' + String(key).toLowerCase();
  if(/pover|hcr|\bmpi\b|vulnerab|cvi|mortal|death|deprivation|kancha|unemploy|out.?of.?school|illiter|child.?marriage|disab|without|lack|flood|disaster|hazard/.test(s)) return 'worse';
  if(/literac|school|enrol|educat|incom|saving|account|\bbank|electric|sanitat|hygien|\bwater|coverage|beneficiar|reach|employ|graduat|financ|internet|mobile|phone|pucca|access|ownership/.test(s)) return 'better';
  return 'neutral';
}

// Role frames how the axis reads for targeting.
function metricRole(key){
  if((DICT[key] && DICT[key].category) === 'brac_programmes') return 'response';
  const p = metricPolarity(key);
  return p === 'worse' ? 'need' : p === 'better' ? 'asset' : 'neutral';
}

function axisPhrase(key, high){
  const role = metricRole(key), dom = metricDomain(key).name, d = dom ? dom + ' ' : '';
  if(role === 'need')     return high ? `elevated ${d}need` : `relatively low ${d}need`;
  if(role === 'asset')    return high ? `strong ${d}outcomes` : `weak ${d}outcomes`;
  if(role === 'response') return high ? 'solid programme coverage' : 'limited programme coverage';
  return high ? `high ${metricLabel(key)}` : `low ${metricLabel(key)}`;
}

// Is this axis a "concern" (high need, or low asset)?  / a programme "gap" (low coverage)?
function axisConcern(key, high){ const r = metricRole(key); return r==='need' ? high : r==='asset' ? !high : false; }
function axisGap(key, high){ return metricRole(key)==='response' && !high; }

function buildRecommendation(district, xk, yk, xHigh, yHigh){
  const xCon = axisConcern(xk, xHigh), yCon = axisConcern(yk, yHigh);
  const xGap = axisGap(xk, xHigh), yGap = axisGap(yk, yHigh);
  // 1) classic targeting gap: real need on one axis + thin programme coverage on the other
  if((xCon && yGap) || (yCon && xGap)){
    const needKey = xCon ? xk : yk;
    return `This points to a gap between need and programme reach — making ${district} a strong candidate to prioritise for ${metricDomain(needKey).action}.`;
  }
  // 2) both axes flag concern
  if(xCon && yCon){
    const a = metricDomain(xk), b = metricDomain(yk);
    // same domain -> name the concrete action; different domains -> just name both areas
    const focus = (a.name && a.name===b.name) ? a.action
                : (a.name && b.name) ? `${a.name} and ${b.name}`
                : (a.action || b.action);
    return `Both indicators flag elevated need, making ${district} a priority for targeted intervention${focus ? ` — particularly around ${focus}` : ''}.`;
  }
  // 3) one axis flags concern
  if(xCon || yCon){
    const ck = xCon ? xk : yk, dom = metricDomain(ck);
    return `The elevated ${dom.name||'risk'} indicator suggests ${district} may warrant additional ${dom.action}.`;
  }
  // 4) at least one axis is meaningfully favorable
  if(metricRole(xk)!=='neutral' || metricRole(yk)!=='neutral'){
    return `Both indicators are comparatively favorable, suggesting ${district} is a lower immediate priority for additional support.`;
  }
  // 5) two neutral/descriptive metrics — no clear targeting signal
  return `These two indicators don't point to a clear need on their own; targeting decisions for ${district} should weigh additional local context.`;
}

function insightHash(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); }

function buildInsightText(selPt, mx, my, xk, yk){
  const xHigh = selPt.x>=mx, yHigh = selPt.y>=my;
  const domX = metricDomain(xk), domY = metricDomain(yk);
  const district = selPt.name;
  const openers = [
    `${district} stands out here`,
    `Looking at ${district}`,
    `For ${district}`
  ];
  const opener = openers[insightHash(selPt.code) % openers.length];
  // collapse the description when both axes are the same domain & same direction
  let placement;
  if(domX.name && domX.name === domY.name && xHigh === yHigh){
    placement = `both its ${domX.name} indicators sit ${xHigh ? 'above' : 'below'} the median`;
  } else {
    placement = `${axisPhrase(xk, xHigh)} and ${axisPhrase(yk, yHigh)}`;
  }
  const s1 = `${opener}: ${placement}.`;
  const s2 = buildRecommendation(district, xk, yk, xHigh, yHigh);
  return `${s1} ${s2}`;
}

function buildInsightHtml(selPt, selQuad, mx, my, xk, yk){
  const xLabel = metricLabel(xk), yLabel = metricLabel(yk);
  return `<div class="quad-insight">
      <div class="quad-insight-head"><span class="qdot" style="background:${QUAD_COLORS[selQuad]}"></span><strong>${selPt.name}</strong></div>
      <p class="quad-insight-row"><span class="qi-label">X-axis — ${xLabel}:</span> ${fmt(selPt.x,xk)} (${selPt.x>=mx?'High':'Low'}, median ${fmt(mx,xk)})</p>
      <p class="quad-insight-row"><span class="qi-label">Y-axis — ${yLabel}:</span> ${fmt(selPt.y,yk)} (${selPt.y>=my?'High':'Low'}, median ${fmt(my,yk)})</p>
      <p class="quad-insight-text"><strong>Insight:</strong> ${buildInsightText(selPt, mx, my, xk, yk)}</p>
    </div>`;
}

function renderQuadChips(groups){
  const order = ['HH','HL','LH','LL'];
  $('quad-chips').innerHTML = order.map(q=>{
    const active = state.quadFilter === q;
    return `<button type="button" class="qchip${active?' active':''}" data-quad="${q}" style="--qc:${QUAD_COLORS[q]}">`
      + `<span class="qchip-dot" style="background:${QUAD_COLORS[q]}"></span>${QUAD_LABELS[q]} (${groups[q].length})</button>`;
  }).join('');
  $('quad-chips').querySelectorAll('.qchip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const q = btn.dataset.quad;
      state.quadFilter = (state.quadFilter === q) ? null : q;
      updateScatter();
    });
  });
}

function renderQuadrantList(){
  const groups = (scatterChart && scatterChart.$quadrantGroups) || {HH:[],HL:[],LH:[],LL:[]};
  const xk = state.scatterX, yk = state.scatterY;

  let rows = [];
  ['HH','HL','LH','LL'].forEach(q => groups[q].forEach(p => rows.push({...p, quad:q})));
  if(state.quadFilter) rows = rows.filter(p => p.quad === state.quadFilter);
  $('quad-sub').textContent = state.quadFilter
    ? `${rows.length} of 64 shown · ${QUAD_LABELS[state.quadFilter]} only`
    : `${rows.length} of 64 shown · split at median`;

  const dir = state.quadSortDir === 'asc' ? 1 : -1;
  rows.sort((a,b)=>{
    if(state.quadSortKey === 'name') return a.name.localeCompare(b.name) * dir;
    if(state.quadSortKey === 'x') return (a.x - b.x) * dir;
    return (a.y - b.y) * dir;
  });

  const arrow = key => state.quadSortKey===key ? (state.quadSortDir==='asc' ? ' ▴' : ' ▾') : '';
  const wrap = $('quad-stack');
  wrap.innerHTML = `<table>
      <thead><tr>
        <th class="qt-sortable" data-sort="name">District${arrow('name')}</th>
        <th class="qt-sortable num" data-sort="x">${metricLabel(xk)}${arrow('x')}</th>
        <th class="qt-sortable num" data-sort="y">${metricLabel(yk)}${arrow('y')}</th>
      </tr></thead>
      <tbody></tbody>
    </table>`;

  const tb = wrap.querySelector('tbody');
  rows.forEach(p=>{
    const tr = document.createElement('tr');
    if(p.code === state.selectedDistrict) tr.classList.add('selected');
    tr.innerHTML = `<td class="qt-dist" style="color:${QUAD_COLORS[p.quad]}">${p.name}</td>`
      + `<td class="num">${fmt(p.x,xk)}</td>`
      + `<td class="num">${fmt(p.y,yk)}</td>`;
    tr.addEventListener('click', ()=>selectDistrict(p.code));
    tb.appendChild(tr);
  });

  wrap.querySelectorAll('.qt-sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.sort;
      if(state.quadSortKey === key) state.quadSortDir = state.quadSortDir==='asc' ? 'desc' : 'asc';
      else { state.quadSortKey = key; state.quadSortDir = key==='name' ? 'asc' : 'desc'; }
      renderQuadrantList();
    });
  });
}

// Plugin to draw a glowing halo behind the currently selected point — pure
// canvas drawing (not a fake dataset), so it never interferes with click hit-
// testing or tooltip behavior on the real point underneath it.
Chart.register({
  id:'selectedHalo',
  beforeDatasetsDraw(chart){
    const sel = chart.$selectedPoint;
    if(!sel) return;
    const meta = chart.getDatasetMeta(0);
    const idx = chart.data.datasets[0].data.findIndex(d=>d.code===sel.code);
    if(idx<0) return;
    const pt = meta.data[idx];
    if(!pt) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 15, 0, Math.PI*2);
    ctx.fillStyle = hexToRgba(sel.color, 0.18);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(sel.color, 0.55);
    ctx.stroke();
    ctx.restore();
  }
});

// Plugin to draw the quadrant divider cross (vertical at median X, horizontal at median Y)
Chart.register({
  id:'quadrantLines',
  beforeDatasetsDraw(chart){
    const q = chart.$quadrant;
    if(!q) return;
    const {chartArea:area, scales} = chart;
    const px = scales.x.getPixelForValue(q.mxPlot);
    const py = scales.y.getPixelForValue(q.myPlot);
    const ctx = chart.ctx;
    ctx.save();
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5,5]);
    // faint quadrant-split guide lines, no value labels (kept clean per design)
    if(px>=area.left && px<=area.right){
      ctx.strokeStyle = 'rgba(154,160,166,0.7)'; // vertical (X median)
      ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
    }
    if(py>=area.top && py<=area.bottom){
      ctx.strokeStyle = 'rgba(0,113,97,0.6)'; // horizontal (Y median)
      ctx.beginPath(); ctx.moveTo(area.left, py); ctx.lineTo(area.right, py); ctx.stroke();
    }
    ctx.restore();
  }
});

// Plugin to draw outlier labels
Chart.register({
  id:'outlierLabels',
  afterDatasetsDraw(chart){
    const outs = chart.$outliers;
    if(!outs || !outs.length) return;
    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '600 11px Helvetica Neue, Arial, sans-serif';
    ctx.fillStyle = '#27281C';
    chart.data.datasets[0].data.forEach((d,i)=>{
      if(outs.some(o=>o.code===d.code)){
        const pt = meta.data[i];
        if(pt) ctx.fillText(d.name, pt.x+8, pt.y-6);
      }
    });
    ctx.restore();
  }
});

/* =====================================================================
   9. SELECTION & FILTER BINDING
   ===================================================================== */
function selectDistrict(code){
  state.selectedDistrict = (state.selectedDistrict === code) ? null : code;
  // table: ensure visible & highlight
  if(state.selectedDistrict){
    const inTop = Array.from($('table-body').querySelectorAll('tr')).some(tr=>tr.dataset.code===code);
    if(!inTop){ tableExpanded = true; }
  }
  renderTable();
  const selRow = $('table-body').querySelector(`tr[data-code="${state.selectedDistrict}"]`);
  if(selRow) selRow.scrollIntoView({block:'nearest'});
  // map
  if(geoLayer){ geoLayer.eachLayer(l=>geoLayer.resetStyle(l)); applyMapSelection();
    if(state.selectedDistrict && layerByCode[state.selectedDistrict]){
      try{ map.panTo(layerByCode[state.selectedDistrict].getBounds().getCenter()); }catch(e){}
    }
  }
  // scatter
  updateScatter();
}

function reRenderAll(){
  buildNormLookup();
  renderKPIs();
  recolorMap();
  updateLegend();
  renderTable();
  updateScatter();
}

function updateLegend(){
  const [min,max] = metricBounds(state.metric);
  $('legend-min').textContent = fmt(min,state.metric);
  $('legend-max').textContent = fmt(max,state.metric);
  $('map-title').textContent = metricLabel(state.metric);
}

function toggleMapFullscreen(){
  const card = $('map-card');
  const btn = $('map-fullscreen-btn');
  const isFs = card.classList.toggle('map-fullscreen');
  document.body.classList.toggle('map-fullscreen-active', isFs);
  btn.title = isFs ? 'Exit full screen' : 'Full screen';
  btn.setAttribute('aria-pressed', String(isFs));
  // Card size changes with the layout transition; nudge Leaflet once it settles.
  setTimeout(()=>{
    if(!map) return;
    map.invalidateSize();
    if(geoLayer){ try{ map.fitBounds(geoLayer.getBounds(), {padding:[4,4]}); }catch(e){} }
  }, 50);
}

function bindFilters(){
  $('f-metric').addEventListener('change', e=>{
    state.metric = e.target.value;
    valueRangeSlider.setup(); // resets to the new metric's full bounds, state.valueRange=null
    renderKPIs(); recolorMap(); updateLegend(); renderTable();
  });
  $('f-showall').addEventListener('change', e=>{
    state.showAllMetrics = e.target.checked;
    buildMetricDropdown();
  });
  $('f-programme').addEventListener('change', e=>{
    state.bracProgramme = e.target.value;
    reRenderAll();
  });
  $('f-scatx').addEventListener('change', e=>{ state.scatterX=e.target.value; updateScatter(); });
  $('f-scaty').addEventListener('change', e=>{ state.scatterY=e.target.value; updateScatter(); });

  $('apply-btn').addEventListener('click', ()=>{
    valueRangeSlider.commit();
    povertyRangeSlider.commit();
    cviRangeSlider.commit();
  });

  $('sort-btn').addEventListener('click', ()=>{
    state.sortDir = state.sortDir==='desc'?'asc':'desc';
    renderTable();
  });
  $('viewall-btn').addEventListener('click', ()=>{
    tableExpanded = !tableExpanded; renderTable();
  });

  $('map-zoom-in').addEventListener('click', ()=>{ if(map) map.zoomIn(); });
  $('map-reset').addEventListener('click', ()=>{
    if(map && geoLayer){ try{ map.invalidateSize(); map.fitBounds(geoLayer.getBounds(),{padding:[4,4]}); }catch(e){ map.setView([23.7,90.35],6.4); } }
  });
  $('map-fullscreen-btn').addEventListener('click', toggleMapFullscreen);
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && $('map-card').classList.contains('map-fullscreen')) toggleMapFullscreen();
  });

  // Sidebar: fixed + collapsible (pushes main content, no overlay). Each page has
  // one sidebar toggled by the same "Filters" button — the Data-filters sidebar on
  // Map/Correlation, the Metric-repository sidebar (#mvi-sidebar) on MVI.
  const activeSidebar = ()=> state.page === 'mvi' ? $('mvi-sidebar') : $('sidebar');
  const toggleSidebar = ()=>{
    activeSidebar().classList.toggle('collapsed');
    // Sidebar width change resizes the map column too — Leaflet caches container
    // size, so the relevant map needs a nudge once the 0.25s CSS transition finishes.
    setTimeout(()=>{
      if(state.page === 'mvi'){
        if(state.mviResultView === 'map' && mviMap){
          mviMap.invalidateSize();
          try{ if(mviGeoLayer) mviMap.fitBounds(mviGeoLayer.getBounds(), {padding:[4,4]}); }catch(e){}
        }
      } else if(map && geoLayer){
        map.invalidateSize();
        map.fitBounds(geoLayer.getBounds(), {padding:[4,4]});
      }
    }, 270);
  };
  $('filters-toggle').addEventListener('click', toggleSidebar);
  $('sidebar-close').addEventListener('click', toggleSidebar);
  $('mvi-sidebar-close').addEventListener('click', toggleSidebar);

  // Top-level page nav: Map view / Correlation view / MVI
  const switchPage = page => {
    state.page = page;
    const isMap = page === 'map', isCorrelation = page === 'correlation', isMvi = page === 'mvi';
    $('page-tab-map').classList.toggle('active', isMap);
    $('page-tab-correlation').classList.toggle('active', isCorrelation);
    $('page-tab-mvi').classList.toggle('active', isMvi);
    $('page-tab-map').setAttribute('aria-selected', isMap);
    $('page-tab-correlation').setAttribute('aria-selected', isCorrelation);
    $('page-tab-mvi').setAttribute('aria-selected', isMvi);
    $('page-map').style.display = isMap ? '' : 'none';
    $('page-correlation').style.display = isCorrelation ? '' : 'none';
    $('page-mvi').style.display = isMvi ? '' : 'none';
    // Swap which left sidebar is in the DOM flow: the Data-filters sidebar on
    // Map/Correlation, the Metric-repository sidebar (#mvi-sidebar) on MVI. The
    // shared "Filters" toggle button now controls whichever one the page shows.
    document.body.classList.toggle('mvi-page-active', isMvi);
    if(isCorrelation && scatterChart) scatterChart.resize();
    // The MVI map only exists inside its own "Map view" sub-tab (mviSwitchView
    // lazily creates it on first use). If the sub-tab was already 'map' from a
    // prior visit, #page-mvi itself just went from display:none to visible, so
    // Leaflet's cached container size is stale and needs the same nudge used
    // elsewhere in this file after any hidden->visible transition.
    if(isMvi && state.mviResultView === 'map' && mviMap){
      mviMap.invalidateSize();
      try{ if(mviGeoLayer) mviMap.fitBounds(mviGeoLayer.getBounds(), {padding:[4,4]}); }catch(e){}
    }
  };
  $('page-tab-map').addEventListener('click', ()=>switchPage('map'));
  $('page-tab-correlation').addEventListener('click', ()=>switchPage('correlation'));
  $('page-tab-mvi').addEventListener('click', ()=>switchPage('mvi'));

  $('quad-download-btn').addEventListener('click', downloadQuadrantCsv);

  // Actual / Normalized scatter scale toggle
  $('scale-toggle').querySelectorAll('.scale-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      const scale = tab.dataset.scale;
      if(state.scatterScale === scale) return;
      state.scatterScale = scale;
      $('scale-toggle').querySelectorAll('.scale-tab').forEach(t=>{
        const on = t.dataset.scale === scale;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on);
      });
      updateScatter();
    });
  });
}

// Export all 64 districts (District, X value, Y value, quadrant) as a CSV —
// fully client-side via a Blob, no backend. Uses the current X/Y axis metrics.
function downloadQuadrantCsv(){
  const xk = state.scatterX, yk = state.scatterY;
  const xLabel = metricLabel(xk), yLabel = metricLabel(yk);
  // recompute medians over all districts that have both values (same rule as the scatter)
  const valid = getUnits().filter(u=>{
    const x = u.metrics[xk], y = u.metrics[yk];
    return x!=null && !Number.isNaN(x) && y!=null && !Number.isNaN(y);
  });
  const mx = median(valid.map(u=>u.metrics[xk])), my = median(valid.map(u=>u.metrics[yk]));
  const quadName = (x,y)=> (mx==null||my==null) ? '' :
    (x>=mx ? (y>=my?'High X · High Y':'High X · Low Y') : (y>=my?'Low X · High Y':'Low X · Low Y'));
  const esc = s => /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g,'""')}"` : String(s);

  const header = ['District', xLabel, yLabel, 'Quadrant'];
  const lines = [header.map(esc).join(',')];
  getUnits().slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(u=>{
    const x = u.metrics[xk], y = u.metrics[yk];
    const xv = (x==null||Number.isNaN(x)) ? '' : x;
    const yv = (y==null||Number.isNaN(y)) ? '' : y;
    const q = (xv===''||yv==='') ? '' : quadName(x,y);
    lines.push([u.name, xv, yv, q].map(esc).join(','));
  });

  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `geo-targeting_${xk}_vs_${yk}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* =====================================================================
   MVI: COMPOSITE VULNERABILITY SCORE TOOL (own page, own Leaflet instance)
   Always computed over getUnits() (all 64 districts) — never visibleUnits()/
   passesFilters(), which are Map-view-specific filters unrelated to this tool.
   ===================================================================== */

/* ---- Metric repository picker: search, chips, DIRECT/INVERSE tags, weights ---- */
function buildMviPicker(){
  renderMviPickerList();
  renderMviChips();
  renderMviWeightList();
  renderMviWeightSum();
  $('mvi-picker-count').textContent = `${state.mviSelected.length}/${MVI_MAX_INDICATORS}`;
  // Metric totals are computed at runtime (master_data.json's 421 + NEET's 27 merged
  // into DICT + 1 derived), so show the live count instead of a hardcoded "421".
  const repoCount = mviAllMetricKeys().length;        // MVI repository (incl. derived disability_rate_pct)
  const dictCount = Object.keys(DICT).length;          // "Show all" toggle (dictionary metrics only)
  const subEl = $('mvi-picker-sub');
  if(subEl) subEl.textContent = `Pick 1–${MVI_MAX_INDICATORS} of ${repoCount} indicators.`;
  const searchEl = $('mvi-picker-search');
  if(searchEl) searchEl.placeholder = `Search indicators…`;
  const showAllEl = $('f-showall-label');
  if(showAllEl) showAllEl.textContent = `Show all ${dictCount} metrics`;
}

function renderMviPickerList(){
  const list = $('mvi-picker-list');
  list.innerHTML = '';
  const q = (state.mviSearch || '').trim().toLowerCase();
  const selectedSet = new Set(state.mviSelected);

  const addHead = (text) => {
    const head = document.createElement('div');
    head.className = 'mvi-metric-group';
    head.textContent = text;
    list.appendChild(head);
  };
  const addRow = (m) => {
    const checked = selectedSet.has(m.key);
    const row = document.createElement('div');
    row.className = 'mvi-metric-row' + (checked ? ' selected' : '');
    row.innerHTML =
      `<input type="checkbox" ${checked?'checked':''}/>` +
      `<span class="mvi-metric-label" title="${m.label}">${m.label}</span>` +
      `<span class="mvi-polarity-tag ${m.inverse?'inverse':''}">${m.inverse?'INVERSE':'DIRECT'}</span>`;
    row.querySelector('input').addEventListener('change', e => mviToggleIndicator(m.key, e.target.checked));
    row.querySelector('.mvi-polarity-tag').addEventListener('click', e => { e.stopPropagation(); mviTogglePolarity(m.key); });
    row.addEventListener('click', e => {
      if(e.target.tagName === 'INPUT' || e.target.classList.contains('mvi-polarity-tag')) return;
      const cb = row.querySelector('input');
      cb.checked = !cb.checked;
      mviToggleIndicator(m.key, cb.checked);
    });
    list.appendChild(row);
  };

  const all = mviAllMetricKeys().map(mviMetricMeta)
    .filter(m => !q || m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q));

  // Selected indicators float to the top (in selection order) so the current build is
  // always visible — this replaces the old chips row. Skipped while searching so search
  // spans everything.
  if(!q && state.mviSelected.length){
    addHead(`Selected (${state.mviSelected.length})`);
    state.mviSelected.forEach(k => addRow(mviMetricMeta(k)));
  }

  // Remaining (unselected) metrics grouped by category. When searching, show all matches.
  const rest = all.filter(m => q || !selectedSet.has(m.key));
  const catOrder = Object.keys((DATA.meta && DATA.meta.categories) || {});
  const byCat = {};
  rest.forEach(m => { (byCat[m.category] = byCat[m.category] || []).push(m); });
  const orderedCats = catOrder.filter(c => byCat[c])
    .concat(Object.keys(byCat).filter(c => !catOrder.includes(c)));
  orderedCats.forEach(cat => {
    const catLabel = (DATA.meta && DATA.meta.categories && DATA.meta.categories[cat]) || cat;
    addHead(catLabel);
    byCat[cat].sort((a,b)=>a.label.localeCompare(b.label)).forEach(addRow);
  });
}

function renderMviChips(){
  const wrap = $('mvi-chips');
  wrap.innerHTML = '';
  state.mviSelected.forEach(key => {
    const meta = mviMetricMeta(key);
    const chip = document.createElement('span');
    chip.className = 'mvi-chip';
    chip.innerHTML = `${meta.label} <button type="button" aria-label="Remove ${meta.label}">&times;</button>`;
    chip.querySelector('button').addEventListener('click', () => mviToggleIndicator(key, false));
    wrap.appendChild(chip);
  });
}

function renderMviWeightList(){
  const list = $('mvi-weight-list');
  list.innerHTML = '';
  state.mviSelected.forEach(key => {
    const meta = mviMetricMeta(key);
    const weight = state.mviWeights[key] || 0;
    const row = document.createElement('div');
    row.className = 'mvi-weight-row';
    row.dataset.key = key;
    row.innerHTML =
      `<div class="mvi-weight-top"><span class="mvi-label" title="${meta.label}">${meta.label}</span>` +
      `<input type="number" class="mvi-num" min="0" max="100" value="${weight}"/>` +
      `<button class="mvi-weight-remove" title="Remove this indicator">×</button></div>` +
      `<input type="range" class="mvi-slider" min="0" max="100" value="${weight}"/>`;
    row.querySelector('.mvi-slider').addEventListener('input', e => mviSetWeight(key, e.target.value));
    row.querySelector('.mvi-num').addEventListener('input', e => mviSetWeight(key, e.target.value));
    row.querySelector('.mvi-weight-remove').addEventListener('click', () => mviToggleIndicator(key, false));
    list.appendChild(row);
  });
}

function mviTogglePolarity(key){
  const meta = mviMetricMeta(key);
  state.mviInverseOverrides[key] = !meta.inverse;
  buildMviPicker();
}

function mviToggleIndicator(key, checked){
  const idx = state.mviSelected.indexOf(key);
  if(checked){
    if(idx === -1){
      if(state.mviSelected.length >= MVI_MAX_INDICATORS){
        buildMviPicker(); // rebuild reverts this checkbox (key was never added to mviSelected)
        return;
      }
      state.mviSelected.push(key);
      if(!(key in state.mviWeights)) state.mviWeights[key] = 0;
    }
  }else if(idx !== -1){
    state.mviSelected.splice(idx, 1);
    delete state.mviWeights[key];
  }
  buildMviPicker();
}

function mviSetWeight(key, val){
  const num = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
  state.mviWeights[key] = num;
  const row = $('mvi-weight-list').querySelector(`.mvi-weight-row[data-key="${key}"]`);
  if(row){
    row.querySelector('.mvi-slider').value = num;
    row.querySelector('.mvi-num').value = num;
  }
  renderMviWeightSum();
}

function renderMviWeightSum(){
  const count = state.mviSelected.length;
  const sum = state.mviSelected.reduce((a,k) => a + (state.mviWeights[k] || 0), 0);
  const ok = sum === 100 && count >= MVI_MIN_INDICATORS && count <= MVI_MAX_INDICATORS;
  const el = $('mvi-weight-sum');
  el.classList.toggle('ok', ok);
  el.classList.toggle('warn', !ok);
  let msg = `Total: ${sum}%`;
  if(count < MVI_MIN_INDICATORS) msg += ` — select at least ${MVI_MIN_INDICATORS} indicator (${count} selected)`;
  else if(count > MVI_MAX_INDICATORS) msg += ` — select at most ${MVI_MAX_INDICATORS} indicators (${count} selected)`;
  else if(sum !== 100) msg += sum < 100 ? ` — add ${100-sum}% more to reach 100%` : ` — remove ${sum-100}% to reach 100%`;
  else msg += ' ✓';
  el.textContent = msg;
  $('mvi-calc-btn').disabled = !ok;
}

function mviDistributeEvenly(){
  const keys = state.mviSelected;
  const n = keys.length;
  if(!n) return;
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  keys.forEach((k, i) => { state.mviWeights[k] = base + (i < rem ? 1 : 0); });
  buildMviPicker();
}

function mviResetToDefault(){
  state.mviSelected = MVI_DEFAULT_SELECTION.slice();
  state.mviWeights = Object.assign({}, MVI_DEFAULT_WEIGHTS);
  state.mviInverseOverrides = {};
  buildMviPicker();
}

/* ---- Computation: min-max normalize -> inverse flip -> weight -> sum ---- */
function mviPercentile(sortedAsc, p){
  if(!sortedAsc.length) return null;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if(lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function mviTiers(scores){
  if(!scores.length) return null;
  const sorted = scores.slice().sort((a,b)=>a-b);
  return { q1: mviPercentile(sorted,0.25), q2: median(scores), q3: mviPercentile(sorted,0.75) };
}

function mviTierFor(score, tiers){
  if(!tiers) return 'nodata';
  if(score >= tiers.q3) return 'severe';
  if(score >= tiers.q2) return 'high';
  if(score >= tiers.q1) return 'moderate';
  return 'low';
}

function computeMviScores(){
  const units = getUnits();
  const keys = state.mviSelected.slice();
  const bounds = {};
  keys.forEach(k => {
    const vals = valuesOf(units, k);
    bounds[k] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 0];
  });

  const byCode = {};
  const includedScores = [];
  units.forEach(u => {
    const pop = u.metrics['Population_HIES_22'];
    const avgHH = u.metrics['Average_Household_Size'];
    const households = (pop != null && avgHH) ? Math.round(pop / avgHH) : null;

    const missing = keys.some(k => {
      const v = u.metrics[k];
      return v === null || v === undefined || Number.isNaN(v);
    });
    if(missing){
      // Excluded rather than defaulted to 0 — a missing raw value must not
      // silently look "best possible" (the bug found in the MVI.html prototype).
      byCode[u.code] = { code:u.code, name:u.name, included:false, score:null, breakdown:[], households };
      return;
    }
    let score = 0;
    const breakdown = [];
    keys.forEach(k => {
      const meta = mviMetricMeta(k);
      const raw = u.metrics[k];
      const [min,max] = bounds[k];
      let norm = (max === min) ? 0.5 : (raw - min) / (max - min);
      if(meta.inverse) norm = 1 - norm;
      const weight = (state.mviWeights[k] || 0) / 100;
      const weighted = norm * weight;
      score += weighted;
      breakdown.push({ key:k, label:meta.label, raw, norm, weight: state.mviWeights[k] || 0, weighted });
    });
    byCode[u.code] = { code:u.code, name:u.name, included:true, score, breakdown, households };
    includedScores.push(score);
  });

  const order = Object.values(byCode).filter(r=>r.included).sort((a,b)=>b.score-a.score).map(r=>r.code);
  const excludedCodes = Object.values(byCode).filter(r=>!r.included).map(r=>r.code);
  const tiers = mviTiers(includedScores);
  order.forEach(code => { byCode[code].tier = mviTierFor(byCode[code].score, tiers); });
  const scoreMin = includedScores.length ? Math.min(...includedScores) : 0;
  const scoreMax = includedScores.length ? Math.max(...includedScores) : 0;

  return { byCode, order, excludedCodes, includedCount: order.length, tiers, scoreMin, scoreMax };
}

/* ---- Display filters (district search + division), for the results header ---- */
function mviPassesDisplayFilter(rec){
  const q = (state.mviDistrictSearch || '').trim().toLowerCase();
  if(q && !rec.name.toLowerCase().includes(q)) return false;
  if(state.mviDivisionFilter && districtDivision(rec.name) !== state.mviDivisionFilter) return false;
  return true;
}

/* ---- KPI strip + ranked table ---- */
function renderMviKPIs(results){
  const scores = results.order.filter(code => mviPassesDisplayFilter(results.byCode[code])).map(code => results.byCode[code].score);
  if(!scores.length){
    ['mvi-kpi-max','mvi-kpi-min','mvi-kpi-avg','mvi-kpi-std'].forEach(id => { $(id).textContent = '—'; });
    $('mvi-kpi-max-district').textContent = '';
    $('mvi-kpi-min-district').textContent = '';
    return;
  }
  const max = Math.max(...scores), min = Math.min(...scores);
  const avg = scores.reduce((a,b)=>a+b,0) / scores.length;
  const maxCode = results.order.find(code => results.byCode[code].score === max);
  const minCode = results.order.find(code => results.byCode[code].score === min);
  $('mvi-kpi-max').textContent = max.toFixed(3);
  $('mvi-kpi-min').textContent = min.toFixed(3);
  $('mvi-kpi-avg').textContent = avg.toFixed(3);
  $('mvi-kpi-std').textContent = stdDev(scores).toFixed(3);
  $('mvi-kpi-max-district').textContent = results.byCode[maxCode].name;
  $('mvi-kpi-max-district').onclick = () => mviSelectDistrict(maxCode);
  $('mvi-kpi-min-district').textContent = results.byCode[minCode].name;
  $('mvi-kpi-min-district').onclick = () => mviSelectDistrict(minCode);
}

function renderMviTable(results){
  const descOrder = results.order; // true rank, independent of the display filters below
  const rankByCode = {};
  descOrder.forEach((code,i) => { rankByCode[code] = i + 1; });

  // Dynamic header: Rank / District / Division / MVI Score / Households + one column per selected indicator
  const thead = $('mvi-table-head');
  thead.innerHTML = '<th>Rank</th><th>District</th><th>Division</th><th class="num">MVI Score</th><th class="num">Households</th>' +
    state.mviSelected.map(k => `<th class="num">${mviMetricMeta(k).label}</th>`).join('');

  let rows = descOrder.filter(code => mviPassesDisplayFilter(results.byCode[code])).map(code => results.byCode[code]);
  if(state.mviSortDir === 'asc') rows = rows.slice().reverse();
  const excludedRows = results.excludedCodes.filter(code => mviPassesDisplayFilter(results.byCode[code])).map(code => results.byCode[code]);

  const shown = state.mviTableExpanded ? rows : rows.slice(0,10);
  const tb = $('mvi-table-body');
  tb.innerHTML = '';
  const colCount = 5 + state.mviSelected.length;
  shown.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.code = r.code;
    if(r.code === state.mviSelectedDistrict) tr.classList.add('selected');
    const tierLabel = r.tier.charAt(0).toUpperCase() + r.tier.slice(1);
    const hh = r.households != null ? r.households.toLocaleString('en-US') : '—';
    let cells = `<td class="num">${rankByCode[r.code]}</td><td class="dist">${r.name}</td>` +
      `<td>${districtDivision(r.name) || '—'}</td>` +
      `<td class="num">${r.score.toFixed(3)} <span class="mvi-tier-pill mvi-tier-${r.tier}">${tierLabel}</span></td>` +
      `<td class="num">${hh}</td>`;
    r.breakdown.forEach(b => {
      cells += `<td class="num">${b.raw!=null ? Number(b.raw).toLocaleString('en-US',{maximumFractionDigits:2}) : '—'}</td>`;
    });
    tr.innerHTML = cells;
    tr.addEventListener('click', ()=>mviSelectDistrict(r.code));
    tb.appendChild(tr);
  });
  if(state.mviTableExpanded){
    excludedRows.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'mvi-excluded-row';
      const hh = r.households != null ? r.households.toLocaleString('en-US') : '—';
      tr.innerHTML = `<td class="num">—</td><td class="dist">${r.name}</td><td>${districtDivision(r.name) || '—'}</td>` +
        `<td colspan="${colCount-3}">Insufficient data for the selected indicators (households: ${hh})</td>`;
      tb.appendChild(tr);
    });
  }
  $('mvi-table-scroll').classList.toggle('expanded', state.mviTableExpanded);
  const total = rows.length + excludedRows.length;
  $('mvi-viewall-btn').textContent = state.mviTableExpanded ? 'Show top 10' : `View all ${total} regions`;
}

/* ---- Map (own Leaflet instance) ----
   mviStyleFor/mviTooltipHTML read state.mviResults directly (no results param)
   so that Leaflet's style callback and resetStyle() always reflect the latest
   Calculate — mirrors the existing Map-view convention (styleFor(u) reads
   state.metric directly). A stale closured `results` argument here would mean
   hover/mouseout repaint districts using whatever results existed at the one
   moment renderMviChoropleth() was first called (before any Calculate), which
   resetStyle() would keep reverting to forever. */
function mviStyleFor(u){
  const results = state.mviResults;
  const rec = (u && results) ? results.byCode[u.code] : null;
  const visible = rec && rec.included && mviPassesDisplayFilter(rec);
  const val = visible ? rec.score : null;
  return {
    fillColor: colorScale(val, results ? results.scoreMin : 0, results ? results.scoreMax : 1),
    fillOpacity: 0.85,
    color: '#FFFFFF',
    weight: 0.6
  };
}

function mviTooltipHTML(u){
  const results = state.mviResults;
  const rec = results ? results.byCode[u.code] : null;
  if(!rec){
    return `<strong>${u.name}</strong><br>Click Calculate to compute the MVI score`;
  }
  if(!rec.included){
    return `<strong>${u.name}</strong><br>Insufficient data for the selected indicators`;
  }
  const rows = rec.breakdown.map(b =>
    `${b.label}: ${b.raw!=null ? Number(b.raw).toLocaleString('en-US',{maximumFractionDigits:2}) : '—'} (weight ${b.weight}%)`
  ).join('<br>');
  return `<strong>${u.name}</strong><br>Composite score: ${rec.score.toFixed(3)} (${rec.tier})<br>${rows}`;
}

function showMviMapMessage(msg){
  const el = $('mvi-map-msg');
  el.textContent = msg;
  el.style.display = 'block';
}

async function initMviMap(){
  mviMap = L.map('mvi-map', {
    zoomControl:false, scrollWheelZoom:true, doubleClickZoom:true,
    touchZoom:true, boxZoom:true, keyboard:true,
    zoomSnap:0.1, zoomDelta:0.1,
    attributionControl:true
  }).setView([23.7, 90.35], 6.4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; OpenStreetMap, &copy; CARTO', subdomains:'abcd', maxZoom:19
  }).addTo(mviMap);

  if(!cachedGeojson){
    try{
      cachedGeojson = await fetch('./bd_districts.geojson').then(r=>{ if(!r.ok) throw new Error('no bundle'); return r.json(); });
    }catch(e){
      console.warn('Bundled bd_districts.geojson missing, trying geoBoundaries API (MVI map)', e);
      try{
        const meta = await fetch('https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM2/').then(r=>r.json());
        cachedGeojson = await fetch(meta.gjDownloadURL).then(r=>r.json());
      }catch(e2){
        showMviMapMessage('District boundaries could not be loaded. Table and KPI panels remain fully functional.');
        return;
      }
    }
  }
  renderMviChoropleth(cachedGeojson);
}

function renderMviChoropleth(geojson){
  buildNormLookup(); // metric-agnostic (keys off the unit list, not state.metric) — safe to reuse
  if(mviGeoLayer){ mviMap.removeLayer(mviGeoLayer); }
  if(mviLabelLayer){ mviMap.removeLayer(mviLabelLayer); mviLabelLayer = null; }
  mviLayerByCode = {};

  const labelMarkers = [];
  mviGeoLayer = L.geoJSON(geojson, {
    style: feature => mviStyleFor(matchUnit(feature.properties)),
    onEachFeature: (feature, layer) => {
      const u = matchUnit(feature.properties);
      if(!u) return;
      mviLayerByCode[u.code] = layer;
      layer.on('mouseover', () => { if(u.code!==state.mviSelectedDistrict) layer.setStyle({weight:2, color:'#fff'}); layer.bindTooltip(mviTooltipHTML(u),{sticky:true}).openTooltip(); });
      layer.on('mouseout',  () => { if(u.code!==state.mviSelectedDistrict) mviGeoLayer.resetStyle(layer); });
      layer.on('click', () => mviSelectDistrict(u.code));
      try{
        const center = layer.getBounds().getCenter();
        labelMarkers.push(L.marker(center, {
          icon: L.divIcon({ className:'district-label-icon', html:`<span>${shortDistrictLabel(u.name)}</span>`, iconSize:[26,14], iconAnchor:[13,7] }),
          interactive:false, keyboard:false
        }));
      }catch(e){}
    }
  }).addTo(mviMap);

  mviLabelLayer = L.layerGroup(labelMarkers).addTo(mviMap);
  try{ mviMap.invalidateSize(); mviMap.fitBounds(mviGeoLayer.getBounds(), {padding:[4,4]}); }catch(e){}
  applyMviMapSelection();
  updateMviLegend();
}

function mviRecolorMap(){
  if(!mviGeoLayer) return;
  mviGeoLayer.eachLayer(layer => {
    const u = matchUnit(layer.feature.properties);
    layer.setStyle(mviStyleFor(u));
  });
  applyMviMapSelection();
}

function applyMviMapSelection(){
  if(!mviGeoLayer) return;
  mviGeoLayer.eachLayer(layer => {
    const u = matchUnit(layer.feature.properties);
    if(u && u.code === state.mviSelectedDistrict){
      layer.setStyle({weight:3, color:'#EC008C'});
      layer.bringToFront();
    }
  });
}

function updateMviLegend(){
  const results = state.mviResults;
  if(!results || !results.order.length){
    $('mvi-legend-min').textContent = '—';
    $('mvi-legend-max').textContent = '—';
    return;
  }
  $('mvi-legend-min').textContent = results.scoreMin.toFixed(3);
  $('mvi-legend-max').textContent = results.scoreMax.toFixed(3);
}

/* ---- Data grid / Map view toggle ---- */
function mviSwitchView(view){
  state.mviResultView = view;
  $('mvi-grid-card').style.display = view === 'grid' ? '' : 'none';
  $('mvi-map-card').style.display = view === 'map' ? '' : 'none';
  $('mvi-view-toggle').querySelectorAll('.scale-tab').forEach(btn => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on);
  });
  if(view === 'map'){
    if(!mviMap) initMviMap();
    else{
      mviMap.invalidateSize();
      try{ if(mviGeoLayer) mviMap.fitBounds(mviGeoLayer.getBounds(), {padding:[4,4]}); }catch(e){}
    }
  }
}

/* ---- Selection + Calculate + event wiring ---- */
function mviSelectDistrict(code){
  state.mviSelectedDistrict = code;
  if(state.mviResults) renderMviTable(state.mviResults);
  mviRecolorMap();
}

function runMviCalculation(){
  state.mviResults = computeMviScores();
  renderMviKPIs(state.mviResults);
  renderMviTable(state.mviResults);
  if(mviGeoLayer){ mviRecolorMap(); updateMviLegend(); }
}

function bindMviEvents(){
  // Metric search behaves like the Map/Correlation "Metric name" combobox: a floating
  // grouped dropdown that opens on focus/typing and floats over the weights. Difference:
  // MVI is MULTI-select, so clicking a row toggles it and the dropdown STAYS open
  // (closes only on outside click / Escape).
  const mviSearchInput = $('mvi-picker-search');
  const mviList = $('mvi-picker-list');
  const openMviList  = () => { mviList.hidden = false; mviSearchInput.setAttribute('aria-expanded', 'true'); };
  const closeMviList = () => { mviList.hidden = true;  mviSearchInput.setAttribute('aria-expanded', 'false'); };
  mviSearchInput.addEventListener('focus', openMviList);
  mviSearchInput.addEventListener('input', e => { state.mviSearch = e.target.value; renderMviPickerList(); openMviList(); });
  mviSearchInput.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeMviList(); mviSearchInput.blur(); } });
  document.addEventListener('click', e => {
    const combo = mviSearchInput.closest('.combobox');
    if(combo && !combo.contains(e.target)) closeMviList();
  });
  $('mvi-calc-btn').addEventListener('click', runMviCalculation);
  $('mvi-distribute-btn').addEventListener('click', mviDistributeEvenly);
  $('mvi-reset-btn').addEventListener('click', mviResetToDefault);
  $('mvi-sort-btn').addEventListener('click', () => {
    state.mviSortDir = state.mviSortDir === 'desc' ? 'asc' : 'desc';
    if(state.mviResults) renderMviTable(state.mviResults);
  });
  $('mvi-viewall-btn').addEventListener('click', () => {
    state.mviTableExpanded = !state.mviTableExpanded;
    if(state.mviResults) renderMviTable(state.mviResults);
  });
  $('mvi-view-toggle').querySelectorAll('.scale-tab').forEach(btn => {
    btn.addEventListener('click', () => mviSwitchView(btn.dataset.view));
  });
  $('mvi-district-search').addEventListener('input', e => {
    state.mviDistrictSearch = e.target.value;
    if(state.mviResults){ renderMviKPIs(state.mviResults); renderMviTable(state.mviResults); mviRecolorMap(); }
  });
  $('mvi-division-filter').addEventListener('change', e => {
    state.mviDivisionFilter = e.target.value;
    if(state.mviResults){ renderMviKPIs(state.mviResults); renderMviTable(state.mviResults); mviRecolorMap(); }
  });
  [...new Set(Object.values(BD_DISTRICT_DIVISIONS))].sort().forEach(div => {
    const opt = document.createElement('option');
    opt.value = div; opt.textContent = div;
    $('mvi-division-filter').appendChild(opt);
  });
}

/* =====================================================================
   10. INIT
   ===================================================================== */
async function init(){
  DATA = await fetch('./master_data.json').then(r=>r.json());
  DICT = DATA.metric_dictionary;
  ALL_UNITS = DATA.districts;

  // Runtime correction (do not edit master_data.json): MF and WASH are BRAC
  // programmes, not population/demography counts — recategorize for grouping
  // in the metric dropdowns so they sit with the rest of BRAC_PROGRAMMES.
  ['MF', 'WASH'].forEach(k => { if(DICT[k]) DICT[k].category = 'brac_programmes'; });

  // Runtime correction: CVI is curated:false in the raw JSON, but it should be
  // a default (curated) metric — surface it in the default dropdown.
  if(DICT.CVI) DICT.CVI.curated = true;

  // Runtime correction: 11 of the 20 BRAC programme/supporting metrics are
  // curated:false in the raw JSON, hiding them from the Metric/X/Y dropdowns
  // unless "Show all 421" is checked. They should always be selectable.
  Object.keys(BRAC_PROGRAMMES).concat(Object.keys(BRAC_SUPPORTING_METRICS)).forEach(k => {
    if(DICT[k]) DICT[k].curated = true;
  });

  // Runtime correction: BD4057 (Meherpur) has a corrupted name_google of
  // "Manikganj" in the raw JSON. buildNormLookup() keys units by both name
  // and name_google, so this duplicate silently steals the "manikganj" lookup
  // key from the real Manikganj (BD3056) — its map polygon was binding to
  // Meherpur's data instead of its own, and BD3056 had no map layer at all.
  { const meherpur = ALL_UNITS.find(u => u.code === 'BD4057');
    if(meherpur && meherpur.name_google === 'Manikganj') meherpur.name_google = meherpur.name; }

  // Runtime-derived metric (MVI tool only, not in master_data.json): disability
  // rate, so raw district population size doesn't bias the raw
  // Total_Persons_With_Disability count. Deliberately NOT added to DICT — see
  // the MVI_INDICATOR_POOL comment above.
  ALL_UNITS.forEach(u => {
    const pwd = u.metrics['Total_Persons_With_Disability'];
    const pop = u.metrics['Population_HIES_22'];
    u.metrics['disability_rate_pct'] = (pwd != null && pop) ? (pwd / pop * 100) : null;
  });

  // New data source (2026-07-12): NEET youth indicators (Not in Education,
  // Employment, or Training) from the Population & Housing Census 2022, merged
  // at runtime from neet_data.json so master_data.json stays untouched (per the
  // do-not-edit rule). Adds 27 % metrics to DICT + each district's metrics, so
  // they appear automatically in the MVI metric repository and, when "Show all"
  // is on, in the Map/Correlation dropdowns too.
  try{
    const neet = await fetch('./neet_data.json').then(r=>{ if(!r.ok) throw new Error('no neet_data'); return r.json(); });
    if(neet && neet.metrics && neet.by_district){
      if(DATA.meta && DATA.meta.categories && !DATA.meta.categories[neet.category_key])
        DATA.meta.categories[neet.category_key] = neet.category_label;
      Object.entries(neet.metrics).forEach(([k,label])=>{
        DICT[k] = { label, category: neet.category_key || 'neet_youth', source:'BBS PHC 2022', coverage:64, curated:false };
        NAME_OVERRIDES[k] = label; // exact label from the source file (skip prettifyLabel mangling)
      });
      // District-name reconciliation: this file spells "Barishal"; master_data uses "Barisal".
      const NEET_NAME_FIX = { 'Barishal':'Barisal' };
      const byOurName = {};
      Object.entries(neet.by_district).forEach(([nm,rec]) => { byOurName[NEET_NAME_FIX[nm] || nm] = rec; });
      ALL_UNITS.forEach(u => {
        const rec = byOurName[u.name];
        if(rec) Object.entries(rec).forEach(([k,v]) => { u.metrics[k] = v; });
      });
    }
  }catch(e){ console.warn('NEET data (neet_data.json) not loaded — MVI/dropdowns will simply omit NEET metrics.', e); }

  buildMetricDropdown();
  buildProgrammeDropdown();

  metricCombo = buildCombobox($('f-metric'));
  scatXCombo = buildCombobox($('f-scatx'));
  scatYCombo = buildCombobox($('f-scaty'));

  valueRangeSlider.setup();
  povertyRangeSlider.setup();
  cviRangeSlider.setup();

  bindFilters();
  initScatter();

  renderKPIs();
  updateLegend();
  renderTable();
  updateScatter();

  bindMviEvents(); // builds the division-filter <option> list, must run before buildMviPicker's first render
  buildMviPicker();
  runMviCalculation(); // compute with the default indicators so the MVI page shows data on load (mirrors MVI.html init)

  await initMap();          // async; map renders when GeoJSON resolves
}

document.addEventListener('DOMContentLoaded', init);
