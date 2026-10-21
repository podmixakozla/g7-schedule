// ------------------------------------------------------------------
// Конфетті (canvas)
// ------------------------------------------------------------------
const canvas = document.getElementById('confettiCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function spawnConfettiBurst(amount = 35, originX, originY) {
  if (prefersReducedMotion) return;
  const colors = ['#D4F54A', '#4558E6', '#FFFFFF', '#B8E028', '#6072F5'];
  const x = originX ?? window.innerWidth / 2;
  const y = originY ?? window.innerHeight / 2;
  for (let i = 0; i < amount; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.85) * 14,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 12,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      alpha: 1
    });
  }
  startConfettiLoopIfNeeded();
}

function confettiLoop() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.99;
    p.vy += 0.3;
    p.rot += p.vRot;
    p.alpha -= 0.014;

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();

    if (p.alpha <= 0) particles.splice(i, 1);
  }

  if (particles.length > 0) {
    requestAnimationFrame(confettiLoop);
  } else {
    confettiLoopRunning = false;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

function startConfettiLoopIfNeeded() {
  if (!confettiLoopRunning) {
    confettiLoopRunning = true;
    requestAnimationFrame(confettiLoop);
  }
}
