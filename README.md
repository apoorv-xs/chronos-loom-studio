# Chronos — The Loom Studio 🎬

Chronos is a modern, high-fidelity browser-based Non-Linear Editor (NLE) that reimagines the video editing workflow by combining a **visual node-based storyboard canvas** with a **traditional linear track timeline**. 

Instead of forcing you into a strict timeline from your first draft, Chronos lets you brainstorm, sequence, and connect media cards visually, while automatically syncing a clean linear sequence underneath.

---

## 🚀 Key Features

### 1. Interactive Node Canvas
* **Visual Storyboarding:** Arrange video, image, and audio cards in a freeform 2D grid.
* **Dynamic Bezier Connections:** Connect cards with canvas-drawn bezier lines indicating chronological playback order.
* **Transition Sockets:** Click and select transition types (Cuts, Fades, Slides, Zooms, and Dissolves) and durations directly on the connector cables.
* **Color Coding & Notes:** Organize sequences with custom colors, locks, and connected text sticky notes (which automatically double as subtitles/captions during playback).

### 2. Draggable & Resizable Program Monitor
* **Responsive UI:** A glassmorphic monitor overlay that is fully draggable and resizable, maintaining locked proportional aspect ratios (16:9, 9:16, or 1:1).
* **Global Playback Controls:** Toggles playback globally with `Spacebar` (ignored while typing in notes/inputs) and provides floating overlay play/pause controls.
* **Real-time Scrubbing:** Scrubbing the timeline playhead seeks the active video frame and background score tracks in real-time.

### 3. FCP7 XML Import & Export (Cross-NLE Compatibility)
* **Roundtrip Portability:** Export your timeline as an industry-standard Final Cut Pro 7 XML file compatible with Premiere Pro, DaVinci Resolve, and Filmora.
* **Workspace Preservation:** Node positions, notes text, connection routes, and card colors are encoded into `<chronos_metadata>` blocks within the XML, allowing a perfect restoration of your canvas workspace on import.
* **Zero-Setup Import:** Double-click `.xml` files in the sidebar explorer or drag-and-drop them onto the canvas to instantly load projects.

### 4. Browser-Native MP4 Video Exporter
* **Offline Canvas Renderer:** Capture the timeline sequence as a compiled video file directly in the browser (no backend required).
* **Live Render Queue Modal:** Watch the rendering process in real-time on a progress bar and visual preview window.
* **Web Audio Mixing:** Routes video sound tracks and background music layers through a Web Audio API `AudioContext` mixer destination.

---

## 🛠️ Tech Stack
* **Framework:** React 18 & Vite
* **Styling:** Vanilla CSS (Glassmorphism design system, smooth micro-animations, tailored dark mode)
* **Graphics & Rendering:** HTML5 Canvas API (Bezier routing, MP4 frame rendering)
* **Audio Engineering:** HTML5 Audio & Web Audio API (Track mixing, spatial nodes)
* **Icons:** Lucide React

---

## 📦 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/apoorv-xs/chronos-loom-studio.git
   cd chronos
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build the production package:
   ```bash
   npm run build
   ```

---

## 💡 Quick Start Guide
1. **Load Folder:** Click **Open Folder** on the left panel to load a local folder of media assets.
2. **Add Assets:** Drag video/audio/image assets from the Directory Explorer onto the canvas to create media nodes.
3. **Connect Sequences:** Drag connections from the circular connector socket on the right of one card to the left socket of another to establish sequence ordering.
4. **Export Video:** Click **Export ➔ Export MP4 Video** to compile your project into a video file!
