# Bundled fonts

Comic and handwritten typefaces offered in Speechbubble's Typeface menu. They
ship with the app so they work offline and can be embedded in exported SVG and
PNG files. Only the Latin subset is included; other characters fall back to the
browser's default font.

| Font | Files | Licence | Copyright |
| --- | --- | --- | --- |
| Comic Neue | `comic-neue-latin-{400,700}-{normal,italic}.woff2` | SIL Open Font License 1.1 (`LICENSE-comic-neue.txt`) | Copyright 2014 The Comic Neue Project Authors |
| Patrick Hand | `patrick-hand-latin-400-normal.woff2` | SIL Open Font License 1.1 (`LICENSE-patrick-hand.txt`) | Copyright (c) 2010-2012 Patrick Wagesreiter |
| Bangers | `bangers-latin-400-normal.woff2` | SIL Open Font License 1.1 (`LICENSE-bangers.txt`) | Copyright 2010 The Bangers Project Authors |
| Permanent Marker | `permanent-marker-latin-400-normal.woff2` | Apache License 2.0 (`LICENSE-permanent-marker.txt`) | Copyright (c) 2010 by Font Diner, Inc. |

The files come unmodified from the [Fontsource](https://fontsource.org) 5.3.0
npm packages (`@fontsource/comic-neue`, `@fontsource/patrick-hand`,
`@fontsource/bangers` and `@fontsource/permanent-marker`).

After adding or replacing a file here, regenerate `fonts.js`, which the app
loads:

```bash
node tools/build-fonts.cjs
```
