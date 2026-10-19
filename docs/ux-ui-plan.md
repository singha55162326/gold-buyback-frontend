# แผนปรับปรุง UX/UI — gold-buyback-frontend

> - **เป้าหมาย:** `D:\KPV\gold-buyback-frontend`
> - **สไตล์อ้างอิงหลัก:** `design.md`
> - **Reference (อ่านอย่างเดียว ห้ามแก้):** `D:\KPV\gold-buyback-frontend-main`
> - **เครื่องมือ:** ui-ux-pro-max v2.15.0 (ใช้ส่วน UX rules) · วางแผนด้วย Opus 5.5 · ลงมือ coding/testing ด้วย Sonnet 5.5 subagent

---

## 0. ข้อค้นพบสำคัญ (อ่านก่อนเริ่ม)

### 0.1 target = baseline ของ -main ทุกไบต์ ยกเว้น 2 ไฟล์

ตรวจครบ 80 ไฟล์ใน `src/` และ `shared/src` ด้วย `git show 1ddbfdc:<path> | diff -q - <target>` พบว่าต่างกันแค่ 1 ไฟล์ บวก config อีก 1 ไฟล์

- **`src/app/(app)/admin/conversion-fees/page.tsx`**
  - target: เวอร์ชันใหม่ 726 บรรทัด (append-only edit/delete, History, Pagination, AuditView)
  - -main: มีแค่ 98 บรรทัด
- **`package.json`**
  - target: `"@kpv/domain": "*"`
  - -main: `"file:./shared"`

### 0.2 -main ทำตาม design.md ครบแล้ว

-main มี 32 commits ตั้งแต่ `1ddbfdc` (baseline) ถึง `0f4689c` ครอบคลุม:
- tokens ทั้ง dark และ light, ฟอนต์ 3 ตัว, Backdrop แบบ static
- glass shell กว้าง 272px, sidebar/header แบบ red-glass
- PageHead, StatCard, Dialog ที่มี focus-trap
- useFadeIn, statusClass, chart theme, print CSS และ style lint

ชุด e2e ใช้ Playwright + axe + contrast guard ผลรันล่าสุดผ่านทั้งหมด

บันทึกการตัดสินใจอยู่ใน `-main/.superpowers/sdd/plan-ux-zippy-diffie/constraints.md` และ `progress.md` **implementer ทุกคนต้องอ่านก่อนเริ่มงาน**

### 0.3 สภาพ repo ของ target ยังไม่ปลอดภัย

- มี `.git` แต่ยังไม่มี commit เลย
- `.gitignore` มีแค่ `".next/" ` (มีเครื่องหมายคำพูดติดมาด้วย) กับ `.next/` จึง**ไม่กัน** `.env`, `.env.local`, `node_modules`, `shared/dist`
- ไม่มี `node_modules` และไม่มี `package-lock.json`
- `"@kpv/domain": "*"` จะติดตั้งด้วย `npm install` ไม่ได้ เพราะไม่มี workspace root

### 0.4 ปัญหา CRLF/LF

ไฟล์ใน target เป็น LF ส่วน working tree ของ -main เป็น CRLF (autocrlf=true)

ให้คัดลอกด้วย `git -C <main> show HEAD:<path>` เท่านั้น **ห้ามใช้ `cp` จาก working tree ของ -main**

### กลยุทธ์ที่แนะนำ

1. Port ไฟล์ที่ restyle แล้วจาก -main HEAD มาทั้งไฟล์ ทำได้ปลอดภัยเพราะ baseline ตรงกันทุกไบต์
2. Restyle `conversion-fees` เวอร์ชันใหม่ด้วยมือ ตาม pattern ของ -main
3. ปิด gap ที่เหลือ: รายการที่ -main พักไว้ (parked) และกฎของ ui-ux-pro-max ที่ -main ยังไม่ได้ทำ

วิธีนี้ทำให้ไม่ต้องเขียน restyle ใหม่ราว 4,000 บรรทัด เหลือแค่คัดลอก ตรวจสอบ แล้วปิด gap

---

## 1. สรุปและเป้าหมาย

### เป้าหมาย

- **สไตล์:** ทุกหน้าตรงกับ design.md
  - warm glassmorphism โทน burgundy/gold
  - dark เป็นค่าเริ่มต้น และมี light theme
  - พื้นหลัง static
  - motion มีแค่ data-fade และ hover/press
- **ห้ามเปลี่ยน:**
  - copy ภาษาลาว/อังกฤษ
  - logic, API, query key, route
- **Accessibility:**
  - contrast ≥ 4.5:1
  - target ≥ 42px
  - focus ring สีทอง
  - มี `aria-label` ครบ
  - ไม่มี emoji ที่ใช้เป็นไอคอน
- **ผ่านการทดสอบทั้งหมด:**
  - typecheck
  - `lint:style` = 0
  - `next build`
  - Playwright: ทุก route × 2 theme × 4 viewport, รวม axe, contrast, fade, dialog, print, states

### design.md vs ui-ux-pro-max: จุดที่ขัดกันและข้อยุติ

| # | ประเด็น | ui-ux-pro-max | design.md / ข้อจำกัดจริง | ข้อยุติ |
|---|---|---|---|---|
| C1 | Palette และฟอนต์ | `--design-system` เสนอ slate/green + Fira | burgundy/gold + Noto Sans Lao / Noto Serif Lao / Cormorant | **ใช้ design.md** ตัด palette/font ของ skill ทิ้งทั้งหมด (style "Glassmorphism" ตรงกัน) |
| C2 | ขนาด target | 44pt/48dp (native) | 42px | ใช้ 42px ซึ่งผ่าน `web-target-size` (WCAG 2.2 AA กำหนด 24px) และ `touch-spacing` ≥ 8px |
| C3 | Letter-spacing ของ section label | — | 0.05–0.06em | ข้อความลาวใช้ไม่เกิน 0.02em และห้าม uppercase เพราะสระ/วรรณยุกต์จะหลุดจากพยัญชนะ ส่วน wordmark ละติน (Cormorant) ใช้ 0.3–0.42em + uppercase |
| C4 | contrast ของ light theme | `color-contrast` 4.5:1 | gold `#a87424` และ success `#1f7a45` ได้ไม่ถึง 4.5 | ข้อความใช้ `--gold` `#7f5110` และ `--success` `#186638` ส่วน `#a87424` ใช้กับ icon/border (`--gold-icon`) → **ควรอัปเดต design.md** (R7) |
| C5 | สี warning/danger | `color-not-only`, `error-feedback` | ห้ามเพิ่ม hue ใหม่ | danger ใช้ตระกูลแดง (glow red), warning ใช้ตระกูลทอง/อำพัน และต้องมี dot + ข้อความเสมอ (`.status-*`) |
| C6 | Motion | Loading indicators | มีแค่ fade + hover/press | skeleton pulse ใช้ได้เฉพาะใน `loading.tsx` และต้องเป็น `motion-safe:` ส่วน dialog/toast ต้องไม่เกิน 0.2s และปิดเมื่อเปิด reduced-motion (ถ้าต้องการแบบเคร่ง ดู R5) |
| C7 | skip-links และ error state | ต้องมีข้อความใหม่ | ห้ามเปลี่ยน copy | error ใช้ข้อความเดิม `'ບໍ່ສຳເລັດ'` + `'ລອງໃໝ່'` ส่วน skip link ต้องมีข้อความใหม่ จึงเป็น optional (R4) และต้องได้รับอนุมัติก่อน |
| C8 | `blur-purpose` | blur เฉพาะ overlay | glass blur คือแบรนด์ | ใช้ตาม design.md แต่**ห้ามซ้อน** backdrop-filter (card ใน card ไม่ใส่ blur) |
| C9 | ฟอนต์ 16px บนมือถือ | `readable-font-size` | body 13–15px | คง 14px ไว้ ห้ามปิด zoom ส่วนตัวเลือก input 16px บนจอ < 640px อยู่ใน R6 |
| C10 | virtualize-lists | — | client pagination 25/หน้า | ใช้ pagination ก็พอ |
| C11 | Chart | ห้ามแยก series ด้วย hue อย่างเดียว | — | `admin/rates` ใช้ `useChartTheme` + dash ต่อ series + ตารางประวัติเป็น fallback ส่วน dashboard **ไม่มี chart และห้ามเพิ่ม** |
| C12 | next/image | "Use next/image" | logo src ตั้งค่าผ่าน env ได้ | คง `<img>` ไว้ แต่เพิ่ม `width`/`height` (R1) |

### กฎของ ui-ux-pro-max ที่นำมาใช้

- **Rule IDs:**
  - การมองเห็นและ contrast: `color-contrast`, `color-not-only`, `focus-states`, `focus-not-obscured`
  - label และ semantics: `aria-labels`, `icon-context`, `form-labels`, `heading-hierarchy`
  - motion และ interaction: `reduced-motion`, `escape-routes`, `web-target-size`, `touch-spacing`, `tap-delay`, `cursor-pointer`
  - feedback และ state: `loading-buttons`, `error-feedback`, `state-clarity`, `primary-action`
  - layout และ rendering: `font-loading`, `content-jumping`, `horizontal-scroll`, `viewport-units`, `z-index-management`, `no-emoji-icons`
- **UX guidelines:**
  - Table Handling, Number Formatting
  - Error Placement, Focusable Error Summary
  - Input Types, Input Labels
  - Empty States, Loading Indicators
  - Reduced Motion, Excessive Motion
  - Focus Not Obscured
- **Next.js stack:** Use next/font, Handle loading states (loading.tsx)

---

## 2. Phase 0 — Foundation (port จาก -main HEAD)

ใช้ helper นี้ใน Git Bash ที่ root ของ target:

```bash
SRC=/d/KPV/gold-buyback-frontend-main
cp_main() { for f in "$@"; do mkdir -p "$(dirname "$f")"; git -C "$SRC" show "HEAD:$f" > "$f"; done; }
# guard: ต้องแน่ใจว่าไฟล์ยังตรงกับ baseline ก่อนเขียนทับ
check_base() { for f in "$@"; do [ -f "$f" ] && { git -C "$SRC" show "1ddbfdc:$f" | diff -q - "$f" >/dev/null || echo "DIVERGED $f"; }; done; }
```

ถ้า `check_base` พิมพ์ `DIVERGED` ออกมา **ให้หยุด ห้ามคัดลอก** แล้ว restyle ไฟล์นั้นด้วยมือ

### 2.1 Design tokens — `src/app/globals.css`

**ตัวแปรใน `:root, :root[data-theme='dark'], [data-surface='dark']`**

- พื้นหลัง: `--page-bg`, `--page-base`, `--glow-gold`, `--glow-red`, `--texture`
- Surface:
  - `--surface`, `--surface-chrome`, `--surface-solid`
  - `--border(-hover|-active)`, `--highlight`
  - `--recessed(-shadow)`, `--card-shadow`
- ข้อความ: `--fg`, `--fg-strong`, `--muted`, `--placeholder`
- ทอง: `--gold`, `--gold-icon`, `--gold-light`, `--gold-mid`, `--gold-text-gradient`, `--gold-fill`, `--on-gold`
- เส้นและแถว: `--line`, `--row-line`, `--row-hover`, `--gold-tint`, `--stat-glow`, `--scrim`
- สถานะ: `--success*`, `--warning*`, `--danger*`

**Light theme**

- `:root[data-theme='light']` override ทั้งชุด
- `[data-surface='dark']` ใน light theme ใช้ red glass

**Component classes**

| กลุ่ม | Class |
|---|---|
| Surface | `.glass`, `.glass-lg`, `.card` (hover ยกขึ้น -2px), `.card-header`, `.card-title`, `.recessed`, `.divider`, `.divider-diamond` |
| Shell | `.chrome`, `.shell-sidebar`, `.shell-header`, `.chrome-btn` (42px), `.nav-group-trigger`, `.nav-count` (18px), `.nav-children`, `.nav-link` (42px, 13.5px), `.nav-link-ref` (10px), `.nav-link-active`, `.menu-panel` |
| ปุ่มและฟอร์ม | `.btn` (42px), `.btn-primary`/`.btn-gold` (gold-fill, hover -1px), `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.input` (42px), `.input-lg` (52px, radius 14px), `.input-icon`, `.label` (13px สีทอง), `.section-label` (11.5px) |
| ข้อมูล | `.login-card`, `.stat-grid` (auto-fit minmax(230px,1fr) gap 16), `.table`, `.table-wrap`, `.sell-price`, `.badge`, `.status-success\|warning\|danger\|approved`, `.notice`, `.stat-glow`, `.text-gold-gradient` |
| Overlay | `.dialog-scrim`, `.dialog-panel`, `.dialog-head`, `.dialog-body`, `.dialog-foot`, `.toast*`, `.pager*`, `.theme-icon-light/dark` |

**Global**

- focus-visible ใช้ ring สีทอง
- `@media (prefers-reduced-motion)`
- `@media print`:
  - shell เป็น block, ซ่อน backdrop
  - ตารางกว้าง 100% และตัดบรรทัดได้
  - ฟอนต์ 11px

**Body**

- `background-color: var(--page-base)`
- `background-image: var(--page-bg)`
- `background-attachment: fixed`
- `isolation: isolate`
- `body::before` ใส่ texture แบบ static

### 2.2 Tailwind — `tailwind.config.ts`

- ฟอนต์: `fontFamily.serif = var(--font-serif-lao)`, `fontFamily.latin = var(--font-latin)`
- radius: `borderRadius.glass` 18px, `borderRadius.panel` 22px
- Semantic colors ชี้ไปที่ CSS var:
  - `fg`, `fg-strong`, `muted`, `line`
  - `surface`, `recessed`
  - `success`, `warning`, `danger`, `*-dot`
  - `gold.DEFAULT/light/mid`
- **ห้ามใช้ opacity modifier** (`/50`) กับสีที่มาจาก var
- คง line-height ที่เหมาะกับภาษาลาวไว้

### 2.3 ฟอนต์และ theme

ไฟล์: `src/app/layout.tsx`, `src/lib/theme.ts`, `src/components/theme-toggle.tsx`

**ฟอนต์ (`next/font/google`)**

| ฟอนต์ | Weight | CSS variable |
|---|---|---|
| `Noto_Sans_Lao` | 300–700 | `--font-lao` |
| `Noto_Serif_Lao` | 600/700 | `--font-serif-lao` |
| `Cormorant_Garamond` | 500/600 (latin) | `--font-latin` |

- ทุกตัวใช้ `display: 'swap'`
- **ต่างจาก -main:** -main โหลด Noto Sans Lao แค่ 400–700 ต้องเพิ่ม `'300'` เพราะ greeting ใช้ `font-light`

**Theme**

- `<html lang="lo" data-theme="dark" suppressHydrationWarning>`
- inline `THEME_SCRIPT` ทำงานก่อน paint:
  - อ่านค่าจาก `localStorage['kpv.theme']`
  - ถ้าไม่มี ใช้ `prefers-color-scheme`
- ThemeToggle:
  - ปุ่ม 42×42
  - `aria-label="ສະຫຼັບຮູບແບບສີ"`
  - ไอคอนสลับด้วย CSS จึงไม่เกิด hydration mismatch

### 2.4 พื้นหลัง static — `src/components/backdrop.tsx`

- glow 3 วง:
  - gold 520px มุมขวาบน
  - red 560px มุมซ้ายล่าง
  - gold 280px มุมขวาล่าง
- ทุกวงใช้ `blur(30px)`, `position: fixed`, `-z-10`, `pointer-events-none`, `no-print`, `aria-hidden`
- **ไม่มี animation**

### 2.5 Primitives

| Primitive | ไฟล์/คลาส | API |
|---|---|---|
| GlassCard | `.card` + `data-fade` | class |
| GlassPanel | `.glass .glass-lg` / `.login-card` | class |
| PageHead | `src/components/page-head.tsx` | `PageHead({ title, subtitle?, actions? })` ใส่ `data-fade` ให้เอง; H1 ใช้ serif + gold gradient ขนาด 26px และ 34px ที่ sm ขึ้นไป |
| StatCard | `src/components/stat-card.tsx` | `StatCard({ label, value, sub?, accent? })` มี `title={value}` |
| DataTable | `.table-wrap` + `.table` | `.table-wrap` ใส่ `tabIndex={0} role="region" aria-label=<ชื่อ card>`; หัวคอลัมน์ตัวเลข `th.text-right`, cell `td.num.text-right`, คอลัมน์ราคาขาย `.sell-price` |
| FormField | label + input | `<label className="label" htmlFor>` + `.input`/`.input-lg`/`.input-icon`; error มี `id` + `aria-describedby` + `role="alert"` |
| Buttons | class | `.btn-primary` (ปุ่มหลักในฟอร์มใช้ `min-h-[54px]`), `.btn-secondary`, `.btn-ghost`, `.btn-danger` |
| Chip/Badge | `.badge`, `.status-*` | `statusClass(status, overrides?)` ใน `src/lib/status.ts` |
| Divider | class | `.divider`, `.divider-diamond` |
| Dialog | `src/components/dialog.tsx` | `Dialog({ open, onClose, title, children, footer?, size?, dismissOnScrim=false })` ทำงานผ่าน portal, มี focus trap, ปิดด้วย Esc, คืน focus เมื่อปิด, ล็อก scroll |
| Empty/Loading/Error | ดูรายละเอียดด้านล่าง | — |
| Chart theme | `src/lib/chart-theme.ts` | `useChartTheme()` คืน `{ grid, axis, tooltipBg, tooltipBorder, text, series[] }` |
| Fade | `src/lib/use-fade-in.ts` | `useFadeIn(key?)` |

**Empty / Loading / Error**

- Empty: แถวที่ใช้ `text-muted`
- Loading: `(app)/loading.tsx`
- Error: `.notice.status-danger role="alert"`
- ส่วนเสริม: `query-state.tsx` (ดู R3)

### 2.6 `useFadeIn`: ต้องตรงตาม spec

**Animation**

- Keyframes: `[{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]`
- Options: `{ duration: 700, delay: 80 + i*60, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }`

**ลำดับการทำงาน**

- รอบแรก: animate `[data-fade]` ทั้งหมด รวม chrome
- เปลี่ยนหน้า (key = pathname): animate เฉพาะ `main [data-fade]`
- ใช้ MutationObserver จับ block ที่ mount ทีหลัง
- ใช้ WeakSet กันไม่ให้ animate ซ้ำ
- ถ้าเปิด reduced-motion: **ไม่สร้าง animation ใดๆ เลย**

**ที่เรียกใช้**

- `useFadeIn` เรียกใน `AppShell`, หน้า login และ not-found เท่านั้น
- หน้าอื่นใส่แค่ attribute `data-fade`

---

## 3. Phase 1 — Shell (port จาก -main)

### `src/components/app-shell.tsx`

**Layout**
- เดิม `flex h-screen` → grid `lg:grid-cols-[272px_minmax(0,1fr)] gap-4 p-4`
- Sidebar:
  - `data-surface="dark"`
  - sticky สูง `h-[calc(100vh-32px)]`
- มือถือ: sidebar เป็น drawer ที่มี scrim

**Header**
- `.shell-header` sticky ที่ top-4
- radius 18px, padding `12px 14px 12px 24px`
- ด้านซ้าย:
  - title 15px/600
  - ใต้ title คือ TOR ref 11px สีทอง
- ด้านขวา:
  - ThemeToggle
  - NotificationBell
  - user chip (recessed 42px, avatar 32px gold-fill)

**ปุ่มอื่นๆ**
- ปุ่มเปิด drawer ปัจจุบันสูงประมาณ 34px → ใช้ `.chrome-btn` 42px

**Fade**
- เรียก `useFadeIn(pathname)`

### `src/components/sidebar.tsx`

**กรอบและ brand**
- `.shell-sidebar` radius 22px
- Brand:
  - logo 46px
  - ชื่อร้านใช้ serif สีทอง 18px
  - "KHAMPHOUVONG" ใช้ Cormorant `tracking-[0.42em]`
- ใต้ brand คั่นด้วย `.divider-diamond`

**ช่องค้นหา**
- `.input` สูง 42px, radius 12px
- ไอคอนแว่นขยายสีทอง

**Group header**
- 12px/600 สีทอง
- `.nav-count` สูง 18px
- chevron หมุน 90° เมื่อเปิด

**รายการลูก**
- เส้นซ้าย 1px สีทอง
- ข้อความ 13.5px
- §ref ขนาด 10px ชิดขวา

**รายการที่ active**
- ใช้ gradient, border และ glow ตาม spec
- ข้อความสี `#fbe7b0` น้ำหนัก 600

### ไฟล์อื่นใน Phase 1

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `logo.tsx` | ใส่ drop-shadow ตาม spec และ wordmark ละติน |
| `notification-bell.tsx` | `.chrome-btn` + badge สีทอง + `.menu-panel` |
| `shift-banner.tsx` | ปุ่มสูง 42px, `.notice status-success/warning` |
| `toast.tsx` | glass แบบทึบ + dot สถานะ, ปุ่มปิดสูง 42px พร้อม `aria-label="ປິດ"` |
| `readiness-panel.tsx` | ปุ่มสูง 42px และใส่ `data-fade` ให้ `section.card` |
| `login/page.tsx` | ดูรายละเอียดด้านล่าง |
| `not-found.tsx` | `'use client'` + `useFadeIn()`, card glass, ตัวเลข 404 ใช้ serif gold gradient, ปุ่ม `.btn-primary` |
| `(app)/loading.tsx`, `(app)/error.tsx` | loading: skeleton แบบ recessed + `motion-safe:animate-pulse`; error: card + ไอคอน danger |

**`login/page.tsx`**

- Layout 2 คอลัมน์ (≥ lg)
  - Brand panel: red glass + ข้อความ `#e8c46a`
  - Card: `.login-card` radius 28px, blur 26px
- Input: `.input-lg` สูง 52px พร้อมไอคอน 18px นำหน้า
- Error: `#login-error` ใช้ `.notice.status-danger role=alert` และผูกกับ input ด้วย `aria-describedby`
- ปุ่ม submit: `.btn-primary` สูง 54px
- อื่นๆ: ThemeToggle, `useFadeIn()`, `min-h-dvh`

---

## 4. Phase 2+ — แผนรายหน้า (ครบทุก route)

**คำย่อ**

| ย่อ | หมายถึง |
|---|---|
| PH | PageHead |
| SC | StatCard |
| TW | table-wrap region |
| ST | statusClass |
| DL | Dialog |
| AV | AuditView |
| PG | Pagination |
| CAT | SimpleCatalog |

"→PH(Lxx)" หมายถึงแทน `<h1>` ที่บรรทัดนั้นด้วย PageHead

**Checklist ที่ใช้กับทุกหน้า**

- แปลง class สีเป็น token:
  - `slate-*` → `fg` / `muted` / `line`
  - `red-*` → `danger`
  - `emerald-*` → `success`
  - `amber-*` → `warning`
- ใส่ `data-fade` บน title, ทุก card และทุกตาราง
- ตัวเลขใช้ `.num text-right`
- ปุ่มแบบลิงก์ (`hover:underline`):
  - เปลี่ยนเป็น `.btn-*` สูงอย่างน้อย 42px
  - aria-label = ข้อความที่มองเห็น + ตัวตนของแถว (label-in-name)
- cell ที่มีปุ่ม action ใช้ `flex flex-nowrap justify-end gap-2 whitespace-nowrap`

**ขนาดงาน (Size)** คือปริมาณงานตรวจหลัง port ยกเว้นแถวที่ระบุว่า manual

### ภาพรวม / ระบบ

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | redirect | ไม่มี | — | – |
| `/login` | `src/app/login/page.tsx` | auth form | ดู Phase 1 | useFadeIn, ThemeToggle | P0/M |
| (404) | `src/app/not-found.tsx` | state | ดู Phase 1 | useFadeIn | P1/S |
| (loading/error) | `(app)/loading.tsx`, `(app)/error.tsx` | state | ดู Phase 1 | — | P1/S |
| `/dashboard` | `(app)/dashboard/page.tsx` | KPI + ตาราง | ดูหมายเหตุ dashboard ใต้ตาราง | PH, SC, TW | P0/M |
| `/help` | `(app)/help/page.tsx` (574) | เอกสารยาว | ดูหมายเหตุ help ใต้ตาราง | PH, TW | P2/M |
| `/reports` | `(app)/reports/page.tsx` | filter + ตาราง + export/print | ดูหมายเหตุ reports ใต้ตาราง | PH, TW, PG | P1/M |

**`/dashboard`**
- →PH(L65): greeting 14px light
- ส่วนสถิติ:
  - `Stat` ภายในไฟล์ (L157) และ grid 4 คอลัมน์ (L164, L186, L198) → `.stat-grid` + SC
  - label 11.5px สีทอง, value 24–26px tabular, sub 12px muted
- ลิงก์และตาราง:
  - ลิงก์ L121 → `.btn-ghost` 42px
  - ตารางราคา: TW (L125) + `.sell-price` (L233) + ตัวเลขชิดขวา
- ReadinessPanel อยู่เหนือ stat
- **ไม่มี recharts และห้ามเพิ่ม**

**`/help`**
- →PH(L64)
- chip role (L96) → `.badge` สูงอย่างน้อย 42px ถ้ากดได้
- ลำดับ chain (L511–528): ลูกศรใส่ `aria-hidden`
- เนื้อหากว้างไม่เกิน `max-w-[75ch]`
- TW L551
- class slate 22 จุด → token

**`/reports`**
- →PH(L149)
- filter card (L156) ใช้ label + `.input`
- ปุ่ม Export/ພິມ ใส่ line icon 18px
- TW L190, คอลัมน์ตัวเลขใช้ `.num text-right`
- ตอนพิมพ์: ซ่อน chrome และ backdrop

### ຂໍ້ມູນຫຼັກ (Admin)

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/admin/products` | `admin/products/page.tsx` | ตั้งราคา + ตาราง | →PH(L82); input ราคาใช้ `.input-lg` + `inputMode="decimal"`; badge L119 → ST; TW L136, L203; ราคาขายใช้ `.sell-price` | PH, TW, AV | P0/M |
| `/admin/deductions` | `admin/deductions/page.tsx` | inline edit | →PH(L62); error L69 → `.notice.status-danger`; badge L100–101 (blue/purple) → `badge recessed`; input inline ใส่ `aria-label`; ลิงก์ L125/132/140 → btn; TW L78 | PH, TW, AV | P1/S |
| `/admin/rates` | `admin/rates/page.tsx` | form + recharts + ประวัติ | ดูหมายเหตุ rates ใต้ตาราง | PH, SC, TW, chart-theme | P1/M |
| `/admin/conversion-fees` | `admin/conversion-fees/page.tsx` (726) | **manual ห้ามคัดลอก** | ดู §4.1 | PH, TW, PG, AV | P0/**L** |
| `/admin/soft-gold-fee` | `admin/soft-gold-fee/page.tsx` | ค่าเดียว + ประวัติ | →PH(L60); `.input-lg` decimal; badge L100; TW L111 | PH, TW, AV | P2/S |
| `/admin/gold-types` | `admin/gold-types/page.tsx` | 2 catalog | →PH(L28); ฟอร์มใช้ label/input; TW L105, L186; checkbox สูงอย่างน้อย 42px | PH, TW | P2/S |
| `/admin/skus` | `admin/skus/page.tsx` | form + ตาราง | →PH(L94); น้ำหนักใช้ decimal; badge L178 → ST; ลิงก์ L226 → btn-ghost + aria-label; TW L199 | PH, TW | P1/M |
| `/admin/cabinets` | `admin/cabinets/page.tsx` | form + 2 ตาราง | →PH(L69); ลิงก์ L116 → btn; TW L101, L137 | PH, TW | P2/S |
| `/admin/banks` | `admin/banks/page.tsx` | CAT wrapper | แก้ผ่าน `simple-catalog.tsx` (ดูหมายเหตุใต้ตาราง) | CAT | P2/S |
| `/admin/income-expense-categories` | `admin/income-expense-categories/page.tsx` | CAT wrapper | เหมือน banks | CAT | P2/S |
| `/admin/ap-ar-categories` | `admin/ap-ar-categories/page.tsx` | CAT wrapper | เหมือน banks | CAT | P2/S |
| `/admin/partners` | `admin/partners/page.tsx` | form + ตาราง | →PH(L62); select มี label; TW L110 | PH, TW | P2/S |
| `/admin/users` | `admin/users/page.tsx` | user CRUD | →PH(L105); badge L116, L223 → ST; ลิงก์ L234–251 → btn + label-in-name; checkbox `min-h-[42px]`; TW L174 | PH, TW | P1/M |
| `/admin/notifications` | `admin/notifications/page.tsx` | WhatsApp log | →PH(L117); status chip L34–36/L102–137 → `.status-*` + ข้อความ; message ใช้ `role="status"`; เบอร์โทรใช้ `inputMode="tel"`; TW L147, L192 | PH, TW, ST | P2/M |
| `/admin/deleted` | `admin/deleted/page.tsx` | list | →PH(L26); badge L54; TW L37 | PH, TW | P2/S |

**`/admin/rates`**
- →PH(L133)
- ปุ่ม L149 → สูง 42px
- Stat L255 → SC
- **Recharts** ใช้ค่าจาก `useChartTheme()`:
  - `CartesianGrid` ใช้สี `grid`
  - axis tick ใช้ `fill=axis`
  - Tooltip ใช้ `contentStyle` จาก token (background, border, radius 12px, สีข้อความ)
  - แต่ละ `Line` ใช้สี series ต่างกัน **และ** `strokeDasharray` ต่างกัน เพื่อไม่แยกด้วยสีอย่างเดียว
- ตารางประวัติ (TW L212) ทำหน้าที่เป็น fallback ด้าน a11y

**SimpleCatalog (`simple-catalog.tsx`)**
- h1 L95 → PH
- form L101 → `.card`
- error L137 → `.notice`
- ตาราง L158 → TW
- คอลัมน์โค้ดคง `font-mono` ไว้

#### 4.1 conversion-fees (manual; ใช้ pattern จาก `-main/admin/deductions` และ `soft-gold-fee`)

**ส่วนบนของหน้า**

1. import `PageHead` และ `statusClass`
2. L96–102 → `<PageHead title="ຈັດການ ຄ່າປ່ຽນ" subtitle="ຄ່າປ່ຽນທີ່ໃຊ້ໃນລາຍການປ່ຽນເປັນເງິນ (TOR §3.4)" />`
3. JewelryPanel/BarPanel (L219, L466):
   - ใส่ `data-fade className="card"`
   - ปุ่มเพิ่มใส่ไอคอน plus 16px แบบ `aria-hidden`

**แผงเพิ่มข้อมูลและตาราง**

4. แผงเพิ่มข้อมูล (L230/L477):
   - `border-line bg-recessed`
   - input เป็น `.input-lg`
   - คง `inputMode="decimal"` ไว้
5. `.table-wrap` (L287, L533, L677) → `tabIndex={0} role="region" aria-label="<card title>"`
6. input แก้ไขในแถว (L313, L326, L557, L570): เพิ่ม `aria-label` จากหัวคอลัมน์เดิม + ตัวตนของแถว

**ปุ่มและข้อความ**

7. ปุ่มแบบลิงก์ 12 จุด (L339–381, L583–623):

   | ปุ่ม | Class |
   |---|---|
   | ບັນທຶກ | `.btn-primary` |
   | ຍົກເລີກ | `.btn-secondary` |
   | ຢືນຢັນລຶບ | `.btn-danger` |
   | ແກ້ໄຂ | `.btn-ghost` |
   | ລຶບ | `.btn-danger` |

   - ทุกปุ่มใส่ aria-label แบบ label-in-name
   - wrapper ใช้ `flex flex-nowrap justify-end gap-2 whitespace-nowrap`
8. คำเตือนก่อนลบ (L400, L642):
   - → `<p role="status" className="notice status-warning m-4">`
   - L526 → `text-warning`
9. แถว empty (L301, L546, L694) → `text-muted`

**HistoryPanel (L663–726)**

10. ปรับ HistoryPanel:
    - span ใน card-header → `text-muted`
    - เพิ่ม prop `numericFirst`: ฝั่ง bar คอลัมน์แรก (น้ำหนัก) เป็นตัวเลข จึงต้องชิดขวา
    - badge ລຶບແລ້ວ → `status-danger`, ໃຊ້ງານ → `status-success`
    - เพิ่ม prop `loading`: ระหว่างโหลดแสดง "ກຳລັງໂຫຼດ..."

**ท้ายหน้าและ e2e**

11. ย่อหน้าท้ายหน้า (L150) → `data-fade className="text-sm text-muted"`
12. e2e mock: เพิ่ม `/fees/conversion/jewelry/history` และ `/fees/conversion/bar/history`

### ການເງິນ (Payment)

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/payment/wallet` | `payment/wallet/page.tsx` | KPI + ประวัติ | status map L18–21 → ST; →PH(L98); Stat → SC; badge L116; ลิงก์ L196 → btn; error → `#wallet-error .notice.status-danger`; TW L163 | PH, SC, ST, TW | P0/M |
| `/payment/bank` | `payment/bank/page.tsx` | ตาราง | →PH(L40); TW L51, L87 | PH, TW | P2/S |
| `/payment/approvals` | `payment/approvals/page.tsx` | คิวอนุมัติ | →PH(L127); ลิงก์ L96–115 → `.btn-primary` / `.btn-danger` + aria-label แถว; badge L134 → ST; TW L149, L188, L221 | PH, ST, TW | P0/M |
| `/payment/old-gold` | `payment/old-gold/page.tsx` | สรุป + **print** | status map → ST; →PH(L74) โดย actions = ปุ่ม "ພິມຕາຕະລາງ" + ไอคอน printer; TW L88, L166; **เพิ่มใน print.spec** | PH, ST, TW | P1/M |

### ຜູ້ປະເມີນລາຄາ (Valuer): ฟอร์มธุรกรรม

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/valuer/buyback` | `valuer/buyback/page.tsx` (447) | ฟอร์ม + ประวัติ | ดูหมายเหตุ buyback ใต้ตาราง | PH, ST, TW | P0/L |
| `/valuer/exchange` | `valuer/exchange/page.tsx` (434) | ฟอร์มหลายบรรทัด | ดูหมายเหตุ exchange ใต้ตาราง | PH, ST, TW | P0/L |
| `/valuer/credit` | `valuer/credit/page.tsx` (370) | ฟอร์มสินเชื่อ | status map → ST; →PH(L147); `.input-lg`; TW L315; ลิงก์ L354 → btn | PH, ST, TW | P0/L |

**`/valuer/buyback`**
- status map → ST, →PH(L190)
- ฟอร์ม:
  - `.input-lg` 52px + label สีทอง 13px
  - น้ำหนักและ % ใช้ `inputMode="decimal"`
- สรุปยอด:
  - `.card`
  - ตัวเลข `.num` 24px
  - ยอดจ่ายใช้ `text-fg-strong`
- submit:
  - `.btn-primary min-h-[54px]`
  - ปิดปุ่มระหว่าง pending
- error ใต้ฟอร์ม: `role=alert` + `aria-describedby`
- TW L332, ลิงก์ L376/381 → btn

**`/valuer/exchange`**
- →PH(L171)
- ปุ่มเพิ่ม/ลบบรรทัด (6 จุด):
  - สูง 42px
  - aria-label ไม่ซ้ำกัน
- balance gate (L348–361):
  - `role="status"` + `.notice status-success/danger`
  - คงข้อความ "✓ ນ້ຳໜັກສົມດຸນ" ไว้เพราะเป็น copy
- TW L379, submit 54px

### Financial Controller

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/fc/approvals` | `fc/approvals/page.tsx` | คิวอนุมัติ 2 ตาราง | →PH(L79); error L86 → `#fc-approvals-error`; ลิงก์ → Approve `.btn-primary` / Reject `.btn-danger` + aria-label; input เหตุผล `aria-label="ເຫດຜົນ"`; TW L99, L165 | PH, ST, TW | P0/M |
| `/fc/cash` | `fc/cash/page.tsx` | KPI + ตาราง | →PH(L66); Stat → SC; IN/OUT → `status-success/danger` + ข้อความ; TW L131 | PH, SC, TW | P1/S |
| `/fc/bank` | `fc/bank/page.tsx` | form + ตาราง | →PH(L93); ลิงก์ L139–149 → btn; TW L110, L218 | PH, TW | P1/M |
| `/fc/orders` | `fc/orders/page.tsx` (487) | ฟอร์ม order + workflow | status map → ST (CANCELLED เป็น neutral); →PH(L193); แผงเลื่อนสถานะ L314 ใช้ `.card` + ปุ่ม 42px; ลิงก์ L453, L462 → btn; TW L411 + scroll-shadow (R1) | PH, ST, TW | P1/L |
| `/fc/advance` | `fc/advance/page.tsx` | KPI + ประวัติ | →PH(L60); Stat → SC; สถานะ → ST; ลิงก์ → btn; TW L88 | PH, SC, ST, TW | P1/M |
| `/fc/income-expense` | `fc/income-expense/page.tsx` | form + ตาราง | →PH(L73); badge → `status-success/danger`; TW L157 | PH, TW | P2/S |
| `/fc/consignments` | `fc/consignments/page.tsx` | form หลายบรรทัด | →PH(L78); ปุ่ม `text-xs` → 42px; badge → ST (`HELD`: warning); Stat L236 → SC; TW L151 | PH, SC, ST, TW | P1/M |

### ສາງຄຳ (Stock)

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/stock/new` | `stock/new/page.tsx` | KPI + ตาราง + dialog | →PH(L45) โดย actions = IN (`.btn-primary`) และ OUT/TRANSFER (`.btn-secondary`); Stat → SC; TW L74, L130; StockMovementDialog → `Dialog` | PH, SC, TW, DL | P0/M |
| `/stock/old` | `stock/old/page.tsx` | เหมือน new | →PH(L47); ปุ่ม L54–56; Stat L162; TW L76, L120 | PH, SC, TW, DL | P1/M |
| `/stock/factory` | `stock/factory/page.tsx` | tracking | →PH(L67); badge → ST (`AWAITING_ASSESSMENT`: warning); ลิงก์ L134–145 → btn; TW L84 | PH, ST, TW | P1/M |

### ບັນຊີ & ລາຍງານ (Ledger)

| Route | ไฟล์ | ประเภท | การเปลี่ยนแปลง | Shared | P/Size |
|---|---|---|---|---|---|
| `/ledger/ap-gold` | → `ap-ar-gold/module.tsx` | ledger + print | module: →PH(L44); badge; TW L65, L93, L126; แถวยอดรวมมีเส้นบนสีทอง; ตัวเลข `.num text-right` | PH, TW | P1/M |
| `/ledger/ar-gold` | module เดียวกัน | — | — | — | P1/S |
| `/ledger/ap-ar-gold` | redirect | — | ไม่มี | — | – |
| `/ledger/ap-cash` | → `ap-ar-cash-module.tsx` | ledger | h1 → PH; การ์ดยอดรวม → SC (ดู R2); ลิงก์ → btn; TW | PH, SC, TW | P1/M |
| `/ledger/ar-cash` | module เดียวกัน | — | — | — | P1/S |
| `/ledger/ap-ar-cash` | `ledger/ap-ar-cash/page.tsx` | ledger (ไม่อยู่ใน NAV) | →PH(L42); badge L103; TW L51, L82; ต้องเพิ่มใน `e2e/routes.ts` | PH, TW | P2/S |
| `/ledger/coh` | `ledger/coh/page.tsx` | สรุป 2 ตาราง | →PH(L26); TW L34, L72; แถวยอดรวมใช้ `text-fg-strong font-semibold` | PH, TW | P1/S |
| `/ledger/wac` | `ledger/wac/page.tsx` | KPI | →PH(L24); Stat L81 → SC; TW L39 | PH, SC, TW | P2/S |
| `/ledger/wealth` | `ledger/wealth/page.tsx` | KPI + สูตร | →PH(L26); Stat L96 → SC; สูตรใช้ `text-muted`; TW L40 | PH, SC, TW | P2/S |

### Shared components (port ใน T5)

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `simple-catalog.tsx` | ดูหมายเหตุ SimpleCatalog ในหัวข้อ Admin |
| `module-shell.tsx` | h1 → PH; กล่องสีอำพัน → `.notice status-warning`; ลิงก์กลับ → `.btn-ghost` |
| `pagination.tsx` | select `h-8` → `.input` 42px; `.pager-btn` 42px |
| `audit-view.tsx` | ปุ่ม `py-1 text-xs` → 42px |
| `stock-movement-dialog.tsx` | ปุ่มเล็กขยายเป็น 42px; overlay → `Dialog` |
| `ap-ar-cash-module.tsx` | ดูแถว ledger และ R2 |

---

## 5. Phase R — ปิด gap ที่ -main ยังไม่ได้ทำ

| ID | งาน | กฎ | ไฟล์ |
|---|---|---|---|
| R1 | Global a11y polish (7 ข้อด้านล่าง) | `focus-not-obscured`, Table Handling, `tap-delay`, `viewport-units`, `image-dimension` | globals.css, dialog.tsx, app-shell, login, not-found, logo |
| R2 | การ์ดยอดรวมแบบ inline ใน `ap-ar-cash-module.tsx` (~L184) → `StatCard` | consistency | ap-ar-cash-module.tsx |
| R3 | **(ต้องอนุมัติ ใช้ข้อความเดิมเท่านั้น)** สร้าง `query-state.tsx` แยก error ออกจาก empty (ดูด้านล่าง) | `error-feedback`, Empty States | ≤ 6 ไฟล์ |
| R4 | **(optional ต้องอนุมัติข้อความใหม่)** skip link "ຂ້າມໄປເນື້ອຫາ" → `#main` | `skip-links` | app-shell.tsx |
| R5 | ทางเลือก motion แบบเคร่ง: ตัด dialog scale, collapsible animation, pulse/spin ออก | design.md Motion | globals.css, sidebar, loading |
| R6 | (optional) input ใช้ 16px บนจอ < 640px เพื่อกัน iOS zoom | `readable-font-size` | globals.css |
| R7 | อัปเดต light token ใน design.md (`#a87424` → `#7f5110` สำหรับข้อความ, `#1f7a45` → `#186638`) ทั้ง 2 สำเนา **ผู้ใช้เป็นคนตัดสินใจ** | `color-contrast` | design.md |

**รายละเอียด R1**

- (ก) `scroll-padding-top: 96px` กัน header sticky บัง element ที่ focus
- (ข) `.table-wrap` เพิ่ม scroll-shadow แบบ static เพื่อบอกว่าเลื่อนแนวนอนได้ (fc/orders, valuer/buyback, valuer/credit ที่ 1440)
- (ค) `touch-action: manipulation` กับ element ที่กดได้
- (ง) ใช้ `min-h-dvh` แทน `h-screen`
- (จ) แก้ comment ใน light token ให้ตรงค่าจริง
- (ฉ) Dialog:
  - FOCUSABLE ไม่รวม `[tabindex="-1"]`
  - กรอง element ที่มองไม่เห็นออก
- (ช) `<img>` ใน logo เพิ่ม `width`/`height`

**รายละเอียด R3**

- สร้าง `src/components/query-state.tsx`
- API: `TableStateRow({ colSpan, isLoading, isError, error, isEmpty, emptyText, onRetry })`
- ตอน error แสดง:
  - กล่อง `role="alert"` ข้อความ "ບໍ່ສຳເລັດ — {message}"
  - ปุ่ม "ລອງໃໝ່" ที่เรียก refetch
- เหตุผล: ตอนนี้ไม่มีหน้าไหนจัดการ `isError` เลย GET ที่ล้มเหลวจึงดูเหมือน "ยังไม่มีข้อมูล"

---

## 6. แผนทดสอบ

### 6.1 Static

```bash
npm run typecheck
npm run lint:style
NEXT_PUBLIC_API_URL=http://api.mock npm run build
grep -rnE "hover:underline|py-1 text-xs|h-8 " src --include=*.tsx
```

- `typecheck` รัน `next typegen && tsc --noEmit`
- `lint:style` ต้องได้ 0 violation (ห้าม `bg-white`, `text-white`, `slate-*`, `#fff`, `#000`)
- `grep` ต้องไม่เจอใน `src` ยกเว้นลิงก์ในเนื้อหาของ help

### 6.2 Playwright (port จาก -main แล้วปรับ)

**ไฟล์ที่ port**

- `playwright.config.ts`:
  - port 3100, ใช้ build → start
  - `NEXT_DIST_DIR=.next-e2e`
  - `NEXT_PUBLIC_API_URL=http://api.mock`
- `e2e/routes.ts`
- `e2e/{pages,fade,dialog,print,states}.spec.ts`
- `e2e/fixtures/{api-mock,session,animations,contrast}.ts`

**ส่วนที่ต้องปรับสำหรับ target**

1. `pages.spec.ts` VIEWPORTS = `375×812`, `768×1024`, `1024×768`, `1440×900`
2. `print.spec.ts` เพิ่ม `/payment/old-gold`
3. `api-mock` เพิ่ม `/fees/conversion/{jewelry,bar}/history`
4. `routes.ts` ต้องมี `/ledger/ap-ar-cash`

**สิ่งที่ตรวจ**

- ทุก route × theme × viewport:
  - screenshot แบบ fullPage
  - ไม่มี horizontal overflow
  - ไม่มี console error
  - `main [data-fade]` ≥ 1
  - contrast 4.5:1
  - axe wcag2a/aa = 0
- reduced-motion: ต้องไม่มี animation เลย
- fade:
  - block ที่ mount ทีหลังได้ fade ด้วย
  - fade ทำงานตอนเปลี่ยนหน้าแบบ soft-nav
  - chrome fade ครั้งเดียว
- dialog:
  - focus trap
  - คลิก scrim แล้วไม่ปิด
  - Esc ปิดแล้วคืน focus
  - ล็อก scroll
- print:
  - main กว้างอย่างน้อย 90%
  - ซ่อน backdrop
- states:
  - drawer, user menu, bell, error
  - theme toggle persist ได้
  - checkbox สูงอย่างน้อย 42px

**คำสั่ง**

```bash
npx playwright install chromium
SHOT_LABEL=baseline npx playwright test e2e/pages.spec.ts --grep desktop   # baseline ก่อน restyle
npm run test:e2e                     # ทั้งชุด (~400 tests, 6–8 นาที)
npm run test:e2e:quick               # เฉพาะ desktop
MSYS_NO_PATHCONV=1 npx playwright test --grep "\[admin\]"
npx playwright show-report
```

ก่อนรันใหม่ทุกครั้ง ให้ปิด server ที่ค้างบนพอร์ต 3100:

```powershell
Get-NetTCPConnection -LocalPort 3100 | % { Stop-Process -Id $_.OwningProcess }
```

### 6.3 Manual checklist (pro-rules Pre-Delivery + design.md)

- [ ] ดู screenshot dark และ light ที่ 375/768/1024/1440 ด้วยตา: พื้นหลัง static, glow ล้นมุม, ไม่มี `#fff` หรือ `#000`
- [ ] Light theme: sidebar/header เป็น red glass และข้อความข้างในใช้ token ของ dark
- [ ] ไม่มี emoji ที่ใช้เป็นไอคอน, ไอคอนเป็นเส้น 1.6–2px สีทอง ขนาด 16–18px
- [ ] Target สูงอย่างน้อย 42px, ระยะห่างอย่างน้อย 8px, focus ring สีทองมองเห็นได้และไม่ถูก header บัง
- [ ] ตัวเลขเป็น tabular และชิดขวา, ราคาขายใช้ `.sell-price`
- [ ] สถานะไม่ได้สื่อด้วยสีอย่างเดียว (มี dot + ข้อความ)
- [ ] เปิด reduced-motion แล้วไม่มี fade แต่ hover ยังทำงาน
- [ ] dialog/drawer มีปุ่มปิดและกด Esc ได้
- [ ] Print preview ของ `/reports`, `/ledger/ap-gold`, `/payment/old-gold`
- [ ] copy ไม่เปลี่ยน: `git diff ux-baseline -- src | grep -P "^[-+].*[\x{0E80}-\x{0EFF}]"` ต้องเหลือแค่บรรทัดที่ย้ายเข้า `PageHead` และ `aria-label`

---

## 7. Execution breakdown — Opus วางแผน / Sonnet ลงมือ

ก่อนเริ่มทุก task ให้ Sonnet subagent อ่าน `design.md`, `docs/ux-ui-plan.md` และ `-main/.superpowers/sdd/plan-ux-zippy-diffie/constraints.md` แต่ละ task commit แยกกัน

| # | Task | ไฟล์ | Acceptance | Verify | ลำดับ |
|---|---|---|---|---|---|
| **T0** | Repo safety + baseline | `.gitignore` (`cp_main`), `package.json` → `"@kpv/domain": "file:./shared"` | `git status` ไม่มี `.env`/`node_modules`; มี commit baseline + tag `ux-baseline` + branch `ux-redesign` | `npm install && npm run typecheck && NEXT_PUBLIC_API_URL=http://api.mock npm run build` | **1** |
| **T1** | Test harness | `playwright.config.ts`, `scripts/lint-style.mjs`, `e2e/**`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs` (ใช้ `check_base` ก่อน) แล้วปรับตาม §6.2 | `npm ci` ผ่าน; `--list` แสดงทุก route; มี baseline screenshot | `SHOT_LABEL=baseline npx playwright test e2e/pages.spec.ts --grep desktop` (fail ได้) | **2** |
| **T2a** | Tokens/ฟอนต์/theme/fade | `globals.css`, `tailwind.config.ts`, `layout.tsx` (+300), `backdrop.tsx`, `theme.ts`, `theme-toggle.tsx`, `use-fade-in.ts` | theme สลับได้และ persist, ฟอนต์ 3 ตัวโหลด, พื้นหลังเป็น gradient + texture | `npm run typecheck && npm run build` | 3 (∥ T2b) |
| **T2b** | Primitives | `page-head.tsx`, `stat-card.tsx`, `dialog.tsx`, `chart-theme.ts`, `status.ts` | API ตาม §2.5 | `npm run typecheck` | ∥ T2a |
| **T3** | Shell | `app-shell`, `sidebar`, `logo`, `notification-bell`, `shift-banner`, `toast`, `readiness-panel` | Phase 1 ครบ | `lint:style` + `states.spec` + `fade.spec` | หลัง T2 |
| **T4** | Auth/system | `login`, `not-found`, `loading`, `error` | Phase 1 ครบ | `--grep "\[login\]"` | ∥ T3 |
| **T5** | Shared modules | `simple-catalog`, `module-shell`, `pagination`, `audit-view`, `stock-movement-dialog`, `ap-ar-cash-module` | ปุ่ม 42px, Dialog ใช้งานได้ | `dialog.spec` + `--grep "\[ledger\]"` | ∥ T3/T4 |
| **P1** | Admin pricing | `admin/{products,deductions,rates,soft-gold-fee,gold-types,skus,cabinets}` | §4 | `--grep "\[admin\]"` | หลัง T2–T5 |
| **P2** | Admin อื่นๆ | `admin/{partners,users,notifications,deleted}` | §4 | `--grep "\[admin\]"` | ∥ |
| **P3** | conversion-fees (**manual**) | `conversion-fees/page.tsx`, `e2e/fixtures/api-mock.ts` | §4.1 ครบ 12 ข้อ, `lint:style` 0 | `--grep "\] /admin/conversion-fees "` + screenshot | ∥ |
| **P4** | Dashboard/help/reports | 3 ไฟล์ | §4 | `--grep "\[dashboard\]\|\[help\]\|\[reports\]"` + `print.spec` | ∥ |
| **P5** | Payment + Valuer | 7 ไฟล์ | §4; ฟอร์ม 52/54px | `--grep "\[payment\]\|\[valuer\]"` | ∥ |
| **P6** | FC | 7 ไฟล์ | §4 | `--grep "\[fc\]"` | ∥ |
| **P7** | Stock + Ledger | 8 ไฟล์ | §4 | `--grep "\[stock\]\|\[ledger\]"` + `dialog.spec` | ∥ |
| **R1** | Global a11y polish | 6 ไฟล์ | ตาม R1 | full `npm run test:e2e` | หลัง P1–P7 |
| **R2** | StatCard ใน ap-ar-cash | 1 ไฟล์ | ค่าไม่ถูกตัด | `--grep "\[ledger\]"` | ∥ R1 |
| **R3–R6** | Optional | — | **ต้องได้รับอนุมัติจากผู้ใช้** | full e2e | หลัง R1 |
| **V** | Final verification | — | ทุกข้อใน §6 เขียว, manual checklist ครบ, ส่ง screenshot | §6 | สุดท้าย |

**งานที่ทำพร้อมกันได้**

- T2a ∥ T2b
- T3 ∥ T4 ∥ T5
- P1 ∥ P2 ∥ P3 ∥ P4 ∥ P5 ∥ P6 ∥ P7 (ไม่มีไฟล์ซ้อนกัน; มีแค่ P3 ที่แตะ api-mock)
- R1 ∥ R2

**ข้อจำกัด:** ทุก agent ใช้ `.next-e2e` และพอร์ต 3100 ร่วมกัน จึง**ห้ามรัน Playwright พร้อมกัน**

- แต่ละ Sonnet agent รันแค่ `typecheck` + `lint:style`
- controller (Opus) รวม e2e แล้วรันทีละชุด

---

## 8. ความเสี่ยงและ rollback

| ความเสี่ยง | ทางป้องกัน / rollback |
|---|---|
| repo ยังไม่มี commit และ `.gitignore` เสีย อาจ commit `.env` เข้าไป | ใน T0 แทนที่ `.gitignore` **ก่อน** `git add` แล้วตรวจ `git status`; ย้อนกลับด้วย `git reset --hard ux-baseline` หรือ `git revert` |
| เขียนทับไฟล์ที่ต่างจาก baseline | รัน `check_base` ก่อน `cp_main` ทุกครั้ง ถ้าเจอ DIVERGED ให้ทำด้วยมือ |
| `@kpv/domain` resolve ไม่ได้ | ใช้ `file:./shared` เหมือน -main ถ้า deploy ใน monorepo เดิม ให้ย้อนกลับเป็น `"*"` ตอน merge |
| ต้องใช้ Next ≥ 15.5 สำหรับ `next typegen` | ใช้ `package-lock.json` จาก -main + `npm ci` |
| CRLF/LF ปนกัน | คัดลอกด้วย `git show` เท่านั้น |
| contrast guard บน gradient เป็นแค่ค่าประมาณ | ตรวจด้วย axe + guard + ดู screenshot ทั้ง 2 theme |
| ผู้ใช้ไม่ยอมรับค่า light token, CANCELLED แบบ neutral หรือ motion ของ dialog | ค่าทั้งหมดอยู่ใน `globals.css`/`status.ts` ย้อนได้ใน 1 commit |
| backend ยังไม่มี `/history` ของ conversion-fees | e2e ใช้ mock; ใน prod จะแสดงเป็น empty (R3 ช่วยแยก error ออกจาก empty) |
