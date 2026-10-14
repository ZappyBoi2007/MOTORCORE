(function () {
  'use strict';
  const P = window.MotorPhysics;
  const fmt = (n, digits) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  class CharacteristicGraph {
    constructor(id, options) {
      this.canvas = document.getElementById(id);
      this.ctx = this.canvas.getContext('2d');
      this.tooltip = document.getElementById(id + '-tooltip');
      this.summary = document.getElementById(id + '-summary');
      this.subtitle = document.getElementById(id + '-subtitle');
      this.options = options;
      this.hover = null;
      this.canvas.addEventListener('pointermove', event => {
        const rect = this.canvas.getBoundingClientRect();
        const t = P.clamp((event.clientX - rect.left - 49) / Math.max(1, rect.width - 65), 0, 1);
        this.hover = options.min + t * (options.max - options.min);
        this.draw();
      });
      this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      this.canvas.addEventListener('blur', () => { this.hover = null; this.draw(); });
      this.canvas.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Escape') { this.hover = null; this.draw(); return; }
        const step = (options.max - options.min) / 100;
        const start = this.hover === null ? this.state[options.input] : this.hover;
        this.hover = event.key === 'Home' ? options.min : event.key === 'End' ? options.max
          : P.clamp(start + (event.key === 'ArrowRight' ? step : -step), options.min, options.max);
        this.draw();
      });
    }
    update(state, live) { this.state = state; this.live = live; this.draw(); }
    equilibriumAt(x) {
      const s = { voltage: this.state.voltage, field: this.state.field, load: this.state.load };
      s[this.options.input] = x;
      return P.equilibrium(s.voltage, s.field, s.load)[this.options.output];
    }
    draw() {
      if (!this.state) return;
      const canvas = this.canvas, ctx = this.ctx, o = this.options;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const box = { x: 49, y: 24, w: w - 65, h: h - 63 };
      const samples = Array.from({ length: 161 }, (_, i) => {
        const x = o.min + (o.max - o.min) * i / 160;
        return { x, y: this.equilibriumAt(x) };
      });
      const liveValue = this.live[o.output];
      let max = Math.max(o.output === 'rpm' ? 1000 : 10, ...samples.map(p => p.y), this.live.connected ? liveValue : 0);
      const unit = o.output === 'rpm' ? 1000 : max > 50 ? 20 : 10;
      max = Math.ceil(max * 1.06 / unit) * unit;
      const min = this.live.connected && liveValue < -0.1 ? -Math.ceil(Math.abs(liveValue) * 1.1 / 20) * 20 : 0;
      const px = x => box.x + (x - o.min) / (o.max - o.min) * box.w;
      const py = y => box.y + box.h * (1 - (y - min) / (max - min));
      ctx.font = '9px Consolas, monospace'; ctx.lineWidth = 1;
      if (o.input === 'field') {
        ctx.fillStyle = 'rgba(245,188,115,0.045)'; ctx.fillRect(px(.3), box.y, px(.5) - px(.3), box.h);
      }
      ctx.strokeStyle = '#263544'; ctx.fillStyle = '#8c9eae';
      for (let i = 0; i <= 4; i++) {
        const y = min + (max - min) * i / 4, Y = py(y);
        ctx.beginPath(); ctx.moveTo(box.x, Y); ctx.lineTo(box.x + box.w, Y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(fmt(y, o.output === 'rpm' ? 0 : y % 1 ? 1 : 0), box.x - 9, Y + 3);
      }
      o.ticks.forEach(x => {
        ctx.strokeStyle = '#1d2d3b'; ctx.beginPath(); ctx.moveTo(px(x), box.y); ctx.lineTo(px(x), box.y + box.h); ctx.stroke();
        ctx.fillStyle = '#8c9eae'; ctx.textAlign = 'center'; ctx.fillText(fmt(x, o.input === 'field' ? 1 : 0), px(x), box.y + box.h + 17);
      });
      ctx.textAlign = 'left'; ctx.fillStyle = '#bacbd7'; ctx.font = '9px Consolas, monospace'; ctx.fillText(o.yLabel, box.x, 12);
      ctx.textAlign = 'center'; ctx.fillStyle = '#8c9eae'; ctx.fillText(o.xLabel, box.x + box.w / 2, h - 3);
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
      const warning = o.output === 'rpm' ? 4000 : 60;
      [warning, ...(o.output === 'current' ? [-warning] : [])].forEach(limit => {
        if (limit > min && limit < max) {
          ctx.setLineDash([3, 5]); ctx.strokeStyle = '#ab85525e'; ctx.beginPath(); ctx.moveTo(box.x, py(limit)); ctx.lineTo(box.x + box.w, py(limit)); ctx.stroke(); ctx.setLineDash([]);
        }
      });
      const gradient = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
      gradient.addColorStop(0, '#5de5c71c'); gradient.addColorStop(1, '#5de5c702');
      ctx.beginPath(); ctx.moveTo(px(samples[0].x), py(0));
      samples.forEach(p => ctx.lineTo(px(p.x), py(p.y)));
      ctx.lineTo(px(samples[samples.length - 1].x), py(0)); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath(); samples.forEach((p, i) => i ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y)));
      ctx.strokeStyle = '#5de5c7'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      const selectedX = this.state[o.input], selectedY = this.equilibriumAt(selectedX);
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = '#5de5c747';
      ctx.beginPath(); ctx.moveTo(px(selectedX), box.y); ctx.lineTo(px(selectedX), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      // Draw markers after clipping so endpoints at zero and range limits remain visible.
      ctx.beginPath(); ctx.arc(px(selectedX), py(selectedY), 4.5, 0, Math.PI * 2); ctx.fillStyle = '#5de5c7'; ctx.fill(); ctx.strokeStyle = '#11212d'; ctx.lineWidth = 2; ctx.stroke();
      if (this.live.connected) {
        const X = px(selectedX), Y = py(liveValue);
        ctx.strokeStyle = '#f5bc73'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X - 5, Y); ctx.lineTo(X + 5, Y); ctx.moveTo(X, Y - 5); ctx.lineTo(X, Y + 5); ctx.stroke();
      }
      if (this.hover !== null) {
        const y = this.equilibriumAt(this.hover);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = '#b8d5e088'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(this.hover), box.y); ctx.lineTo(px(this.hover), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(px(this.hover), py(y), 3, 0, Math.PI * 2); ctx.fillStyle = '#e7eef5'; ctx.fill();
        this.tooltip.style.display = 'block';
        this.tooltip.textContent = fmt(this.hover, o.input === 'field' ? 2 : 1) + ' ' + o.xUnit + ' → ' + fmt(y, o.output === 'rpm' ? 0 : 2) + ' ' + o.yUnit + ' (eq)';
      } else this.tooltip.style.display = 'none';
      this.subtitle.textContent = o.fixed(this.state);
      this.summary.textContent = 'Predicted ' + fmt(selectedY, o.output === 'rpm' ? 0 : 2) + ' ' + o.yUnit + ' · ' + (this.live.connected ? 'live ' + fmt(liveValue, o.output === 'rpm' ? 0 : 2) + ' ' + o.yUnit : 'armature open');
      this.canvas.setAttribute('aria-label', o.title + '. ' + this.subtitle.textContent + '. ' + this.summary.textContent + '. Arrow keys inspect the equilibrium curve.');
    }
  }
  class Graphs {
    constructor() {
      this.graphs = [
        new CharacteristicGraph('voltage-graph', { title: 'Speed versus armature voltage', input: 'voltage', output: 'rpm', min: 0, max: 240, ticks: [0, 60, 120, 180, 240], xLabel: 'ARMATURE VOLTAGE (V)', yLabel: 'SPEED (RPM)', xUnit: 'V', yUnit: 'RPM', fixed: s => 'Iꜰ = ' + fmt(s.field, 2) + ' A  ·  Tʟ = ' + fmt(s.load, 1) + ' N·m' }),
        new CharacteristicGraph('field-graph', { title: 'Speed versus field current', input: 'field', output: 'rpm', min: .3, max: 1.5, ticks: [.3, .6, .9, 1.2, 1.5], xLabel: 'FIELD CURRENT (A)', yLabel: 'SPEED (RPM)', xUnit: 'A', yUnit: 'RPM', fixed: s => 'Vₐ = ' + fmt(s.voltage, 0) + ' V  ·  Tʟ = ' + fmt(s.load, 1) + ' N·m' }),
        new CharacteristicGraph('load-graph', { title: 'Armature current versus mechanical load', input: 'load', output: 'current', min: 0, max: 20, ticks: [0, 5, 10, 15, 20], xLabel: 'MECHANICAL LOAD (N·m)', yLabel: 'CURRENT (A)', xUnit: 'N·m', yUnit: 'A', fixed: s => 'Vₐ = ' + fmt(s.voltage, 0) + ' V  ·  Iꜰ = ' + fmt(s.field, 2) + ' A' })
      ];
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.graphs.forEach(g => g.draw()));
        this.graphs.forEach(g => this.observer.observe(g.canvas.parentElement));
      } else window.addEventListener('resize', () => this.graphs.forEach(g => g.draw()));
    }
    update(state, reading) {
      this.graphs.forEach(graph => graph.update(state, reading));
      document.getElementById('graph-context').textContent = 'Equilibrium curves use commanded setpoints, even while stopped. ' + (reading.connected ? 'Amber crosses show instantaneous readings; teal dots show predicted equilibrium.' : 'Live markers are hidden while the armature circuit is open.');
    }
  }
  window.MotorGraphs = Graphs;
}());
