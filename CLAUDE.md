# BRAC DataExplorer — Project Log & Context

> Working notes for the Bangladesh District Data dashboard. Records what was built,
> what data sources we found, and what was changed — so we can pick up later.

## 1. What this project is
A single self-contained `index.html` analytics dashboard (vanilla JS, no build step,
no backend). It reproduces the approved "DataExplorer" design and binds it to real data
from `master_data.json`. CDN libs only: **Leaflet 1.9** (map) + **Chart.js 4** (scatter).

Spec lives in `instruction.md`. Design tokens in `design/DESIGN.md`; reference image
`design/screen.png`; the original static Tailwind mock is `design/code.html` (NOT used —
it had hardcoded values and placeholder images, so we wrote a fresh compliant build).

## 2. Files in this folder
| File | Role |
|---|---|
| `index.html` | The deliverable dashboard (what we built). |
| `master_data.json` | Data source: `meta`, `metric_dictionary` (421 metrics, 31 curated), `districts` (64). |
| `bd_districts.geojson` | Bundled district boundaries (geoBoundaries BGD ADM2, simplified). Added by us. |
| `BD_Upazila_National_Data 2022.xlsx - Codebook.csv` | Codebook with plain-English **Description** per indicator. |
| `instruction.md` / `design/` | Spec + design reference. |
| `CLAUDE.md` | This log. |

## 3. What we built (the dashboard)
- Sidebar (DataExplorer wordmark, nav, nakshi-kantha dashed motif): fixed, collapsible,
  **pushes** main content (no overlay/backdrop), open by default. Toggle via the "Data
  filters" button or the sidebar's own X.
- Two top-level pages, switched via pills next to "Data filters": **Map view** (KPI strip +
  choropleth + Regional data breakdowns table) and **Correlation view** (HH/HL/LH/LL
  quadrant KPI cards, each readable with a color dot + count + "districts" sub-label +
  scatter chart + a stacked 4-quadrant district list, district names colored per quadrant).
- **KPI strip (Map view)**: Max / Min / Avg / population Std dev, live from selected metric
  over visible districts (nulls ignored).
- **Filters**: metric dropdown (curated, grouped by category via `<optgroup>`, "Show all
  421" toggle), BRAC programme (15 real programmes only — see §6), dual-handle value range,
  Apply button. The value-range/programme filter now also grays out excluded districts on
  the **map** (previously only affected KPIs/table/scatter — see §5.7).
- **Spatial distribution**: TRUE choropleth (Leaflet), magenta ramp by value, null/filtered
  → gray ("no data" style), hover tooltip, click-to-select, legend bar. Zoom in/out is
  currently **locked** (temporary, see §5.7) — pan still works.
- **Regional data breakdowns**: sortable table, top 10 + "View all 64", district names in
  magenta, null → em-dash, "View all" button pinned flush to the card's bottom.
- **Data correlation analysis**: 64-point scatter (one per district), colored by quadrant
  (HH/HL/LH/LL split at the median of each axis), regression trend line + Pearson r, outlier
  labels, "N of 64 shown". Defaults X=UPGP (BRAC response) vs Y=poverty (BBS need).
- **Programme pins**: selecting a BRAC programme in the filter dropdown adds a pin
  (magenta `L.circleMarker`) on every district where that programme is active (non-null
  value = active, same convention as everywhere else). District name + value shown on
  hover only (pins stay visible always — coverage ranges from 8/64 to 61/64 districts
  depending on programme, so always-on labels would be unreadable for the dense ones).
- State sync: selecting a district (map, table, OR quadrant list) highlights it across map +
  table + scatter + list.
- Geo-level agnostic via `getUnits()` keyed on `state.activeLevel` (drill-down ready for upazila/union).

## 4. What we found / verified in the data
- Default metric `HCR_Upper_pct_HIES_22` reproduces the reference numbers exactly (max 54.40 Madaripur, min 6.10; top-6 matches screenshot).
- 64 districts each carry 421 metric values (nullable). `brac_programmes` category has **18**
  keys: 13 programme acronyms + 5 supporting/outcome metrics (`Total_Brac_Reach`,
  `Child_marriages_prevented`, `No_of_Borrower_Dabi`, `No_of_Borrower_Progoti`,
  `numParticipants_in_Apprenticeship_Star_programme`). `MF` and `WASH` are *also* real BRAC
  programmes but are filed under `population_demography` in the raw JSON, not
  `brac_programmes` — recategorized at runtime (§6). There is **no 16th programme** in the
  data beyond these 15; no separate "Migration" metric exists apart from `MEP`.
- `CVI` is `curated:false` in the raw JSON despite being intended as a default/curated
  metric — patched to `curated:true` at runtime in `init()` (do not edit `master_data.json`).
- 11 of the 20 BRAC programme/supporting metrics (`BYP, CCP, DRMP, IDP, MEP, SCP, SDP, UDP,
  No_of_Borrower_Dabi, No_of_Borrower_Progoti, numParticipants_in_Apprenticeship_Star_programme`)
  were also `curated:false`, hiding them from the Metric/X/Y-axis dropdowns unless "Show all
  421" was checked — patched to `curated:true` at runtime alongside CVI.
- **Per-district programme coverage is real and varies a lot** (verified via the data, not
  assumed): BEP 44/64, BHP 61/64, BYP 12/64, CCP 8/64, DRMP 21/64, IDP 16/64, MEP 5/64,
  MF 64/64, SCP 18/64, SDP 52/64, SELP 31/64, TBCP 59/64, UDP 11/64, UPGP 41/64, WASH 14/64
  districts have a non-null (= active) value. Null = programme not active there, not missing
  data — this is the convention `passesFilters()` and the programme-pin feature both rely on.
- **Found and fixed a real data bug, not a code bug**: `BD4057` ("Meherpur") had a corrupted
  `name_google` of `"Manikganj"` in the raw JSON — a copy-paste error. `buildNormLookup()`
  keys district lookup by both `name` and `name_google`, so this duplicate silently stole the
  `"manikganj"` key from the real Manikganj (`BD3056`): the Manikganj map polygon was binding
  to Meherpur's data (wrong color, wrong click target, wrong tooltip), and Manikganj itself
  had no map layer at all — invisible to clicks, hover, and the programme-pin feature.
  Patched at runtime in `init()` (`meherpur.name_google = meherpur.name`), per the same
  do-not-edit-`master_data.json` rule as the other corrections. Confirmed via Playwright: all
  64 districts now have a `layerByCode` entry, clicking the Manikganj polygon selects
  Manikganj (not Meherpur), and BHP pin count now correctly reads 61/64.
- With that bug fixed, all 64 GeoJSON `shapeName` features now match our district names via
  the alias table — verified by direct simulation against the real `NAME_ALIASES` table
  (previously this line in the log was aspirational, not actually re-checked after later
  data/alias changes).
- Codebook (`...Codebook.csv`) gives readable descriptions, but its column names are the *original upazila* names and differ from the renamed keys in `master_data.json` (not a clean 1:1 join).

## 5. Changes made (chronological)
1. **Initial build** — wrote `index.html` from scratch per `instruction.md` (replaced the static `design/code.html` mock).
2. **Map fix** — geoBoundaries API has no browser CORS headers, so the live fetch failed. Downloaded the geoBoundaries BGD ADM2 (simplified) GeoJSON, bundled it as `bd_districts.geojson`, and made the **local file the primary source** (geoBoundaries kept as fallback). Choropleth now renders.
3. **KPI layout fix** — label and value were rendering inline; set them to `display:block` so the label sits above the value (matches reference).
4. **Dropdown safety** — `buildOptgroups` now sets `selectEl.value = selectedKey` so the UI always reflects state on load.
5. **Readable indicator names** — see §6.
6. **Sidebar + two-page restructure** — sidebar converted from an off-canvas overlay drawer
   to a fixed, push-content, collapsible panel (`flex:0 0 320px` ↔ `.collapsed`); the old
   nested-tabs layout (scatter / quadrant table sharing one card) split into two full pages
   ("Map view" / "Correlation view") switched via pills next to "Data filters". Correlation
   page's KPI strip relabeled to HH/HL/LH/LL quadrant district counts, each with a color dot
   + "districts" sub-label; the 4-quadrant table became a stacked, color-coded list to fit
   the narrower column. Regional table default bumped from top 6 to top 10.
7. **Map-view polish round** —
   - "Show all 421 metrics" toggle given breathing room below the metric dropdown (`.toggle-row` margin).
   - Map zoom in/out **disabled temporarily** (`zoomControl`/`scrollWheelZoom`/`doubleClickZoom`/`touchZoom`/`boxZoom`/`keyboard` all `false`, `#map-zoom-in` button `disabled`) — marked `TEMP` in code for an easy revert once the team decides on a final zoom approach. Panning and `#map-reset` still work.
   - "View all 64 regions" button pinned flush to the bottom of its card (`.row-mid > .card{display:flex;column}` + `.table-scroll{flex:1}`) instead of leaving dead space below it.
   - **Map now respects the Value range / BRAC programme filters** — extracted `passesFilters(u)` (used by both `visibleUnits()` and `styleFor()`) so districts excluded by the current filter render in the existing no-data gray, not their color-scaled fill. Color-scale domain (legend min/max) deliberately still uses the full metric range, not the narrowed selection.
8. **BRAC programme glossary applied** — see §6 (Tier 3 resolved).
9. **Curated-metrics fix + programme map pins + Manikganj data-bug fix** — patched
   `curated:true` onto the 11 previously-hidden BRAC metrics (see §4) so they appear in the
   Metric/X/Y dropdowns by default; added programme-pin markers to the map (see §3); found and
   fixed the `BD4057`/Manikganj `name_google` collision bug (see §4) that was silently
   breaking map matching for one district.

## 6. Indicator naming — decision & approach
Problem: dropdown labels were cryptic codes (e.g. `HCR_Upper_pct_HIES_22`, `Kancha_pct`,
`BEP`) that a non-technical director can't read. Three tiers:

- **Tier 1 (clear from codebook / key):** poverty, housing, WASH, education, employment,
  demographics. → Mapped to plain-English names via an explicit `NAME_OVERRIDES` lookup
  in `index.html`. Units verified against actual value ranges (e.g. financial-account &
  literacy metrics are %, MF/WASH/reach are counts).
- **Tier 2 (everything else, ~390 metrics):** auto-prettified at runtime (`prettifyLabel`):
  underscores→spaces, `pct/_%`→`(%)`, `# / num_`→`Number of`, strip `HIES_22 / _22 /
  _calculated / *`, sentence-case the first letter.
- **Tier 3 (resolved 2026-06-21):** BRAC supplied the programme glossary. `BRAC_PROGRAMMES`
  (15 keys — `BEP, BHP, BYP, CCP, DRMP, IDP, MEP, MF, SCP, SDP, SELP, TBCP, UDP, UPGP, WASH`)
  and `BRAC_SUPPORTING_METRICS` (the 5 outcome/sub-metrics from §4) are defined in
  `index.html` and merged into `NAME_OVERRIDES`. The "BRAC programme" filter dropdown
  (`buildProgrammeDropdown`) now sources strictly from `Object.keys(BRAC_PROGRAMMES)`, not
  the data's `category` field, so supporting metrics never leak into it. `MF`/`WASH` are
  recategorized to `brac_programmes` at runtime in `init()` purely for dropdown grouping.

`metricLabel(key)` resolves: `NAME_OVERRIDES[key]` → else `prettifyLabel(dict.label)`.
The raw metric keys are never changed; only display labels.

## 7. Open items / TODO
- [ ] Confirm with BRAC whether a 16th programme really exists (their note expected 16, the
      data + glossary only account for 15 — see §4). If one surfaces, add it to
      `BRAC_PROGRAMMES` in `index.html`.
- [ ] Decide on a final map zoom UX (currently locked/disabled temporarily, see §5.7) and
      either remove the `TEMP` zoom-disable code or keep it permanently.
- [ ] Optional: build a richer key→codebook mapping (Tier 2 → curated) if more precise names are wanted.

## 8. How to run
Serve over HTTP (fetch won't work from `file://`):
`python -m http.server 8765` then open `http://127.0.0.1:8765/index.html`.
Map needs internet for basemap tiles; district shapes load from the bundled GeoJSON (works offline-ish).
