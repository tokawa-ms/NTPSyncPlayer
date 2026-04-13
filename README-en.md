# 🎯 NTP Sync Countdown

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![Azure Container Apps](https://img.shields.io/badge/Azure-Container%20Apps-0078D4?logo=microsoftazure&logoColor=white)](infra/main.bicep)

[日本語](README.md)

**A precisely synchronized countdown timer across multiple devices using NTP time synchronization.**

Ideal for event venues, broadcast studios, QA testing, and any scenario where multiple screens need to display a perfectly synchronized countdown.

## ✨ Features

- **NTP Time Sync** — Fetches accurate time from `ntp.nict.jp` via the server and automatically corrects client-side clock drift
- **Video Countdown** — Frame-accurate synchronized MP4 video playback (falls back to text-based countdown if no video is available)
- **Multi-Device Sync** — Displays the same countdown timing across all connected browsers and devices
- **Real-Time Quality Indicators** — NTP offset and HTTP RTT visualized with color coding (green/yellow/red)
- **Mobile Ready** — Tap overlay for Autoplay restrictions, fullscreen support
- **Zero-Dependency Frontend** — Pure HTML/CSS/JS with no frameworks required
- **Docker & Azure Ready** — One-command deployment with Dockerfile and Bicep templates

## 🏗️ Architecture

```
┌────────────┐    UDP/123     ┌──────────────┐     HTTP      ┌──────────────┐
│ NTP Server  │ ◄──────────► │  Web Server    │ ◄──────────► │   Browser     │
│ ntp.nict.jp │              │  (Node.js)     │              │  (Client)     │
└────────────┘              └──────────────┘              └──────────────┘
```

1. **Server → NTP**: Queries the NTP server every 60 seconds to calculate server clock offset
2. **Client → Server**: Fetches `/api/ntp-offset` every 30 seconds and computes client-side offset accounting for HTTP RTT
3. **`ntpNow()`**: Returns `Date.now() + clientOffset` for NTP-corrected accurate time

See [docs/time-sync-algorithm.md](docs/time-sync-algorithm.md) for the full algorithm details.

## 📁 Project Structure

```
├── server.js              # Node.js HTTP server + NTP client
├── public/
│   ├── index.html         # Main HTML page
│   ├── app.js             # Client logic (NTP sync, countdown control)
│   └── style.css          # Stylesheet
├── docs/
│   └── time-sync-algorithm.md  # Detailed time-sync algorithm documentation
├── infra/
│   ├── main.bicep         # Azure Container Apps Bicep template
│   └── main.bicepparam    # Bicep parameter file
├── deploy.ps1             # Deployment script (PowerShell)
├── deploy.sh              # Deployment script (Bash)
├── Dockerfile             # Container image build definition
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+

### Run Locally

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open http://localhost:6413 in your browser.

### Run with Docker

```bash
# Build the image
docker build -t ntpsync .

# Start the container
docker run -p 6413:6413 ntpsync
```

### Video File (Optional)

Place a `bg-movie-countdown01.mp4` file in the `public/` directory to enable synchronized video playback during the countdown. If no video file is present, the app automatically falls back to a text-based countdown with beep sounds.

## ☁️ Deploy to Azure

Bicep templates and deployment scripts are included for Azure Container Apps.

```bash
# PowerShell
.\deploy.ps1

# Bash
./deploy.sh
```

Deployment requires:

- An Azure subscription
- Azure Container Registry (ACR)
- Azure CLI (`az`)

See [infra/main.bicep](infra/main.bicep) for infrastructure details.

## 🔧 Configuration

| Environment Variable | Default | Description           |
| -------------------- | ------- | --------------------- |
| `PORT`               | `6413`  | Server listening port |

### Countdown Timing

By default, countdowns start at **:20** and **:50** of each minute. To customize, edit the `START_SECS` array in [public/app.js](public/app.js).

## 📡 API

### `GET /api/ntp-offset`

Returns the server's NTP synchronization status.

```json
{
  "offsetMs": 12.5,
  "lastSync": "2026-04-13T12:00:00.000Z",
  "server": "ntp.nict.jp",
  "error": null,
  "serverTime": 1776182400000
}
```

| Field        | Type             | Description                                         |
| ------------ | ---------------- | --------------------------------------------------- |
| `offsetMs`   | `number \| null` | Server's NTP offset in ms. `null` if not yet synced |
| `lastSync`   | `string \| null` | Last successful sync time (ISO 8601)                |
| `server`     | `string`         | NTP server in use                                   |
| `error`      | `string \| null` | Error message, if any                               |
| `serverTime` | `number`         | Server's `Date.now()` at response generation (ms)   |

## 🖥️ UI Display

| Element             | Description                               |
| ------------------- | ----------------------------------------- |
| NTP-Corrected Time  | Accurate time based on `ntpNow()`         |
| System Time         | Raw `Date.now()` without correction       |
| NTP Correction Info | Client-based offset + server-side offset  |
| HTTP RTT            | Round-trip time between client and server |

### Offset / RTT Color Coding

| Status     | Offset     | RTT        |
| ---------- | ---------- | ---------- |
| 🟢 Good    | ≤ 100 ms   | ≤ 200 ms   |
| 🟡 Warning | 100–500 ms | 200–500 ms |
| 🔴 Bad     | > 500 ms   | > 500 ms   |

## ⚠️ Limitations

- NTP communication is server-side only (browsers cannot send UDP packets)
- UDP port 123 may be blocked in PaaS/container environments, causing NTP sync to fail
- Sync accuracy degrades in high-latency network environments

## 📄 License

[MIT](LICENSE)
