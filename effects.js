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
      this.electricCanvas = $('electric-canvas');
      this.electricCtx = this.electricCanvas && this.electricCanvas.getContext ? this.electricCanvas.getContext('2d') : null;
      if (this.electricCtx) this.stage.classList.add('electric-canvas-ready');
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.smallScreen = window.matchMedia('(max-width: 700px)');
      this.paused = document.hidden;
      this.opacity = 0;
      this.target = 0;
      this.phase = 0;
      this.lastDraw = -Infinity;
      this.canvasHadPaint = false;
      this.lastStrength = '';
      this.electricLevel = 0;
      this.electricTarget = 0;
      this.electricTint = 0;
      this.electricLastDraw = -Infinity;
      this.electricHadPaint = false;
      this.selectedPart = null;
      this.pinnedPart = null;
      this.currentReading = null;
      this.componentCard = $('component-card');
      this.componentCard.hidden = true;
      this.setPaused(this.paused);
      if (typeof ResizeObserver !== 'undefined') {
        this.stageObserver = new ResizeObserver(() => {
          this.sizeElectricCanvas();
          if (this.selectedPart) this.positionComponentCard($(this.selectedPart));
        });
        this.stageObserver.observe(this.stage);
      }
      this.bindSpotlights();
      this.bindBursts();
      this.bindReveals();
      this.bindComponents();
    }

    update(reading) {
      this.currentReading = reading;
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
        ? clamp(reading.rpm / 720, 0, 1) * (.62 + .22 * currentLevel)
        : 0;
      this.electricTarget = !this.reducedMotion.matches && !this.stage.className.includes('classic-view')
        ? mode === 'energized' ? 1 : mode === 'emergency' ? .73 : 0
        : 0;
      if (this.selectedPart) this.updateComponentCard();
    }

    setPaused(value) {
      this.paused = Boolean(value);
      document.body.classList.toggle('visuals-paused', this.paused);
      this.lastDraw = -Infinity;
      this.electricLastDraw = -Infinity;
    }

    tick(timestamp, dt, reading) {
      if (this.paused || document.hidden) return;
      this.tickElectric(timestamp, dt, reading);
      if (!this.ctx) return;
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
        const tail = Math.max(0, head - (.065 + speed * .095));
        const point = progress => ({
          x: width * (.04 + .88 * progress),
          y: height * (.5 + side * lane * (1 - .48 * progress) + bend * Math.sin(progress * Math.PI))
        });
        ctx.beginPath();
        for (let segment = 0; segment <= 7; segment++) {
          const p = point(tail + (head - tail) * segment / 7);
          if (segment === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,190,108,.74)' : 'rgba(103,222,252,.67)';
        ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.45;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.canvasHadPaint = true;
      this.lastDraw = timestamp;
    }

    sizeElectricCanvas() {
      if (!this.electricCtx) return null;
      const width = this.electricCanvas.clientWidth, height = this.electricCanvas.clientHeight;
      if (width < 24 || height < 24) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, this.smallScreen.matches ? 1.25 : 1.5);
      const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
      if (this.electricCanvas.width !== pixelWidth || this.electricCanvas.height !== pixelHeight) {
        this.electricCanvas.width = pixelWidth;
        this.electricCanvas.height = pixelHeight;
        this.electricHadPaint = false;
      }
      return { width, height, dpr };
    }

    tickElectric(timestamp, dt, reading) {
      if (!this.electricCtx) return; // The existing SVG rim is the Canvas fallback.
      const disabled = this.reducedMotion.matches || this.stage.className.includes('classic-view');
      const target = disabled ? 0 : this.electricTarget;
      const mix = 1 - Math.exp(-Math.min(dt, .1) / .32);
      this.electricLevel += (target - this.electricLevel) * mix;
      this.electricTint += ((reading.estop ? 1 : 0) - this.electricTint) * mix;
      if (this.electricLevel < .004 && target === 0) {
        this.electricLevel = 0;
        if (this.electricHadPaint) {
          this.electricCtx.clearRect(0, 0, this.electricCanvas.width, this.electricCanvas.height);
          this.electricHadPaint = false;
        }
        return;
      }
      if (timestamp - this.electricLastDraw < (this.smallScreen.matches ? 50 : 33)) return;
      const size = this.sizeElectricCanvas();
      if (!size) return;
      const { width, height, dpr } = size;
      const ctx = this.electricCtx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const inset = 5, radius = Math.min(11, width / 8, height / 8);
      const left = inset, top = inset, right = width - inset, bottom = height - inset;
      const horizontal = right - left - 2 * radius;
      const vertical = bottom - top - 2 * radius;
      const arc = Math.PI * radius / 2;
      const perimeter = 2 * (horizontal + vertical) + 4 * arc;
      const corner = (cx, cy, a, distance) => {
        const angle = a + distance / radius;
        return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      };
      const perimeterPoint = raw => {
        let s = ((raw % perimeter) + perimeter) % perimeter;
        if (s < horizontal) return { x: left + radius + s, y: top };
        s -= horizontal;
        if (s < arc) return corner(right - radius, top + radius, -Math.PI / 2, s);
        s -= arc;
        if (s < vertical) return { x: right, y: top + radius + s };
        s -= vertical;
        if (s < arc) return corner(right - radius, bottom - radius, 0, s);
        s -= arc;
        if (s < horizontal) return { x: right - radius - s, y: bottom };
        s -= horizontal;
        if (s < arc) return corner(left + radius, bottom - radius, Math.PI / 2, s);
        s -= arc;
        if (s < vertical) return { x: left, y: bottom - radius - s };
        s -= vertical;
        return corner(left + radius, top + radius, Math.PI, s);
      };
      const time = timestamp / 1000;
      const tint = this.electricTint;
      const color = (alpha, warm = false) => {
        const blue = warm ? [255, 183, 109] : [111, 231, 255];
        const red = [244, 102, 126];
        const rgb = blue.map((v, i) => Math.round(v * (1 - tint) + red[i] * tint));
        return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let strand = 0; strand < 3; strand++) {
        const direction = strand === 1 ? -1 : 1;
        const head = (time * (.055 + strand * .013) * direction + strand * .37 + 3) % 1;
        const length = strand === 0 ? .22 : strand === 1 ? .16 : .12;
        const points = [];
        for (let i = 0; i <= 31; i++) {
          const distance = (head - length + length * i / 31) * perimeter;
          const p = perimeterPoint(distance), next = perimeterPoint(distance + 1);
          const dx = next.x - p.x, dy = next.y - p.y;
          const norm = Math.hypot(dx, dy) || 1;
          const irregularity = Math.sin(distance * .11 + time * 5.2 + strand * 2.4) * 2.4
            + Math.sin(distance * .39 - time * 7.1 + strand * 4.1) * 1.25;
          points.push({ x: p.x - dy / norm * irregularity, y: p.y + dx / norm * irregularity });
        }
        const trace = () => {
          ctx.beginPath();
          points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        };
        const warm = strand === 2 && !reading.estop;
        trace();
        ctx.strokeStyle = color(.16 * this.electricLevel, warm);
        ctx.lineWidth = 11;
        ctx.stroke();
        trace();
        ctx.strokeStyle = color(.47 * this.electricLevel, warm);
        ctx.lineWidth = 4.5;
        ctx.stroke();
        trace();
        ctx.strokeStyle = color(.96 * this.electricLevel, warm);
        ctx.lineWidth = 1.35;
        ctx.stroke();
        const branchPulse = Math.pow(Math.max(0, Math.sin(time * 1.4 + strand * 2.7)), 18);
        if (branchPulse > .12) {
          const a = points[19], b = points[20];
          const dx = b.x - a.x, dy = b.y - a.y;
          const norm = Math.hypot(dx, dy) || 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(a.x - dy / norm * 7 + dx / norm * 3, a.y + dx / norm * 7 + dy / norm * 3);
          ctx.lineTo(a.x - dy / norm * 11 + dx / norm * 8, a.y + dx / norm * 11 + dy / norm * 8);
          ctx.strokeStyle = color(branchPulse * this.electricLevel * .8);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      this.electricHadPaint = true;
      this.electricLastDraw = timestamp;
    }

    bindComponents() {
      this.componentParts = {
        stator: {
          name: 'FIELD STATOR / WINDINGS',
          description: 'The stationary field establishes magnetic flux through the armature.',
          principle: 'A separately regulated 120 V field sets K = 0.25 + 0.55 Iꜰ.',
          reading: r => `Field ${r.field.toFixed(2)} A  ·  K ${r.K.toFixed(3)} V·s/rad`
        },
        rotor: {
          name: 'ARMATURE / ROTOR',
          description: 'Electromagnetic torque accelerates the rotating assembly and drives the output shaft.',
          principle: 'Tₑ = K Iₐ; inertia and opposing torque set angular acceleration.',
          reading: r => `Speed ${Math.round(r.rpm).toLocaleString('en-US')} RPM  ·  Tₑ ${r.torque.toFixed(2)} N·m`
        },
        copper: {
          name: 'COPPER ARMATURE WINDINGS',
          description: 'Armature conductors carry the signed current produced by supply voltage and back EMF.',
          principle: 'Iₐ = (Vₐ − Kω) / Rₐ; copper heating is Iₐ²Rₐ.',
          reading: r => `Iₐ ${r.current.toFixed(2)} A  ·  copper loss ${r.copperLoss.toFixed(0)} W`
        },
        shaft: {
          name: 'OUTPUT SHAFT',
          description: 'The steel shaft carries the rotor’s rotation to the coupled load brake.',
          principle: 'Useful load output is the selected load torque times angular speed.',
          reading: r => `Speed ${Math.round(r.rpm).toLocaleString('en-US')} RPM  ·  load output ${(r.outputPower / 1000).toFixed(3)} kW`
        },
        brake: {
          name: 'MECHANICAL LOAD BRAKE',
          description: 'The selected mechanical load resists forward rotation and draws useful shaft power.',
          principle: 'Load torque opposes electromagnetic torque in J dω/dt = Tₑ − Tʟ − Bω.',
          reading: r => `Load ${r.load.toFixed(1)} N·m  ·  output ${(r.outputPower / 1000).toFixed(3)} kW`
        }
      };
      Object.keys(this.componentParts).forEach(part => {
        const hotspot = $('hotspot-' + part);
        if (!hotspot) return;
        hotspot.addEventListener('pointerenter', () => {
          if (!this.pinnedPart) this.showComponent(part);
        });
        hotspot.addEventListener('pointerleave', () => {
          if (!this.pinnedPart) this.hideComponent();
        });
        hotspot.addEventListener('focus', () => {
          if (!this.pinnedPart) this.showComponent(part);
        });
        hotspot.addEventListener('blur', () => {
          if (!this.pinnedPart) this.hideComponent();
        });
        hotspot.addEventListener('click', () => {
          if (this.pinnedPart === part) this.hideComponent();
          else { this.pinnedPart = part; this.showComponent(part); }
        });
        hotspot.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (this.pinnedPart === part) this.hideComponent();
            else { this.pinnedPart = part; this.showComponent(part); }
          }
        });
      });
      $('component-close').addEventListener('click', () => this.hideComponent());
      window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.selectedPart) this.hideComponent();
      });
    }

    showComponent(part) {
      this.selectedPart = part;
      this.componentCard.hidden = false;
      Object.keys(this.componentParts).forEach(name => {
        const hotspot = $('hotspot-' + name);
        hotspot.classList.toggle('is-selected', name === part);
        hotspot.setAttribute('aria-expanded', String(name === part));
      });
      this.updateComponentCard();
      this.positionComponentCard($('hotspot-' + part));
    }

    updateComponentCard() {
      if (!this.selectedPart || !this.currentReading) return;
      const item = this.componentParts[this.selectedPart];
      $('component-title').textContent = item.name;
      $('component-description').textContent = item.description;
      $('component-principle').textContent = item.principle;
      const live = item.reading(this.currentReading);
      if ($('component-reading').textContent !== live) $('component-reading').textContent = live;
    }

    positionComponentCard(hotspot) {
      if (!hotspot || this.componentCard.hidden) return;
      const stage = this.stage.getBoundingClientRect();
      const anchor = hotspot.getBoundingClientRect();
      const card = this.componentCard.getBoundingClientRect();
      const left = clamp(anchor.left - stage.left + anchor.width / 2 - card.width / 2,
        8, Math.max(8, stage.width - card.width - 8));
      const above = anchor.top - stage.top - card.height - 16;
      const below = anchor.top + anchor.height - stage.top + 16;
      const top = above >= 8 ? above : clamp(below, 8, Math.max(8, stage.height - card.height - 8));
      this.componentCard.style.left = Math.round(left) + 'px';
      this.componentCard.style.top = Math.round(top) + 'px';
    }

    hideComponent() {
      this.selectedPart = null;
      this.pinnedPart = null;
      this.componentCard.hidden = true;
      Object.keys(this.componentParts).forEach(part => {
        const hotspot = $('hotspot-' + part);
        hotspot.classList.remove('is-selected');
        hotspot.setAttribute('aria-expanded', 'false');
      });
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
