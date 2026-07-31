# Work Tracker for Jibble

![Version](https://img.shields.io/badge/version-2.1-blue)
![Manifest V3](https://img.shields.io/badge/manifest-V3-purple)
![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Firefox%20%7C%20Brave-orange)
![License](https://img.shields.io/badge/license-AGPL--3.0-green)

A browser extension for Jibble that tracks your daily work hours, break times, and monthly attendance targets at a glance. Works on Chrome, Firefox, Brave.

---

## Features

- **At-a-glance stats**: View today's and monthly work time, allowed break, and target variance.
- **Daily chart**: Visual grouped bar chart showing work, break, and total hours per day with hover tooltips.
- **Icon badge**: Displays live daily hours directly on the extension icon.
- **Notifications**: Optional desktop alert when your daily target is reached.
- **Auto session sync**: Automatically syncs login token when Jibble is open in any tab.
- **Flexible schedules**: Configurable work targets, break allowances, half-day Saturdays, and alternating weekend schedules.
- **Export & Print**: Export monthly data to CSV or print a formatted PDF summary report.
- **Light/Dark theme**: Follows system preference or toggle manually.

---

## Installation

### Chrome / Brave / Edge
1. Download or clone this repository.
2. Go to `chrome://extensions` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the extension directory.

### Firefox
1. Go to `about:debugging` -> **This Firefox**.
2. Click **Load Temporary Add-on...** and select `manifest.json`.

---

## How it Works

1. Open [web.jibble.io](https://web.jibble.io) in any tab. The extension automatically detects your login session.
2. Click the extension icon in your browser toolbar for quick stats, or open the full dashboard for charts and configuration.

---

## License & Disclaimer

Released under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See `LICENSE` for details.

*Note: This is an unofficial open-source companion extension and is not affiliated with or endorsed by Jibble.*
