# Voltage — Guitar Studio

A local-first browser guitar amp. All live audio processing, recorded takes, custom cabinet impulses, and loop playback run on your computer. No audio upload or account is needed to use the local app.

## Start locally

Install Node.js 22 or newer, then run `npm start` in this folder (or double-click `start.cmd` on Windows). Open **http://127.0.0.1:5173** in Chrome or Edge. There are no npm dependencies to install. Keep the terminal running while you play.

## Connect your guitar

1. Connect the guitar to a USB audio interface's **instrument/Hi-Z** input. A normal headphone socket and passive cable cannot replace an instrument input.
2. Connect wired headphones to the interface. Start with low hardware gain/volume, and turn off the interface's direct monitoring to avoid hearing a second dry signal.
3. Select the interface as your computer's output (or use Audio settings in a browser supporting output selection).
4. Click **Connect guitar**, allow audio input access, choose the interface, and select **Input 1 / L** or **Input 2 / R**. Mono-only capture disables Input 2.
5. Play firmly and adjust hardware input gain so the input meter avoids clipping. Choose a preset and play.

**Try a demo riff** exercises the actual effect chain without a connected instrument. **M** mutes all output. **T** opens the tuner.

## Included

- Four original amp voices: American Clean, British Chime, Vintage Crunch and Modern High Gain. Gain, bass, middle, treble, presence, level and amp bypass.
- Three filter-based cabinet simulations, cabinet bypass and custom mono/stereo cabinet IR loading (up to 2 seconds / 10 MB).
- Noise gate, compressor, overdrive, chorus, phaser, tremolo, delay and algorithmic convolution reverb; independent controls and bypass.
- Six factory presets plus a browser-local personal tone library. Amp and pedal settings are restored on reload; master starts at 35% and audio always starts off.
- Chromatic tuner with muted tuning, metronome with tap tempo, a 60-second looper with overdubbing, and recording with downloadable takes.
- Processed recording includes guitar, loop, click and master volume/mute. Dry recording taps the input after trim and before effects. Export uses the browser's supported MediaRecorder format, usually WebM/Opus. Recordings stop at 30 minutes. Download takes before leaving.
- Input/output meters, pre-limiter high-level indicator, input trim, channel selection and available device output selection.

## Practical limits

Use HTTPS or localhost; opening index.html directly does not enable live audio. Chrome/Edge are recommended. Other browsers may omit output device selection or worklet support. Capture constraints request echo cancellation, noise suppression and automatic gain off; actual device settings are reported where available.

Output latency is a browser estimate, not measured guitar round-trip latency. Input, driver and hardware delay are additional. Browsers cannot select ASIO drivers; a native audio workstation may offer lower latency. Bluetooth adds delay. Amp models are original waveshaping/EQ designs, not licensed or measured replicas of physical amps. Built-in cabinets use filters; custom IRs supply measured cabinet responses.

Custom IRs, loops and undownloaded recordings live only in the current session. Saved custom-IR presets identify the expected file; reload it if missing or different. Presets belong to the browser and origin used to save them. Built-in metering is for monitoring, not calibrated measurement.

## Verification

`npm run check` checks JavaScript syntax. `npm test` covers tuner accuracy, setting validation, amp curves, gate attenuation and looper routing/lifecycle. With the local server running, open **http://127.0.0.1:5173/__test** for 20 real OfflineAudioContext render checks, including all presets, effect influence, tails, cabinet filtering and bounded output. The test route is local-only and not included in hosted static assets.

Physical USB input, driver behavior, hardware output and end-to-end latency must be checked on the interface you use.

## Architecture

Static ES modules in `dist/` use Web Audio and AudioWorklet without dependencies. `audio-engine.js` manages capture, graph lifecycle, effects, recording and transport. `gate-worklet.js` runs the gate and sample-based looper on the audio rendering thread. `dsp.js` contains tuner and synthesized audio helpers. `settings.js` defines validated tone settings; `app.js` binds the interface. `server.mjs` is a loopback-only development server.
