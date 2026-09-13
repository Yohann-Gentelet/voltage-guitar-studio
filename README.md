# Voltage — Guitar Studio

A local-first browser guitar amp. All live audio processing, recorded takes, custom cabinet impulses, and loop playback run on your computer. No audio upload or account is needed to use the local app.

## Start locally

Install Node.js 22 or newer, then run `npm start` in this folder (or double-click `start.cmd` on Windows). Open **http://127.0.0.1:5173** in Chrome or Edge. There are no npm dependencies to install. Keep the terminal running while you play.

## Host from a GitHub repository

The included **Deploy Voltage to GitHub Pages** workflow checks the app and publishes the `dist/` website after each push to `main`. In the repository, select **Settings → Pages → Source: GitHub Actions** before the first deployment. A successful run reports the website URL. The online app works over HTTPS; no application server, build dependencies, or API keys are needed.

The website processes guitar input on your computer. Saved tones remain in the browser storage for the website you use. Your existing localhost presets do not automatically move to the online address, so keep the local app available if you need those tones.

## Connect your guitar

1. Connect the guitar to a USB audio interface's **instrument/Hi-Z** input. A normal headphone socket and passive cable cannot replace an instrument input.
2. Connect wired headphones to the interface. Start with low hardware gain/volume, and turn off the interface's direct monitoring to avoid hearing a second dry signal.
3. Select the interface as your computer's output (or use Audio settings in a browser supporting output selection).
4. Click **Connect guitar**, allow audio input access, choose the interface, and select **Input 1 / L** or **Input 2 / R**. Mono-only capture disables Input 2.
5. Play firmly and adjust hardware input gain so the input meter avoids clipping. Choose a preset and play.

**Try a demo riff** exercises the actual effect chain without a connected instrument. **M** mutes all output. **T** opens the tuner.

## Included

- Six original amp voices: American Clean, British Chime, Tube Breakup, Vintage Crunch, Modern High Gain and Tight Metal. Separate preamp and power saturation with 4× oversampling and antiderivative antialiasing. Gain, bass, middle, treble, presence, level and amp bypass.
- Tightness, Sag, Power drive and Cab high cut controls for low-end definition, dynamic response and brightness.
- Two measured cabinet responses (Greenback and Vintage 30), three filter-based cabinets, cabinet bypass and custom mono/stereo IR loading (up to 2 seconds / 10 MB). [Cabinet credits and CC0 sources](dist/credits.txt).
- Thirteen effects: noise gate, compressor, sub octave, auto wah, overdrive, bitcrusher, noise and dust, chorus, phaser, tremolo, ring modulation, delay and algorithmic convolution reverb; independent controls and bypass.
- 48 factory presets in eight folders, plus a browser-local personal tone library with custom folders. Amp and pedal settings are restored on reload; master starts at 35% and audio always starts off.
- Chromatic tuner with muted tuning, metronome with tap tempo, a 60-second looper with overdubbing, and recording with downloadable takes.
- Processed recording includes guitar, loop, click and master volume/mute. Dry recording taps the input after trim and before effects. Export uses the browser's supported MediaRecorder format, usually WebM/Opus. Recordings stop at 30 minutes. Download takes before leaving.
- Input/output meters, pre-limiter high-level indicator, input trim, channel selection and available device output selection.

## Preset folders

The **Factory** library opens as eight folders, with six tones each: **Clean**, **Indie**, **Drive**, **Heavy**, **Ambient**, **Lo-Fi**, **Funk**, and **Experimental**. Open a folder to browse its tones; use the back arrow to return to folders. Search by tone, folder, or effect name. Search within a folder narrows that folder; go back to search across the library.

Try **Dusty Polaroid** for warm crackle, **Pocket Wah** for picking-sensitive funk, **Rubber Bass** for sub-octave single-note lines, **8-Bit Bedroom** for digital grain, or **Satellite Bells** for metallic echoes. The collection uses all thirteen effects in different combinations, with playing tips shown when you select a tone.

When saving your own sound, choose an existing folder or type a new folder name. In **My presets**, use **Move** beside a tone to reorganize it. Existing saved presets appear in **My tones**, with their sound settings preserved. Folder names ignore extra spaces and reuse an existing name regardless of capitalization. Empty folders disappear automatically. All presets and folders stay in this browser on this device.

## Amp response

For light, picking-sensitive drive, start with **Drive → Midnight Blues**. Try **Drive → British Invasion** for rock and **Heavy → Iron Rhythm** or **Heavy Weather** for metal. Selected factory presets now use measured cabinets and revised gain staging. Unmodified factory presets pick up the new settings on reload; saved personal control values and modified sessions are preserved, though the new engine changes their sound.

**Tightness** cuts lows before distortion to keep riffs defined. **Sag** adds a gentle supply drop and recovery under load. **Power drive** adds saturation after the tone controls. **Cab high cut** softens the cabinet's top end; try 6–7 kHz for a less fizzy heavy tone. It is bypassed when the cabinet is off. If a measured cabinet cannot load, the interface reports its modeled fallback.

The [amp design notes](docs/amp-model.md) explain the equations, primary research, measured improvements and remaining limits. The overdrive, preamp and power stages share one oversampled processing domain; this addresses aliasing at its source while cabinet convolution provides the recorded speaker/microphone response.

## Indie presets

Find these in **Factory → Indie**:

- **Jangle Club** — bright British chime, compression, and subtle chorus for jangly rhythm.
- **Bedroom Tape** — warm clean tone with softened highs and a slow chorus wobble.
- **Garage Afterhours** — mid-forward crunch, short slapback delay, and a small room.
- **Dream Pop** — clean chorus with soft echoes and spacious reverb.
- **Shoegaze Bloom** — layered drive, slow chorus, and a long, diffuse reverb tail.
- **Neon Arpeggios** — lightly driven chime and 375 ms repeats (dotted eighths at 120 BPM).

These are original tones using Voltage's existing effects. Presets change the amp and pedals; they preserve your input, master volume, and metronome tempo.

## Texture effects

The five extra pedals stay bypassed in the original twelve presets. The expanded folders include many tones with them enabled. Turn a pedal on and adjust its controls; save the result to keep your own texture preset.

- **Noise & Dust** adds tape-style hiss and vinyl-like crackle with a brightness control. It follows the input envelope and fades between phrases; it does not generate continuous noise on silent input. Try it with Bedroom Tape.
- **Bitcrusher** reduces bit depth and sample rate for grainy digital distortion and aliasing. Start at 8 bits / 6,000 Hz, then lower the mix for a little grit or raise it for a broken-console sound.
- **Sub Octave** adds an analog-style synth bass voice one octave below single notes. Use the neck pickup and play one note at a time. Chords and complex harmonics may confuse its monophonic tracker; it is not a polyphonic pitch shifter.
- **Auto Wah** follows how hard you pick. Sensitivity changes how readily the filter opens; resonance controls its focus. Start with a clean tone and vary your picking strength.
- **Ring Mod** adds metallic sum/difference frequencies. Carrier chooses the modulation frequency, Tone softens the result, and Mix blends it with the guitar. Try 30–100 Hz with a low mix for rough movement or a higher carrier for bell-like tones.

Signal order: gate → compressor → octave → wah → overdrive → amp / cabinet → bitcrusher → noise → chorus → phaser → tremolo → ring mod → delay → reverb → looper → master.

## Practical limits

Use HTTPS or localhost; opening index.html directly does not enable live audio. Chrome/Edge are recommended. Other browsers may omit output device selection or worklet support. Capture constraints request echo cancellation, noise suppression and automatic gain off; actual device settings are reported where available.

Output latency is a browser estimate, not measured guitar round-trip latency. Internal processing, input, driver and hardware delay are additional. The amp's resampling filters alone add approximately 0.97 ms at 48 kHz. Browsers cannot select ASIO drivers; a native audio workstation may offer lower latency. Bluetooth adds delay. Amp voices are original tube-inspired behavioral designs, not circuit-exact or measured replicas of physical amps. Two built-in cabinets use CC0 measurements; the other three use filters. Custom IRs can supply your own cabinet response.

Custom IRs, loops and undownloaded recordings live only in the current session. Saved custom-IR presets identify the expected file; reload it if missing or different. Presets belong to the browser and origin used to save them. Built-in metering is for monitoring, not calibrated measurement.

## Verification

`npm run check` checks JavaScript syntax. `npm test` covers amp alias suppression, picking response, sag, sample-rate consistency, cabinet files/calibration/fallback, tuner accuracy, setting migration, gate/looper behavior, texture processing and graph routing/cleanup. Native-node contract doubles check graph wiring separately from audio DSP. `npm run measure` produces reproducible synthetic amp-core measurements in `artifacts/amp-report.json`; see the design notes for method and limits.

With the local server running, **http://127.0.0.1:5173/__test** provides OfflineAudioContext render checks, including all presets and effects, bypass, silence, ring-mod sidebands, tails, cabinet filtering and bounded output. This browser harness was not run for the Originals II revision; its validation used the shared DSP in Node and graph contract tests. The test route is local-only and not included in hosted static assets.

Physical USB input, driver behavior, hardware output and end-to-end latency must be checked on the interface you use.

## Architecture

Static ES modules in `dist/` use Web Audio and AudioWorklet without dependencies. `audio-engine.js` manages capture, graph lifecycle, effects, recording and transport. `amp-dsp.js` implements the shared numerical model; `amp-worklet.js` connects it to the rendering thread. `cabinets.js` loads and calibrates measured/custom IRs. `gate-worklet.js` runs the gate and sample-based looper; `texture-worklet.js` runs noise, bitcrushing, octave tracking and auto-wah processing. `dsp.js` contains tuner and synthesized audio helpers. `settings.js` defines validated tone settings; `app.js` binds the interface. `server.mjs` is a loopback-only development server.
