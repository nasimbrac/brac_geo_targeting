# BRAC DataExplorer — Data Collection Format (for the Data Team)

This is the format to use when collecting data for **any** indicator or programme
(MF, BEP, a new programme, a new census indicator, etc.) so it drops straight into
the dashboard without rework. Two files define everything:

| File | What it is | Who fills it |
|---|---|---|
| `codebook.csv` | The **specification** — every column's name, type, unit, allowed values, and rules. | Reference only (and append a row when adding a brand-new indicator). |
| `data_template.csv` | The **collection sheet** — one row per district (64), identity columns already filled, every indicator column blank and ready for values. | Data team enters values here. |

---

## 1. Layout (WIDE)

- **One row = one geo unit** (a district now; the same sheet supports upazila/union later).
- **One column = one indicator** (plus the 8 identity columns at the start).
- Open in Excel/Google Sheets, type values under each indicator column, save as CSV (UTF-8).

```
code,   name,     name_google, geo_level, parent, climate_zone, lat,     lon,    MF,     BEP, HCR_Upper_pct_HIES_22, ...
BD4001, Bagerhat, Bagerhat,    district,  ,       Coastal,      22.3288, 89.744, 183333, 774, 13.7,                  ...
```

> Do **not** rename, reorder, or delete the identity columns or the indicator codes
> in the header row — the dashboard matches on those exact codes.

---

## 2. The 8 identity columns (already filled for all 64 districts)

| Column | Type | Rule |
|---|---|---|
| `code` | text | Stable unique ID, e.g. `BD4001`. Never change or reuse. |
| `name` | text | Official English name. |
| `name_google` | text | Name used to match the map shape — keep equal to `name`. |
| `geo_level` | text | `district` \| `upazila` \| `union`. |
| `parent` | text | Blank for districts; the parent's `code` for upazila/union. |
| `climate_zone` | text | One of: Barind, CHT, Coastal, Haor, Other, River & Char, River-Char. |
| `lat` / `lon` | decimal | Centroid in decimal degrees. |

For a **new geo unit** (e.g. adding upazilas) add a new row and fill these 8 yourself.

---

## 3. Indicator columns — the value types

Every indicator in `codebook.csv` is one of these `data_type` / `unit` combinations.
Enter values in that form, **numbers only — no `%`, no commas, no text units**:

| `unit` | Meaning | Enter as | Example |
|---|---|---|---|
| `count` | A headcount / number of people/households | whole integer | `183333` |
| `percent` | A percentage 0–100 | decimal, no `%` sign | `13.7` |
| `index/ratio` | An index, rate, ratio, or score | decimal | `0.52`, `98.97` |
| `degrees` | Map coordinate | decimal | `22.3288` |
| `category` | A fixed text label | exact text from codebook | `Low(Q2)` |
| `code` / `name` | Identity text | text | `BD4001` |

The `codebook.csv` also gives `observed_min` / `observed_max` for each numeric
indicator — use them as a **sanity range**. A value far outside that range is
probably a data-entry error (wrong unit, extra digit).

---

## 4. The most important rule: blank vs zero

**Leave a cell BLANK when there is no value. Do not type `0` unless the real measured value is zero.**

- For a **BRAC programme** column (e.g. MF, BEP, UPGP): **blank = the programme is
  not active in that district.** `0` would wrongly mean "active but reached zero people."
- For a **census/context** column: **blank = not collected / not available** for that
  geo unit.

The dashboard treats blank as "no data" (greys out the district, ignores it in
averages, hides its map pin). Typing `0` changes the map colour, the min/avg KPIs,
and the correlation charts — so only use `0` for a true measured zero.

---

## 5. Adding a brand-new indicator or programme

1. Add a **new column** at the end of `data_template.csv` whose header is the indicator
   **code** (short, no spaces, e.g. `NEWPROG` or `num_New_Thing`).
2. Add a **new row** to `codebook.csv` describing it:
   `field_name, display_label, group=indicator, category, source, data_type, unit,
   nullable, null_meaning, description` (copy an existing similar row as a guide).
   - `category` should be one of the existing category codes (see codebook), e.g.
     `brac_programmes` for a new programme.
   - `source` = `BRAC` for programme reach, `BBS` for census/survey context.
3. Fill the values down the new column (blank where not active / not available).

That's all the dashboard needs — the indicator then appears automatically in the
metric dropdowns, map, table, and correlation axes.

---

## 6. Handing back

Return the filled `data_template.csv` (same columns, same 64+ rows). The dashboard
build step converts this wide CSV into the `districts[]` / `metrics{}` and
`metric_dictionary` structure of `master_data.json` automatically — no manual JSON editing.
