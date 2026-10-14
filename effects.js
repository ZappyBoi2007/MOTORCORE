(function () {
  'use strict';

  // Decorative presentation only. The motor model and all instruments read physics.js directly.
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const $ = id => document.getElementById(id);

  class MotorEffects {
    constructor() {
      this.stage = $('motor-stage');
      this.canvas = $('energy-trails');
      this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.smallScreen = window.matchMedia('(max-width: 700px)');
      this.paused = document.hidden;
      this.opacity = 0;
      this.target = 0;
      this.phase = 0;
      this.lastDraw = -Infinity;
      this.canvasHadPaint = false;
      this.lastStrength = '';
      this.setPaused(this.paused);
      this.bindSpotlights();
      this.bindBursts();
      this.bindReveals();
    }

    update(reading) {
      const mode = reading.estop ? 'emergency' : reading.connected ? 'energized' : 'standby';
      if (document.body.dataset.energy !== mode) document.body.dataset.energy = mode;

      // Current is used only for glow strength; speed controls only the visual trail.
      // Neither quantity feeds back into the simulation.
      const currentLevel = clamp(Math.abs(reading.current) / 90, 0, 1);
      const fieldLevel = clamp((reading.field - .3) / 1.2, 0, 1);
      const strength = (reading.connected ? .23 + .62 * currentLevel : 0).toFixed(2);
      const fieldStrength = (.16 + .28 * fieldLevel).toFixed(2);
      const key = strength + ':' + fieldStrength;
      if (key !== this.lastStrength) {
        document.body.style.setProperty('--electric-alpha', strength);
        document.body.style.setProperty('--field-alpha', fieldStrength);
        this.lastStrength = key;
      }
      this.target = mode === 'energized' && !this.reducedMotion.matches && !this.stage.className.includes('classic-view')
        ? clamp(reading.rpm / 850, 0, 1) * (.32 + .18 * currentLevel)
        : 0;
    }

    setPaused(value) {
      this.paused = Boolean(value);
      document.body.classList.toggle('visuals-paused', this.paused);
      this.lastDraw = -Infinity;
    }

    tick(timestamp, dt, reading) {
      if (!this.ctx || this.paused || document.hidden) return;
      if (this.reducedMotion.matches || this.stage.className.includes('classic-view') || reading.estop) this.target = 0;
      const mix = 1 - Math.exp(-Math.min(dt, .1) / .24);
      this.opacity += (this.target - this.opacity) * mix;
      if (this.opacity < .003 && this.target === 0) {
        this.opacity = 0;
        if (this.canvasHadPaint) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.canvasHadPaint = false;
        }
        return;
      }
      // Decorative Canvas is capped to 30 fps on desktop and 20 fps on mobile.
      if (timestamp - this.lastDraw < (this.smallScreen.matches ? 50 : 33)) return;
      const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
      if (width < 1 || height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, this.smallScreen.matches ? 1.25 : 1.5);
      const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const speed = clamp(reading.rpm / 4000, 0, 1);
      if (speed > 0) this.phase = (this.phase + Math.min(dt, .1) * (.08 + .22 * speed)) % 1;
      const count = this.smallScreen.matches ? 6 : 10;
      ctx.lineCap = 'round';
      ctx.globalAlpha = this.opacity;
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? -1 : 1;
        const lane = .14 + (i % 5) * .057;
        const bend = (i % 3 - 1) * .014;
        const head = (this.phase + i * .177) % 1;
        const tail = Math.max(0, head - (.055 + speed * .037));
        const point = progress => ({
          x: width * (.04 + .88 * progress),
          y: height * (.5 + side * lane * (1 - .48 * progress) + bend * Math.sin(progress * Math.PI))
        });
        ctx.beginPath();
        for (let segment = 0; segment <= 7; segment++) {
          const p = point(tail + (head - tail) * segment / 7);
          if (segment === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(239,181,106,.47)' : 'rgba(106,221,234,.38)';
        ctx.lineWidth = i % 3 === 0 ? 1.8 : 1.15;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.canvasHadPaint = true;
      this.lastDraw = timestamp;
    }

    bindSpotlights() {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      ['controls', 'machine-panel', 'instrument-panel'].forEach(id => {
        const panel = $(id);
        if (!panel) return;
        let nextPoint = null, scheduled = false;
        panel.addEventListener('pointermove', event => {
          if (this.paused) return;
          nextPoint = [event.clientX, event.clientY];
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(() => {
            scheduled = false;
            if (!nextPoint || this.paused) return;
            const bounds = panel.getBoundingClientRect();
            panel.style.setProperty('--spot-x', Math.round(nextPoint[0] - bounds.left) + 'px');
            panel.style.setProperty('--spot-y', Math.round(nextPoint[1] - bounds.top) + 'px');
          });
        });
      });
    }

    bindBursts() {
      const bind = (element, emergency = false) => {
        if (!element) return;
        element.addEventListener('click', event => {
          if (this.reducedMotion.matches) return;
          const bounds = element.getBoundingClientRect();
          const x = Number.isFinite(event.clientX) && event.clientX !== 0 ? event.clientX : bounds.left + bounds.width / 2;
          const y = Number.isFinite(event.clientY) && event.clientY !== 0 ? event.clientY : bounds.top + bounds.height / 2;
          const pulse = document.createElement('span');
          pulse.className = 'impact-pulse' + (emergency ? ' impact-danger' : '');
          pulse.setAttribute('aria-hidden', 'true');
          pulse.style.left = x + 'px'; pulse.style.top = y + 'px';
          document.body.append(pulse);
          setTimeout(() => pulse.remove(), 520);
        });
      };
      bind($('run'));
      bind($('record'));
      bind($('estop'), true);
      document.querySelectorAll('[data-preset]').forEach(button => bind(button));
    }

    bindReveals() {
      if (this.reducedMotion.matches || typeof IntersectionObserver === 'undefined') return;
      const targets = document.querySelectorAll('.characteristics, .observations, .knowledge-grid');
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.remove('reveal-pending');
          entry.target.classList.add('reveal-complete');
          observer.unobserve(entry.target);
        });
      }, { threshold: .06 });
      targets.forEach(element => {
        if (element.getBoundingClientRect().top < window.innerHeight * .85) return;
        element.classList.add('reveal-pending');
        observer.observe(element);
        // A stalled observer must never hide information indefinitely.
        setTimeout(() => {
          if (element.classList.contains('reveal-pending')) {
            element.classList.remove('reveal-pending');
            observer.unobserve(element);
          }
        }, 4000);
      });
    }
  }

  window.MotorEffects = MotorEffects;
}());
