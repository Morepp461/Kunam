(() => {
  const canvas = document.querySelector(".smoke-canvas");
  const host = document.querySelector(".scene");
  if (!canvas || !host) return;

  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 320;
  const spriteContext = sprite.getContext("2d");
  const puffs = [
    [-.16, -.04, .48], [.12, -.1, .42], [-.02, .13, .58],
    [.2, .14, .38], [-.22, .18, .4], [.02, .34, .5],
    [.28, -.02, .3], [-.3, -.12, .28]
  ];

  puffs.forEach(([x, y, radius], index) => {
    const gradient = spriteContext.createRadialGradient(
      160 + x * 320, 160 + y * 320, 4,
      160 + x * 320, 160 + y * 320, radius * 160
    );
    gradient.addColorStop(0, index % 3 === 0 ? "rgba(225,228,232,.18)" : "rgba(196,202,208,.14)");
    gradient.addColorStop(.42, "rgba(174,181,189,.075)");
    gradient.addColorStop(1, "rgba(150,158,168,0)");
    spriteContext.fillStyle = gradient;
    spriteContext.fillRect(0, 0, 320, 320);
  });

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let frame = 0;
  let lastTime = 0;
  let particles = [];
  const random = (min, max) => min + Math.random() * (max - min);

  function createParticle(fromBottom = false) {
    return {
      x: random(-.08, 1.08),
      y: fromBottom ? random(.78, 1.08) : random(.56, 1.08),
      size: random(.16, .34),
      speed: random(.008, .021),
      drift: random(-.012, .012),
      phase: random(0, Math.PI * 2),
      sway: random(.006, .022),
      opacity: random(.38, .85),
      rotation: random(-.5, .5),
      rotationSpeed: random(-.035, .035)
    };
  }

  function resize() {
    const bounds = host.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    particles = Array.from({ length: Math.max(18, Math.min(34, Math.round(width / 30))) }, () => createParticle());
  }

  function draw(time) {
    frame = requestAnimationFrame(draw);
    if (document.hidden) return;

    const delta = Math.min((time - (lastTime || time)) / 1000, .04);
    lastTime = time;
    context.clearRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = "screen";

    const scaleBase = Math.min(width, height);
    for (const particle of particles) {
      particle.y -= particle.speed * delta;
      particle.x += particle.drift * delta + Math.sin(time * .00013 + particle.phase) * particle.sway * delta;
      particle.rotation += particle.rotationSpeed * delta;

      if (particle.y < .48 || particle.x < -.28 || particle.x > 1.28) {
        Object.assign(particle, createParticle(true));
      }

      const size = scaleBase * particle.size;
      const x = particle.x * width + Math.sin(time * .00018 + particle.phase) * size * .12;
      const y = particle.y * height;
      context.globalAlpha = particle.opacity * (.72 + Math.sin(time * .0002 + particle.phase) * .12);
      context.translate(x, y);
      context.rotate(particle.rotation);
      context.drawImage(sprite, -size * .5, -size * .34, size, size * .68);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    context.restore();
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function start() {
    stop();
    if (reducedMotion.matches) {
      context.clearRect(0, 0, width, height);
      return;
    }
    frame = requestAnimationFrame(draw);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  start();

  reducedMotion.addEventListener?.("change", start);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
  window.addEventListener("pagehide", () => {
    stop();
    observer.disconnect();
  }, { once: true });
})();
