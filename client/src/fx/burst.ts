// A small shower of paper and gold when a hop lands.
export function burst(x: number, y: number, color: string, n = 18, gold = false): void {
  if (document.documentElement.dataset.motion === 'reduced') return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:45;pointer-events:none';
  document.body.appendChild(host);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = 55 + Math.random() * 95, s = 4 + Math.random() * 7;
    const c = gold && i % 3 === 0 ? '#f1cf7c' : color;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s * (Math.random() > 0.5 ? 1 : 0.5)}px;border-radius:${Math.random() > 0.5 ? '50%' : '1px'};background:${c};box-shadow:0 1px 2px rgba(40,20,4,.3)`;
    host.appendChild(p);
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.5)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 50}px)) rotate(${Math.random() * 540}deg) scale(1)`, opacity: 0 },
      ],
      { duration: 750 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    );
  }
  window.setTimeout(() => host.remove(), 1400);
}
