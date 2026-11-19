// Feeling the game through the device. Android browsers vibrate through the Vibration API.
// iPhones have no such API, but Safari gives a light tick when a switch control is toggled,
// so a hidden switch stands in for it there.
import type { Tier } from '../../../shared/rules.ts';
import type { FlipTier } from './sound.ts';

class Haptics {
  enabled = true;
  private label: HTMLLabelElement | null = null;
  private readonly canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  private tick(): void {
    if (typeof document === 'undefined') return;
    if (!this.label) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      this.label = label;
    }
    this.label.click();
  }

  /** A single buzz of so many milliseconds, or a pattern of buzz, pause, buzz, pause... */
  play(pattern: number | number[]): void {
    if (!this.enabled) return;
    try {
      if (this.canVibrate) {
        navigator.vibrate(pattern);
        return;
      }
      // the stand-in can only tick: play one tick for each buzz in the pattern
      const p = Array.isArray(pattern) ? pattern : [pattern];
      let at = 0;
      for (let i = 0; i < p.length; i += 2) {
        if (at === 0) this.tick();
        else window.setTimeout(() => this.tick(), at);
        at += p[i] + (p[i + 1] ?? 0);
      }
    } catch {
      /* a device that cannot buzz is not an error */
    }
  }

  tap(): void {
    this.play(8);
  }

  door(tier: Tier): void {
    this.play({ crumb: 6, loaf: 11, fish: [9, 26, 9], pearl: [6, 30, 6, 30, 14], nugget: [8, 24, 8, 24, 8, 24, 30], wall: [22] }[tier]);
  }

  used(): void {
    this.play([4, 34, 4]);
  }

  /** One tick for each page as it turns, then a firmer one as the last lands. */
  flip(leaves: number, staggerMs: number, durationMs: number, tier: FlipTier): void {
    const landing = { crumb: 10, loaf: 16, fish: 22, pearl: 30, nugget: 45, home: 40, wall: 16 }[tier];
    const pattern: number[] = [];
    let at = 0;
    for (let i = 0; i < leaves; i++) {
      pattern.push(6, Math.max(8, staggerMs - 6));
      at += staggerMs;
    }
    const rest = Math.max(10, durationMs + (leaves - 1) * staggerMs - at);
    pattern[pattern.length - 1] = Math.max(10, pattern[pattern.length - 1] + rest - landing);
    pattern.push(landing);
    if (tier === 'pearl' || tier === 'home' || tier === 'nugget') pattern.push(50, 14, 50, 22);
    this.play(pattern);
  }

  refuse(): void {
    this.play([12, 44, 12]);
  }

  strike(): void {
    this.play([30, 52, 30]);
  }

  rooster(): void {
    this.play([30, 40, 30, 40, 30, 60, 110]);
  }

  grace(): void {
    this.play([10, 70, 10, 70, 10]);
  }

  lookBack(): void {
    this.play([22, 40, 10, 30, 6]);
  }

  home(): void {
    this.play([14, 36, 14, 36, 14, 36, 70]);
  }

  loss(): void {
    this.play([60, 90, 130]);
  }
}

export const haptics = new Haptics();
