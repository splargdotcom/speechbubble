# Speechbubble

A direct, browser-based speech bubble designer for comics, photographs and memes.

**[Open Speechbubble](https://splargdotcom.github.io/speechbubble/)**

Speechbubble generates its artwork as procedural SVG. Bubbles remain crisp at any size, tails join the body cleanly, and uploaded images never leave the browser.

## What it does

- Drag bubbles directly around the canvas.
- Drag the blue tail point to the speaker.
- Resize from the blue corner handle.
- Add, duplicate, delete and reorder multiple bubbles.
- Undo and redo edits, including dragging, formatting and background changes.
- Choose speech, thought or shout styles.
- Use oval or rounded speech bubbles with adjustable tails.
- Automatically wrap and fit text.
- Format text with `**bold**`, `*italic*` and `[colour](#d62828)`.
- Upload PNG, JPEG, WebP or GIF backgrounds.
- Export a transparent or white-background SVG.
- Export PNG at 1×, 2× or 4× resolution.
- Insert a selected bubble into Photopea as a group of native shape and text layers.
- Use the editor on desktop, tablet or mobile.

## Photopea plugin

Speechbubble can run inside Photopea and insert the selected bubble directly into the active document.

1. Download [`speechbubble-photopea.json`](speechbubble-photopea.json).
2. In Photopea, choose **Window → Plugins → Add Plugin**.
3. Load the downloaded JSON file.
4. Open the Speechbubble plugin, design a bubble and choose **Insert in Photopea**.

The plugin is the same private, browser-based editor hosted by GitHub Pages. Generated bubbles are transferred locally. Speech bubbles have a closed body and a separate closed tail in **one native shape layer**, with both paths set to **Unite**. This addresses [issue #1](https://github.com/splargdotcom/speechbubble/issues/1). A layer stroke outlines the combined silhouette, so there is no seam where the tail meets the body. Text remains in separate editable text layers, including inline bold, italic and colour formatting.

To adjust a tail after insertion, expand the inserted group, select **bubble-shape**, choose **Path Select (A)** and drag the tail. Use **Direct Select** to edit individual points. Keep its path operation on **Unite**. Thought-bubble dots are separate paths too. A speech tail whose tip is inside the body is hidden and omitted from insertion.

Keep the destination document open while insertion runs. Temporary import tabs close after a successful transfer. If Photopea reports a timeout or document change, inspect those tabs before retrying; the plugin leaves uncertain imports open to avoid closing your work. Insertion is confirmed only after Photopea acknowledges the copy.

The shape is generated as a small native PSD and the text is imported from SVG. Ordinary **Export SVG** and **Export PNG** retain the seamless artwork for standalone use. Photopea may substitute unavailable fonts; make the same font available there for matching text metrics. Existing smart objects inserted by earlier releases are not converted automatically.

## Controls

- Drag a bubble to move it.
- Drag the circular blue point to aim its tail.
- Drag the square corner point to resize it. Hold Shift to preserve its proportions.
- Use the arrow keys to nudge the selected bubble; hold Shift to move it farther.
- Press Delete or Backspace to remove the selected bubble.
- Press Ctrl/⌘ + D to duplicate it.
- Press Ctrl/⌘ + Z to undo, or Ctrl/⌘ + Shift + Z / Ctrl + Y to redo. Text fields retain their normal typing shortcuts; the toolbar undo buttons undo editor changes.

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
- `editor-state.js` — undo/redo snapshots, bounded movement and image sizing.
- `native-shape.js` — cubic vector contours and the native PSD shape writer.
- `photopea.js` — guarded Photopea import, styling and grouping scripts.
- `app.js` — canvas interaction, text layout, image loading and export.
- `speechbubble-photopea.json` — Photopea plugin manifest.
- `photopea-icon.svg` — monochrome plugin-gallery icon.

Everything is plain HTML, CSS and JavaScript so it remains easy to host on GitHub Pages and easy to alter without a toolchain.

## Changes in 2.2.0

- Separate editable Photopea tail paths, native text layers and confirmed insertion.
- Undo/redo with up to 60 steps; consecutive typing and nudging are grouped.
- Rounded tails attach along straight edges; oval tails aim correctly on wide bubbles.
- Moving against a canvas edge preserves the tail's offset from the body.
- More stable resizing and pointer handling, and safer empty numeric inputs.
- Small backgrounds keep their dimensions; large images scale proportionally to an 8000-pixel maximum edge. GIF backgrounds use a still frame so preview and export agree.
- Stale image loads are ignored, PNG failures are reported and auto-fit checks text width as well as height.
- Toolbar controls wrap on narrow screens; all script/style URLs have versioned cache keys.

## Verification

Run the dependency-free regression suite with Node.js 18 or newer:

```bash
node --test tests/*.test.cjs
```

Tests cover geometry, PSD path operations, undo/redo, image dimensions, editor events and Photopea message sequencing. The small DOM fixture does not emulate browser rendering or font metrics. Native insertion scripts and independent tail movement were also checked in the live Photopea editor; the complete plugin iframe flow and local responsive layout still need a browser smoke test after hosting this version.

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE).
