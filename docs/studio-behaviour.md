# Studio behaviour spec (fields on artwork)

What the studio's canvas does with **form fields on an uploaded artwork** ([D35](decisions.md#d35-ai-made-artwork-and-fields-only)), edge cases included. Each rule has a source and a status. Agreed with the owner on 2026-11-17 (Phase 0 research: Q-S1–Q-S7), then cut to fields when the drawing tools were dropped (D35).

> **🤖 Claude Code:** a canvas behaviour not listed here is added here first (with a source), then built and tested. Rules marked **To build** are agreed but not built yet: build them before calling the studio done.

## Sources

| Key | Source |
|---|---|
| **OP** | [open-pencil](https://github.com/open-pencil/open-pencil) (MIT): a Figma-compatible editor whose input code copies Figma's behaviour, often naming the Figma version it measured. Files under `packages/vue/src/shared/input/` unless named |
| **OT** | [opentempl](https://github.com/noah-thing/opentempl) (MIT): a Canva-like editor, its code and a scripted run of it (OT-run n, 2026-11-17) |
| **FG** | Figma's help centre (help.figma.com) |
| **PL** | Our plan §5 |
| **US** | Our studio, measured 2026-11-17 |

Not taken over from the research, because there's nothing to draw any more (D35): text editing and text box sizing, rotation, shapes and lines, layers and locking, hide and show, groups, crop, auto layout (Q-S7: no).

## 1. Speed

| # | Rule | Source | Status |
|---|---|---|---|
| P1 | Each field is drawn as its own piece; a move changes only its position, never its drawing. The artwork is drawn once | OP/OT (per-element components); US (the whole slip redrawn per move: 150–200 ms frames with the CPU slowed 4×) | Built (R1) |
| P2 | The studio's SVG equals the server's for the same design (`tests/slip-svg.test.ts`) | PL §6.2 | Built |

## 2. Viewport

| # | Rule | Source | Status |
|---|---|---|---|
| V1 | Opens at Fit; Ctrl+0 fits again; zoom 10–400% | PL | Built |
| V2 | Ctrl/⌘ + wheel zooms about the pointer at Figma's rates: a trackpad pinch (small Ctrl+wheel steps) by `2^(−Δ/50)`, a mouse wheel notch by `e^(−0.005 Δ)`; never 10× in one event | OP `wheel.ts` ("measured in Figma 126"); US (was 2.7× a notch) | Built |
| V3 | Ctrl + `+` / `−` zoom by 1.25 about the middle | PL; OT | Built |
| V4 | Wheel pans; Shift + wheel pans sideways; Space + drag or the middle button pans | PL; OT | Built |
| V5 | Field outlines, handles and guides stay thin at any zoom: outlines are drawn in a screen-pixel layer outside the zoomed stage (Chrome rounds a border under 1 px up to 1 px *before* the zoom, so dividing by the zoom doesn't work) | OT (overlay in screen pixels); US (thick at 400%) | Built |

## 3. Selecting

| # | Rule | Source | Status |
|---|---|---|---|
| S1 | Click selects one field; Shift+click adds or removes one | PL; OP `select/press.ts`; FG | Built |
| S2 | Shift+press on a selected field: a click removes it, a drag moves the whole selection | OP (`clickDeselectsId`) | Built |
| S3 | A box dragged on empty canvas selects every field it **touches** | PL; OT-run 10; OP `transform/marquee.ts` | Built |
| S4 | Ctrl+A selects every field; Esc clears the selection | PL; FG | Built |
| S5 | The artwork is never selectable on the canvas | PL §5.2 | Built |
| S6 | An empty field is hit across its whole box | PL §5.3 | Built |
| S7 | Hover outline on the field under the pointer, when it isn't selected (a selected field has its toolbar there) | OT `HoverOutline` | Built |

## 4. Moving

| # | Rule | Source | Status |
|---|---|---|---|
| M1 | Press on an unselected field and drag: selected and moved in one gesture | PL; OT-run 2; OP | Built |
| M2 | A move starts after 3 px; less is a click | OP `drag-threshold.ts`; OT | Built (Moveable) |
| M3 | Shift while dragging locks to the main axis | OP `move/drag.ts`; OT-run 5 | Built |
| M4 | Alt held at the press drags a copy and leaves the original; the copies end selected. A fixed-meaning field can't be copied (F3), so it just moves | OP `duplicate-drag.ts`; FG; OT-run 6 | Built |
| M5 | Esc during a drag or resize cancels it: back where it was, no save, no undo step; so do the window losing focus and `pointercancel` | OP `pointer/drag.ts`, `useCanvasInput.ts`; OT-run 4 (OT doesn't) | Built |
| M6 | Arrows nudge 1 px, Shift+arrows 10 px | PL; FG; OP `nudge.ts` | Built |
| M7 | Fields may leave the artwork; off it is a publish warning | PL §5.6 | Built |

## 5. Resizing

| # | Rule | Source | Status |
|---|---|---|---|
| R1 | Eight handles; a side handle moves one side, the opposite side stays | PL; OP `resize/rect.ts` | Built |
| R2 | **Shift keeps proportions** while held | FG ("hold ⇧ Shift"); OP `resize/apply.ts`; Q-S3 | Built |
| R3 | Past the opposite side, the field stops at 4 px; it never flips | OT `MIN = 4`; OP mirrors instead (we have no flip) | Built |
| R4 | Several fields resize from the corners of their shared box | OP `resize/selection.ts`; OT `scaleGroup` | Built (Moveable group) |
| R5 | A tiny field keeps a grabbable body: side handles hide under 32 screen px, all handles under 16 (zoom in, or type W and H, to resize it) | OT-run 13 (handles cover a 6 px box) | Built |
| R5b | A press *near* a tiny selected field still takes it | OP `select/hit.ts` | To build |
| R6 | A live label shows the size while resizing | OT `live-label` | Built |

## 6. Snapping

| # | Rule | Source | Status |
|---|---|---|---|
| G1 | Edges and centres snap to the artwork's edges and centre and to other fields, with guide lines; distances are labelled in design px | PL; OP; OT | Built |
| G2 | Threshold 5 screen px (Figma's) | OP `scene-graph/src/snap.ts` | Built |
| G3 | **Ctrl/⌘ held: no snapping** | FG ("Hold Control"); OP; Q-S2 | Built |
| G4 | Equal gaps between neighbours snap, with the gap labelled (Moveable `snapGap`) | OT `equalGap`; OP | Built |

## 7. Editing and keyboard

| Keys | Action | Status |
|---|---|---|
| Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y | Undo · Redo (one gesture = one step, last 100) | Built |
| Ctrl+C · Ctrl+V · Ctrl+D | Copy · Paste (works across templates in this browser) · Duplicate | Built |
| Delete / Backspace | Delete | Built |
| Ctrl+A · Esc | Select all · Clear (during a drag or resize, Esc cancels it: M5) | Built |
| Arrows · Shift+Arrows | Nudge 1 · 10 px | Built |
| Ctrl + `+` / `−` / `0` | Zoom in · out · Fit | Built |
| Space + drag | Pan | Built |
| Shift (dragging) · Alt (at the press) · Ctrl (dragging) | Lock to an axis · Drag a copy · No snapping | Built |

Shortcuts don't fire while typing in a field or inside a dialog or menu. Paste skips a fixed-meaning field the template already has (one of each, PL §5.3.3). A pasted choice option brings its group.

## 8. Fields (only our studio has these)

| # | Rule | Source | Status |
|---|---|---|---|
| F1 | Sample values show in the fields, so the size of a value can be judged | PL §5.3.4 | Built |
| F2 | A value shrinks to fit its box, to half its size, then is cut off | PL §5.3.1 | Built |
| F3 | Fixed-meaning fields: one of each; the Fields panel greys out what's there | PL §5.3.3 | Built |
| F4 | A new field goes to the middle of the artwork, cascading 24 px, and to the end of the fill order | PL §5.3.4 | Built |
| F5 | Selecting one option of a choice group outlines the group's other options | PL §5.3.2 | Built |
| F6 | Hovering a field shows its name: its label, or its type when it has none | Q-S4 | Built |

## 9. Artwork

| # | Rule | Source | Status |
|---|---|---|---|
| A1 | PNG and JPEG as uploaded; SVG drawn to PNG in the browser (no scripts, no outside links); over 1 MB re-encoded as JPEG; over 2000 px scaled down; under 200 px refused; the platform sees the result and what was changed | D35; `utils/artwork.ts` | Built |
| A2 | The canvas takes the artwork's size; Replace artwork keeps the fields where they are | PL §5.2 | Built |
| A3 | Under 1000 px on its long side: a "soft" warning | PL §5.2 | Built |
