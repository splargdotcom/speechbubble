# Speech Bubble Designer Pro 💬

> A parametric, browser-based vector graphics tool for generating perfect comic book speech bubbles and memes.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Launch_App-success?style=for-the-badge&logo=github)](https://splargdotcom.github.io/speechbubble/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<img width="1919" height="1079" alt="Screenshot 2025-12-12 054743" src="https://github.com/user-attachments/assets/f4844427-06c8-4ae2-9642-8490d6f4e03a" />


## 🚀 Overview

**Speech Bubble Designer Pro** is a lightweight, zero-dependency web tool that generates procedural SVGs for speech bubbles, thought clouds, and shout spikes. Unlike static clipart, this tool uses real-time math to calculate tangent points, Bézier curves, and shape mechanics.

It has recently evolved into a full **Meme Generator**, allowing you to upload background images, layer bubbles on top, and export the combined result as a high-resolution PNG.

**[👉 Try the Live Demo Here](https://splargdotcom.github.io/speechbubble/)**

## ✨ Key Features

### 🎨 Design & Shapes
* **4 Parametric Shapes:** Switch seamlessly between **Pill**, **Circle**, **Rectangle**, and the new **Spike/Explosion** mode.
* **Thought Bubbles:** Procedurally generates "scalloped" edges for thought clouds.
* **Physics-Based Tails:**
    * **Smart Tangents:** Tails connect perfectly to the bubble edge regardless of angle or size.
    * **Seamless Joining:** Advanced path logic ensures the tail and body are a single continuous shape (no ugly seam lines).
    * **Bézier Controls:** Fine-tune the "physics" of the tail curve (bend left, bend right, or S-curve).

### 🖼️ Meme Generator Mode
* **Background Upload:** Upload any image to use as a backing layer.
* **Smart Canvas:** The workspace automatically resizes to match the resolution of your uploaded image.
* **Positioning:** Drag sliders to position the bubble exactly where you need it over a character's head.

### ✍️ Rich Text Engine
Support for formatting within the text input:
* **Bold:** Use double asterisks -> `**Like This**`
* **Italic:** Use single asterisks -> `*Like This*`
* **Color:** Use bracket syntax -> `[Red Text](red)` or `[Blue](#0000FF)`

### 🛠️ Export
* **High-Res PNG:** One-click download that flattens the background image, the SVG vector bubble, and the text into a single portable file.

## 🛠️ Technical Stack

This project is built as a **Single-File Application (SPA)** for maximum portability and ease of study.

* **React 18:** Used for state management and UI rendering.
* **SVG (Scalable Vector Graphics):** The core rendering engine. All shapes are drawn using mathematical `path` data commands.
* **Tailwind CSS:** For the polished "Pro App" UI/UX.
* **Babel Standalone:** Compiles JSX on the fly (no Node.js build step required).

### The Math Behind the Magic
The core logic relies on trigonometry to calculate the connection points between the bubble body and the tail.
* **Seamless Paths:** The engine dynamically generates a single `d` path attribute that traces the shape's perimeter, injects the tail coordinates at the correct angle, and closes the loop to ensure stroke widths remain consistent.
* **Edge Snapping:** For rectangles, the math creates a "sliding" effect where the tail base follows the flat edge but allows the tip to point anywhere.

## 📦 Local Development

Because this project uses the "Zero-Build" architecture, you do not need `npm`, `yarn`, or a build server.

1.  Clone the repo:
    ```bash
    git clone [https://github.com/splargdotcom/speechbubble.git](https://github.com/splargdotcom/speechbubble.git)
    ```
2.  Open `index.html` directly in any modern web browser (Chrome, Firefox, Safari).

*Note: For the best experience, or if you plan to extend the code, running it via a local server (like VS Code's "Live Server" extension) is recommended to prevent browser CORS issues with image exports.*

## 🤝 Contributing

This is an open-source project! Ideas for future updates:

* [ ] **Multi-Bubble Support:** Allow adding multiple bubbles to a single canvas.
* [ ] **Sticker Library:** Add pre-made assets (emojis, effects) to the canvas.
* [ ] **Stroke Styles:** Support for dashed lines or "sketchy" hand-drawn stroke effects.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with ❤️ using React and SVG Math.*
