BRAC DataExplorer — Bangladesh District Dashboard

You are a senior frontend engineer building a production-quality, data-bound analytics dashboard. An approved visual design already exists (the "DataExplorer" reference image, provided separately). Reproduce that design exactly and wire it to real data from master_data.json. The reference is a static picture — make it functional and data-accurate.


0. Deliverable

A single self-contained index.html:


No build step, no backend, no frameworks (vanilla JS only).
CDN libs only: Leaflet.js 1.9 (map) + Chart.js 4 (scatter).
Loads data via fetch('./master_data.json') (same folder).
Works at >=1280px; stacks gracefully at <=1024px.



1. Data contract — master_data.json

Three top-level blocks. Read the schema exactly; do not assume field names.


meta: geo_level, geo_count(64), years[2022,2025], sources{BBS, "BRAC Bangladesh"}, climate_zones[7], categories{category_key -> label}, drilldown_ready.
metric_dictionary: metric_key -> { label, category, source("BBS"|"BRAC Bangladesh"), coverage(0-64), curated(bool) }. 421 entries; 31 are curated:true. THIS DRIVES ALL DROPDOWNS.
districts: 64 objects -> { geo_level, name, name_google, code, parent(null), climate_zone, lat, lon, metrics{ 421 keys -> value|null } }.


Hard data rules


Every value is at district.metrics[metricKey]. A value may be null (metric/programme absent). NEVER render null as 0 — render em-dash —.
Dropdown labels come from metric_dictionary[key].label. Never show raw keys.
Metric dropdown defaults to curated:true, grouped by category via <optgroup> (label from meta.categories). Add a "Show all 421 metrics" toggle for the full dictionary.
source distinguishes context (BBS 2022) vs BRAC response (2025) — used by Source filter and the scatter's "need vs response" framing.



2. Architecture — geo-level agnostic (drill-down ready)

Schema already supports upazila/union later (geo_level, parent). Do NOT hardcode "district" in logic. Render against a generic units array via getUnits() keyed on state.activeLevel. When upazila/union data is added later (same schema, geo_level:"upazila", parent:<district code>), the same code must work by swapping the active unit set.


3. Visual spec — match the approved design exactly

Light theme. Left sidebar + main content on soft lavender page bg.

CSS variables (strict):

--magenta:#EC008C;  /* primary: logo, active nav, primary button, accents, table district names */
--teal:#007161;     /* data-viz: choropleth ramp + scatter accent */
--blue:#3DB7E4; --amber:#FFA100; --purple:#80379B;
--text:#27281C; --text-muted:#4D4F53;
--bg:#FFFFFF; --surface:#F8F8F6; --page:#F4F2F7; --border:#D3D1C7;
font:'Helvetica Neue',Arial,sans-serif;

Sentence case everywhere (except tiny KPI labels). No heavy shadows. Gradients ONLY on map fill + legend. Rounded-8px cards, 0.5px borders, generous whitespace.

Layout: sidebar(220px) | [ KPI strip (Maximum|Minimum|Average|Std dev) ] over [ Data filters card | Spatial distribution card ] over [ Regional data breakdowns | Data correlation analysis ].
Sidebar: DataExplorer wordmark in magenta; sublabel "PROJECT: Bangladesh District Data"; nav Dashboard(active=magenta pill), Map, Insights, Settings (simple inline SVG/Unicode icons). Subtle 0.5px dashed magenta line at 15% opacity under header = BRAC nakshi-kantha stitch motif (understated).


4. Panel behavior — wire to real data

4.1 KPI strip (Max/Min/Avg/Std dev)

Live from the SELECTED metric across currently VISIBLE (filtered) districts, ignoring nulls. Integers with separators; rates/indices to 2 decimals. Std dev = population stdev.

4.2 Filters card


Metric name: dropdown, curated grouped by optgroup, default MPI (or "Poverty Headcount Rate"). "Show all 421" toggle.
BRAC programme: 16 programme keys (brac_programmes category) + "(All)". Choosing one filters to districts where it's non-null (active).
Data source: "(All)"|"BBS"|"BRAC Bangladesh" — filters which metrics are selectable by source.
Value range: dual-handle slider on selected metric min/max; filters districts in range.
Apply filters (magenta) applies; also live-update on change.


4.3 Spatial distribution — REAL CHOROPLETH (correctness requirement)

Reference shows a flat teal shape — that is WRONG. Build a TRUE choropleth where each district is shaded by its value.


Leaflet + Bangladesh district GeoJSON (admin level 2). Fetch at runtime from geoBoundaries:
https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM2/ -> read gjDownloadURL -> fetch that GeoJSON.
If fetch fails, fall back to a bundled bd_districts.geojson in the same folder (note in a comment) and show an inline message, never a blank box.
Clean light basemap (CartoDB Positron) or filled polygons on the card.
Color scale: light mint #E1F5EE -> deep teal #007161, linear on selected metric range. null -> light gray #E8E8E4 + "no data" tooltip.
DISTRICT NAME MATCHING IS CRITICAL — our names differ from GeoJSON. Normalize case/whitespace and apply aliases (our name <- geojson variants):


jsconst NAME_ALIASES = {
  "Bogura":["Bogra"], "Barisal":["Barishal"], "Chattogram":["Chittagong"],
  "Cumilla":["Comilla"], "Cox's Bazar":["Coxs Bazar","Cox'S Bazar"],
  "Jashore":["Jessore"], "Kishoregonj":["Kishoreganj"],
  "Brahmanbaria":["Brahamanbaria","Brahman Baria"],
  "Chapainawabganj":["Nawabganj","Chapai Nawabganj","Chapainababganj"],
  "Netrakona":["Netrokona"], "Lakshmipur":["Laxmipur","Lakshimpur"],
  "Moulvibazar":["Maulvibazar","Moulavibazar"], "Khagrachhari":["Khagrachari"]
};

Build a normalized lookup so all 64 color correctly. Log unmatched GeoJSON features to console.


Tooltip on hover: district name, selected metric value, MPI, vulnerability score, total BRAC reach.
Click district -> selects it (syncs table + scatter). Click is the future drill-down entry point.
Legend: horizontal gradient bar under map, min left / max right, caption "Value distribution density".


4.4 Regional data breakdowns (table)


Subtitle = metric label + source/year (e.g. "Poverty Headcount Rate (%) — HIES 2022").
Columns: Geo location (District) | Value. District name magenta. Value right-aligned, formatted, null -> —.
Default sorted desc by value; "Sort by value" toggles asc/desc.
Show top 6; "View all 64 regions" (magenta link) expands full scrollable list.
Row hover highlight; click row -> selects district (pan/highlight map, ring scatter point).


4.5 Data correlation analysis — 64 POINTS ONLY (correctness requirement)

Reference shows a dense cloud — WRONG. We have exactly 64 districts = 64 points.


Chart.js scatter, one point per district (max 64).
X and Y each selectable from the metric dropdown. Defaults that tell the core story: X = UPGP (BRAC response), Y = poverty/HCR (BBS need) — "where need is high, is BRAC responding?".
Point color = climate_zone (consistent categorical palette).
Label outlier points (e.g. Dhaka, Chattogram) — 2-3 farthest from trend.
Draw linear regression trend line; show Pearson r in caption.
Hover tooltip: district + both axis values.
Selecting a district highlights its point (enlarged/ringed).
Skip points where either axis is null; caption "N of 64 shown".



5. Selection & state sync

Single state: { metric, bracProgramme, source, valueRange, selectedDistrict, sortDir, scatterX, scatterY, showAllMetrics, activeLevel }.
Selecting a district (map click OR table row) updates ALL panels: map highlight, table scroll+highlight, scatter ring. Changing metric re-renders KPI strip, map colors, table, legend.


6. Quality bar


All numbers rounded/formatted (toLocaleString, toFixed(2)). No raw floats.
null -> — everywhere; never 0/null/undefined/NaN.
No console errors (unmatched GeoJSON names = warning only).
Map loads ~2s; on GeoJSON failure show inline message in the map card.
Responsive: <=1024px stacks panels, sidebar -> top bar.
Accessibility: real button/select, labels, focus states.


7. Do NOT

No React/Vue/build tools. No dark mode. No emoji. No ALL CAPS (except tiny KPI labels). No fake/placeholder data — every number from master_data.json. No alert(). No position:fixed tooltips. Do not hardcode district names in logic — iterate the data.

8. Structure inside index.html

style (vars+grid+components) -> body (sidebar / kpi / filters+map / table+scatter) -> script:
1 fetch json; 2 state + getUnits(); 3 utils fmt/stdDev/linReg/colorScale/normalizeName; 4 buildMetricDropdown(optgroups+show-all); 5 initMap+renderChoropleth+alias join; 6 renderKPIs; 7 renderTable+sort+select; 8 initScatter+updateScatter+trend+outliers; 9 bindFilters + selectDistrict() syncs all; 10 init() on DOMContentLoaded.