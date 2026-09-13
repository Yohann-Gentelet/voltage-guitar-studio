# Voltage Originals II: amp design and measurements

This revision addresses harsh, fizzy saturation by changing the nonlinear processing, gain structure, and cabinet response together. The six voices are original, tube-inspired **behavioral models**. They are not circuit-exact replicas, trained amp captures, or a claim to reproduce a particular manufacturer's amplifier.

## What was wrong with the first version?

The old engine used one finite WaveShaper curve with gain in front and EQ behind it. For example, its lead voice at Gain 66 applied approximately 15.5× input gain before a tanh curve with hardness 3.4. A signal peak of about 0.065 already reached the curve's ±1 input endpoint. The [Web Audio specification](https://webaudio.github.io/web-audio-api/#WaveShaperNode) defines endpoint extension outside this domain. That combination compressed pick dynamics very early. There was no interstage bass shaping or separate power stage, and the cabinets used only generic filters.

Oversampling alone does not solve gain staging, dynamic response, or cabinet voicing. A cabinet also cannot undo alias components that have already folded into the audible band.

## Signal structure

```text
guitar → gate / compressor / octave / wah
       → 4× interpolation
       → overdrive (optional)
       → coupling HP → preamp saturation → bandwidth LP (three stages)
       → bass / middle / treble
       → power saturation with supply sag → presence
       → DC removal / bandwidth limit → filtered 4× decimation
       → measured cabinet convolution OR modeled cabinet filters
       → cabinet high cut
       → remaining texture / modulation / delay / reverb effects
       → looper / master / output protection
```

Separating filters and nonlinear stages follows the block-oriented approach described by [Eichas, Möller and Zölzer, DAFx 2017](https://www.dafx.de/paper-archive/2017/papers/DAFx17_paper_35.pdf). Their work identifies models from physical amplifiers; Voltage instead uses hand-designed profiles. Our controls and constants are design choices, not parameters measured by that paper.

## Saturation without finite curve endpoints

For driven input `x` and stage bias `b`, the static characteristic is:

```text
f_b(x) = [tanh(x + b) − tanh(b)] / [1 − tanh²(b)]
```

It has zero output at zero input and unit small-signal slope. A small bias introduces asymmetric distortion; each voice distributes gain and bias differently across its preamp stages. An analytic function avoids a WaveShaper lookup table's finite input domain.

We use first-order antiderivative antialiasing (ADAA), based on [Parker, Zavalishin and Le Bivic, DAFx 2016](https://dafx.de/paper-archive/2016/dafxpapers/20-DAFx-16_paper_41-PN.pdf):

```text
F(x) = log(cosh(x))
q[n] = [F(x[n] + b) − F(x[n−1] + b)] / [x[n] − x[n−1]]
y[n] = [q[n] − tanh(b)] / [1 − tanh²(b)]
```

The implementation uses a midpoint tanh when the denominator is near zero and evaluates `log(cosh(x))` as `abs(x) + log1p(exp(−2 abs(x))) − log(2)`. Both endpoints use the current bias during control changes. Inactive stages use a linear midpoint to retain delay alignment. First-order ADAA adds delay and high-frequency droop, so it runs inside the oversampled domain.

## Resampling and timing

Two 2× interpolation stages feed the shared overdrive/preamp/power domain at `4 Fs`. Each uses a normalized 63-tap Blackman-windowed sinc. Interpolation cutoff is 0.25 cycles per filter sample; decimation uses a more conservative 0.20 cutoff, leaving a transition band before the folding frequency. Inserting zeros requires 2× amplitude compensation per interpolation stage. No arrays are allocated per audio sample.

The resampling-only impulse response has unity DC gain and a 46.5 base-sample delay: about **0.97 ms at 48 kHz** or **1.05 ms at 44.1 kHz**. ADAA adds roughly another half base sample through the active amp path, and other filters have frequency-dependent phase. Cabinet convolution, browser buffering, native effects, audio drivers and hardware add further delay. The app's displayed output latency is not a measured input-to-output latency.

## Tone, dynamics, and controls

Coupling and bandwidth filters use a trapezoidal one-pole RC discretization:

```text
g = tan(π fc / (4 Fs)); a = g / (1 + g)
v = a (x − state)
low = v + state
state = low + v
high = x − low
```

**Tightness** scales the coupling high-pass frequencies before clipping. This changes which frequencies drive the nonlinear stages. **Gain** sets each stage's drive with `base + range × (Gain/100)²`. **Power drive** independently raises the final nonlinear stage's drive. The principal parameters settle smoothly with a 20 ms exponential time constant; filter coefficients also interpolate.

Bass is a 150 Hz shelf, Middle a 750 Hz peak, Treble a 2.4 kHz shelf, and Presence a 3.6 kHz shelf after the power stage. Their bilinear-transform biquads use the [RBJ Audio EQ Cookbook equations](https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html), normalized by `a0`. These independent filters are a musical tone section, not a solution of a coupled passive hardware tone stack. Presence is an output shelf, not a modeled global negative-feedback circuit.

Supply sag follows the idea that increased signal load reduces available headroom and then recovers. Physical supply modeling is discussed by [Macák and Schimmel, DAFx 2011](https://dafx.de/paper-archive/2011/Papers/05_e.pdf). Voltage uses a simpler bounded envelope approximation, not that paper's complete circuit equations:

```text
load = clamp(0.55 abs(prePowerSignal), 0, 1)
targetSupply = 1 − 0.28 × (Sag/100) × voiceSag × load
supply += (targetSupply − supply) × (1 − exp(−1 / (4 Fs τ)))
τ = 25 ms when falling; 140 ms when recovering
drive = 0.85 + 2.2 × (Power/100)
powerOut = ADAA(prePowerSignal × drive / supply) × supply / sqrt(drive)
```

Supply stays above 0.72. The metal voice uses less supply variation to retain attack. This model omits transformer hysteresis, explicit grid current, blocking distortion, speaker nonlinearities, and circuit-level feedback.

| Voice | Intended response |
| --- | --- |
| American Clean | One active preamp saturator, broad bandwidth, restrained sag |
| British Chime | Two stages with stronger asymmetry and brighter voicing |
| Tube Breakup | Gradual two-stage saturation and more supply movement for light drive |
| Vintage Crunch | Three stages, stronger mids, classic rock response |
| Modern High Gain | Cascaded gain and filtered lows for sustain and heavy rock |
| Tight Metal | Focused interstage low cut, firmer power response, articulate heavy rhythm |

The 48 factory preset IDs and eight folders remain intact. Selected clean, indie, blues, rock and heavy presets have been revoiced for this engine. Saved personal knob values are preserved, although the new engine changes their sound. An unmodified factory preset uses its updated settings on reload.

## Cabinet response

The new Greenback and Vintage 30 options convolve the amp signal with real cabinet-and-microphone measurements from Jester Dyne Productions. The exact source files, cabinet details, CC0 terms and original handbooks are identified in [the asset credits](../dist/credits.txt). These are captures of a complete recording chain, not universal speaker response curves or endorsements.

The shipped WAV files are unchanged. At load time Web Audio decodes/resamples them to the context rate; Voltage uses their first 85 ms, retains the captured onset, and applies a cosine fade over the last 10 ms. This limits convolution cost. Midrange calibration uses:

```text
H(f) = Σ h[n] exp(−j 2π f n / Fs)
R = sqrt(mean(|H(f)|²)), f ∈ {350, 500, 700, 1000, 1400, 2000, 2800} Hz
gain = 0.8 / R
```

For stereo IRs, the mean includes both channels and one common gain preserves their balance. Native convolver normalization is disabled. Custom IRs use the same calibration but keep their complete permitted length. This is consistent reference-band gain, not perceptual loudness normalization for every possible guitar signal.

Measured and custom IRs replace the modeled cabinet filter path. The shared **Cab high cut** applies afterward; Cabinet off bypasses it. If a built-in IR cannot load within six seconds, its modeled fallback remains usable and the interface reports that fallback.

## Reproducible measurements

Run `npm test`, then `npm run measure`. The latter writes `artifacts/amp-report.json` from the same `AmpDSP` class used by the worklet.

An isolated stress test uses a coherent 2,920.90 Hz sine at 48 kHz, unit peak, tanh drive 12, 4,096 warmup frames and a 16,384-point FFT. Alias energy excludes DC and all exact integer-harmonic bins, then divides by total non-DC signal energy:

| Waveshaper | Alias / signal |
| --- | ---: |
| Direct base-rate tanh | −18.11 dB |
| Ordinary tanh with the same guarded 4× filters | −77.29 dB |
| ADAA with those guarded 4× filters | −101.20 dB |

ADAA improves this particular test by about **24 dB versus the identical 4× resampler with ordinary tanh**. These numbers are neither a perceptual score nor a measurement of the old browser-native amp. The full nonlinear chain can generate additional intermodulation and aliases; intentional bitcrusher/ring-mod textures are separate effects.

Tests also check progressive harmonic generation with input level, tightness before saturation, power drive, sag recovery, silent model changes, worklet wake-up, cabinet calibration/fallback, and finite extreme-control output at 44.1/48/96 kHz. A steady 440 Hz response stays within 0.1 dB across those rates for each voice. Core measurements use synthetic double-precision signals; the worklet outputs Float32 samples.

Real guitar listening, browser CPU/dropout behavior, hardware input/output and round-trip latency have not been measured for this revision. A level-matched comparison using the same dry guitar performance and interface is the next perceptual check; mathematical tests alone cannot establish a universally best tone.

## Starting sounds

- **Drive → Midnight Blues:** Tube Breakup and Greenback, for light drive and expressive picking.
- **Drive → British Invasion:** classic rock with a measured Greenback cabinet.
- **Heavy → Iron Rhythm:** Tight Metal and Vintage 30, for focused palm-muted riffs.
- **Heavy → Heavy Weather:** smoother high gain with a restrained overdrive boost.

If the guitar is still too bright, lower Cab high cut toward 6–7 kHz and reduce Presence a little. If chords blur, lower Gain and raise Tightness before adding more EQ. Keep the interface input below clipping; no software model can restore a clipped input recording.
