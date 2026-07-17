# Speechbubble

A direct, browser-based speech bubble designer for comics, photographs and memes.

**[Open Speechbubble](https://splargdotcom.github.io/speechbubble/)**

Speechbubble generates its artwork as procedural SVG. Bubbles remain crisp at any size, tails join the body cleanly, and uploaded images never leave the browser.

## What it does

- Drag bubbles directly around the canvas.
- Drag the blue tail point to the speaker.
- Resize from the blue corner handle.
- Add, duplicate, delete and reorder multiple bubbles.
- Choose speech, thought or shout styles.
- Use oval or rounded speech bubbles with adjustable tails.
- Automatically wrap and fit text.
- Format text with `**bold**`, `*italic*` and `[colour](#d62828)`.
- Upload PNG, JPEG, WebP or GIF backgrounds.
- Export a transparent or white-background SVG.
- Export PNG at 1×, 2× or 4× resolution.
- Insert a selected bubble into Photopea as a transparent SVG smart object.
- Use the editor on desktop, tablet or mobile.

## Photopea plugin

Speechbubble can run inside Photopea and insert the selected bubble directly into the active document.

1. Download [`speechbubble-photopea.json`](speechbubble-photopea.json).
2. In Photopea, choose **Window → Plugins → Add Plugin**.
3. Load the downloaded JSON file.
4. Open the Speechbubble plugin, design a bubble and choose **Insert in Photopea**.

The plugin is the same private, browser-based editor hosted by GitHub Pages. Generated bubbles are transferred to Photopea locally as tightly cropped SVG smart objects.

## Controls

- Drag a bubble to move it.
- Drag the circular blue point to aim its tail.
- Drag the square corner point to resize it. Hold Shift to preserve its proportions.
- Use the arrow keys to nudge the selected bubble; hold Shift to move it farther.
- Press Delete or Backspace to remove the selected bubble.
- Press Ctrl/⌘ + D to duplicate it.

## Local use

There are no packages to install and no build step.

```bash
git clone https://github.com/splargdotcom/speechbubble.git
cd speechbubble
python3 -m http.server 8000
```

Then open `http://localhost:8000`. You can also open `index.html` directly.

## Project structure

- `index.html` — accessible application markup.
- `styles.css` — layout, controls and responsive design.
- `geometry.js` — procedural bubble, cloud, burst and tail paths.
- `app.js` — canvas interaction, text layout, image loading and export.
- `speechbubble-photopea.json` — Photopea plugin manifest.
- `photopea-icon.svg` — monochrome plugin-gallery icon.

Everything is plain HTML, CSS and JavaScript so it remains easy to host on GitHub Pages and easy to alter without a toolchain.

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE).
