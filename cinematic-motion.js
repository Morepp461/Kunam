(() => {
  const canvas = document.querySelector(".dust-canvas");
  const host = document.querySelector(".scene");
  if (!canvas || !host) return;
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const LOOP_MS = 12000;
  const PARTICLE_COUNT = 76;
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    x: ((i * 0.61803398875) % 1),
    y: ((i * 0.41421356237 + 0.17) % 1),
    radius: 0.75 + ((i * 7) % 15) / 10,
    phase: ((i * 0.754877666) % 1),
    driftX: ((i % 2 ? -1 : 1) * (0.018 + ((i * 3) % 9) * 0.006)),
    driftY: -0.025 - ((i * 5) % 11) * 0.006,
    alpha: 0.2 + ((i * 5) % 9) * 0.032,
    streak: i % 5 === 0
  }));

  let width = 1, height = 1, ratio = 1, raf = 0, startAt = 0;
  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 1.75);
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
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      const travel = (phase + p.phase) % 1;
      const x = ((p.x + p.driftX * travel + 1.2) % 1.2 - 0.1) * width;
      const y = ((p.y + p.driftY * travel + 1.1) % 1.1 - 0.05) * height;
      const pulse = 0.72 + 0.28 * Math.sin((travel * Math.PI * 2) + p.phase * 13);
      const alpha = p.alpha * pulse;
      const radius = p.radius * (width < 600 ? 0.82 : 1);

      ctx.beginPath();
      ctx.fillStyle = `rgba(255,242,213,${alpha})`;
      ctx.shadowColor = `rgba(255,224,166,${alpha * 0.9})`;
      ctx.shadowBlur = p.streak ? 9 : 5;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (p.streak) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,232,194,${alpha * 0.48})`;
        ctx.lineWidth = Math.max(0.6, radius * 0.65);
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.driftX * width * 0.12, y - p.driftY * height * 0.12);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
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