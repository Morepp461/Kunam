(() => {
  const canvas = document.querySelector(".dust-canvas");
  const host = document.querySelector(".scene");
  if (!canvas || !host) return;
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const LOOP_MS = 14000;
  const particles = Array.from({ length: 30 }, (_, i) => ({
    x: ((i * 0.61803398875) % 1),
    y: ((i * 0.41421356237 + 0.17) % 1),
    radius: 0.55 + ((i * 7) % 10) / 10,
    phase: i * 2.3999632297,
    drift: 0.002 + ((i * 3) % 7) * 0.00045,
    alpha: 0.08 + ((i * 5) % 8) * 0.012
  }));

  let width = 1, height = 1, ratio = 1, raf = 0, startAt = 0;
  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (document.hidden) return;
    if (!startAt) startAt = now;
    const phase = ((now - startAt) % LOOP_MS) / LOOP_MS;
    const angle = phase * Math.PI * 2;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      const x = (p.x + Math.sin(angle + p.phase) * p.drift * 2.5) * width;
      const y = (p.y + Math.sin(angle + p.phase * 1.31) * .012 + 1) % 1 * height;
      const twinkle = .65 + .35 * Math.sin(angle + p.phase * 1.7);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,239,205,${p.alpha * twinkle})`;
      ctx.arc(x, y, p.radius * (width < 600 ? .72 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    startAt = 0;
  }
  function start() {
    stop();
    ctx.clearRect(0, 0, width, height);
    if (reducedMotion.matches) return;
    raf = requestAnimationFrame(draw);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  start();
  reducedMotion.addEventListener?.("change", start);
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  window.addEventListener("pagehide", () => { stop(); observer.disconnect(); }, { once: true });
})();