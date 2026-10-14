(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = window.MotorPhysics, motor = new P.Motor(), graphs = new window.MotorGraphs();
  const observations = [], selected = new Set();
  let nextTrial = 1, previousFrame = null, previousReadout = -Infinity, previousGraph = -Infinity;
  let angle = 0, particlePhase = 0, toastTimer = 0, lastSafety = '';
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stage = $('motor-stage'), twinRotor = $('twin-rotor'), currentGlow = $('twin-current-glow');
  const viewAngle = $('view-angle'), viewZoom = $('view-zoom');
  function applyView() {
    stage.style.setProperty('--view-angle', viewAngle.value + 'deg');
    stage.style.setProperty('--view-scale', (Number(viewZoom.value) / 100).toFixed(2));
    viewAngle.style.setProperty('--fill', ((Number(viewAngle.value) + 14) / 28 * 100).toFixed(1) + '%');
    viewZoom.style.setProperty('--fill', ((Number(viewZoom.value) - 100) / 18 * 100).toFixed(1) + '%');
    $('view-angle-value').textContent = (Number(viewAngle.value) < 0 ? '−' : '+') + Math.abs(Number(viewAngle.value)) + '°';
    $('view-zoom-value').textContent = viewZoom.value + '%';
  }
  [viewAngle, viewZoom].forEach(input => input.addEventListener('input', applyView));
  $('view-reset').addEventListener('click', () => { viewAngle.value = '-6'; viewZoom.value = '104'; applyView(); });
  function setViewMode(classic) {
    stage.classList.toggle('classic-view', classic);
    $('view-twin').setAttribute('aria-pressed', String(!classic));
    $('view-classic').setAttribute('aria-pressed', String(classic));
    viewAngle.disabled = viewZoom.disabled = $('view-reset').disabled = classic;
    $('motor-svg-desc').textContent = classic
      ? 'Original SVG motor. Rotor and shaft follow simulated speed at one fortieth scale.'
      : 'Enhanced SVG digital twin. Rotor and shaft follow simulated speed at one fortieth scale. Angle and zoom affect appearance only.';
  }
  $('view-twin').addEventListener('click', () => setViewMode(false));
  $('view-classic').addEventListener('click', () => setViewMode(true));
  applyView(); setViewMode(false);
  const display = (number, digits = 2) => (Math.abs(number) < .5 * Math.pow(10, -digits) ? 0 : number).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const signed = (number, digits = 1) => (number >= 0 ? '+' : '') + display(number, digits);
  const setText = (id, text) => { const node = $(id); if (node.textContent !== String(text)) node.textContent = text; };
  const clock = time => Math.floor(time / 60).toString().padStart(2, '0') + ':' + (time % 60).toFixed(1).padStart(4, '0');
  function notify(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
  }
  function stateName(r) {
    if (r.estop) return r.rpm > .5 ? 'E-STOP / COASTING' : 'E-STOP / REST';
    if (!r.connected) return r.rpm > .5 ? 'COASTING' : 'STANDBY';
    if (r.stalled) return 'STALLED';
    if (r.regenerating) return 'REGENERATING';
    if (r.braking) return 'DYNAMIC BRAKING';
    return r.settled ? 'STEADY' : 'TRANSIENT';
  }
  function syncControl(name, updateNumber = true) {
    const slider = $(name), value = motor[name];
    slider.value = value;
    slider.style.setProperty('--fill', ((value - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100) + '%');
    if (updateNumber) $(name + '-number').value = value.toFixed(name === 'field' ? 2 : name === 'load' ? 1 : 0);
  }
  function syncControls() { ['voltage', 'field', 'load'].forEach(name => syncControl(name)); }
  function updateControl(name, value, updateNumber = true) {
    motor.set(name, value); syncControl(name, updateNumber); render(); graphs.update(motor, motor.read());
  }
  ['voltage', 'field', 'load'].forEach(name => {
    $(name).addEventListener('input', () => updateControl(name, Number($(name).value)));
    const numeric = $(name + '-number');
    numeric.addEventListener('input', () => {
      if (numeric.value !== '' && Number.isFinite(numeric.valueAsNumber) && numeric.validity.valid)
        updateControl(name, numeric.valueAsNumber, false);
    });
    numeric.addEventListener('change', () => {
      if (numeric.value === '' || !Number.isFinite(numeric.valueAsNumber)) { syncControl(name); return; }
      const step = Number(numeric.step), rounded = Math.round(numeric.valueAsNumber / step) * step;
      updateControl(name, rounded);
    });
    numeric.addEventListener('keydown', event => { if (event.key === 'Enter') numeric.blur(); });
    numeric.addEventListener('blur', () => syncControl(name));
  });
  $('run').addEventListener('click', () => {
    if (motor.estop) { motor.rearm(); notify('Stop latch released. Select Energize motor to restart.'); }
    else if (motor.connected) { motor.stop(false); notify('Armature opened. Shaft coasts under friction and load.'); }
    else { motor.start(); notify('Armature energized. Live integration running.'); }
    render(); graphs.update(motor, motor.read());
  });
  function emergencyStop() {
    motor.stop(true); render(); graphs.update(motor, motor.read());
    notify('EMERGENCY STOP — armature open, field energized. Shaft coasting.');
  }
  $('estop').addEventListener('click', emergencyStop);
  $('reset').addEventListener('click', () => {
    // A deliberate bench reset establishes an initial condition, unlike a physical coast-down.
    // A latched emergency stop must still be explicitly released.
    const latched = motor.estop;
    motor.reset(); motor.estop = latched; angle = 0; particlePhase = 0;
    previousFrame = null; syncControls(); render(); graphs.update(motor, motor.read());
    notify('Motor reset to rest and nominal setpoints. Observation log retained.');
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const values = { nominal: [180, 1, 5], weak: [200, .4, 3], load: [180, 1, 18] }[button.dataset.preset];
    ['voltage', 'field', 'load'].forEach((name, i) => motor.set(name, values[i]));
    syncControls(); render(); graphs.update(motor, motor.read());
    notify(button.textContent + ' setpoints applied' + (motor.connected ? '.' : '. Energize when ready.'));
  }));
  function safetyMessages(r) {
    const warnings = [];
    if (r.estop) warnings.push(['danger', 'Stop latched.', r.rpm > .5 ? 'Armature open; shaft coasting. Release latch to rearm.' : 'Armature open; shaft at rest. Release latch to rearm.']);
    if (r.rpm > 4000) warnings.push(['danger', 'Overspeed.', 'Above 4,000 RPM. Reduce voltage or increase field.']);
    if (Math.abs(r.current) > 60) warnings.push(['danger', 'Excess current.', '|Iₐ| exceeds 60 A' + (r.current < 0 ? ' during electrical braking.' : '; inspect voltage and load. Startup may trigger this warning.')]);
    if (r.stalled) warnings.push(['danger', 'Stall.', 'Starting torque cannot overcome the selected load.']);
    if (r.field < .5) warnings.push(['warn', 'Weak field.', 'Below 0.50 A. Reduced torque per ampere; watch speed.']);
    if (r.regenerating) warnings.push(['warn', 'Regeneration.', 'Negative armature current returns energy to the ideal supply.']);
    if (r.braking && !r.regenerating) warnings.push(['warn', 'Dynamic braking.', 'At zero applied voltage, kinetic energy dissipates in armature resistance; no armature power returns to the supply.']);
    if (!warnings.length) warnings.push(['normal', r.connected ? 'Within monitored limits.' : 'Ready for an experiment.', r.connected ? 'Live values include startup and load-change transients.' : 'Set your inputs, then energize the armature. Field remains on.']);
    return warnings;
  }
  function renderSafety(r) {
    const warnings = safetyMessages(r), key = JSON.stringify(warnings);
    if (key === lastSafety) return;
    lastSafety = key; $('safety-status').replaceChildren();
    warnings.forEach(([kind, title, message]) => {
      const row = document.createElement('div'); row.className = 'status-message ' + kind;
      const icon = document.createElement('span'); icon.className = 'status-icon'; icon.textContent = kind === 'normal' ? '✓' : '!'; icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span'), strong = document.createElement('strong'); strong.textContent = title + ' ';
      body.append(strong, document.createTextNode(message)); row.append(icon, body); $('safety-status').append(row);
    });
  }
  function render() {
    const r = motor.read();
    setText('rpm-value', display(r.rpm, 0)); setText('current-value', display(r.current));
    setText('voltage-value', display(r.voltage, 1)); setText('field-value', display(r.field));
    setText('torque-value', display(r.torque)); setText('power-value', display(r.outputPower / 1000, 3));
    setText('efficiency-value', r.efficiency === null ? '—' : display(r.efficiency, 1));
    setText('emf-value', display(r.emf, 1) + ' V'); setText('input-value', display(r.inputPower / 1000, 3) + ' kW');
    setText('loss-value', display((r.copperLoss + r.frictionLoss) / 1000, 3) + ' kW');
    setText('field-power-value', display(r.fieldPower, 0) + ' W'); setText('flux-value', display(r.K, 3));
    setText('sim-time', clock(r.time));
    setText('stage-rpm', String(Math.round(r.rpm)).padStart(4, '0'));
    currentGlow.style.opacity = r.connected ? Math.min(Math.abs(r.current) / 140, .65).toFixed(2) : '0';
    stage.classList.toggle('machine-active', r.connected && r.rpm > .5);
    $('instrument-panel').classList.toggle('is-live', r.connected);
    setText('settle-state', r.stalled ? 'Stalled · zero shaft output' : !r.connected ? 'Armature disconnected' : r.braking ? 'Electrical braking · negative Iₐ' : r.settled ? 'Steady state · prediction reached' : 'Transient · acceleration ' + display(r.alpha, 1) + ' rad/s²');
    const note = r.efficiency !== null ? 'Steady motoring · includes 120 V field supply input.' : r.braking ? 'Efficiency undefined during electrical braking; signed input is shown below.' : !r.connected ? 'Armature open. Field supply still consumes power.' : r.stalled ? 'Stall: zero useful output. Efficiency is not displayed.' : r.load === 0 ? 'No external load: useful shaft output is zero. Efficiency not displayed.' : 'Efficiency available after the motor reaches steady motoring.';
    setText('efficiency-note', note);
    setText('rotation-status', r.rpm < .5 ? 'AT REST' : display(r.rpm, 0) + ' RPM / CW');
    $('speed-bar').style.width = Math.min(r.rpm / 6000 * 100, 100) + '%';
    $('speed-bar').style.background = r.rpm > 4000 ? 'var(--red)' : 'var(--teal)';
    const pill = $('run-state'), name = r.estop ? 'E-STOP' : !r.connected ? r.rpm > .5 ? 'COASTING' : 'STANDBY' : r.stalled ? 'STALLED' : r.regenerating ? 'REGENERATING' : r.braking ? 'BRAKING' : 'RUNNING';
    if (pill.dataset.state !== name) { pill.replaceChildren(document.createElement('i'), document.createTextNode(name)); pill.dataset.state = name; }
    pill.className = 'state-pill ' + (r.estop || r.stalled ? 'stopped' : r.connected ? 'running' : r.rpm > .5 ? 'coasting' : '');
    setText('run', r.estop ? '↺ Release stop latch' : r.connected ? 'Ⅱ Disconnect armature' : '▶ Energize motor');
    $('run').classList.toggle('latched', r.estop); $('estop').setAttribute('aria-pressed', String(r.estop));
    setText('control-note', r.estop ? 'Stop latched. Release, then energize explicitly.' : r.connected ? 'Armature connected. Setpoint edits apply immediately.' : 'Field energized at 120 V. Armature circuit open.');
    setText('circuit-state', r.connected ? 'CONNECTED' : 'OPEN');
    $('switch-open').style.opacity = r.connected ? 0 : 1;
    setText('flow-value', display(r.current) + ' A');
    setText('flow-mode', r.regenerating ? 'ENERGY → SUPPLY' : r.braking ? 'ENERGY → RESISTANCE' : r.current > .01 ? 'ENERGY → MOTOR' : 'NO ARMATURE CURRENT');
    $('switch-closed').style.opacity = r.connected ? 1 : 0;
    $('current-particles').style.opacity = r.connected && Math.abs(r.current) > .01 ? 1 : 0;
    $('flux-lines').style.opacity = .2 + r.field / 1.5 * .6;
    renderSafety(r);
  }
  function renderComparison() {
    const box = $('comparison'), trials = observations.filter(row => selected.has(row.id));
    box.replaceChildren(); box.hidden = !trials.length;
    if (trials.length === 1) { box.textContent = 'Trial ' + trials[0].id + ' selected. Select one more trial to compare.'; return; }
    if (trials.length !== 2) return;
    const [a, b] = trials;
    const heading = document.createElement('strong'); heading.textContent = 'Δ Trial ' + b.id + ' − Trial ' + a.id; box.append(heading);
    [ ['Speed', b.rpm - a.rpm, 'RPM', 0], ['Current', b.current - a.current, 'A', 2], ['Torque', b.torque - a.torque, 'N·m', 2], ['Output', (b.outputPower - a.outputPower) / 1000, 'kW', 3] ].forEach(([label, value, unit, digits]) => {
      const span = document.createElement('span'); span.textContent = label + ' ' + signed(value, digits) + ' ' + unit; box.append(span);
    });
    const eta = document.createElement('span'); eta.textContent = 'Efficiency ' + (a.efficiency !== null && b.efficiency !== null ? signed(b.efficiency - a.efficiency, 1) + ' pp' : '— (requires two steady motoring trials)'); box.append(eta);
  }
  function renderObservations() {
    const body = $('observation-rows'); body.replaceChildren();
    observations.forEach(row => {
      const tr = document.createElement('tr'); tr.classList.toggle('selected', selected.has(row.id));
      const selectCell = document.createElement('td'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(row.id); checkbox.setAttribute('aria-label', 'Compare trial ' + row.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selected.size >= 2) { checkbox.checked = false; notify('Select up to two trials. Uncheck one to change the comparison.'); return; }
        if (checkbox.checked) selected.add(row.id); else selected.delete(row.id);
        tr.classList.toggle('selected', checkbox.checked); renderComparison();
      }); selectCell.append(checkbox); tr.append(selectCell);
      const trialCell = document.createElement('td'); trialCell.textContent = '#' + String(row.id).padStart(2, '0');
      const time = document.createElement('small'); time.textContent = clock(row.time); trialCell.append(time); tr.append(trialCell);
      const values = [row.state, display(row.voltage, 0), display(row.field), display(row.load, 1), display(row.rpm, 0), display(row.current), display(row.torque), display(row.outputPower / 1000, 3), row.efficiency === null ? '—' : display(row.efficiency, 1)];
      values.forEach((value, i) => { const td = document.createElement('td'); td.textContent = value; if (i === 0) td.className = 'trial-state'; tr.append(td); });
      const removeCell = document.createElement('td'), remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove trial ' + row.id); remove.title = 'Remove trial ' + row.id;
      remove.addEventListener('click', () => { observations.splice(observations.findIndex(item => item.id === row.id), 1); selected.delete(row.id); renderObservations(); notify('Trial ' + row.id + ' removed.'); });
      removeCell.append(remove); tr.append(removeCell); body.append(tr);
    });
    $('empty-state').hidden = observations.length > 0;
    $('download').disabled = $('clear-records').disabled = observations.length === 0;
    setText('observation-count', String(observations.length).padStart(2, '0'));
    setText('log-status', observations.length ? observations.length + ' / 200 readings · stored in this tab · export before closing' : 'Session log · stored in this tab · export before closing');
    renderComparison();
  }
  function record() {
    if (observations.length >= 200) { notify('Log holds 200 readings. Export and remove readings to continue.'); return; }
    const r = motor.read();
    observations.push({ ...r, id: nextTrial++, state: stateName(r), setVoltage: motor.voltage, capturedAt: new Date().toISOString() });
    renderObservations(); notify('Trial ' + (nextTrial - 1) + ' recorded · ' + display(r.rpm, 0) + ' RPM · ' + stateName(r).toLowerCase());
  }
  $('record').addEventListener('click', record);
  $('clear-records').addEventListener('click', () => { observations.length = 0; selected.clear(); renderObservations(); notify('Observation log cleared.'); });
  function csvValue(value) { return '"' + String(value === null ? '' : value).replace(/"/g, '""') + '"'; }
  function csvText() {
    const headings = ['Trial', 'Captured UTC', 'Simulation time (s)', 'State', 'Armature connected', 'Voltage setpoint (V)', 'Applied voltage (V)', 'Field current (A)', 'Load torque (N m)', 'Speed (RPM)', 'Armature current (A)', 'EM torque (N m)', 'Load output (W)', 'Total input (W)', 'Armature input (W)', 'Field input (W)', 'Copper loss (W)', 'Friction loss (W)', 'Rotor energy rate (W)', 'Back EMF (V)', 'Efficiency (%)', 'Steady state'];
    const rows = observations.map(r => [r.id, r.capturedAt, r.time.toFixed(4), r.state, r.connected, r.setVoltage, r.voltage, r.field, r.load, r.rpm.toFixed(6), r.current.toFixed(6), r.torque.toFixed(6), r.outputPower.toFixed(6), r.inputPower.toFixed(6), r.armaturePower.toFixed(6), r.fieldPower.toFixed(6), r.copperLoss.toFixed(6), r.frictionLoss.toFixed(6), r.storedPower.toFixed(6), r.emf.toFixed(6), r.efficiency === null ? null : r.efficiency.toFixed(6), r.settled]);
    return '\uFEFF' + [headings, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n') + '\r\n';
  }
  $('download').addEventListener('click', () => {
    if (!observations.length) return;
    const blob = new Blob([csvText()], { type: 'text/csv;charset=utf-8;' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'MOTORCORE-observations-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    notify(observations.length + ' observations exported as CSV.');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); emergencyStop(); return; }
    if (event.key.toLowerCase() === 'r' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !event.target.closest('input, textarea, select, [contenteditable="true"]')) { event.preventDefault(); record(); }
  });
  document.addEventListener('visibilitychange', () => { previousFrame = null; });
  function animate(dt, r) {
    if (!motionPreference.matches) {
      angle = (angle + r.omega * 180 / Math.PI * dt / 40) % 360;
      particlePhase = (particlePhase + Math.sign(r.current) * Math.min(Math.abs(r.current) * 2, 110) * dt + 90) % 90;
      $('rotor').setAttribute('transform', 'rotate(' + angle.toFixed(3) + ')');
      twinRotor.setAttribute('transform', 'rotate(' + angle.toFixed(3) + ')');
      $('load-rotor').setAttribute('transform', 'rotate(' + angle.toFixed(3) + ')');
      $('shaft-stripe').setAttribute('d', 'M447 ' + (199 + Math.sin(angle * Math.PI / 180) * 8).toFixed(2) + 'h80');
      $('winding-highlight').setAttribute('d', 'M242 ' + (201 + Math.sin(angle * Math.PI / 180) * 23).toFixed(2) + 'h181');
      $('flux-lines').setAttribute('stroke-dashoffset', (-r.time * 12).toFixed(2));
      const circles = $('current-particles').children;
      for (let i = 0; i < circles.length; i++) {
        let x = (particlePhase + i * 90) % 280;
        // Current dots stay on wire segments, clear of the motor symbol.
        if (x > 130 && x < 179) x += 49;
        circles[i].setAttribute('cx', x.toFixed(2));
      }
    }
  }
  function frame(timestamp) {
    const dt = previousFrame === null || document.hidden ? 0 : Math.min(Math.max((timestamp - previousFrame) / 1000, 0), P.C.maxFrame);
    previousFrame = timestamp;
    if (!document.hidden) { motor.step(dt); animate(dt, motor.read()); }
    if (timestamp - previousReadout >= 80) { render(); previousReadout = timestamp; }
    if (timestamp - previousGraph >= 160) { graphs.update(motor, motor.read()); previousGraph = timestamp; }
    requestAnimationFrame(frame);
  }
  syncControls(); render(); renderObservations(); graphs.update(motor, motor.read()); requestAnimationFrame(frame);
  // Deliberately small diagnostics surface for offline numerical and UI verification.
  window.Motorcore = Object.freeze({ read: () => ({ ...motor.read(), setVoltage: motor.voltage }), csv: csvText, observationCount: () => observations.length });
}());


