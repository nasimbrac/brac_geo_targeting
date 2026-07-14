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
- **Third page — MVI (Composite Vulnerability Score)**: a programme director picks 5–8
  vulnerability indicators from a 12-item curated pool, assigns % weights that must sum to
  100% (Calculate disabled otherwise), and gets a per-district composite score shown as a
  ranked table, its own choropleth map, and Max/Min/Avg/StdDev KPI cards. Own control panel,
  own Leaflet instance, always scores all 64 districts. See §5.11 for full details.

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
10. **Map-view request round (2026-07-02)** —
    - **Spatial distribution title now shows the selected metric name**, truly centered in
      the card head regardless of the action-button cluster's width (`#map-title`,
      `.map-card-head`/`.map-head-actions` in CSS; text set from `updateLegend()`, which
      already ran on both initial load and metric change, so no new call sites were needed).
    - **Permanent 3-letter district labels** added to the choropleth (`shortDistrictLabel()` —
      Titlecase, letters only, e.g. "Dhaka"→"Dha", "Cox's Bazar"→"Cox") via non-interactive
      `L.divIcon` markers in a new `labelLayer` group, rebuilt alongside `geoLayer` in
      `renderChoropleth()`.
    - **Regional data breakdowns no longer leaves blank space** below the top-10 list — the
      `.table-scroll` `max-height:280px` cap (which was cutting the list off well short of
      the card's actual height, set by the map card in the same grid row) was removed; `flex:1`
      now does the job on its own.
    - **Map zoom/pan re-enabled** — reverted the 2026-06-21 TEMP lock in `initMap()`
      (`scrollWheelZoom`/`doubleClickZoom`/`touchZoom`/`boxZoom`/`keyboard` back to `true`;
      `zoomControl` stays `false`, the card keeps its own zoom button) and wired
      `#map-zoom-in` to `map.zoomIn()`. Resolves the first bullet of the old §7 TODO.
    - **Added a map full-screen toggle** — new `#map-fullscreen-btn` (`toggleMapFullscreen()`)
      expands `#map-card` to a fixed viewport overlay (`.map-fullscreen`), re-running
      `map.invalidateSize()`/`fitBounds()` after the CSS transition; `Escape` exits.
11. **MVI (Composite Vulnerability Score) page added (2026-07-12)** — third page/pill next
    to Map view / Correlation view, implementing the BRD-spec "programme director picks
    5–8 vulnerability indicators, assigns % weights summing to 100%, gets a per-district
    composite score" tool. MVP scope: UPG-programme framing, district level.
    - **`MVI_INDICATOR_POOL`** (12 curated metrics, not the full 421) spans poverty,
      climate, energy, disability, migration, WASH, housing, employment, child-marriage,
      and literacy categories; each entry carries an `inverse` flag (higher raw value =
      less vulnerable, e.g. literacy rate, safe sanitation). Default 6-indicator selection
      (`HCR_Upper_pct_HIES_22` 25%, `MPI` 20%, `CVI` 20%, `No_Electricity_Connection_pct`
      15%, `disability_rate_pct` 10%, `Percent_Returned_Migrant` 10%) matches the
      director's named examples (poverty, MPI, climate, electricity, disability,
      migration) and all have 64/64 district coverage.
    - **New runtime-derived metric** `disability_rate_pct` (`Total_Persons_With_Disability
      / Population_HIES_22 * 100`), computed once in `init()` alongside the existing CVI/
      Meherpur runtime patches. Deliberately **not** added to `metric_dictionary`/
      `NAME_OVERRIDES` — it must stay invisible to the Map/Correlation metric dropdowns.
    - **Own independent control panel** — MVI's indicator/weight picker is its own card,
      not a repurposing of the global "Data filters" sidebar. MVI always scores
      `getUnits()` (all 64 districts), never `visibleUnits()`/`passesFilters()` — it's a
      standalone targeting tool, not filtered by whatever Map-view filter happens to be
      set.
    - **Own Leaflet instance** (`mviMap`/`mviGeoLayer`/`mviLabelLayer`/`mviLayerByCode`) —
      Leaflet requires one map per container, so this cannot share Map view's `map`/
      `geoLayer` globals. Lazily initialized on first switch to the MVI tab (`switchPage()`
      extended from boolean `isMap` to explicit 3-way branching) to avoid Leaflet
      rendering 0×0 inside a `display:none` container. `bd_districts.geojson` is now
      fetched once and cached (`cachedGeojson`), shared by both `initMap()` and the new
      `initMviMap()`.
    - **`computeMviScores()`**: min-max normalize each selected indicator across all 64
      districts → apply `1-norm` if `inverse` → multiply by weight/100 → sum. A district
      missing a value for *any* currently-selected indicator is **excluded** from the
      ranking (shown as "insufficient data" on the table/map) rather than defaulted to 0
      — the MVI.html prototype's approach of treating missing data as "best possible" was
      deliberately not replicated. Tiers (Low/Moderate/High/Severe) are **quartile-based**
      on the actual computed score distribution, not fixed thresholds, since score
      magnitude depends on whatever weight combination a director picks.
    - Verified the math against real `master_data.json` in a headless Node harness (no
      browser DOM): default 6 indicators → all 64 districts included, Bandarban/Cox's
      Bazar/Rangamati/Netrakona/Khagrachhari (CHT/coastal) rank highest, Dhaka/
      Narayanganj/Gazipur/Munshiganj (Dhaka-adjacent, high-electricity-access) rank
      lowest — plausible. Confirmed `mviDistributeEvenly()` always sums to exactly 100 for
      5–8 selected indicators, null-exclusion correctly drops a district when a selected
      indicator is nulled, and the inverse-polarity flip is actually applied (higher
      literacy → lower vulnerability contribution). Full interactive browser verification
      (Leaflet lazy-init across page switches, picker UI clicks) was **not** done in this
      session — the Claude-in-Chrome browser extension was not connected — so that should
      still be spot-checked once opened in a real browser.
    - Two reference prototypes exist in the repo root (`MVI.html`, `mvi2.html`, not part
      of the deliverable) — read in full for inspiration; `mvi2.html` cites a "BRD v1.0,
      10 Jul 2026" spec and is the closer match to what was built, but both use
      hardcoded/synthetic data with keys that don't exist in `master_data.json`.
    - **Also found and fixed a real bug before this reached the user**: `mviStyleFor`/
      `mviTooltipHTML` originally took a `results` parameter, closured once from
      `initMviMap()` (when `state.mviResults` was still `null`). After clicking
      Calculate, `mviRecolorMap()` repainted every layer correctly via `setStyle`, but
      Leaflet's `resetStyle()` (fired on mouseout) reverts to the layer's **style
      option**, not the last `setStyle` — so hovering any district after Calculate
      would paint it back to no-data gray, and tooltips always said "insufficient
      data" regardless of the real score. Fixed by having both functions read
      `state.mviResults` directly (no parameter), matching the existing
      `styleFor(u)`/`tooltipHTML(u)` convention used by Map view.
12. **MVI page reworked to match the `MVI.html` prototype's UI (2026-07-12, same day)** —
    the user pointed at `MVI.html` running in their browser and asked for that UI/UX,
    not the leaner picker from item 11. Superseded pieces:
    - **Metric repository, not a 12-item pool** — `mviAllMetricKeys()` +
      `mviMetricMeta(key)` now cover all 421 metrics + the 1 derived
      `disability_rate_pct`, searchable (`#mvi-picker-search`), grouped by category,
      each row showing a clickable `DIRECT`/`INVERSE` polarity tag
      (`state.mviInverseOverrides` holds user flips; `MVI_INVERSE_DEFAULTS` seeds a
      handful of known "higher = safer" metrics — literacy, safe sanitation, financial
      account, pucca housing, electricity access/national grid). Selected metrics show
      as removable chips (`#mvi-chips`). Min/max selectable changed from 5–8 to **1–10**
      to match `MVI.html`'s actual enforced bounds (its UI text never showed a min-5
      floor).
    - **New default selection** (matching `MVI.html`'s own defaults exactly, verified
      against real data): `HCR_Upper_pct_HIES_22` 30%, `MPI` 25%, `CVI` 25%,
      `Literacy_Rate_7yearplus_Overall` 20% (inverse). Re-ran the headless Node
      verification harness with these — top-5 ranked districts (Bandarban 0.769,
      Netrakona 0.630, Bhola 0.625, Sunamganj 0.624, Kurigram 0.599) match the
      screenshot of `MVI.html` almost exactly, confirming the ported math is faithful.
    - **New `BD_DISTRICT_DIVISIONS`** static lookup (district name → one of Bangladesh's
      8 real divisions) — `master_data.json` has no division field (`parent` is `null`
      for all 64 districts), so this was hand-built from public administrative
      geography and checked against the exact 64 canonical district-name spellings
      pulled from the data itself.
    - **New derived `households`** per district (`round(Population_HIES_22 /
      Average_Household_Size)`, both 64/64 coverage) computed inside `computeMviScores()`
      — shown as its own ranked-table column, matching the prototype's grid.
    - **Data grid / Map view toggle** (`#mvi-view-toggle`, `mviSwitchView()`) replaces
      the old always-visible side-by-side map+table layout — full-width table or
      full-width map, one at a time, reusing the existing `.scale-toggle`/`.scale-tab`
      pill CSS (same component already used for the Correlation page's Actual/
      Normalized toggle). The Leaflet map is now lazily created on first switch to
      *Map view* specifically (not on first visit to the MVI page), so `switchPage()`'s
      MVI-specific nudge only fires `invalidateSize()`/`fitBounds()` when
      `state.mviResultView === 'map'`.
    - **District search + division filter** (`#mvi-district-search`,
      `#mvi-division-filter`) added as *display* filters — `mviPassesDisplayFilter(rec)`
      narrows what KPIs/table/map show without touching the underlying
      `computeMviScores()` ranking or re-normalizing; true rank numbers in the table
      are always computed from the full unfiltered result set.
    - **Ranked table now has per-indicator raw-value columns** (dynamic `<thead>` built
      in `renderMviTable()` from `state.mviSelected`) plus Division and Households,
      matching the prototype's grid columns exactly: Rank / District / Division / MVI
      Score (+ tier pill inline) / Households / one column per selected indicator.
    - Button/label text updated to match: "Calculate MVI / apply filters", "Metric
      repository" header with an "N/10" counter.
    - **Two follow-up fixes after the user reported "no data on the MVI page"**:
      (a) `init()` now calls `runMviCalculation()` once on load (after `buildMviPicker()`),
      exactly like `MVI.html`'s `init()` (line 1361) — previously KPIs/table/map stayed
      blank until the user clicked Calculate, because `state.mviResults` was `null`. The
      data binding to `master_data.json` was never broken; the calculation just wasn't
      *triggered* on load. (b) The global "Data filters" sidebar (metric/programme/range
      sliders) and its toggle button are now hidden on the MVI page via a
      `body.mvi-page-active` class toggled in `switchPage()` — that sidebar is
      Map/Correlation-specific and does nothing for MVI, which has its own in-page
      metric-repository panel (matching how `MVI.html`'s MVI tab has no shared global
      filter sidebar).
13. **MVI map-height fix + one-screen layout + NEET data added (2026-07-12, same day)** —
    - **Map view sub-tab showed no map** because `#mvi-map` had no CSS height (Map view's
      `#map` has `height:420px`; the MVI equivalent was never added, so it collapsed to
      0px). Fixed as part of the layout work: `#mvi-map{ flex:1; min-height:180px; … }`
      inside a flex-column map card.
    - **One-screen layout**: the MVI page now fits the viewport like Map/Correlation —
      `.mvi-layout{ height:calc(100vh - 96px) }`, left picker card scrolls internally
      (`overflow-y:auto`, metric list capped ~230px, weight list ~24vh), right
      `.mvi-results-col` is a flex column whose grid/map card flexes to fill remaining
      height with internal scroll. The standalone description card was slimmed to a
      compact `.mvi-results-head`. A `@media (max-width:1024px)` override drops the fixed
      height so stacked columns flow normally on mobile.
    - **NEET youth data added** (`neet_data.json`, new file): 27 % indicators × 64
      districts (NEET = Not in Education/Employment/Training, 15–24 / 15–19 / 20–24 age
      bands × male/female × rural/urban), extracted from `new_data/NEET data PHC
      2022.xlsx` (BBS Population & Housing Census 2022). Merged at runtime in `init()`
      (fetch `neet_data.json` → add to `DICT`/`NAME_OVERRIDES` under a new `neet_youth`
      category + each district's `metrics`), so `master_data.json` stays untouched per
      the do-not-edit rule and the metrics appear automatically in the MVI metric
      repository (and in Map/Correlation when "Show all" is on). District-name join
      verified 64/64 (the file spells "Barishal"; reconciled to our "Barisal" via a
      one-entry fix table). The `new_data/` xlsx also has a 2nd sheet of student-count-
      by-age data (sheet2) — **not** imported yet (counts, less directly a vulnerability
      %); available to add later if wanted.
14. **MVI filter unified into a collapsible sidebar (2026-07-14)** — the MVI page's
    Metric-repository / weights picker was an always-visible in-page left column
    (`#mvi-picker-card`, left cell of the `.row-mid.mvi-layout` grid). It's now a real
    collapsible left sidebar (`<aside class="sidebar mvi-sidebar" id="mvi-sidebar">`),
    a sibling of the existing Data-filters `#sidebar`, so all three pages share the
    **same sliding-door filter UX** toggled by the one "Filters" button.
    - Only one sidebar is in the DOM flow per page: `body.mvi-page-active #sidebar{display:none}`
      + `body:not(.mvi-page-active) #mvi-sidebar{display:none}`. The `#filters-toggle`
      button is no longer hidden on MVI (previous §12b behavior reverted) — it now
      toggles whichever sidebar the current page shows.
    - `toggleSidebar()` picks the active sidebar via `activeSidebar()` (`#mvi-sidebar`
      on MVI, else `#sidebar`) and nudges the correct Leaflet map after the 0.25s CSS
      transition (`mviMap` when on MVI's Map sub-view, else `map`). New
      `#mvi-sidebar-close` X also calls it.
    - **Kept the one-screen/no-scroll behavior** (the thing change #13 fought for): the
      height anchor moved off the deleted `.mvi-layout` grid onto `#page-mvi{height:calc(100vh-96px)}`
      + `.mvi-results-col{height:100%}`, so the results table/map still scroll internally
      and the page itself doesn't. `@media (max-width:1024px)` sets `#page-mvi{height:auto}`
      for normal mobile flow. `#page-mvi` is now just the full-width `.mvi-results-col`
      (grid + `#mvi-picker-card` removed; dead CSS for both cleaned up). All `mvi-*`
      element IDs were preserved through the move, so no JS wiring changed.
    - `.mvi-sidebar` widened to 360px on ≥769px (`@media (min-width:769px)`) since the
      weight sliders need a touch more room than the 320px Data-filters sidebar; inherits
      `.sidebar` collapse + mobile rules otherwise. Defaults open on MVI (parity with the
      other pages). Structure validated (tag balance, unique IDs); **browser spot-check
      still pending** — the Claude-in-Chrome extension wasn't connected this session.

15. **MVI search → floating combobox + single-navbar redesign (2026-07-14, browser-verified)** —
    - **MVI sidebar header slimmed**: removed the funnel icon + "Metric repository N/10"
      title and the `filter-divider` gap under the search (user: "remove these space and
      text"). Kept `#mvi-picker-count` in the DOM (hidden) so `buildMviPicker()` still
      writes to it. Header is now just a right-aligned close ✕.
    - **MVI metric search is now a floating combobox** (same style as the Map/Correlation
      "Metric name" combobox) instead of an inline list. `#mvi-picker-list` moved inside a
      `.combobox` wrapper and given `.combobox-list` (position:absolute, floats over the
      weights). Opens on focus/typing, closes on outside-click/Escape. **Difference from the
      single-select Metric-name combo: MVI stays MULTI-select** — clicking a row toggles it
      and the dropdown stays open (checked rows = the "already added" ✓). Fixed the earlier
      root cause too: as a flex item the scroll-container list had `min-height:auto`=0 and
      the tall weight list squeezed it to 0 height (search results invisible) — floating it
      removes it from the flex flow entirely.
    - **Single navbar**: `.topbar-row` reorganized to All Dashboards (left) · title (center)
      · page tabs + **BRAC logo at the far right** (`.topbar-right`, brand-compliant: magenta,
      undistorted, clear space via gap). Logo moved from left to right per user request
      (note: brand guideline's preferred spots are top-left/bottom-right; top-right was the
      user's explicit call).
    - **Filters control moved out of the navbar** into an in-page `.filter-bar` above the
      content (`#filters-toggle` relocated, same id + `toggleSidebar` binding). Shown on all
      pages; on MVI it toggles the Metric-repository sidebar. MVI one-screen height retuned
      to `calc(100vh - 144px)` to account for the added bar.
    - Verified in a real browser this session (Chrome DevTools bridge, since the
      Claude-in-Chrome extension wasn't connecting): navbar layout, in-page Filters
      collapse→full-width results, MVI floating search dropdown (multi-select, ✓ on added),
      and MVI one-screen no-scroll all confirmed via screenshots.

16. **Navbar final layout + repo cleanup (2026-07-14, browser-verified & committed)** —
    supersedes the navbar arrangement in #15:
    - **Single navbar, final**: BRAC **logo (left)** + page tabs Map/Correlation/MVI (left) ·
      title (center) · **Filters + All Dashboards (right)**. (User reversed #15: logo moved
      back to the LEFT, All Dashboards to the RIGHT, Filters back UP into the navbar — the
      in-page `.filter-bar` from #15 was removed; `#page-mvi` height reverted to
      `calc(100vh - 96px)`.)
    - **Grid overlap fix**: `.topbar-row` uses `grid-template-columns:auto minmax(0,1fr) auto`
      (clusters size to content, title takes the middle) and `.dashboard-title` is
      `justify-self:stretch` + `overflow:hidden; text-overflow:ellipsis`. Earlier
      `justify-self:center` sized the title to its content and let the overflow spill onto
      the MVI tab / Filters; stretch makes it fill its cell and truncate instead. Verified
      no overlap/clipping with the wide (360px) MVI sidebar open.
    - **"Programmatic MVI" heading removed** from the MVI results column (user request).
    - **Repo cleaned to code-only** (2 commits: `5331b7f` snapshot-all, then remove).
      **Remaining files: `index.html`, `master_data.json`, `bd_districts.geojson`,
      `neet_data.json`, `logo.png`, `CLAUDE.md`, `.gitignore`.** Deleted (recoverable via
      `git checkout 5331b7f -- <path>`): the `MVI.html`/`mvi2.html` prototypes, `design/`,
      `docs/`, `new_data/` (NEET source xlsx), `instruction.md`, both codebook CSVs,
      `data_template.csv`, `DATA_COLLECTION_FORMAT.md`, `make_data_templates.py`,
      `metric_naming_map.json`. **NOTE: earlier sections of this log still reference some of
      these now-deleted files (e.g. §2's file table, the Codebook.csv, `design/`,
      `instruction.md`, the `MVI.html`/`mvi2.html` prototypes) — those references are now
      historical; the files live only in git history.**

17. **Split into css/js files (2026-07-14, browser-verified)** — `index.html` was ~3,000
    lines (HTML + inline `<style>` + inline `<script>`). Extracted into **`css/styles.css`**
    (~520 lines) and **`js/app.js`** (~2,179 lines); `index.html` is now ~308 lines of
    structure that `<link>`s the CSS and `<script src>`s the JS. **Still no build step** —
    just three files served statically (open via `python -m http.server`). CDN libs
    (Leaflet, Chart.js) stay in `<head>`; data files stay in root so the `fetch('./…')`
    paths are unchanged. (So §1's "single self-contained `index.html`" is now historical —
    the app is `index.html` + `css/styles.css` + `js/app.js` + the 3 data JSONs + logo.png.)
    Verified after the split: CSS applied (magenta button), JS ran (KPIs computed, table
    rendered), page-tab switching works.

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
- [x] Map zoom UX decided (2026-07-02, see §5.10): zoom/pan re-enabled (TEMP lock reverted)
      and a full-screen toggle added.
- [ ] Optional: build a richer key→codebook mapping (Tier 2 → curated) if more precise names are wanted.
- [ ] Spot-check the MVI page (§5.11) in a real browser — picker checkboxes/sliders, the
      Calculate button enable/disable, and the Leaflet map's lazy-init when switching tabs
      were only logic-verified via a headless Node harness against `master_data.json`, not
      clicked through in an actual browser (Claude-in-Chrome extension wasn't connected).
- [ ] MVI follow-ups explicitly punted from MVP: full 421-metric searchable indicator
      picker, per-district click-to-detail panel, proportional "balance to 100%" weight
      rebalance, upazila/union drill-down, other-programme framing beyond UPG.

## 8. How to run
Serve over HTTP (fetch won't work from `file://`):
`python -m http.server 8765` then open `http://127.0.0.1:8765/index.html`.
Map needs internet for basemap tiles; district shapes load from the bundled GeoJSON (works offline-ish).
