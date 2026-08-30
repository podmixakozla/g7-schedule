const canvas = document.getElementById('confettiCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function spawnConfettiBurst(amount = 35) {
  const colors = ['#C6FF3D', '#FF4FD8', '#FFD400', '#00F5D4', '#FF3366'];
  for (let i = 0; i < amount; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.8) * 16,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 12,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 8 + Math.random() * 8,
      alpha: 1
    });
  }
  startConfettiLoopIfNeeded();
}

function confettiLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.35;
    p.rot += p.vRot;
    p.alpha -= 0.016;

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();

    if (p.alpha <= 0) particles.splice(i, 1);
  }

  if (particles.length > 0) {
    requestAnimationFrame(confettiLoop);
  } else {
    confettiLoopRunning = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function startConfettiLoopIfNeeded() {
  if (!confettiLoopRunning) {
    confettiLoopRunning = true;
    requestAnimationFrame(confettiLoop);
  }
}
