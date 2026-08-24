# Work Tracker for Jibble

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Manifest V3](https://img.shields.io/badge/manifest-V3-purple)
![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Firefox%20%7C%20Brave-orange)
![License](https://img.shields.io/badge/license-AGPL--3.0-green)

A browser extension for Jibble that tracks your daily work hours, break times, and monthly attendance targets at a glance. Works on Chrome, Firefox, Brave.

---

## Features

- **At-a-glance stats**: View today's and monthly work time, allowed break, and target variance.
- **Live Elapsed Tracking**: System time auto-increments today's active work time and toolbar icon badge continuously.
- **Break in Hand (+)**: Clear positive remaining break display (`+40m`) when under allowance.
- **Daily chart**: Visual grouped bar chart showing work, break, and total hours per day with hover tooltips.
- **Icon badge**: Displays live daily hours directly on the extension icon.
- **Notifications**: Optional desktop alert when your daily target is reached.
- **Auto session sync**: Automatically syncs login token when Jibble is open in any tab.
- **Flexible schedules**: Configurable work targets, break allowances, half-day Saturdays, and alternating weekend schedules with proper "Weekend" off days.
- **Export & Print**: Export monthly data to CSV or print a formatted PDF summary report.
- **Light/Dark theme**: Follows system preference or toggle manually.

---

## Development & Single Codebase

All development source code lives in `src/`. Run the zero-dependency build script to generate Chrome and Firefox targets:

```bash
# Build both Chrome and Firefox targets
npm run build

# Run unit tests
npm test

# Lint Firefox extension with Mozilla addons-linter
npm run lint
```

### Installation

#### Chrome / Brave / Edge
1. Clone or download this repository.
2. Run `npm run build` (or use pre-built `chrome/` directory).
3. Go to `chrome://extensions` and enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `chrome/` directory (or `dist/chrome/`).

#### Firefox
1. Run `npm run build` (or use pre-built `firefox/` directory).
2. Go to `about:debugging` -> **This Firefox**.
3. Click **Load Temporary Add-on...** and select `firefox/manifest.json` (or `dist/firefox/manifest.json`).

---

## How it Works

1. Open [web.jibble.io](https://web.jibble.io) in any tab. The extension automatically detects your login session.
2. Click the extension icon in your browser toolbar for quick stats, or open the full dashboard for charts and configuration.

---

## License & Disclaimer

Released under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See `LICENSE` for details.

*Note: This is an unofficial open-source companion extension and is not affiliated with or endorsed by Jibble.*
