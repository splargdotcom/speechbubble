# Speech Bubble Designer Pro 💬

> A parametric, browser-based vector graphics tool for generating perfect comic book speech bubbles.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Launch_App-success?style=for-the-badge&logo=github)](https://splargdotcom.github.io/speechbubble/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<img width="850" height="850" alt="speech-bubble" src="https://github.com/user-attachments/assets/cf4bce19-a9f5-4bac-8d93-d432862349dc" />


## 🚀 Overview

**Speech Bubble Designer Pro** is a lightweight, zero-dependency web tool that generates procedural SVGs for speech and thought bubbles. Unlike static clipart, this tool uses real-time math to calculate tangent points, Bézier curves, and shape mechanics, allowing for "physics-based" tail adjustments.

It exports high-resolution, transparent PNGs ready for use in **webcomics, UI mockups, educational materials, and memes.**

**[👉 Try the Live Demo Here](https://splargdotcom.github.io/speechbubble/)**

## ✨ Key Features

* **Parametric Shapes:** Switch seamlessly between Pill, Circle, and Rectangle modes with adjustable aspect ratios.
* **Physics-Based Tails:**
    * **Smart Tangents:** Tails connect perfectly to the bubble edge regardless of angle or size.
    * **Bézier Controls:** Fine-tune the "physics" of the tail curve (bend left, bend right, or S-curve).
    * **Manual Offsets:** Option to detach the tail tip for precise positioning.
* **Smart Text Layout:**
    * Multi-line support with dynamic spacing.
    * Partial Markdown support (use `*text*` for italics).
    * Wide selection of comic-friendly fonts.
* **Thought Bubble Mode:** Procedurally generates "scalloped" edges for thought clouds.
* **High-Res Export:** One-click download of transparent PNGs at any resolution.

## 🛠️ Technical Stack

This project is built as a **Single-File Application (SPA)** for maximum portability and ease of study.

* **React 18:** Used for state management and UI rendering.
* **SVG (Scalable Vector Graphics):** The core rendering engine. All shapes are drawn using mathematical `path` data commands.
* **Tailwind CSS:** For the polished "Pro App" UI/UX.
* **Babel Standalone:** Compiles JSX on the fly (no Node.js build step required).

### The Math Behind the Magic

The core logic relies on trigonometry to calculate the connection points between the bubble body and the tail.
* **Pill Shapes:** Uses an ellipse algorithm to find the exact coordinate on the perimeter based on the tail's angle.
* **Tails:** Uses Quadratic Bézier curves (`Q` commands in SVG path data) to create smooth, organic bends.

## 📦 Local Development

Because this project uses the "Zero-Build" architecture, you do not need `npm`, `yarn`, or a build server.

1.  Clone the repo:
    ```bash
    git clone [https://github.com/splargdotcom/speechbubble.git](https://github.com/splargdotcom/speechbubble.git)
    ```
2.  Open `index.html` directly in any modern web browser (Chrome, Firefox, Safari).

*Note: For the best experience, or if you plan to extend the code, running it via a local server (like VS Code's "Live Server" extension) is recommended.*

## 🤝 Contributing

This is an open-source project! Ideas for future updates:

* [ ] **Image Upload:** Allow users to upload a background image to place bubbles over (Meme Generator mode).
* [ ] **Rich Text:** Support for bolding and changing colors of specific words.
* [ ] **Spike Bubbles:** Procedural generation for "shouting" or "explosion" bubbles.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with ❤️ using React and SVG Math.*
