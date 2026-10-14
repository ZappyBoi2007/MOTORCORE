(function () {
  'use strict';
  const C = Object.freeze({ Ra: 2, J: 0.5, B: 0.012, Vf: 120, maxStep: 1 / 240, maxFrame: 0.1 });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const k = field => 0.25 + 0.55 * field;
  function equilibrium(voltage, field, load) {
    const K = k(field);
    const omega = Math.max(0, (K * voltage / C.Ra - load) / (K * K / C.Ra + C.B));
    const current = (voltage - K * omega) / C.Ra;
    return { omega, rpm: omega * 60 / (2 * Math.PI), current, torque: K * current };
  }
  class Motor {
    constructor() { this.reset(); }
    reset() {
      this.voltage = 180; this.field = 1; this.load = 5;
      this.omega = 0; this.time = 0; this.connected = false; this.estop = false;
    }
    set(name, value) {
      const limits = { voltage: [0, 240], field: [0.3, 1.5], load: [0, 20] };
      if (!limits[name] || !Number.isFinite(value)) return;
      this[name] = clamp(value, ...limits[name]);
    }
    start() { if (!this.estop) this.connected = true; }
    stop(emergency) { this.connected = false; if (emergency) this.estop = true; }
    rearm() { this.estop = false; this.connected = false; }
    acceleration(omega) {
      const current = this.connected ? (this.voltage - k(this.field) * omega) / C.Ra : 0;
      return (k(this.field) * current - this.load - C.B * omega) / C.J;
    }
    step(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const dt = Math.min(seconds, C.maxFrame);
      const count = Math.ceil(dt / C.maxStep), h = dt / count;
      for (let i = 0; i < count; i++) {
        // Midpoint integration; a passive load resists motion but cannot drive reverse rotation.
        const mid = Math.max(0, this.omega + this.acceleration(this.omega) * h / 2);
        this.omega = Math.max(0, this.omega + this.acceleration(mid) * h);
      }
      this.time += dt;
    }
    read() {
      const K = k(this.field), voltage = this.connected ? this.voltage : 0;
      const emf = K * this.omega;
      // An open armature circuit has zero current, not a short-circuit braking current.
      const current = this.connected ? (voltage - emf) / C.Ra : 0;
      const torque = K * current, rpm = this.omega * 60 / (2 * Math.PI);
      const alpha = Math.max(this.omega === 0 ? 0 : -Infinity, (torque - this.load - C.B * this.omega) / C.J);
      const armaturePower = voltage * current, fieldPower = C.Vf * this.field;
      const inputPower = armaturePower + fieldPower, outputPower = this.load * this.omega;
      const copperLoss = current * current * C.Ra, frictionLoss = C.B * this.omega * this.omega;
      const storedPower = C.J * this.omega * alpha;
      const eq = equilibrium(this.voltage, this.field, this.load);
      const settled = this.connected && Math.abs(this.omega - eq.omega) < 0.5 && Math.abs(alpha) < 0.1;
      const efficiency = settled && current > 0 && outputPower > 0 && inputPower > 0 && outputPower <= inputPower
        ? outputPower / inputPower * 100 : null;
      const stalled = this.connected && voltage > 0 && this.omega < 0.1 && torque <= this.load;
      return { K, voltage, field: this.field, load: this.load, omega: this.omega, rpm, emf, current, torque,
        alpha, inputPower, armaturePower, fieldPower, outputPower, copperLoss, frictionLoss, storedPower,
        efficiency, settled, stalled, time: this.time, connected: this.connected, estop: this.estop,
        braking: this.connected && current < -0.01, regenerating: this.connected && armaturePower < -0.01, eq };
    }
  }
  window.MotorPhysics = Object.freeze({ C, k, clamp, equilibrium, Motor });
}());

