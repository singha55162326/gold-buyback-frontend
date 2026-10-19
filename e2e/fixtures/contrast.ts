import type { Page } from '@playwright/test';

/**
 * Contrast guard for both themes (replaces the old dark-text-only guard).
 *
 * For every visible text-owning element inside `roots` it computes WCAG contrast between the
 * text colour and an ESTIMATED background:
 *   - walk up the ancestors collecting `background-color` layers (alpha-blended, nearest on
 *     top) until an opaque layer is found, then composite the stack over `--page-base`
 *     (read from :root);
 *   - the body's page gradient (a fixed-attachment ellipse radial-gradient) is evaluated at the
 *     element's centre, in viewport coordinates, so the red hot-spot only counts where it is;
 *   - an ancestor with a `linear-gradient` (glass cards, the red chrome) contributes that
 *     gradient sampled at the element's centre inside the ancestor's box (CSS angle maths);
 *     any other gradient contributes its first rgba() stop, or `--surface-solid` at 12% alpha;
 *   - ancestor `opacity` multiplies the text alpha; the text colour is blended over the result.
 * Fails below 4.5:1 (3:1 for >= 24px, or >= 18.66px and bold).
 * Excluded: text on the gold fill (`.btn-primary`, `.btn-gold`, `.pager-btn-active`, gold
 * gradients), transparent-fill text (gold-gradient headings), disabled controls, hidden
 * elements. Placeholders are not text nodes, so they are out of scope by construction.
 *
 * Estimates ignore the fixed page glows, so results can differ slightly from axe;
 * axe's own `color-contrast` "incomplete" count is attached separately as an annotation.
 */
export async function findLowContrast(page: Page, roots: string[] = ['main']): Promise<string[]> {
  return page.evaluate((rootSelectors) => {
    type RGBA = [number, number, number, number];
    const parse = (s: string): RGBA | null => {
      const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
      if (!m) return null;
      let a = 1;
      if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [Number(m[1]), Number(m[2]), Number(m[3]), a];
    };
    const hex = (s: string): RGBA | null => {
      const m = s.trim().match(/^#([0-9a-f]{6})$/i);
      if (!m) return parse(s);
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const c = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [c(0), c(1), c(2), a];
    };
    const lum = (c: RGBA) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    const rootStyle = getComputedStyle(document.documentElement);
    const pageBase = hex(rootStyle.getPropertyValue('--page-base')) ?? [0, 0, 0, 1];

    const onGold = (el: Element) => {
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        if (n.matches('.btn-primary, .btn-gold, .pager-btn-active')) return true;
        const bg = getComputedStyle(n).backgroundImage;
        if (bg.includes('gradient') && bg.includes('248, 226, 164')) return true;
      }
      return false;
    };

    /** Colour of `radial-gradient(<w>% <h>% at <x>% <y>%, c0 p0%, c1 p1%, ...)` at a viewport point. */
    const pageGradientAt = (image: string, px: number, py: number): RGBA | null => {
      const head = image.match(/radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%/);
      if (!head) return null;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const [rx, ry, cx, cy] = [(+head[1] / 100) * W, (+head[2] / 100) * H, (+head[3] / 100) * W, (+head[4] / 100) * H];
      const t = Math.min(1, Math.hypot((px - cx) / rx, (py - cy) / ry));
      const stops = Array.from(image.matchAll(/(rgba?\([^)]*\))\s*([\d.]+)%/g)).map(
        (m) => ({ c: parse(m[1]) as RGBA, p: +m[2] / 100 }),
      );
      if (stops.length === 0 || stops.some((s) => !s.c)) return null;
      for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i].p) {
          const k = (t - stops[i - 1].p) / (stops[i].p - stops[i - 1].p || 1);
          const a = stops[i - 1].c;
          const b = stops[i].c;
          return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, 1];
        }
      }
      return stops[stops.length - 1].c;
    };

    /** Colour of the first `linear-gradient(<angle>, stops...)` in `image` at a point inside `box`. */
    const linearGradientAt = (image: string, box: DOMRect, px: number, py: number): RGBA | null => {
      const start = image.indexOf('linear-gradient(');
      if (start < 0) return null;
      let depth = 0;
      let end = -1;
      for (let i = start + 'linear-gradient'.length; i < image.length; i++) {
        if (image[i] === '(') depth++;
        else if (image[i] === ')' && --depth === 0) {
          end = i;
          break;
        }
      }
      if (end < 0) return null;
      const body = image.slice(start + 'linear-gradient('.length, end);
      const angleMatch = body.match(/^\s*(-?[\d.]+)deg\s*,/);
      const deg = angleMatch ? parseFloat(angleMatch[1]) : 180;
      const stops = Array.from(body.matchAll(/(rgba?\([^)]*\))(?:\s*([\d.]+)%)?/g)).map((m) => ({
        c: parse(m[1]) as RGBA,
        p: m[2] === undefined ? null : +m[2] / 100,
      }));
      if (stops.length < 2 || stops.some((s) => !s.c)) return null;
      stops.forEach((s, i) => {
        if (s.p === null) s.p = i / (stops.length - 1);
      });
      const rad = (deg * Math.PI) / 180;
      const [sin, cos] = [Math.sin(rad), -Math.cos(rad)];
      const len = Math.abs(box.width * sin) + Math.abs(box.height * cos) || 1;
      const t = Math.min(1, Math.max(0, ((px - (box.left + box.width / 2)) * sin + (py - (box.top + box.height / 2)) * cos) / len + 0.5));
      for (let i = 1; i < stops.length; i++) {
        const [a, b] = [stops[i - 1], stops[i]];
        if (t <= (b.p as number)) {
          const k = (t - (a.p as number)) / (((b.p as number) - (a.p as number)) || 1);
          return [0, 1, 2, 3].map((j) => a.c[j] + (b.c[j] - a.c[j]) * k) as RGBA;
        }
      }
      return stops[stops.length - 1].c;
    };

    const background = (el: Element): RGBA => {
      const layers: RGBA[] = [];
      const box = el.getBoundingClientRect();
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (n === document.body) {
          const page = pageGradientAt(cs.backgroundImage, box.left + box.width / 2, box.top + box.height / 2);
          if (page) layers.push(page);
          break;
        }
        if (cs.backgroundImage.includes('gradient') && !cs.backgroundClip.includes('text')) {
          const centre = [box.left + box.width / 2, box.top + box.height / 2];
          const tint =
            linearGradientAt(cs.backgroundImage, n.getBoundingClientRect(), centre[0], centre[1]) ??
            parse(cs.backgroundImage);
          if (tint) layers.push(tint);
          else {
            const solid = hex(cs.getPropertyValue('--surface-solid')) ?? pageBase;
            layers.push([solid[0], solid[1], solid[2], 0.12]);
          }
        }
        const bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      // layers are nearest-first; composite from the farthest up.
      let acc: RGBA = pageBase;
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
      return acc;
    };

    const out: string[] = [];
    for (const sel of rootSelectors) {
      document.querySelectorAll(sel).forEach((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        for (let el = walker.currentNode as HTMLElement | null; el; el = walker.nextNode() as HTMLElement | null) {
          if (el.closest('svg')) continue;
          const hasText = Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
          );
          if (!hasText) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || el.getClientRects().length === 0) continue;
          if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)') continue;
          if (el.closest(':disabled, [aria-disabled="true"]')) continue;
          const fg = parse(cs.color);
          if (!fg) continue;
          let opacity = 1;
          for (let n: Element | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
          if (opacity < 0.05 || fg[3] * opacity < 0.1) continue;
          if (onGold(el)) continue;

          const bg = background(el);
          const text = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
          const r = ratio(text, bg);
          const px = parseFloat(cs.fontSize);
          const bold = Number(cs.fontWeight) >= 700;
          const large = px >= 24 || (px >= 18.66 && bold);
          const min = large ? 3 : 4.5;
          if (r < min) {
            const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
            out.push(
              `${el.tagName.toLowerCase()}${cls} "${(el.textContent ?? '').trim().slice(0, 28)}" ${r.toFixed(2)}<${min} fg=${cs.color} bg=rgb(${bg.slice(0, 3).map(Math.round).join(',')})`,
            );
          }
        }
      });
    }
    return out;
  }, roots);
}
