# BRAC DataExplorer — Four Enhancements (Design)

_Date: 2026-07-12 · Target: existing `index.html` (vanilla CSS/JS, Leaflet + Chart.js)_

## Context & scope

The user supplied a generation-style prompt ("build a Tailwind dashboard…") describing four
capabilities. Decision (confirmed with user): **do NOT rebuild.** These are four localized
enhancements added into the existing, debugged `index.html` deliverable. The "Tailwind CSS"
wording is treated as boilerplate and ignored — the project stays vanilla CSS/JS so all prior
work is preserved (Manikganj data-bug fix, MVI page, NEET merge, BRAC styling).

Work is sequenced by blast radius: safe localized edits first, the global layout change last.

CDN additions: **html2canvas** (for map raster export). Everything else uses existing libs
or pure JS.

---

## Feature A — Nationwide vulnerability-rank tooltip (Map + MVI views)

**Goal:** hovering any district shows its structural vulnerability ranking relative to all 64.

**Data (verified):** `Weighted_avg_composite_score_vulnerability` has 64/64 coverage; higher
score = more vulnerable (Madaripur 11.76 highest, matches its highest-poverty status;
Noakhali 1.61 lowest). So **rank 1 = most vulnerable**, clean 1–64, no null/"unranked" case.

**Implementation:**
- After data load (in `init()`), build `state.vulnRankByCode`: districts sorted by the score
  descending, `rank = index + 1`. Computed once; independent of any filter (it is a
  *nationwide* rank, always over all 64).
- `tooltipHTML(u)` (~line 1534): append `Vulnerability rank: <r> of 64 nationwide`.
- `mviTooltipHTML(u)` (~line 2619): append the same line.

**Out of scope:** re-ranking by the currently-selected metric, or by the MVI composite score
(that already has its own tier pills). This tooltip rank is fixed to the composite vulnerability
score per the user's choice.

---

## Feature B — Yellow proportional programme-reach bubbles (Map view)

**Goal:** selecting a Programme overlays bubbles whose size is proportional to that programme's
reach per district; bubbles are small, yellow, and sit within the district boundary.

**Current state:** `renderProgrammeMarkers()` (~line 1559) already overlays magenta
`L.circleMarker`s sized by min-max-normalized reach (floor 5px, cap 16px).

**Changes:**
- Fill colour → **yellow `#FDB913`**, white stroke (`weight:1.5`). (Note: yellow is outside
  BRAC's stated palette, but explicitly requested — followed as-is.)
- Sizing → **area-proportional**: `radius = floor + k·√(value)` normalized so the max reach maps
  to the cap. Small range: floor ~3px, cap ~11px, so bubbles stay inside the polygon **at the
  map's default zoom**.
- Keep `L.circleMarker` (pixel radius → honest visual comparison of reach across districts).
- Keep existing behaviour: bubble only where the programme is active (non-null), hover shows
  district name + reach value, click selects the district.

**Known limitation (stated, not hidden):** a pixel-radius bubble is screen-constant, so at very
low zoom a bubble can visually exceed a tiny district. "Within boundary" holds at default zoom.

---

## Feature C — Export controls

Confirmed scope: **tables → CSV**, **charts/map → PNG + JPG**. (No PDF, no SVG.)

### C1. Table → CSV (pure JS, no library)
- A compact "Download ⌄" control (menu with a single **CSV** item) on:
  - **Regional data breakdowns** table (Map view).
  - **MVI ranked table**.
- Exports the **full currently sorted + filtered row set** (not just the top-10 slice):
  district name + value column(s). MVI CSV includes rank, district, division, score, tier,
  households, and one column per selected indicator (matching the on-screen grid).
- Implementation: build a CSV string (quote/escape fields), `Blob` + object URL, trigger
  download with a dated filename (e.g. `brac-regional-<metric>-YYYY-MM-DD.csv`).

### C2. Chart / Map → PNG & JPG
Small overlay utility menu (PNG / JPG items) on: the **scatter chart**, the **Map-view
choropleth panel**, and the **MVI choropleth panel**.

- **Scatter (Chart.js):** native `chart.toBase64Image('image/png')` / `('image/jpeg', 0.92)`
  → download. Reliable.
- **Maps (Leaflet):** confirmed to include the **basemap tiles** (full on-screen render). Use
  `html2canvas` on the map card element. Set `crossOrigin: true` on the basemap `L.tileLayer`
  and call html2canvas with `useCORS: true` so tiles don't taint the canvas.
  - **Landmine (explicit):** html2canvas over Leaflet's transformed panes + external tiles can
    still fail or taint. **Graceful fallback:** wrap in try/catch; on failure show a small
    user-facing message ("Map image export failed in this browser") rather than throwing.
  - **Verification caveat:** this path cannot be confirmed from logic alone and the Chrome
    extension was not connected in prior sessions. It must be **spot-checked in a real browser**
    before being claimed as working. Chart PNG/JPG and CSV exports do not carry this caveat.

---

## Feature D — Zero-scroll responsive layout (highest risk — done last)

**Goal:** the app fits the viewport with no page scroll; only data tables scroll internally.
Responsive from mobile to ultrawide.

**Approach:**
1. **Audit first** — open the running app and observe what actually overflows at laptop size
   on each page. MVI already uses `.mvi-layout{height:calc(100vh - 96px)}`; Map/Correlation
   may already be close. Fix only real overflow; do not rewrite working layout.
2. **Bounded target (confirmed with user):**
   - **Laptop → ultrawide (≥1024px):** hard zero page-scroll. `overflow:hidden` on the page
     shell; scrolling confined to data tables via `overflow:auto` on their scroll containers.
     Panels flex to fill height.
   - **Mobile / small (<1024px):** clean column-stacking that scrolls normally via an existing-
     style `@media` override that drops the fixed viewport height. True zero-scroll on a phone
     would make dense panels unusable — explicitly accepted as graceful stacking, not a hard
     constraint.
3. Keep the existing design language (spacing, cards, BRAC colours). No visual redesign.

---

## Sequencing / build order

1. Feature A (rank tooltip) — localized, verifiable by data.
2. Feature B (yellow bubbles) — localized edit to one function.
3. Feature C1 (CSV export) — additive, pure JS.
4. Feature C2 (PNG/JPG export) — additive; map path flagged needs-browser-verify.
5. Feature D (layout) — audit, then bounded fixes. Last, because it can regress A–C.

## Testing / verification

- **A:** assert `vulnRankByCode` has 64 unique ranks 1–64, Madaripur = 1, Noakhali = 64
  (headless Node check against `master_data.json`).
- **B:** confirm bubbles render yellow, count matches programme coverage (e.g. BHP 61/64),
  radius monotonic in reach.
- **C1:** open a CSV, confirm row count = full filtered set and columns match the grid.
- **C2:** chart PNG/JPG download works; **map export must be clicked through in a real browser**
  (landmine) — not claimed done on logic alone.
- **D:** at ≥1024px no page scrollbar on all three pages; tables still scroll; at <1024px
  content stacks and remains usable.

## Non-goals

- No rebuild / Tailwind migration.
- No PDF or SVG export.
- No new pages, metrics, or data files.
- No re-ranking tooltip by arbitrary metric.
