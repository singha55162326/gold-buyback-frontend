# Khamphouvong Gold Shop — UI Style Guide

Use this guide to update any screen of ລະບົບບໍລິຫານຈັດການຮ້ານຄຳ (ຮ້ານຄຳພູວົງ) so it matches the Login and Dashboard designs.
Style: premium and luxury. Warm glassmorphism. Burgundy and gold.

Reference files: `Login.dc.html`, `Dashboard.dc.html` (dark), `Login Light.dc.html`, `Dashboard Light.dc.html` (light).

## Rules
- Keep all existing copy (Lao and English) exactly as it is. Change only the styling.
- The background is static. Do not add animated, drifting, or pulsing background effects.
- The only motion is a fade-in when the page loads (see Motion) plus hover and press feedback.
- Use only the tokens below. Do not add new hues.
- Never use pure white (#fff) or pure black (#000) as a surface or as text.

## Typography
| Role | Font | Weight | Size |
|---|---|---|---|
| Brand name / page H1 | Noto Serif Lao | 700 | 34px (H1), 18px (sidebar brand) |
| UI text, labels, data | Noto Sans Lao | 300–600 | 13–15px body, 24–26px stat values |
| Latin wordmark / tagline | Cormorant Garamond | 500–600 | 11–15px, letter-spacing 0.3–0.42em, uppercase |

- Section labels (card titles, table headers): 11.5px, weight 500, letter-spacing 0.05–0.06em, gold.
- Numbers: `font-variant-numeric: tabular-nums`. Right-align numbers in tables.
- The brand name and H1 use a gold gradient on the text (see Gold gradient).

```
Google Fonts: Noto+Sans+Lao:wght@300;400;500;600;700 · Noto+Serif+Lao:wght@600;700 · Cormorant+Garamond:wght@500;600
```

## Color tokens

### Dark theme (default)
| Token | Value |
|---|---|
| Page background | `radial-gradient(ellipse 120% 90% at 30% 0%, #6e0f0f 0%, #3a0707 45%, #160404 100%)`, base `#1a0606` |
| Glow (gold) | `radial-gradient(circle, rgba(214,160,62,0.45), transparent 65%)` + `blur(30px)` |
| Glow (red) | `radial-gradient(circle, rgba(178,34,34,0.6), transparent 65%)` + `blur(30px)` |
| Texture | `repeating-linear-gradient(135deg, rgba(232,196,106,0.022) 0 1px, transparent 1px 22px)` |
| Glass surface | `linear-gradient(150deg, rgba(255,236,200,0.12), rgba(255,220,170,0.04))` |
| Glass border | `1px solid rgba(240,204,130,0.26)`. Hover: `0.5`. Active: `0.45–0.8` |
| Inner highlight | `inset 0 1px 0 rgba(255,240,210,0.25)` |
| Recessed (inputs, chips, table head) | `rgba(20,4,4,0.3–0.35)` + `inset 0 1px 2px rgba(0,0,0,0.3)` |
| Text primary | `#f7ead2` · strong `#fbf0d8` |
| Text muted | `rgba(247,234,210,0.62–0.86)` |
| Gold (labels, icons, links) | `#e8c46a` · icon stroke `#d9b465` · light `#fbe7b0` · mid `#f3d998` |
| Success | dot `#5fd38d`, text `#9df0bd`, bg `rgba(95,211,141,0.14)`, border `rgba(95,211,141,0.35)` |

### Light theme
| Token | Value |
|---|---|
| Page background | `radial-gradient(… #fffaf0 0%, #f6ebd6 50%, #ead8b8 100%)`, base `#f4ead8` |
| Glow (gold / red) | `rgba(214,160,62,0.42)` / `rgba(200,70,50,0.2)` |
| Glass surface | `linear-gradient(150deg, rgba(255,255,255,0.62), rgba(255,248,236,0.38))` |
| Glass border | `rgba(168,118,36,0.26)` |
| Inner highlight | `inset 0 1px 0 rgba(255,255,255,0.9)` |
| Recessed | `rgba(255,255,255,0.7)` |
| Text primary | `#3b1a0c` · strong `#2e1208` · muted `rgba(59,26,12,0.62–0.86)` |
| Gold | `#a87424` · dark `#7a4a0e` · mid `#8a5a12` |
| Success text | `#1f7a45` |
| **Sidebar and header** | Red glass: `linear-gradient(170deg, rgba(150,22,18,0.94), rgba(96,10,8,0.96))`. Inside them, use the **dark-theme** text, gold, border, and recessed tokens. |
| Login brand panel | `linear-gradient(160deg, rgba(128,20,16,0.9), rgba(78,10,8,0.94))` with gold `#e8c46a` text |

### Gold gradient
- Text, dark theme: `linear-gradient(180deg, #fbe7b0 0%, #e2b553 55%, #b8862c 100%)`. Apply with `background-clip: text; color: transparent`.
- Text, light theme: `linear-gradient(180deg, #c99a3c 0%, #9a6a1c 55%, #6b430c 100%)`.
- Primary button and avatar (both themes): `linear-gradient(180deg, #f8e2a4 0%, #e3b65a 48%, #c08f32 100%)`. Text on it is `#3a0a04`.

## Surfaces
- **Glass card:** radius 18px. Padding 20–24px. `backdrop-filter: blur(20px) saturate(140%)`. Shadow `0 18px 40px -22px rgba(0,0,0,0.6)` plus the inner highlight. Optional corner glow: a 120px circle `rgba(232,196,106,0.18)` placed at top-right, offset -40px.
- **Large panels** (login card, table card): radius 20–28px. Blur 24–26px.
- **Background:** the page gradient, 2–3 static glow circles (position fixed, `pointer-events:none`), and the diagonal texture. Place the glows partly off-screen at the corners.
- **Dividers:** a 1px line `linear-gradient(90deg, transparent, rgba(232,196,106,0.5), transparent)`, optionally with a 6px rotated-square gold diamond in the center.
- **Table rows:** border-bottom `rgba(240,204,130,0.1)`. Hover `rgba(232,196,106,0.06)`. Sell-price column in gold `#f3d998`, weight 600.

## Layout
- **App shell:** grid `272px minmax(0,1fr)`. 16px outer gutter. All main blocks float as glass panels with gaps.
- **Sidebar:** sticky, full height, radius 22px. Contents from top: brand (46px logo + name + KHAMPHOUVONG), gradient divider, search input (42px, radius 12px), then the nav.
  - Group header: 12px, weight 600, gold. Count chip: 18px pill with gold tint. Chevron rotates 90° when open.
  - Child items: indented, with a 1px gold left rule. 13.5px text. Section ref (e.g. §4.1) at 10px, muted, right-aligned.
  - Active item: `linear-gradient(90deg, rgba(232,196,106,0.26), rgba(232,196,106,0.08))`, border `rgba(240,204,130,0.45)`, glow `0 6px 18px -8px rgba(226,170,70,0.55)`, text `#fbe7b0`, weight 600.
- **Header:** sticky at top 16px, radius 18px, padding `12px 14px 12px 24px`. Left: page title (15px, 600) over the TOR ref (11px, gold). Right: theme toggle, notification button, user chip. All controls are 42px tall, radius 12px, on the recessed surface. The avatar is a 32px gold-gradient square.
- **Page head:** H1 (gold gradient) and a 14px light greeting below it.
- **Stat grid:** `repeat(auto-fit, minmax(230px, 1fr))`, gap 16px. Card contents: label, then 24px value, then 12px muted sub-line.
- **Forms:** label 13px gold, input 52px tall, radius 14px, leading 18px line icon. The primary button is 54px tall with the gold gradient.

## Icons
1.6–2px stroke line icons, 16–18px, in gold. No emoji. Use the PV logo (`assets/pv_logo.png`) as provided, with `drop-shadow(0 4–8px 10–24px rgba(0,0,0,0.4))`.

## Motion
- **Page load:** add `data-fade` to each major block (sidebar, header, title, each card, table). On mount, animate them in order:
  ```js
  document.querySelectorAll('[data-fade]').forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 700, delay: 80 + i * 60, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
  ```
- **Hover:** cards lift `translateY(-2px)` and their border brightens. The primary button lifts 1px and its glow strengthens. Transitions take .15–.2s.
- **Do not animate the background.**

## Accessibility
- Text contrast must be at least 4.5:1 against its surface. On glass, always use the full-strength text tokens for primary text.
- Interactive targets are at least 42px tall.
