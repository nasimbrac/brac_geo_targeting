# -*- coding: utf-8 -*-
"""
Generate the data-collection templates the BRAC data team will follow.

Reads master_data.json (the live dashboard data) and emits:
  1) codebook.csv        - the schema: one row per FIELD (identity + every indicator)
                           with type, unit, category, source, observed range, null rule.
  2) data_template.csv   - WIDE layout: one row per district (64), identity columns
                           pre-filled, every indicator column left blank to be collected.

Run:  python make_data_templates.py
"""
import json, csv, statistics

SRC = "master_data.json"

with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

meta       = data["meta"]
dictionary = data["metric_dictionary"]
districts  = data["districts"]
cat_labels = meta.get("categories", {})

# ---- identity (non-metric) columns, in the order the data team should see them ----
IDENTITY = [
    # field_name, display_label, data_type, unit, required, nullable, description
    ("code",         "Geo code",        "text",       "code",     "yes", "no",
        "Unique ID for the geo unit, e.g. BD4001. Must be stable and never reused."),
    ("name",         "Geo name",        "text",       "name",     "yes", "no",
        "Official English name of the district/upazila/union."),
    ("name_google",  "Name (map match)","text",       "name",     "yes", "no",
        "Name used to match the map boundary. Usually identical to 'name'."),
    ("geo_level",    "Geo level",       "text",       "category", "yes", "no",
        "One of: district | upazila | union. Same schema supports all three."),
    ("parent",       "Parent code",     "text",       "code",     "no",  "yes",
        "Code of the parent geo unit (blank for districts; district code for upazilas, etc.)."),
    ("climate_zone", "Climate zone",    "text",       "category", "yes", "no",
        "One of: " + ", ".join(meta.get("climate_zones", []))),
    ("lat",          "Latitude",        "decimal",    "degrees",  "yes", "no",
        "Centroid latitude in decimal degrees (e.g. 22.3288)."),
    ("lon",          "Longitude",       "decimal",    "degrees",  "yes", "no",
        "Centroid longitude in decimal degrees (e.g. 89.7440)."),
]
IDENTITY_KEYS = [r[0] for r in IDENTITY]


def infer(key, info):
    """Infer (data_type, unit) for an indicator from its key, label and real values."""
    vals = [d["metrics"].get(key) for d in districts]
    present = [v for v in vals if v is not None]
    has_null = any(v is None for v in vals)

    label = (info.get("label") or key)
    klow  = key.lower()

    # categorical text (e.g. Quintile_HIES_22 = "Low(Q2)")
    if present and all(isinstance(v, str) for v in present):
        return "text", "category", has_null, present

    # numeric: decide integer vs decimal, then unit
    is_int = present and all(isinstance(v, (int)) and not isinstance(v, bool) for v in present) \
             and all(float(v).is_integer() for v in present)

    # unit by naming convention
    if "pct" in klow or klow.endswith("_pct") or label.strip().startswith("%") or "rate" in klow:
        unit = "percent"          # 0-100
    elif klow.startswith(("num", "no_of", "number")) or label.strip().startswith(("#", "num", "Number")):
        unit = "count"
    elif any(t in klow for t in ("ratio", "mpi", "cvi", "_ci", "score", "_index", "growth")) \
         or key in ("A", "H_Harmonised_National_MPI"):
        unit = "index/ratio"
    else:
        unit = "count" if is_int else "index/ratio"

    dtype = "integer" if is_int and unit == "count" else "decimal"
    return dtype, unit, has_null, present


def numfmt(x):
    if isinstance(x, float):
        return f"{x:g}"
    return str(x)


# ---------------- 1) codebook.csv ----------------
COLS = ["field_name", "display_label", "group", "category", "category_label",
        "source", "data_type", "unit", "nullable", "required",
        "observed_min", "observed_max", "example_value", "null_meaning", "description"]

rows = []

# identity rows first
for fn, lbl, dt, unit, req, nul, desc in IDENTITY:
    example = next((d.get(fn) for d in districts if d.get(fn) not in (None, "")), "")
    rows.append({
        "field_name": fn, "display_label": lbl, "group": "identity",
        "category": "", "category_label": "",
        "source": "geo registry", "data_type": dt, "unit": unit,
        "nullable": nul, "required": req,
        "observed_min": "", "observed_max": "", "example_value": numfmt(example),
        "null_meaning": "blank = not applicable" if nul == "yes" else "",
        "description": desc,
    })

# one row per indicator, in dictionary order
for key, info in dictionary.items():
    dtype, unit, has_null, present = infer(key, info)
    cat = info.get("category", "")
    nums = [v for v in present if isinstance(v, (int, float)) and not isinstance(v, bool)]
    omin = numfmt(min(nums)) if nums else ""
    omax = numfmt(max(nums)) if nums else ""
    example = numfmt(present[0]) if present else ""
    null_meaning = ""
    if has_null:
        null_meaning = ("blank = programme NOT active in this geo unit (not 'zero', not 'missing')"
                        if cat == "brac_programmes"
                        else "blank = value not collected / not available for this geo unit")
    rows.append({
        "field_name": key,
        "display_label": info.get("label", key),
        "group": "indicator",
        "category": cat,
        "category_label": cat_labels.get(cat, cat),
        "source": info.get("source", ""),
        "data_type": dtype,
        "unit": unit,
        "nullable": "yes" if has_null else "no",
        "required": "no",
        "observed_min": omin,
        "observed_max": omax,
        "example_value": example,
        "null_meaning": null_meaning,
        "description": info.get("label", key),
    })

with open("codebook.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)

# ---------------- 2) data_template.csv (WIDE) ----------------
metric_keys = list(dictionary.keys())
header = IDENTITY_KEYS + metric_keys

with open("data_template.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(header)
    for d in districts:
        ident = [d.get(k, "") if d.get(k) is not None else "" for k in IDENTITY_KEYS]
        blanks = [""] * len(metric_keys)   # metric values to be collected
        w.writerow(ident + blanks)

print(f"codebook.csv:       {len(rows)} field rows ({len(IDENTITY)} identity + {len(dictionary)} indicators)")
print(f"data_template.csv:  {len(districts)} district rows x {len(header)} columns "
      f"({len(IDENTITY_KEYS)} identity + {len(metric_keys)} indicators)")
