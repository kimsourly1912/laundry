# Studio behaviour spec (Phase 0)

What every studio tool does, including the edge cases, **before** the canvas is rebuilt. Each rule has a source and the test that will prove it. Status: **agreed by the owner on 2026-11-17** (all of §17 as recommended). Plan §5.6–5.7 points here, and the rebuild (plan §9, R1–R6) is checked against it ([D34](decisions.md#d34-the-studio-canvas-our-own-interaction-layer)).

> **🤖 Claude Code:** build nothing in the studio's canvas that isn't a rule here. A behaviour found missing while building is added here first (with a source), then built and tested.

## Sources

| Key | Source | Trust |
|---|---|---|
| **OT** | [opentempl](https://github.com/noah-thing/opentempl) source (MIT), file named | What a working editor's code does |
| **OP** | [open-pencil](https://github.com/open-pencil/open-pencil) source (MIT): a Figma-compatible editor in Vue whose input code copies Figma's behaviour and often names the Figma version it measured. File named (under `packages/vue/src/shared/input/` unless shown) | What Figma does, measured |
| **OT-run n** | opentempl run locally from source, driven by a script (scenario n, 2026-11-17) | What it actually does |
| **FG** | Figma's help centre (help.figma.com), article named | Official, verified |
| **CV** | Canva: third-party shortcut lists only. Canva's help centre refuses automated reading | **Unverified** |
| **PL** | Our plan §5 (agreed 2026-11-17) | Agreed product |
| **US** | Our own studio, measured 2026-11-17 (a 50-element slip, CPU slowed 4×) | Problems to fix |

Rule status: **Keep** (already in plan §5), **New** (not in the plan before), **Change** (differs from the plan's first version; agreed with §17). The owner's answers are in [§17](#17-questions-for-the-owner).

## 1. Performance (the reason for the rebuild)

Measured on our studio (US): with the CPU slowed 4× (a normal laptop), a drag on a 50-element slip has frames of 150–200 ms and a group drag blocks for 24 s. Cause: every pointer move rebuilds the **whole** slip SVG, re-shapes every text with fontkit, re-parses it, and re-measures every element for snapping.

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| P1 | A move, resize or rotate redraws **only the elements that changed**. Each element is its own memoised component | OT `render/PageView.tsx`, `ElementView.tsx` (`memo`) | New | e2e perf check |
| P2 | Shaped text is cached by (text, size, bold, width, line height); a move never re-shapes text | OT `text/layout.ts` (cache of 2,000) | New | unit: cache hit; output equals uncached |
| P3 | Snap targets are collected **once** when a gesture starts, not on every move | OT `canvas/snap.ts` `collectTargets` in `beginMove` | New | unit |
| P4 | **Budget:** a drag of one element and of 20 elements on a 100-element slip, CPU slowed 4×: 95% of frames ≤ 33 ms, no task over 100 ms | US | New | `studio-perf.test.ts` |
| P5 | The studio's SVG stays byte-identical to the server's for the same design (one drawing path, D31/D32) | PL §6.2 | Keep | unit: per-element output = `slipSvg` |

## 2. Viewport: zoom, pan, fit

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| V1 | The slip is drawn **at the zoomed size** (SVG `width/height` = design × zoom, `viewBox` in design units), not with a CSS `scale()`. Handles, outlines and guides are drawn in screen pixels, so they stay thin at any zoom | OT `PageStage.tsx`, `PageView` `displayWidth`; US (outlines thick at 400%) | Change | e2e: outline 1 px at 400% |
| V2 | Ctrl/⌘ + wheel zooms about the pointer, at Figma's measured rates: a **trackpad pinch** (Chromium reports Ctrl+wheel with small deltas) by `2^(−deltaY / 50)`; a **mouse wheel** by `e^(−0.005 × deltaY)`; one event never zooms more than 10×. Wheel without Ctrl pans by 2 × delta, at most 120 px per event | OP `wheel.ts` ("measured in Figma 126"); OT `Viewport.tsx` (gentler); US (ours: 2.7× per notch) | Change | unit: factor per event |
| V3 | Zoom range 10%–400% | PL §5.6 (OT allows 800%) | Keep | unit |
| V4 | Ctrl + `+` / `−` zoom by 1.25 about the view's centre; Ctrl+0 Fit; **Ctrl+1 100%** | OT `shortcuts.ts`; FG "Adjust your zoom" (Shift+1 fit) | Keep + New (Ctrl+1) | e2e |
| V5 | The studio opens at Fit and **keeps fitting while the window resizes** until the person zooms or pans; after that the zoom stays | OT `Viewport.tsx` (`autoFit`) | New | e2e |
| V6 | Wheel without Ctrl scrolls (pans); Shift + wheel pans sideways | PL §5.6; OT (native scroll) | Keep | e2e |
| V7 | Space + drag, or middle button, pans. Space is ignored while typing | PL §5.6; OT `Viewport.tsx` | Keep | e2e |
| V8 | Pressing on the grey workspace (outside the slip) clears the selection and can start a box select | OT `onBackground`; PL §5.6 | Keep | e2e |

## 3. Hit-testing and hover

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| H1 | **Hover outline:** the element under the pointer gets a thin outline (not when it's already selected, not during a drag) | OT `HoverOutline` | New | e2e |
| H2 | A **locked** element lets clicks through to the first unlocked element under it. Only when nothing editable is under the pointer is the locked one picked | OT `PageStage.tsx` `seeThrough` / `pickId` | Change (Q-S1) | e2e |
| H3 | Hidden elements are never hit on the canvas | OT `ElementView` (renders nothing); FG "Toggle visibility" | Keep | e2e |
| H4 | The background (photo) is never hit; a click on it is a click on empty slip | PL §5.2 | Keep | e2e |
| H5 | **Form fields are hit across their whole box**, even though an empty field draws nothing (its box is the target) | PL §5.4 (fields draw nothing until filled); US | Keep | e2e |

## 4. Selecting

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| S1 | Click selects one element and clears the rest | PL §5.6; OT; FG "Select layers" | Keep | e2e |
| S2 | Shift+click adds an element, or removes it if already selected | PL; OT `select(additive)`; FG | Keep | e2e |
| S2b | **Shift+press on an already selected element:** a click (no drag) removes it from the selection; a drag moves the whole selection and removes nothing | OP `select/press.ts` (`clickDeselectsId`), `move/drag.ts` | New | e2e |
| S3 | Press on empty slip and drag: a **box select**. It selects every unlocked, shown element it **touches** (not only those fully inside). Shift + box adds to the selection | PL §5.6; OT `rectsIntersect`; OT-run 10 (touching one corner selects) | Keep | e2e |
| S4 | The box select updates **live** while dragging (selected elements show as you go) | OT (`selection` set on each move) | New | e2e |
| S5 | Box select never picks locked or hidden elements | OT; OT-run 11d | Keep | e2e |
| S6 | Ctrl+A selects every unlocked, shown element | PL §5.7; OT `selectAll` | Keep | e2e |
| S7 | Esc: cancels a running gesture (M7); else finishes text editing (T5); else clears the selection | OT `shortcuts.ts` (order of Esc); FG ("Esc" deselects) | Keep + New (cancel) | e2e |
| S8 | **Tab / Shift+Tab** selects the next / previous element in layer order (keyboard reach) | OT `shortcuts.ts`; FG (Tab between siblings) | New | e2e |
| S9 | Undo and redo drop selected ids that no longer exist | OT `pruneSelection` | Keep | unit |

## 5. Moving

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| M1 | Press on an **unselected** element and drag: it is selected and moves in the same gesture | PL §5.6; OT `beginMove`; OT-run 2 | Keep | e2e |
| M2 | Press on an element that's **part of a multi-selection** and drag: the whole selection moves | OT `beginMove(ids)` | Keep | e2e |
| M3 | A move starts only after the pointer travels **3 px (mouse) / 10 px (touch)**. Less is a click | OT `startDrag` threshold; OT-run 1 | New | e2e |
| M4 | **Shift while dragging** locks the move to the main axis (horizontal or vertical) | OT `beginMove`; OT-run 5 | New | e2e |
| M5 | **Alt held when the drag starts** moves a copy and leaves the original (Alt-drag duplicates). The copy is one undo step | OT `beginMove(duplicate)`; FG "Copy and paste" (Alt-drag); OT-run 6 (Alt pressed after the press does nothing) | New (Q-S2) | e2e |
| M6 | Locked elements in the selection don't move; the rest do | OT `movable` filter; OT-run 11c | Keep | e2e |
| M7 | **Esc during a drag, resize or rotate cancels it**: everything returns to where it was (an Alt-drag copy goes away), nothing is saved, no undo step | OP `pointer/drag.ts` (`discardCanvasDrag`, `cancelMove`): Figma cancels resize and rotate on Esc; OP leaves moves running, as Figma does. **We cancel moves too** (harmless, and OT-run 4 shows the confusion of not doing it) | New | e2e |
| M10 | The window losing focus, or the browser cancelling the pointer (`pointercancel`), cancels the gesture as Esc does | OP `useCanvasInput.ts` (`blur` → cancel, `pointercancel`) | New | e2e |
| M11 | Space pressed **during** a drag doesn't start panning; the drag goes on | OP (Space is taken during a move) | New | e2e |
| M8 | Elements may be moved partly or fully off the slip; a field off the slip is a publish warning (not blocked) | PL §5.8 | Keep | e2e |
| M9 | Arrow keys nudge 1 px, Shift+arrows 10 px. **Presses in a row (within 0.5 s) are one undo step and one save** | PL §5.7; FG "nudge values" (1 / 10); OT nudge | Keep + New (merge) | unit + e2e |

## 6. Resizing

Handles: corners are 14 px circles; side handles are 22 × 7 px pills (OT `app.css`). The hit area is at least 14 px whatever the zoom.

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| R1 | **Which handles:** shapes, images, icons, fields: 8. Text: 4 corners + left and right (no top and bottom; its height follows its text). Line: one handle at each end, no box | OT `handlesFor`; PL §5.6 | Change (lines, text) | e2e |
| R2 | A side handle changes one side; the opposite side stays put | OT `resizeElement`; OT-run 7c | Keep | unit |
| R3 | **Corner handles keep proportions for images, icons and text; free for shapes and fields. Shift switches that** (frees images and text, locks shapes) | OT `resizeElement` (`keepRatio` per type, Shift inverts); FG (Shift keeps proportions); PL §5.6 (types only) | Change (Q-S3) | unit + e2e |
| R4 | **Alt resizes from the centre** (both opposite sides move) | OT (`opts.alt`); FG "Smart selection"; CV (third-party) | New | unit |
| R5 | Text, side handle: changes the wrap width; the text rewraps; the height follows. Width can't go below ~0.6 × font size | OT `resizeElement` (text branch); PL §5.6 | Keep | unit + e2e |
| R6 | Text, corner handle: scales the font size with the box | OT; PL §5.6 | Keep | unit |
| R7 | A **rotated** element resizes along its own axes; the opposite handle stays fixed on the page | OT `resizeElement` (`rotatePoint`) | Keep (verify ours) | unit |
| R8 | Dragging past the opposite side **stops at the minimum size** (4 px); the element never flips. (Figma mirrors the layer instead; we have no flip in the first version, and a mirrored Khmer label would be wrong) | OT `MIN = 4`; OT-run 7c; OP `resize/rect.ts` (mirrors) | Keep | unit |
| R8b | With proportions kept, a corner follows the axis the pointer moved most (the width when equal), and the opposite corner stays put | OP `resize/rect.ts` | New | unit |
| R9 | **Several selected:** the box is the elements' axis-aligned bounds (upright even when they're rotated), with only the 4 corners; the whole selection scales together inside its bounding box (texts' font sizes and lines' widths scale with it) | OT `scaleGroup`, `groupResizeBox` | Change (ours lets each resize alone) | unit + e2e |
| R10b | A press **near** a selected element too small for handles still takes it (the hit area grows to the handles' box), as Figma widens it | OP `select/hit.ts` (`tinySelectionAt`) | New | e2e |
| R10 | **Tiny on screen:** when the box is under ~40 screen px on a side, the side handles hide and only corners stay; under ~16 px only the bottom-right corner stays, so the body can still be grabbed to move | **Gap in OT** (OT-run 13: 8 handles cover a 6 px box) | New | e2e |
| R11 | A live label shows the size while resizing (`240 × 80`) and the angle while rotating (`45°`) | OT `live-label` | New | e2e |
| R12 | Resizing snaps the dragged edge to guides (only for unrotated elements) | OT `onHandle` (snap only if no rotation) | New | unit |
| R13 | When resizing ends, every text box's height is fitted to its text | OT `fitText` on resize end; US (`setNormalize`) | Keep | unit |

## 7. Rotating

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| RO1 | The round handle sits **below** the selection (it doesn't hide the floating toolbar above) | OT `.rotate-handle` (`top: 100%`); our studio already does this | Change (plan says "above") | e2e |
| RO2 | Snaps to 0°, 45°, 90°… within 3° | PL §5.6; OT `snapAngle(deg, 3, 45)` | Keep | unit |
| RO3 | **Shift: 15° steps** | OT `rotationFor`; FG "Adjust alignment… rotation" (Shift, 15°); CV (third-party); OT-run 8 | New | unit + e2e |
| RO4 | Several selected rotate together around the selection's centre (each keeps its place in the group); the selection box stays upright | OT `onRotate` (multi); OP `transform/rotation.ts` | Keep | unit |
| RO5 | Stored angle: −180° to 180°, one decimal | Ours (`normalAngle`) | Keep | unit |

## 8. Snapping and smart guides

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| G1 | Edges and centres snap to: the slip's edges and centre, other shown elements' edges and centres. Threshold **5 screen px** (Figma's), so it feels the same at any zoom | OP `scene-graph/src/snap.ts` (5), `snap/resolve.ts` (÷ zoom); OT (6); PL §5.6 (6) | Change | unit |
| G1b | **Whole pixels:** a move lands on whole positions and a resize on whole sizes (Figma's "snap to pixel grid"); Ctrl (no snapping) keeps them exact too | OP `snap/resolve.ts` | New | unit |
| G2 | **Equal spacing:** between two neighbours on a line, the element snaps to equal gaps, and the gaps are labelled (`24`) | OT `equalGap`, `gapGuides`; FG Smart selection (spacing) | New | unit |
| G3 | Guide lines show only while dragging, run between the matched elements, and are 1 px | OT `GuideLine`; FG ("A red guide appears") | Keep | e2e |
| G4 | **Hold Ctrl/⌘ to move without snapping** | OT (`!ev.metaKey && !ev.ctrlKey`); FG ("Hold Control to temporarily disable" snapping) | Change (plan: Alt) (Q-S2) | e2e |
| G5 | With Shift (axis lock), snapping only works on the free axis | OT (`axes` in `snapBox`) | New | unit |
| G6 | Hidden elements are not snap targets; locked ones are | OT `collectTargets` (skips `hidden`) | New | unit |
| G7 | A **Snap** switch in the toolbar turns snapping off for the session | OT (`editor.state.snap`, screenshot: "Snap") | New | e2e |

## 9. Text on the canvas

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| T1 | Double-click a text starts editing. **A second click on an already selected text also starts editing.** Enter starts editing the selected text | PL §5.6; OT `beginMove` (`clickedSelected`), `shortcuts.ts` (Enter); OT-run 16 | Keep + New | e2e |
| T2 | The editor sits exactly over the text, same font, size, line height, colour, alignment and rotation, so words don't jump when editing starts or stops | OT `TextEditor.tsx`; PL §5.6 | Keep | e2e (screenshot diff) |
| T3 | On entering, all the text is selected | OT (`selectAll` on open) | Keep | e2e |
| T4 | Enter inserts a new line (the slip's text has no paragraphs) | OT (`insertLineBreak`) | New | e2e |
| T5 | Esc or a click outside finishes. The whole edit is **one undo step** | PL §5.6; OT (`stopCapturing` on open) | Keep | e2e |
| T6 | **Leaving a text box empty removes it** | OT (cleanup on unmount); OT-run 14 | New | e2e |
| T7 | Paste inside the editor pastes **plain text** only | OT (`onPaste` → `insertText`) | New | e2e |
| T8 | While editing, the canvas shortcuts are off (Delete deletes letters, arrows move the caret) | PL §5.7; OT `isTyping` | Keep | e2e |
| T9 | While typing, the box's height grows with the text so the editor never cuts it off | OT (`minHeight`); ours sets a fixed height | Change | e2e |
| T10 | Khmer + Latin in one box; wraps only at spaces and new lines | PL §5.3, D32 (Q14) | Keep | unit (exists) |

## 10. Lock, hide, background

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| L1 | A locked element can't be moved, resized, rotated or deleted on the canvas | PL; OT; FG "Lock and unlock" | Keep | e2e |
| L2 | A locked element is picked only when nothing unlocked is under the pointer (H2); then it shows its box with a lock badge and no handles, and the floating toolbar offers **Unlock** only | OT `SelectionOverlay` (`lock-badge`, `QuickBar` locked); OT-run 11b | Change (Q-S1) | e2e |
| L3 | Locked and hidden elements can always be selected in the Layers tab | FG; PL §5.3 | Keep | e2e |
| L4 | Ctrl+Shift+L locks or unlocks the selection | OT `shortcuts.ts`; FG ("Cmd/Ctrl+Shift+L") | New | e2e |
| L5 | Delete skips locked elements in the selection | OT `deleteSelected` | Keep | unit |
| L6 | Duplicate and paste make **unlocked** copies | OT `duplicateSelected` (`locked: false`) | New | unit |

## 11. Layer order and the Layers tab

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| Y1 | Ctrl+] / Ctrl+[ bring forward / send backward; **Ctrl+Shift+] / [** bring to front / send to back (⌘+⌥ on a Mac) | PL §5.7; FG (Windows "Ctrl+Shift+]", Mac "Cmd+Option+]"); OT uses Ctrl+Alt, which clashes with AltGr on Windows keyboards | Keep + New | e2e |
| Y2 | The Layers tab lists top first, the background last; click selects, Shift+click adds; drag to reorder; double-click renames; eye and lock buttons | PL §5.3; OT `LayersPanel.tsx`; FG | Keep | e2e |
| Y3 | Selecting on the canvas scrolls the Layers list to that row | OT `LayersPanel` ("brings its row into view") | New | e2e |
| Y4 | Each row shows a small preview of the element | OT (`ElementView` in the row) | New (Q-S4) | — |

## 12. Copy, paste, duplicate, delete

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| C1 | Ctrl+C / Ctrl+X / Ctrl+V; Ctrl+D duplicates | PL §5.7 (+ cut: new); OT `shortcuts.ts` | Keep + New (cut) | e2e |
| C2 | Paste puts copies where the originals were; **if something already sits exactly there, each paste moves 24 px further** (paste, paste, paste makes a staircase) | OT `paste` (`sameSpot`); OT-run 15 | Change (ours: fixed offset) | unit |
| C3 | Duplicate places the copy 24 px right and down, selected, on top | OT `duplicateSelected(24)` | Keep | unit |
| C4 | A copy works across templates in the same browser (the clipboard keeps the elements) | PL §5.7; OT (system clipboard + prefix) | Keep | e2e (exists) |
| C5 | **Pasting fixed-meaning fields** (Order No., Date, Phone, Amount, Paid) into a template that already has one: the paste skips them and says so | PL §5.4.3 (one of each) | Keep (verify ours) | unit |
| C6 | Pasted fields get new keys; choice options keep their group only if the group comes with them | PL §5.4.2 | Keep (exists) | unit |

## 13. Keyboard (complete list)

All shortcuts are off while typing in a field, in the text editor, or inside a dialog or menu (ours: `isTyping`; OT `isTyping`).

| Keys | Action | Source |
|---|---|---|
| Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y | Undo · Redo | PL; OT; FG |
| Ctrl+C · Ctrl+X · Ctrl+V · Ctrl+D | Copy · Cut · Paste · Duplicate | PL; OT |
| Delete / Backspace | Delete (unlocked) | PL; OT |
| Ctrl+A · Esc · Tab / Shift+Tab | Select all · Cancel / finish / clear · Next / previous element | PL; OT; FG |
| Enter | Edit the selected text | OT |
| Arrows · Shift+Arrows | Nudge 1 · 10 px | PL; OT; FG |
| Ctrl+] · Ctrl+[ · Ctrl+Shift+] · Ctrl+Shift+[ | Forward · Backward · Front · Back | PL; FG |
| Ctrl+Shift+L | Lock / unlock | OT; FG |
| Ctrl + `+` · Ctrl + `−` · Ctrl+0 · Ctrl+1 | Zoom in · out · Fit · 100% | PL; OT |
| Space + drag | Pan | PL; OT |
| ? | Show this list | OT (`shortcutsOpen`) |

Not taken from OT: tool keys (T, R, C, L…), groups (Ctrl+G), flip, find, command palette, copy style. Groups and flip are out of the first version (PL §5.10); the tool keys can come later (Q-S5).

## 14. Undo, redo and saving boundaries

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| U1 | One gesture (drag, resize, rotate) = **one undo step and one save**, committed when the pointer is released. Selecting is never a step | PL §5.8; OT (`stopCapturing` at gesture start); OT-run 3 | Keep | e2e (exists) |
| U2 | A cancelled gesture (M7) or a click without movement makes no step | New (M7, M3) | New | e2e |
| U3 | A text edit is one step (T5); a run of nudges is one step (M9); a toolbar slider drag is one step | OT; PL | Keep + New | unit |
| U4 | Undo during text editing first finishes the edit | OT `undo()` (clears `editingTextId`) | New | e2e |
| U5 | 100 steps per session | PL §5.8 | Keep | unit (exists) |

## 15. Toolbars

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| B1 | **Floating toolbar** over the selection: duplicate, lock, delete, ⋯ (layer order, copy, paste). For a locked selection: Unlock only. Hidden while dragging | PL §5.1; OT `QuickBar` | Keep + Change (locked) | e2e |
| B2 | The floating toolbar **flips below** the selection when there's no room above (near the top toolbar or the window edge), and follows zoom and scroll | OT `QuickBar` (`is-below`) | New | e2e |
| B3 | **Right-click menu** on an element: the same actions as ⋯; on empty slip: Paste, Select all | OT `onContextMenu` | New (Q-S4) | e2e |
| B4 | The contextual toolbar above the canvas changes with the selection (§5.5 of the plan) | PL §5.5; OT `ContextToolbar` | Keep | e2e (exists) |

## 16. Form fields and our own elements (no other tool has these)

| # | Rule | Source | Status | Test |
|---|---|---|---|---|
| F1 | An empty field shows a **1 px dashed outline in screen pixels** (V1), so fields are findable on a busy photo; the outline is never in the customer's PNG | PL §5.4; US | Keep | e2e |
| F2 | Hovering a field shows its label (English) next to it; the Layers tab and toolbar show it too | New (fields draw nothing until filled) | New (Q-S4) | e2e |
| F3 | Selecting one option of a choice group **highlights the other options of the same group** (thin outline) | PL §5.4.2 (options placed separately) | New | e2e |
| F4 | The canvas shows **sample values** in fields (a 2, a ✓, an order number) so the size of a value can be judged; a switch hides them | PL §5.4.5; ours (`sampleData`) | Keep | e2e |
| F5 | A field's value shrinks to fit its box, down to half its font size, then is cut off; never spills | PL §5.4.1 | Keep | unit (exists) |
| F6 | Fixed-meaning fields: at most one of each. Adding a second (button, paste, Alt-drag, duplicate) is refused with a message | PL §5.4.3 | Keep | unit |
| F7 | A new field is added at the centre of the view (not the slip), cascading 24 px when added again, and goes to the end of the fill order | PL §5.4.5; ours (cascade) | Keep | unit |
| F8 | Deleting a field removes it from the fill order; deleting the last options of a group leaves a publish error, not a broken design | PL §5.8 | Keep | unit |
| F9 | The background photo is set from Uploads; it fills the slip, is never selectable on the canvas, and is listed last in Layers | PL §5.2 | Keep | e2e |

## 17. Questions for the owner

Answered 2026-11-17: **Q-S1–Q-S5 all as recommended.** Q-S6 and Q-S7 came from the open-pencil study and are open.

| # | Question | Answer | Why |
|---|---|---|---|
| **Q-S1** | Clicking a **locked** element: pass the click through to what's under it, and select the locked one (badge, Unlock button) only when nothing else is there? Or never select locked elements on the canvas (plan §5.6, Figma)? | Pass through, then select with Unlock (OT) | A photo slip has locked labels on top of fields. Pass-through lets you click the field under it, and you can still unlock from the canvas without opening Layers |
| **Q-S2** | Modifier keys: **Ctrl = no snapping**, **Alt = resize from centre / Alt-drag duplicates**? (The plan uses Alt for no snapping.) | Yes | Matches Figma and opentempl, so the platform's hands already know it. Alt can't mean two things |
| **Q-S3** | Corner handles: keep proportions for images, icons, text; free for shapes and fields; **Shift switches**? | Yes | Same as opentempl. The plan had the per-type rule without Shift; Figma uses Shift to keep proportions |
| **Q-S4** | Extras from opentempl: layer previews (Y4), right-click menu (B3), field labels on hover (F2). Include in the rebuild, or later? | Include B3 and F2; Y4 later | B3 and F2 are cheap and help on a busy photo; Y4 is cosmetic |
| **Q-S5** | Single-key tools (T for text, R for rectangle) like opentempl? | Later | Our main use is fields on a photo; buttons in the Form tab are enough for now |
| **Q-S6** | **Text box sizing:** add Figma's **auto width** (a new text grows sideways on one line as you type; dragging a side handle turns it into fixed width that wraps)? Today a text always has a fixed width and wraps | **Yes** (open; asked 2026-11-17) | Labels like "Shirt" or "អាវ" are short: a fixed width wraps them when the platform types a longer word. One flag on the text element; the server keeps drawing from the stored width |
| **Q-S7** | **Auto layout** (padding, gap, hug, fill) like Figma? | **No, not in the first version** (open; asked 2026-11-17) | Fields sit over printed boxes on a photo, so positions are absolute. Auto layout needs frames in the design and a layout engine on the server too. Equal-gap guides and Spread evenly cover even spacing |

## 17b. From open-pencil (Figma's behaviour): what we take and what we don't

open-pencil is a Figma-compatible editor (Vue 3, about 300,000 lines): it opens `.fig` files, draws with CanvasKit (Skia in WebAssembly) and lays out with Taffy (a flexbox and grid engine in WebAssembly). Its input code is the best source for **how Figma's gestures feel**, and the rules above now cite it (OP).

| Area | open-pencil | For our studio |
|---|---|---|
| Gestures (select, move, resize, rotate, Esc, Shift / Ctrl / Alt) | Figma's, measured | **Taken:** V2, G1, G1b, S2b, M7, M10, M11, R8b, R9, R10b, RO4 |
| Text box sizing | Three modes: **auto width** (grows on one line; made by a click), **auto height** (fixed width, wraps; made by a drag), **fixed** | **Q-S6** below |
| Auto layout (padding, gap, hug, fill, wrap, grid) | Frames that lay their children out like CSS flexbox and grid, through Taffy | **Not taken (Q-S7):** see below |
| Drawing | CanvasKit (Skia): one renderer in the browser | **Not taken:** our server must draw the customer's PNG on a Worker; the shared SVG builder (D31, D32, D34) stays |
| Components, variants, vector pen, `.fig` files, AI, collaboration | Yes | Not for a laundry slip |

**Why not auto layout:** the main use is fields placed **on a photo of a printed slip** (D33). Each field must sit exactly over a printed box, wherever the printer put it, so positions are absolute. Auto layout would also need a tree of frames in the design (ours is a flat list) and the same layout engine on the server, so the customer's PNG matches; that's Taffy (WebAssembly) on the Worker beside resvg. What a slip does need from it, even spacing, is covered by smart guides with equal gaps (G2) and **Spread evenly** (built in S5).

## 18. Deliberately not adopted from opentempl

Pages, groups, connectors and connect dots, pen and freehand drawing, crop mode, flip, effects and animation, charts and tables, comments and live sharing, the command palette, copy and paste style, rulers and a layout grid. Each is either out of the first version (PL §5.10) or has no use on a laundry slip. They can be revisited one by one, each with its own rules added here first.

## 19. Gaps found in opentempl that we do better

- **M7:** Esc doesn't cancel a drag there (OT-run 4). We cancel and restore.
- **R10:** tiny elements are covered by their own 8 handles (OT-run 13). We hide handles by size.
- **M5:** Alt must be held before pressing; pressing Alt during the drag does nothing (OT-run 6). We keep that rule but say it in the shortcut list.

## 20. How this was gathered

- **open-pencil:** `packages/vue/src/shared/input/` (`select/press.ts`, `select/hit.ts`, `select/move.ts`, `move/drag.ts`, `move/snap.ts`, `resize/apply.ts`, `resize/rect.ts`, `resize/selection.ts`, `resize/sizing.ts`, `snap/resolve.ts`, `wheel.ts`, `drag-threshold.ts`, `click-count.ts`, `duplicate-drag.ts`), `packages/vue/src/canvas/` (`useCanvasInput.ts`, `pointer/drag.ts`, `transform/rotation.ts`, `transform/marquee.ts`, `text-edit/input.ts`), `packages/core/src/layout/` (`text-auto-resize.ts`, `item-spacing.ts`, `axis-sizing.ts`, `spacing-marks.ts`), `packages/scene-graph/src/snap.ts`.
- **Code:** opentempl `apps/editor/src/canvas/*` (`PageStage`, `SelectionOverlay`, `transform`, `snap`, `TextEditor`, `CropOverlay`, `Viewport`), `editor/Editor.ts`, `editor/shortcuts.ts`, `panels/LayersPanel.tsx`, `styles/app.css`, `doc/design.ts` (undo `captureTimeout: 450`).
- **Running it:** opentempl built from source and driven by a Playwright script through 16 scenarios (OT-run 1–16), on a 1080 × 1080 page at 58% zoom.
- **Figma:** help.figma.com articles "Select layers and objects", "Adjust alignment, rotation, position and dimensions", "Set small and big nudge values", "Adjust your zoom and view options", "Lock and unlock layers", "Arrange layers with Smart selection", "Scale layers while maintaining proportions", "Copy and paste objects", "Adjust text dimensions and resizing", "Explore text properties", "Measure distances between layers", "Toggle visibility to hide layers".
- **Canva:** its help centre refuses automated reading (403). Third-party shortcut lists only, marked CV and never the only source for a rule.
- **Our studio:** the 2026-11-17 measurement (§1).
