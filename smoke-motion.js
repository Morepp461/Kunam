(() => {
  const canvas = document.querySelector(".smoke-canvas");
  const host = document.querySelector(".scene");
  if (!canvas || !host) return;

  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 420;
  const paint = sprite.getContext("2d");
  const clouds = [
    [-.22, -.04, .43, .16], [.08, -.12, .48, .18], [.28, .04, .42, .14],
    [-.08, .2, .55, .13], [.2, .27, .46, .15], [-.3, .28, .38, .12],
    [.02, -.32, .36, .12], [.34, -.24, .34, .1]
  ];
  clouds.forEach(([x, y, radius, alpha], index) => {
    const cx = 210 + x * 300, cy = 210 + y * 300;
    const gradient = paint.createRadialGradient(cx, cy, 5, cx, cy, radius * 210);
    gradient.addColorStop(0, `rgba(224,229,234,${alpha})`);
    gradient.addColorStop(.28, `rgba(204,211,219,${alpha * .72})`);
    gradient.addColorStop(.62, `rgba(177,187,198,${alpha * .28})`);
    gradient.addColorStop(1, "rgba(150,160,172,0)");
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, 420, 420);
  });

  let width = 1, height = 1, ratio = 1, raf = 0, previous = 0;
  let particles = [];
  const random = (min, max) => min + Math.random() * (max - min);
  function makeParticle(initial = false) {
    return {
      x: random(-.08, 1.08), y: initial ? random(.57, 1.08) : random(.88, 1.12),
      size: random(.22, .43), rise: random(.006, .014), drift: random(-.008, .008),
      phase: random(0, Math.PI * 2), sway: random(.012, .03),
      alpha: random(.2, .42), rotation: random(-.4, .4), spin: random(-.018, .018)
    };
  }
  function resize() {
    const box = host.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({length: Math.max(22, Math.min(42, Math.round(width / 24)))}, () => makeParticle(true));
  }
  function draw(time) {
    raf = requestAnimationFrame(draw);
    if (document.hidden) return;
    const dt = Math.min((time - (previous || time)) / 1000, .04);
    previous = time;
    context.clearRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = "screen";
    const unit = Math.min(width, height);
    for (const p of particles) {
      p.y -= p.rise * dt;
      p.x += (p.drift + Math.sin(time * .00016 + p.phase) * p.sway) * dt;
      p.rotation += p.spin * dt;
      if (p.y < .43 || p.x < -.3 || p.x > 1.3) Object.assign(p, makeParticle());
      const size = unit * p.size;
      const x = p.x * width + Math.sin(time * .0002 + p.phase) * size * .16;
      const y = p.y * height;
      context.globalAlpha = p.alpha * (.72 + Math.sin(time * .00024 + p.phase) * .2);
      context.translate(x, y); context.rotate(p.rotation);
      context.drawImage(sprite, -size * .5, -size * .36, size, size * .72);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    context.restore();
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; previous = 0; }
  function start() {
    stop();
    if (reducedMotion.matches) { context.clearRect(0, 0, width, height); return; }
    raf = requestAnimationFrame(draw);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host); resize(); start();
  reducedMotion.addEventListener?.("change", start);
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  window.addEventListener("pagehide", () => { stop(); observer.disconnect(); }, {once:true});
})();