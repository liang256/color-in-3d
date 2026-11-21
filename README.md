# Color in 3D Together

Product page for the paperback, with the coloring demo on the same page. GitHub Pages serves this repository as a static site.

From the repository root, run:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000/](http://localhost:8000/). The demo loads its local manifest and SVGs over HTTP.

The coloring demo is the “try a page before you buy” section. Its modes are unchanged: one side only, one color per side, one color per face, random colors, and tap to fill.

| Page | Artwork |
| --- | --- |
| `b4-p34` | Title-page slab with official face polygons and edges |
| `b4-p32` | Batch 4, page 32 |
| `b4-p01` | Batch 4 final, page 01 |
| `b7-p08` | Batch 7 final, page 08 |
| `b7-p24` | Batch 7 final, page 24 |

Run `python3 scripts/export_face_svgs.py` from the workspace root to regenerate the five SVGs and their manifest. Derived pages use the official title-page left/right convention from cover_geometry.json (left = +y face).

Use `?page=b4-p34&mode=paladin` to open a specific view. Modes accept `one-side`, `paladin`, `mage`, `random`, and `tap`, or the corresponding numbers 1 through 5. Random starts at seed 34. In tap mode, use `fills` with comma-separated `face-id:#RRGGBB` entries. Encode the hash as `%23` in browser URLs, for example `?mode=tap&fills=b4-p34-left-00:%23F94C3E`.

`sample/everything-is-relative.pdf` is a single interior coloring page offered as a free download. It is not the whole book.

## Phase 2 hooks

- Register bucket and brush handlers in the `modes` controller in `demo.js`. Stage events route to the active handler.
- Bucket writes to `faceColors`. The renderer projects that map onto stable face paths, which can also be reused for clipping.
- Render a separate brush stroke list in `#paint-layer`, between `#fills` and the pass-through `#line-art`. A future undo stack can record changes to the face map and brush commands.
