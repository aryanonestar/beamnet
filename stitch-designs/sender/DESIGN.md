---
name: BEAM-NET Terminal
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#c0c1ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#9a9dff'
  on-tertiary-container: '#211cb4'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: -0.05em
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.4'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.1em
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max: 1440px
---

## Brand & Style

The design system is a high-performance, technical interface designed for rapid data synthesis and system monitoring. It draws heavily from **Industrial Minimalism** and **Cyber-Technoeconomic** aesthetics, prioritizing high-density information display without visual clutter.

The interface evokes a sense of "The command center"—a digital environment that is authoritative, precise, and uncompromisingly functional. It utilizes a dark, low-light environment to reduce eye strain for long-duration operation, while employing luminous accent colors to direct attention to critical system states.

The visual style is characterized by:
- **Sharp Precision:** Strict adherence to 0px radii for all structural components.
- **Luminous Hierarchy:** Using "Cyber Cyan" and "Emerald Green" as active light sources against a deep charcoal void.
- **Data-First Utility:** A dual-typography system that separates human-readable labels from machine-generated data.

## Colors

This design system uses a deeply desaturated foundation to allow functional colors to pop with maximum intensity.

- **Foundation:** The primary background is Zinc-950 (`#09090b`). Surfaces and containers use Zinc-900 (`#18181b`) to create subtle depth without relying on shadows.
- **Interaction (Cyber Cyan):** Used for all interactive elements, hover states, and primary navigational links. It represents the "Beam" of the network.
- **Status (Emerald Green):** Reserved strictly for success states, active system pulses, and positive data trends.
- **Alert (Amber/Rose):** Use sparingly for warnings. 
- **Borders:** Use Zinc-800 (`#27272a`) for standard structural division. Active elements receive a `1px` solid Cyan or Emerald border with a subtle outer glow (bloom).

## Typography

The typography system is bifurcated to distinguish between **Interface Infrastructure** and **Dynamic Data**.

1.  **Inter (Sans-Serif):** Used for structural navigation, headers, and instructional text. It provides the "human" layer of the interface.
2.  **JetBrains Mono (Monospace):** Used for all numerical data, status readouts, code snippets, and timestamping. Monospace ensures that changing values don't cause layout "jitter" and maintains the technical, industrial aesthetic.

**Formatting Rules:**
- Use `label-xs` for all field headers and metadata tags.
- Data points should never use Inter; they must always be rendered in JetBrains Mono to signify "System Output."

## Layout & Spacing

This design system utilizes a **Rigid Grid** model based on 4px increments. All elements must align to a strict 12-column grid on desktop and a 4-column grid on mobile.

- **Gutters:** Fixed at 16px to maintain a dense, technical feel.
- **Margins:** 32px on desktop to provide a "frame" for the terminal.
- **Layout Philosophy:** Components should feel like "modules" slotted into a rack. Use solid borders to define edges rather than whitespace alone. 
- **Density:** Information density is high. Use padding sparingly (8px to 12px within cards) to maximize data visibility.

## Elevation & Depth

In this design system, depth is achieved through **Luminance and Opacity** rather than physical shadows.

- **Z-0 (Base):** Zinc-950. The background void.
- **Z-1 (Surface):** Zinc-900. Used for card backgrounds and sidebars.
- **Z-2 (Overlay):** Zinc-800. Used for tooltips or elevated modal windows.
- **Glow (Bloom):** Critical elements (active tabs, primary buttons) utilize a 4px to 8px box-shadow blur with a low-opacity color tint (e.g., `rgba(34, 211, 238, 0.2)`) to simulate a glowing cathode-ray tube or LED indicator. 
- **Outlines:** All containers use a `1px` solid border. Never use rounded corners or soft drop-shadows.

## Shapes

The shape language is strictly **Geometric and Angular**. 

- **Corners:** All elements (Buttons, Cards, Inputs, Tags) must have a `0px` border radius. 
- **Accents:** Small 45-degree "dog-ear" clips can be used on the top-right corner of cards to indicate "expandable" or "technical" modules.
- **Icons:** Use stroke-based icons with a 1.5px or 2px weight. Avoid filled shapes.

## Components

### Stat Tiles
The core unit of the dashboard. Features a `label-xs` title in the top-left, a large `data-lg` value in the center, and a 1px `accent_emerald` bottom border if the data is active.

### Progress Bars
Thin (4px) horizontal tracks. The "unfilled" portion is Zinc-800. The "filled" portion is a solid Cyan or Emerald block. No rounded caps. For high-importance bars, add a subtle glow to the leading edge of the progress.

### Dropzone Cards
Dashed Zinc-700 borders. On file-hover, the border transitions to solid `accent_cyan` with a `label-xs` readout showing "READY FOR UPLOAD".

### Navigation Tabs
Vertical or horizontal. Active states are indicated by a 2px solid Cyber Cyan line on the "inside" edge of the tab and a faint Cyan background tint (5% opacity).

### Buttons
- **Primary:** Solid Cyan background, Black text, sharp corners.
- **Secondary:** Transparent background, 1px Cyan border, Cyan text.
- **Ghost:** No border, Cyan text, Zinc-800 hover state.

### Input Fields
Dark backgrounds (Zinc-950) with 1px Zinc-800 borders. On focus, the border changes to `accent_cyan` and the label shifts color to match. Use Monospace text for the input value.