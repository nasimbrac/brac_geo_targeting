---
name: Human-Centric Data Intelligence
colors:
  surface: '#fff8f8'
  surface-dim: '#f0d3db'
  surface-bright: '#fff8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0f3'
  surface-container: '#ffe8ee'
  surface-container-high: '#ffe1e9'
  surface-container-highest: '#f9dbe3'
  on-surface: '#27171d'
  on-surface-variant: '#5a3f49'
  inverse-surface: '#3e2b32'
  inverse-on-surface: '#ffecf0'
  outline: '#8e6f79'
  outline-variant: '#e2bdc8'
  surface-tint: '#b8006c'
  primary: '#b30069'
  on-primary: '#ffffff'
  primary-container: '#e00085'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb0cc'
  secondary: '#006b5c'
  on-secondary: '#ffffff'
  secondary-container: '#9bf3de'
  on-secondary-container: '#017261'
  tertiary: '#006481'
  on-tertiary: '#ffffff'
  tertiary-container: '#007ea2'
  on-tertiary-container: '#fbfdff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9e4'
  primary-fixed-dim: '#ffb0cc'
  on-primary-fixed: '#3e0021'
  on-primary-fixed-variant: '#8d0051'
  secondary-fixed: '#9bf3de'
  secondary-fixed-dim: '#7fd6c3'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005145'
  tertiary-fixed: '#bee9ff'
  tertiary-fixed-dim: '#68d3ff'
  on-tertiary-fixed: '#001f2a'
  on-tertiary-fixed-variant: '#004d64'
  background: '#fff8f8'
  on-background: '#27171d'
  surface-variant: '#f9dbe3'
typography:
  display-lg:
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  caption:
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  margin-page: 32px
  gutter: 16px
  container-max: 1440px
  padding-card: 24px
  padding-input: 12px 16px
---

## Brand & Style
This design system is built for a professional, NGO-grade data analytics environment. It balances technical precision with a human-centric warmth, moving away from cold corporate aesthetics toward a "Literate Data" approach. The personality is authoritative yet accessible, designed to facilitate deep focus while acknowledging the social impact of the data being explored.

The style is a refined **Minimalism** with **Modern/Corporate** influences. It utilizes a flat design language, emphasizing clarity through generous whitespace and crisp, thin borders rather than depth effects like shadows or gradients. A subtle cultural signature—inspired by the *Nakshi Kantha*—is woven into the interface through delicate dashed accents, grounding the high-tech tool in a craft-based heritage.

## Colors
The palette is diverse yet disciplined, reflecting the varied nature of international development data. 

- **Primary Magenta (#EC008C):** Used sparingly for key actions, brand moments, and as a 15% opacity dashed motif.
- **Data Accents:** Teal, Blue, and Amber serve as functional identifiers for data categorization, chart series, and status indicators.
- **Surfaces:** The interface uses a layered neutral strategy. A soft Lavender (#F4F2F7) serves as the base page background to reduce eye strain, while pure White (#FFFFFF) defines the primary workspace and "Surface Alt" (#F8F8F6) identifies sidebar or secondary navigation areas.
- **Typography:** Contrast is maintained using a "Near-black" (#27281C) for maximum legibility and a neutral Gray (#4D4F53) for metadata and helper text.

## Typography
The typography system relies on the ubiquity and neutrality of **Helvetica Neue** (falling back to Arial). It is optimized for high information density and data readability.

- **Casing Rules:** Use **sentence case only** across all UI elements, including buttons, headers, and labels. **Never use all-caps**, as it diminishes the human-centric and accessible tone of the brand.
- **Alignment:** Data in tables should be tabular-lined where possible. Use optical alignment for icons and labels.
- **Visual Hierarchy:** Differentiation is achieved through weight (Regular, Medium, Bold) rather than excessive size variations, maintaining a stable and professional appearance.

## Layout & Spacing
The system follows a strict **8px grid** to ensure consistency across the data-heavy interface.

- **Grid System:** Use a 12-column fluid grid for dashboard layouts with 16px gutters.
- **Margins:** Standard page margins are set to 32px to provide a generous "breathing room" around complex data visualizations.
- **Information Density:** While the overall aesthetic values whitespace, data tables and property panels can transition to a "compact" mode using a 4px increment to ensure users can view large datasets without excessive scrolling.
- **Breakpoints:** 
  - **Desktop:** >1024px (12 columns)
  - **Tablet:** 768px - 1023px (8 columns)
  - **Mobile:** <767px (4 columns, stacks vertically)

## Elevation & Depth
This design system intentionally avoids physical depth metaphors. There are **no box-shadows** used in the UI. 

Depth is communicated through **Tonal Layers** and **Structural Outlines**:
- **Z-Index 0:** Page Background (#F4F2F7).
- **Z-Index 1:** Workspace Cards and Main Content (#FFFFFF) with a 0.5px border (#D3D1C7).
- **Z-Index 2:** Modals and Popovers (#FFFFFF) with a 1px border (#D3D1C7) to distinguish them from the background layer.
- **Nakshi Accent:** A thin, dashed Magenta line (15% opacity) can be used as a structural divider or a top-border accent on cards to provide a rhythmic visual break without adding "weight" to the layout.

## Shapes
The shape language is "Soft-Modern." Elements use a consistent **8px (0.5rem) corner radius** to make the professional environment feel approachable.

- **Containers:** Dashboard cards, input fields, and main containers use the 8px radius.
- **Small Elements:** Tooltips and tags may use a slightly reduced 4px radius if they are smaller than 24px in height.
- **Borders:** All borders must be 0.5px in weight using the #D3D1C7 color. This creates a high-precision, "technical drawing" feel that aligns with data analytics.

## Components
- **Buttons:** Use solid fills for primary actions (Teal or Magenta). Secondary buttons should be "Ghost" style with 0.5px borders. Use sentence case for all button labels.
- **Cards:** White background (#FFFFFF), 8px rounded corners, 0.5px border (#D3D1C7). For dashboard sections, a thin dashed magenta line at 15% opacity can be placed at the very top of the card as an accent.
- **Input Fields:** 0.5px border, 8px radius, White background. Use Gray (#4D4F53) for placeholder text. Labels should always sit above the field in Near-black (#27281C).
- **Data Tables:** Row lines should be 0.5px #D3D1C7. Header backgrounds should be Surface Alt (#F8F8F6). No vertical lines between columns; use generous 16px padding for separation.
- **Chips/Tags:** Use low-saturation backgrounds derived from the Teal, Blue, or Amber palette (approx 10% opacity) with full-saturation text for categorized data.
- **The Motif:** The dashed Nakshi Kantha line should be used as a separator in long-form reports or as a decorative element in the sidebar footer, always at 15% opacity Magenta.