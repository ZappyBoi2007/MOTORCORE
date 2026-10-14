# MOTORCORE — DC Motor Test Bench

A completely offline, interactive simulator of a separately excited DC motor. Built for SIMULAB 2026 with HTML5, CSS3, vanilla JavaScript, inline SVG and native Canvas.

## V3 reactive energy display

Three display states follow the existing motor model: **Standby** keeps near-black/navy lighting after an ordinary armature disconnect; **Energized** adds restrained cyan and copper illumination while the armature is connected; **Emergency stop** switches to a dark crimson atmosphere while the rotor continues its physical coast-down. Releasing the stop latch returns to standby. Visual color changes take about 0.78 seconds and never delay safety readings or change electrical calculations.

The blue field outline represents regulated field excitation. Its intensity follows the selected field current and is visible even with the armature open, because the field remains energized. The amber copper glow is linked to actual armature current magnitude. The cyan/amber trails behind the motor appear only after the shaft begins turning and respond to actual RPM. These are **illustrative visual effects**, not literal sparks or additional energy terms in the equations.

The energized viewport and instrument panel have small animated SVG rim segments inspired by ElectricBorder. They use no WebGL or external code. The motor trails use one local Canvas 2D layer, capped at 30 frames per second on desktop and 20 on mobile, with at most ten paths (six on mobile). Decorations pause when the tab is hidden. CSS lighting remains usable if Canvas is unavailable. **Classic SVG** hides the motor aura, trails and electric viewport rim, preserving the original SVG motor.

Fine-pointer devices receive a soft radial highlight in key panels. Clicks on the run, record, emergency-stop and preset buttons create a short visual pulse; the emergency pulse is red. Reduced-motion settings disable decorative motion and pulses. Existing live instrument numbers continue to display actual simulated values directly, without a visual counter lag. Lower sections have one gentle scroll reveal when IntersectionObserver is available and remain visible when it is not.

All V3 effects are in the local effects.js file, loaded as a deferred script between graphs.js and app.js. The simulator does not make network requests, import packages or depend on WebGL. Physics and graph source are unchanged.

## V2 digital twin display

The enhanced motor view adds static metallic and copper material layers, a softly lit engineering stage, and a second rotor illustration synchronized to the same simulated angle as the original. The status overlay uses actual calculated RPM and armature current. Select **Classic SVG** in the machine card to reveal the original motor artwork; the original rotor, shaft and field elements remain underneath and keep running. This is the built-in visual fallback.

**View angle** and **Zoom** change only the SVG presentation. They do not change speed, power, graph predictions or recorded data. **Reset view** restores the default framing. The view controls are disabled in Classic SVG mode. Reduced-motion settings suppress decorative rotor motion while preserving live readings and calculations.

## Open the simulator

1. Open `C:\Users\Keith\Documents\MOTORCORE` in File Explorer.
2. Double-click `index.html`, or choose Open with a modern browser such as Edge, Chrome, Firefox or Safari.
3. Keep all six files together when copying the project to another computer.

There is no installation, build, server, internet connection, external font, CDN, library, package manager or network API. The project also works from an extracted ZIP. Extract it first; do not open only index.html from inside an archive.

## Files

- `index.html`: semantic dashboard, motor SVG, inputs, instruments, tables and theory.
- `style.css`: responsive industrial dashboard and reduced-motion/print styles.
- `physics.js`: numerical motor model, power accounting and equilibrium calculations.
- `graphs.js`: three high-DPI Canvas characteristic graphs and curve inspection.
- `effects.js`: reactive ambient state, small electric borders, motor trails, spotlight and brief interaction pulses.
- `app.js`: controls, simulation loop, motor animation, safety states and observations.
- `README.md`: operating guide, assumptions and verification notes.

Scripts are ordinary deferred scripts in this dependency order: physics.js, graphs.js, effects.js, app.js. No module loader is used.

## Quick experiment

1. Begin with the nominal settings: 180 V armature voltage, 1.00 A field current and 5.0 N m load.
2. Select **Energize motor**. Speed rises over time; startup current can exceed the illustrative 60 A warning threshold.
3. Wait for **Steady state**. The default equilibrium is approximately 1,927 RPM, 9.28 A and 56.4% total efficiency.
4. Select **Record observation**, or press **R** outside an editable field.
5. Change voltage, field current or mechanical load using a slider or its numerical input. Readings and graph predictions update immediately.
6. Record more trials. Check any two rows to see signed changes in speed, current, torque, output and efficiency. Comparison uses the later-recorded trial minus the earlier trial.
7. Select **Export CSV** to save full-precision readings. Remove individual rows with their × buttons, or clear the log.

Quick setpoints: Nominal (180 V, 1.00 A, 5 N m), Weak field (200 V, 0.40 A, 3 N m), Load test (180 V, 1.00 A, 18 N m). Presets apply immediately to an energized motor, but never start a disconnected motor.

The observation log is held in memory in this tab, with a limit of 200 rows. Export before closing or refreshing. Resetting the motor retains recorded observations. Reset is a deliberate return to the initial condition, not a physical stop operation; it resets simulation time and nominal settings while preserving an emergency-stop latch.

## Physics

SI units are used internally:

```
Ra = 2 ohm
J  = 0.5 kg m^2
B  = 0.012 N m s/rad
Vf = 120 V
K  = 0.25 + 0.55 If

E      = K omega
Ia     = (Va - E) / Ra                 [armature connected]
Te     = K Ia
alpha  = (Te - Tload - B omega) / J
RPM    = omega 60 / (2 pi)
```

The simulation uses requestAnimationFrame and midpoint integration with numerical steps no larger than 1/240 second. Each displayed frame advances at most 0.1 second. A hidden tab pauses simulation time; returning to it does not integrate a large catch-up interval. Under severe rendering delays, simulation time can progress more slowly than wall-clock time.

A passive mechanical load resists forward motion. Speed is constrained to zero at stall: the selected load cannot drive reverse rotation. At rest, the resisting load reaction balances available torque until starting torque is sufficient. The displayed mechanical load is its commanded resisting-torque capacity; external load power is zero at rest.

Assumptions: ideal regulated field current; constant resistance and inertia; linear empirical K(If) relation; viscous friction; no armature inductance, magnetic saturation, brush voltage drop, iron loss, thermal dynamics or mechanical compliance. Field control takes effect instantly. The two supplies are ideal; the connected armature supply can absorb regenerative energy.

## Stops and negative current

**Disconnect armature** and **Emergency stop** open the armature circuit. Actual applied armature voltage, current and electromagnetic torque become zero immediately. Shaft speed is retained and decays under friction and the selected mechanical load. Back EMF can remain nonzero while the open-circuit motor coasts. The field stays energized and consumes 120 If watts.

Emergency stop is latched. Select **Release stop latch**, then separately select **Energize motor** to restart. Resetting the motor does not bypass the latch. **Escape** activates emergency stop, including while editing an input.

Reducing voltage while the armature remains connected can make Ia and Te negative. With positive terminal voltage this is regenerative braking and Va Ia is negative: armature energy returns to the ideal supply. At a zero-volt setpoint, negative current produces dynamic braking through armature resistance; terminal electrical power is zero, so it is not labelled regeneration. Setting voltage to zero is therefore different from opening the armature circuit.

Warning thresholds are illustrative lab limits, not manufacturer ratings:

- Overspeed: greater than 4,000 RPM.
- Excessive current: absolute armature current greater than 60 A, including startup or electrical braking.
- Stall: armature voltage applied, near-zero speed, and electromagnetic torque no greater than load.
- Field weakening: field current less than 0.50 A.

Warnings do not automatically trip or clamp the physical state. Use the emergency stop when desired.

## Power and efficiency

```
Parmature = actual Va * Ia              [signed]
Pfield    = 120 * If
Pinput    = Parmature + Pfield          [signed total electrical input]
Poutput   = Tload * omega               [useful load shaft power]
Pcopper   = Ia^2 * Ra
Pfriction = B * omega^2
Pstored   = J * omega * alpha           [rate of stored kinetic energy]

Pinput = Poutput + Pcopper + Pfriction + Pfield + Pstored
```

The instrument labelled “EM torque” is electromagnetic torque, not load torque. “Load shaft power” is useful power absorbed by the external load, not gross electromagnetic conversion power. The “Copper + friction losses” instrument excludes field power, which is separately displayed and included in total electrical input.

Efficiency is `100 Poutput / Pinput`, including field excitation. It is displayed only for connected, near-steady motoring with positive current, input and useful output, and with output no greater than input. Near-steady requires angular-speed error below 0.5 rad/s relative to equilibrium and acceleration magnitude below 0.1 rad/s². During startup, deceleration, electrical braking, no-load operation, stall or coast, efficiency displays a dash and exports as an empty CSV cell. All other live readings remain instantaneous.

## Three actual characteristic graphs

Each curve evaluates the specified equilibrium model at 161 evenly spaced samples:

```
omega_eq = max(0, (K Va / Ra - Tload) / (K^2 / Ra + B))
Ia_eq    = (Va - K omega_eq) / Ra
```

1. Speed versus armature voltage, 0–240 V; field current and load held at current setpoints.
2. Speed versus field current, 0.3–1.5 A; voltage and load held at current setpoints.
3. Armature current versus mechanical load, 0–20 N m; voltage and field current held at current setpoints.

A teal dot marks equilibrium at the selected setpoint. An amber cross shows the instantaneous reading, including negative current during a transient. The live marker is hidden when the armature is open; equilibrium curves continue to preview commanded settings. Axis limits rescale to include the calculated curve and live state. Hover or touch a plot to inspect a calculated point, or focus it and use Left/Right/Home/End. Escape also invokes the global emergency stop.

These are predicted steady-state characteristics, not fabricated time histories or recorded measurement fits. The observation table contains actual instantaneous simulation snapshots.

## Animation and accessibility

Rotor, shaft highlight and load indicator use one continuously integrated phase driven by actual simulated omega. A fixed 1:40 visual speed reduction makes high speeds legible and avoids changes in CSS animation duration or phase jumps. Current indicators reverse when current is negative; field visualization responds to field current. Reduced-motion preferences disable decorative motion without stopping physics or readings.

The layout adapts to mobile widths; the wide observation table scrolls horizontally. Controls have labels, keyboard operation and visible focus indicators. Warnings and notifications use live status regions. Plots have descriptive accessible labels and a text summary of predicted and instantaneous values. Print styles emphasize the observation table.

## Verification and limitations

The original six required files remain, with one local visual effects script added. JavaScript syntax checks passed. Twenty-seven dependency-free automated checks passed, including:

- 105 voltage/field/load operating points converging to the specified equilibrium.
- Transient integration compared with the analytic solution and friction-only coast decay.
- Signed instantaneous power conservation, stall, regeneration, dynamic braking, limits and bounded time steps.
- Application initialization and all three Canvas drawing paths in a test DOM.
- Controls, presets, recording, comparison, row removal, CSV generation/download wiring, warning states, keyboard shortcuts and emergency-stop rearming.
- Hidden-tab timing, local resource references, unique HTML IDs and ordinary deferred script order.
- V2 view switching, visual-only angle/zoom controls, and the original and enhanced rotors sharing one simulation-driven phase.
- V3 standby/energized/emergency state transitions, normal-disconnect coast-down, motor trail rendering, and hidden-tab decorative pause.

The automated preview browser refused file:// navigation under its URL security policy. Consequently actual-browser visual layout, rendering, download behavior and console output could not be directly observed in this session. Automated DOM/Canvas checks are not a substitute for visual browser verification. No packages were installed; the application itself needs no developer runtime.

No requested feature is intentionally incomplete. These are educational model assumptions, not a replacement for physical motor commissioning or manufacturer protection settings.
