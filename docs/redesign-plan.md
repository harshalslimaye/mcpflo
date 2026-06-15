# MCPFlo Layout Redesign — Detailed Implementation Plan

Source design: `MCPFlo Redesign.html` (Claude Design handoff bundle).
Goal: make the app match the design's layout & information architecture exactly,
**without changing the color scheme** (same semantic tokens, dark + light).

Execution model: **one phase / one element at a time**. Phase 0 is the foundation
everything references — do it first. Phase 7 is the load-bearing refactor (result
state moves before panels 8–9 make sense).

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## How to read this doc

### Token name translation (mockup → app)

The mockup invents its own short token names; the app already has semantic tokens.
**These are the same colors, different names.** Always use the app's existing tokens
where one exists, and only add the *derived* tokens (Phase 0) that have no equivalent.

| Mockup token | App token / Tailwind utility | Notes |
|---|---|---|
| `--bg`     | `--bg-primary`  → `bg-bg-primary`     | app background |
| `--panel`  | `--bg-surface`  → `bg-bg-surface`     | panels / cards |
| `--card`   | `--bg-elevated` → `bg-bg-elevated`    | inputs / raised |
| `--border` | `--border`      → `border-border`     | |
| `--fg`     | `--text-primary`→ `text-text-primary` | |
| `--fg-dim` | `--text-muted`  → `text-text-muted`   | secondary text |
| `--accent` | `--accent`      → `text-accent` / `bg-accent` | `#cc785c` |
| `--accent-hover` | `--accent-hover` → `*-accent-hover` | |
| `--rail`, `--panel-2`, `--card-2`, `--border-soft`, `--fg-faint`, `--accent-soft`, `--accent-line`, `--green`, `--green-soft`, `--code`, `--scroll*` | **NEW — added in Phase 0** | see Phase 0 |

### Tailwind conventions for this codebase

- Tailwind **v4** with the `@theme` block in `src/renderer/src/assets/base.css`.
  Mapping `--color-foo: var(--foo)` auto-generates `bg-foo`, `text-foo`, `border-foo`.
- **Non-standard px sizes** (e.g. `13.5px`, `23px`, `52px`) → use **arbitrary values**:
  `text-[13.5px]`, `w-[52px]`, `rounded-[8px]`. Do NOT approximate to the nearest
  default class — the design relies on exact values.
- **Custom radii** `--r-sm:5px --r-md:8px --r-lg:10px` → use `rounded-[5px]`,
  `rounded-[8px]`, `rounded-[10px]` (or define `--radius-sm/md/lg` in `@theme` and use
  `rounded-sm/md/lg`; arbitrary values preferred for clarity).
- Keep all existing behavior intact (prefill, schema lock, error/executing states,
  refresh/delete, resource & prompt views). Verify **both light and dark** each phase.

---

## Phase 0.5 — Margin-utility fix (foundation, discovered mid-build)

**File:** `src/renderer/src/assets/base.css`

Root cause found while verifying the sidebar in a real browser (Playwright): the base
reset `*,*::before,*::after { margin: 0 }` was **unlayered**, so it outranked Tailwind's
layered `m*` utilities (unlayered always beats `@layer` in the cascade). Result: **every
margin utility in the app was silently dead** — `mx-2`/`mt-1`/`mb-3` on the filter box,
`mb-3` on the sidebar title, `ml-auto` (history duration right-align), and `-mb-px` (tab
underline overlap) all computed to `0`.

- [x] Wrapped the reset block in `@layer base` so utilities can override it
- [x] Verified live: filter `margin-left` 0→8px (now aligns with rows at 60–311px), title→Add Server gap 0→12px
- Side effects (all toward intended design): history durations now right-align (`ml-auto`),
  tab active-underlines now overlap the container border (`-mb-px`), a few small `ml-*`/`mb-px` gaps appear.

---

## Phase 0 — Design tokens (foundation)

**File:** `src/renderer/src/assets/base.css`

The mockup's `:root` (dark) and `.app[data-theme="light"]` (light) blocks define derived
tokens layered on the semantic ones. Add each to **both** themes, then map into `@theme`.

### 0.1 — Add derived tokens to `:root` (dark, lines ~6–15 currently)

```css
/* derived — added for redesign */
--rail:        #141414;
--panel-2:     #2a2a2a;
--card-2:      #343434;
--border-soft: #2d2d2d;
--fg-faint:    #6f6f6f;
--accent-soft: rgba(204,120,92,0.15);
--accent-line: rgba(204,120,92,0.50);
--green:       #5cc77d;
--green-soft:  rgba(92,199,125,0.14);
--code:        #d4896b;
--scroll:      #3a3a3a;
--scroll-hover:#4a4a4a;
--btn:         linear-gradient(180deg,#d4896b,#cc785c);
```

### 0.2 — Add derived tokens to `[data-theme="dark"]`?

> ⚠️ The app's current `base.css` defines **light as `:root`** and **dark under
> `[data-theme="dark"]`** (opposite of the mockup, which defaults dark). Follow the
> **app's** structure: put **light** values in `:root` and **dark** values in
> `[data-theme="dark"]`. The theme store sets `data-theme` on `<html>`.

Light values (in `:root`):
```css
--rail:        #ece6dc;
--panel-2:     #f3eee6;
--card-2:      #e5dfd4;
--border-soft: #ece7df;
--fg-faint:    #999999;
--accent-soft: rgba(204,120,92,0.13);
--accent-line: rgba(204,120,92,0.45);
--green:       #3f9d63;
--green-soft:  rgba(63,157,99,0.14);
--code:        #b8674d;
--scroll:      #d8d2c6;
--scroll-hover:#c8c2b6;
--btn:         linear-gradient(180deg,#cc785c,#b8674d);
```
Dark values (in `[data-theme="dark"]`) = the 0.1 block above.

### 0.3 — Map into `@theme` (after the existing `--color-*` lines)

```css
--color-rail:        var(--rail);
--color-panel-2:     var(--panel-2);
--color-card-2:      var(--card-2);
--color-border-soft: var(--border-soft);
--color-fg-faint:    var(--fg-faint);
--color-accent-soft: var(--accent-soft);
--color-accent-line: var(--accent-line);
--color-green:       var(--green);
--color-green-soft:  var(--green-soft);
--color-code:        var(--code);
```

### Checklist
- [x] 0.1 dark derived tokens added
- [x] 0.2 light derived tokens added (mind the `:root` = light convention)
- [x] 0.3 `@theme` mappings added → `bg-rail`, `bg-panel-2`, `bg-card-2`,
      `border-border-soft`, `text-fg-faint`, `bg-accent-soft`, `border-accent-line`,
      `bg-green`, `bg-green-soft`, `text-code` all resolve
- [x] Confirm dark `--accent-hover` is `#d4896b` (already correct in base.css)
- [x] `--btn` gradient + `--scroll*` available for Phases 8 & 11
- [x] Smoke-test: typecheck + full test suite (508) green

---

## Phase 1 — Icon rail

**File:** `src/renderer/components/sidebar/PrimarySidebar.tsx`

### Design (`.rail`, `.rail button`)
```
.rail        : flex:0 0 52px; background:var(--rail); border-right:1px solid var(--border);
               flex-direction:column; align-items:center; padding:14px 0; gap:6px;
.rail button : 34×34; border-radius:8px; background:transparent; color:var(--fg-faint);
.rail button:hover : background:var(--card-2); color:var(--fg-dim);
.rail button.on    : background:var(--accent-soft); color:var(--accent);
.rail svg    : 18×18
```

### Current
- Container `flex flex-col items-center w-12 h-full bg-bg-surface border-r border-border` (line 42)
- `SidebarButton` uses `p-3 rounded-md`; active `text-accent`, else `text-text-muted hover:text-text-primary hover:bg-bg-elevated` (lines 23–27)
- Icons `size={20}` (lines 46, 53, 56)
- Top group `gap-2 pt-2 flex-1`; bottom group `gap-2 pb-2`

### Target
- [x] Container width `w-12` → `w-[52px]`; bg `bg-bg-surface` → `bg-rail`; keep `border-r border-border`
- [x] Vertical padding to `pt-[14px]`/`pb-[14px]`; group gaps `gap-2` → `gap-1.5` (6px)
- [x] `SidebarButton` button: `p-3 rounded-md` → `w-[34px] h-[34px] flex items-center justify-center rounded-[8px]`
- [x] Default color `text-text-muted` → `text-fg-faint`
- [x] Hover `hover:text-text-primary hover:bg-bg-elevated` → `hover:text-text-muted hover:bg-card-2`
- [x] Active `text-accent` → `text-accent bg-accent-soft`
- [x] Icon `size={20}` → `size={18}` (all four icons)
- [x] Keep Tooltip, items, order, theme-toggle + Settings at bottom
- Note: kept active buttons free of hover overrides (intentional deviation — mockup's
  cascade accidentally flips active→muted on hover). Tests 10/10, full suite 508 green.

---

## Phase 2 — Sidebar shell & header

**File:** `src/renderer/components/sidebar/SecondarySidebar.tsx`

### Design (`.sidebar`, `.sb-head`, `.sb-title`, `.add-server`)
```
.sidebar    : flex:0 0 268px; background:var(--panel); border-right:1px solid var(--border);
.sb-head    : padding:16px 16px 10px;
.sb-title   : 11px; weight:700; letter-spacing:.12em; color:var(--fg-faint); margin:0 0 12px;
.add-server : flex; gap:7px; color:var(--accent); 13px; weight:600; padding:4px 0;  (svg 14×14)
```

### Current
- Container `flex flex-col w-60 h-full bg-bg-primary border-r border-border shrink-0 overflow-y-auto` (line 165)
- Header block `px-3 pt-4 pb-2`; title `text-text-muted text-xs uppercase tracking-wider font-medium` (166–169)
- Add Server: `px-3 pb-3` wrapper; `<button class="text-accent text-sm hover:text-accent-hover">+ Add Server</button>` (172–179)

### Target
- [x] Width `w-60` → `w-[268px]`; bg `bg-bg-primary` → `bg-bg-surface`
- [x] Header padding → `px-4 pt-4 pb-2.5` (16/16/10), single block wrapping title + Add Server
- [x] Title → `<h2>` `text-[11px] font-bold tracking-[0.12em] uppercase text-fg-faint mb-3`
- [x] Add Server → `flex items-center gap-[7px] py-1 text-accent text-[13px] font-semibold` with a `<Plus size={14} />` icon before the label
- [x] Test: `'+ Add Server'` → `'Add Server'` (3 assertions). Suite 508 green.
- Note: outer column keeps `overflow-y-auto`; the header/tree scroll split moves to Phase 3 (with the filter box).

---

## Phase 3 — Sidebar filter box (net-new feature)

**File:** `src/renderer/components/sidebar/SecondarySidebar.tsx`

### Design (`.sb-filter`)
```
.sb-filter       : margin:4px 16px 12px; flex; gap:8px; align:center; background:var(--card);
                   border:1px solid var(--border); border-radius:8px; padding:7px 10px;
.sb-filter svg   : 13×13; color:var(--fg-faint);
.sb-filter input : flex:1; border:0; background:transparent; color:var(--fg); 12.5px;
.sb-filter input::placeholder : color:var(--fg-faint);
.sb-filter kbd   : mono 10px; color:var(--fg-faint); border:1px solid var(--border);
                   border-radius:4px; padding:1px 5px;
```

### Target
- [x] Insert filter row between header and tree: `mx-4 mt-1 mb-3 flex items-center gap-2 bg-bg-elevated border border-border rounded-[8px] px-2.5 py-[7px]`
- [x] `<Search size={13} className="shrink-0 text-fg-faint" />`
- [x] `<input>`: `min-w-0 flex-1 bg-transparent border-0 outline-none text-[12.5px] text-text-primary placeholder:text-fg-faint`, placeholder `"Filter tools, resources…"`, Escape clears + blurs
- [x] `<kbd>`: `font-mono text-[10px] text-fg-faint border border-border rounded-[4px] px-1.5 py-px`, content `⌘K`
- [x] Scroll split: outer column drops `overflow-y-auto`; new `min-h-0 flex-1 overflow-y-auto` tree wrapper
- [x] State `filter` + normalized `query`; `ServerTree` gains a `filter` prop, `itemLabel` helper
- [x] Filtering: case-insensitive match on tool/resource/prompt names; hide empty groups + non-matching servers; force-expand matches; never mutate the expansion Sets
- [x] `⌘K`/Ctrl+K global keydown → focus input via ref
- [x] 7 tests added (input, filter tools, match resources, hide servers, no-match, clear restores, ⌘K focus). Suite 515 green.
- Decision: filter matches **capabilities only**, not server names; operates on already-loaded data (no auto-fetch); group counts stay total.

---

## Phase 4 — Category headers (Tools / Resources / Prompts)

**Files:** `src/renderer/components/sidebar/SecondarySidebar.tsx`, `ServerRowItem.tsx`
(consider a dedicated `CategoryRow.tsx` rather than overloading `ServerRowItem`)

### Design (`.cat`, `.cat .count`)
```
.cat        : flex; gap:7px; margin:10px 4px 3px; padding:3px 6px; font-family:mono;
              10.5px; letter-spacing:.06em; color:var(--fg-faint); text-transform:uppercase;
              border-radius:4px; cursor:pointer;
.cat:hover  : color:var(--fg-dim);
.cat .chev  : 10×10; rotate 90° when open
.cat .cat-ico: 13×13
.cat .lbl   : flex:1
.cat .count : mono 10px; color:var(--fg-faint); background:var(--card);
              border:1px solid var(--border-soft); border-radius:20px; padding:1px 7px;
```

### Current
- Categories rendered as `ServerRowItem` with `depth={1}` (`pl-6`, `text-xs`, plain numeric count, chevron 12) — SecondarySidebar lines 79–87
- Count rendered as bare `<span class="text-xs text-text-muted">{count}</span>` (ServerRowItem line 115)

### Target
- [x] New `CategoryRow.tsx` component (kept `ServerRowItem` API intact — its tests assert depth-1 behavior)
- [x] `mx-1 mt-2.5 mb-[3px] px-1.5 py-[3px] rounded-[4px] font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-faint hover:text-text-muted`
- [x] Chevron `size={10}` rotates on open; category icon `size={13}`; label `flex-1`
- [x] Count **pill**: `rounded-full border border-border-soft bg-bg-elevated px-[7px] py-px text-[10px]` (inside the button)
- [x] Server-row typography bump: `text-xs font-medium` → `text-[13.5px] font-semibold` (depth 0); test updated
- [x] Preserve `disabled` (empty group) behavior
- [x] Tests: new `CategoryRow.test.tsx` (4); `ServerRowItem` font assertion updated. Suite 519 green.
- [x] Verified live (Playwright): categories render mono-uppercase with pill counts, Prompts dimmed/disabled, server rows bolder.

---

## Phase 5 — Leaf rows (tool / resource / prompt items)

**File:** `src/renderer/components/sidebar/CapabilityItem.tsx`

### Design (`.leaf`, `.leaf.active`)
```
.leaf            : flex; align-items:flex-start; gap:8px; padding:5px 8px 5px 10px;
                   margin-left:6px; border-left:1px solid var(--border-soft);
                   border-radius:0 5px 5px 0; 12.5px; color:var(--fg-dim); line-height:1.3;
.leaf:hover      : background:var(--card-2); color:var(--fg);
.leaf .lf-ico    : 13×13; margin-top:1px; color:var(--fg-faint);
.leaf .lf-name   : mono 12px; word-break:break-word;   /* full name, wraps — NO truncation */
.leaf.active     : background:var(--accent-soft); border-left:2px solid var(--accent);
                   color:var(--accent); padding-left:9px;
.leaf.active .lf-ico : color:var(--accent);
```

### Current
- `w-full flex items-center gap-1.5 pl-12 pr-2 py-0.5 text-left` (line 26)
- selected `text-accent bg-accent/10`; else muted hover (lines 15–19)
- label `truncate text-xs` (line 29) — **this is the truncation to remove**

### Target
- [x] Layout → `ml-1.5 flex items-start gap-2 rounded-r-[5px] py-[5px] pr-2 text-left` + per-state border/padding
- [x] Default colors → `text-text-muted hover:bg-card-2 hover:text-text-primary`
- [x] Icon wrapper → `mt-px shrink-0 text-fg-faint` (`GROUP_META` icons bumped to `size={13}`); active → `text-accent`
- [x] Label → `font-mono text-[12px] leading-[1.3] break-words` (removed `truncate`/`text-xs`) — verified wraps to 2 lines
- [x] Active → `bg-accent-soft border-l-2 border-accent text-accent pl-[9px]`; default `border-l border-border-soft pl-2.5` (no-shift, verified icon stays at 81px)
- [x] Kept `aria-current` + non-interactive cursor variant; tests updated. Suite 521 green; verified live.

---

## Phase 6 — Tool header

**File:** `src/renderer/components/tool/ToolHeader.tsx`

### Design (`.tool-head`, `.tool-name`, `.srv-chip`, `.tool-desc`)
```
.tool-head : flex column; gap:10px
.tool-id   : flex; align:center; gap:12px; wrap
.tool-name : mono 23px; weight:600; letter-spacing:-.01em; color:var(--fg)
.srv-chip  : inline-flex; gap:6px; 11.5px; color:var(--fg-dim); border:1px solid var(--border);
             border-radius:6px; padding:3px 8px; background:var(--card);  (svg 12×12)
.tool-desc : 13.5px; line-height:1.55; color:var(--fg-dim); max-width:72ch
```

### Current
- Wrapper `flex flex-col gap-2` (line 47) → gap should be 10px (`gap-2.5`)
- Name `text-lg font-medium font-mono truncate` (line 49)
- Chip `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border text-text-muted shrink-0` (line 50) — **no bg today**
- Desc `text-text-muted text-sm leading-relaxed` (line 57)

### Target
- [x] Wrapper gap `gap-2` → `gap-2.5` (10px)
- [x] `.tool-id` row gap `gap-2` → `gap-3` (12px), keep `flex-wrap`
- [x] Name → `font-mono text-[23px] font-semibold tracking-[-0.01em] text-text-primary` (drop `truncate`) — verified 23px/600/mono
- [x] Chip → `bg-bg-elevated`, `text-[11.5px]`, `gap-1.5`, `px-2 py-[3px]`, `rounded-[6px]`, Server icon `size={12}` (verified bg = `#2e2e2e`)
- [x] Desc → `text-text-muted text-[13.5px] leading-[1.55] max-w-[72ch]`
- [x] Kept annotation badges block unchanged
- [x] **Also applied the same treatment to `ResourceHeader`** (incl. the mimeType chip) for app-wide consistency. (`PromptHeader` doesn't exist on this branch.)
- [x] No test changes needed; suite 521 green; verified live.

---

## Phase 7 — Center layout restructure (headline / load-bearing)

**Files:** `src/renderer/components/tool/ToolDetailView.tsx`, `ParamsTab.tsx`

### Design intent
Center column = two stacked bordered **panels**: **Request** (fixed height to content)
and **Response** (`flex:1`, fills remaining height, body scrolls internally). This removes
the dead space below the result and gives form ↔ result a visible relationship.

```
.center-scroll : flex:1; overflow-y-auto; padding:22px 28px 24px; flex column; gap:18px
.panel         : background:var(--panel); border:1px solid var(--border); border-radius:10px;
                 flex column; overflow:hidden
.response      : flex:1 1 auto; min-height:240px
```

### Current structure (to change)
- `ToolDetailView` renders: `ToolHeader`, then a **2-column** flex (left = tabs + tab content scroll, right = History aside) — lines 44–95
- Params/Schema **tabs live in ToolDetailView** (lines 53–68)
- `ParamsTab` contains *everything*: Raw JSON toggle, fields, Execute button, **and the Result** (`ToolCallResultView`) below a `border-t` — ParamsTab lines 121–202
- Result tab state (`resultTab`) lives in `ParamsTab` (line 55)

### Target structure — DONE (implemented together with Phases 8 & 9)
- [x] Layout: `ToolHeader` → **RequestPanel** → **ToolCallResultView** (Response) stacked on the left; History rail on the right
- [x] Center container: `flex flex-col gap-[18px] flex-1 min-h-0 px-7 pt-[22px] pb-6` (no outer scroll; Response body scrolls)
- [x] **State lifted to `ToolDetailView`**: `activeTab`, `prefill`, `running`, `resultTab` + `latestCall`/`liveNotifications` selectors + `handleExecute`
- [x] Split: new `RequestPanel` (owns form state) + `ToolCallResultView` restyled as the Response panel; `ParamsTab` deleted
- [x] Panel shell: `bg-bg-surface border border-border rounded-[10px] flex flex-col overflow-hidden`; Response adds `flex-1 min-h-[240px]`
- [x] Preserved: remount-per-tool, prefill nonce, schema lock, error/executing states, resultTab persistence
- [x] Tests migrated: `ParamsTab.test` → `RequestPanel.test` (form/exec) + `ToolCallResultView.test` (result chrome/body) + `ToolDetailView.test` (integration). Suite 517 green; verified live.

---

## Phase 8 — Request panel

**Files:** `ToolDetailView.tsx` / new `RequestPanel.tsx`, `ParamsTab.tsx`, `SchemaTab.tsx`, `ui/Toggle.tsx`

### Design (`.panel-head`, `.tabs`, `.toggle`, `.req-body`, `.field`, `.input`, `.req-foot`, `.btn-exec`)
```
.panel-head : flex; align:center; gap:16px; padding:11px 16px; background:var(--panel-2);
              border-bottom:1px solid var(--border)
.panel-label: mono 11px; letter-spacing:.1em; uppercase; color:var(--fg-faint); weight:600
.tabs button: sans 12.5px; color:var(--fg-dim); padding:5px 11px; border-radius:6px
.tabs button.on : color:var(--accent); background:var(--accent-soft)
.toggle .sw : 34×19; radius:20; bg:var(--card); border:1px solid var(--border)
.toggle.on .sw : bg:var(--accent-soft); border-color:var(--accent-line); knob→accent, x:15
.req-body   : padding:18px 16px
.field-label: mono 13px; color:var(--fg);  .req → color:var(--accent)
.field-help : 12px; color:var(--fg-faint)
.input      : bg:var(--card); border:1px solid var(--border); radius:8px; padding:11px 13px;
              mono 13.5px; focus → border:var(--accent-line) + ring 3px var(--accent-soft)
.req-foot   : flex; align:center; gap:12px; padding:13px 16px; border-top:1px solid var(--border-soft);
              background:var(--card)
.req-foot .hint : mono 11.5px; color:var(--fg-faint)
.btn-exec   : bg:var(--btn) gradient; color:#fff; weight:700; 13px; radius:8px; padding:9px 22px;
              inline-flex gap:8px; inset highlight; hover brightness 1.07; svg 13×13 (play)
```

### Current (ParamsTab)
- Raw JSON toggle row `flex items-center justify-between` (lines 123–140) — move into panel header
- Fields via `FieldRow`/`FieldInput` (SchemaFields.tsx) — move into panel body
- Execute button `px-4 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white` (176–183) — move into panel footer, restyle to gradient
- Tabs (Params/Schema) currently in ToolDetailView — move into panel header

### Target — DONE (in `RequestPanel.tsx`)
- [x] **Header**: `bg-panel-2 border-b border-border px-4 py-[11px]`; "Request" mono label + Params/Schema segmented tabs (active `bg-accent-soft text-accent`) + `flex-1` spacer + Raw JSON toggle (shown on Params tab)
- [x] **Body** `px-4 py-[18px]`: `FieldRow` label → `font-mono text-[13px] text-text-primary`, help → `text-[12px] text-fg-faint`; `FieldInput`/textarea → `bg-bg-elevated rounded-[8px] px-[13px] py-[11px] font-mono text-[13.5px] focus:border-accent-line focus:ring-[3px] focus:ring-accent-soft`; Schema tab renders here
- [x] **Footer** `border-t border-border-soft bg-bg-elevated px-4 py-[13px]`: status hint + `⌘↵` + gradient Execute (`bg-[image:var(--btn)]`, `<Play>` icon)
- [x] Wired `⌘↵` (panel keydown). Kept existing `Toggle` component (didn't restyle the switch — shared with elicitation; can revisit).
- [x] Preserved form↔JSON toggle, complex-schema lock + helper text, validation, prefill. Verified live.

---

## Phase 9 — Response panel

**File:** `src/renderer/components/tool/ToolCallResultView.tsx` (+ wrapper from Phase 7)

### Design (`.panel.response`, `.status-chip`, `.dur-badge`, `.resp-body`, `.block`, `.block-tag`, `.tabs.count`)
```
.status-chip.ok : color:var(--green); dot 7×7 bg green + 3px green-soft ring; 12.5px
.dur-badge      : mono 11px; color:var(--fg-dim); bg:var(--card); border:1px solid var(--border-soft);
                  border-radius:5px; padding:2px 7px
.resp-body      : flex:1; overflow-y-auto; padding:16px
.block          : bg:var(--card); border:1px solid var(--border-soft); radius:8px; padding:14px 16px;
                  margin-bottom:12px
.block-tag      : mono 10px; letter-spacing:.08em; color:var(--fg-faint); bg:var(--panel-2);
                  border:1px solid var(--border-soft); radius:4px; padding:2px 8px; margin-bottom:10px
.block-text     : 14px; line-height:1.55; color:var(--fg)   (.mono → mono 13px color var(--code))
.tabs.count .n  : color:var(--fg-faint) 11px;  .on .n → color:var(--accent)
```

### Current
- `ToolCallResultView` renders a `statusLine` (dot + Success/Error + ms), then a bottom-border tab strip, then the body (lines 40–85)
- Tabs include Notifications with `(count)` appended in the label (lines 30–38)
- Body uses `ResultPreview` / highlighted `<pre>` blocks (lines 88–136)

### Target — DONE (in `ToolCallResultView.tsx`, API unchanged)
- [x] Panel: header (`bg-panel-2 border-b border-border px-4 py-[11px]`) + scrollable body (`flex-1 min-h-0 overflow-y-auto p-4`); panel `flex-1 min-h-[240px]`
- [x] Header left: "Response" mono label + status chip (ok → `text-green` dot w/ `shadow-[0_0_0_3px_var(--green-soft)]`; error → red + Error icon; executing → accent pulse dot) + duration pill (`bg-bg-elevated border border-border-soft rounded-[5px]`)
- [x] Header right: segmented tabs (`bg-accent-soft text-accent` active); Notifications count in a `.n` sub-span (space-separated for a11y name)
- [x] Body content (ResponseBody/ResultPreview/Notifications) kept as-is — block-card restyling (`.block`/`.block-tag`) lives in `ContentBlockPreview`, left for a follow-up if needed
- [x] Preserved executing/transport-error/JSON-RPC-error states, CopyButton, highlightJson. 114 tool tests green; verified live.
- Note: detailed `.block` card restyle (Phase 9's block-tag/block-text spec) deferred — `ContentBlockPreview` already renders a TEXT-tagged block that reads correctly; revisit if you want exact card padding/tag styling.

---

## Phase 10 — History panel

**Files:** `src/renderer/components/tool/HistoryTab.tsx`, `ToolDetailView.tsx`, possibly `src/renderer/stores/serverStore.ts`

### Design (`.history`, `.hist-head`, `.hist-scope`, `.hist-item`, `.hi-*`)
```
.history    : flex:0 0 304px; background:var(--panel); border-left:1px solid var(--border)
.hist-head  : padding:15px 16px 10px; flex; align:center; gap:10px
.hist-title : 11px; weight:700; letter-spacing:.12em; color:var(--fg-faint); flex:1
.hist-count : mono 10px; color:var(--fg-faint); bg:var(--card); border:1px solid var(--border-soft);
              border-radius:20px; padding:1px 7px
.hist-clear : 11px; color:var(--fg-faint); mono;  hover → var(--accent)
.hist-scope : flex; gap:3px; margin:0 16px 8px; bg:var(--card); border:1px solid var(--border-soft);
              border-radius:8px; padding:3px
.hist-scope button   : flex:1; 11.5px; color:var(--fg-dim); padding:5px 0; radius:6px
.hist-scope button.on: bg:var(--accent-soft); color:var(--accent)
.hist-item  : border:1px solid transparent; radius:8px; padding:9px 11px; margin-bottom:4px
.hist-item:hover : bg:var(--card-2); border-color:var(--border-soft)
.hist-item.active: bg:var(--accent-soft); border-color:var(--accent-line)
.hi-top     : flex; align:center; gap:8px; margin-bottom:5px
.hi-tool    : mono 12px; color:var(--fg); weight:600; flex:1; truncate
.hi-dur     : mono 10.5px; color:var(--fg-faint)
.hi-payload : mono 11px; color:var(--code); truncate; opacity:.85
dot.green   : 7×7; bg green + 3px green-soft ring
```
> Final design (per chat): **no timestamps, no time-grouping** — flat list, status · tool · payload · duration.

### Current
- History is a **right rail inside `ToolDetailView`**: `aside w-80` with "History" heading + bordered scroll box (lines 78–93)
- `HistoryTab`: `divide-y` list; each row shows **timestamp** (primary), duration (right), args below (HistoryTab.tsx lines 26–66)
- History is **per-tool**: `history[toolKey(serverId, tool.name)]` (ToolDetailView line 29)
- Click → `onSelectRecord` → prefill params (ToolDetailView lines 84–91)

### DECISION (settled): per-tool, no tabs
Global history was considered and **rejected** — in a per-tool detail rail it's mostly
redundant with the sidebar, the prefill loop only works cleanly for the current tool, and
a cross-tool feed belongs in its own surface. So: keep the existing **per-tool** data,
**no All/This tool toggle**, show a count + clear, restyle to cards. **Timestamp kept**
(per-tool entries need a distinguisher — the mockup dropped it only because its global
list was tool-tagged).

### Target — DONE
- [x] Rail `w-[304px]`, `border-l border-border pl-6`
- [x] Header: "HISTORY" title + count pill (`bg-bg-elevated border border-border-soft rounded-full`) + "clear" button (`hover:text-accent`)
- [x] **No** scope toggle (per decision)
- [x] Items → cards (`rounded-[8px] border border-transparent px-[11px] py-[9px]`, `hover:bg-card-2 hover:border-border-soft`); top row = green halo dot + timestamp + duration; bottom = payload in `text-code opacity-85`
- [x] Error status → red dot; success dot uses `bg-green` + green-soft ring
- [x] `clearHistory(serverId, toolName)` added to `serverStore`; wired to the clear button
- [x] Click-to-prefill preserved; tests updated (`HistoryTab.test` dot class, new `ToolDetailView` count+clear test). Suite 518 green; verified live.

---

## Phase 11 — Polish

**Files:** `base.css`, optionally Electron main/window config

### Scrollbars
- [ ] `base.css` `::-webkit-scrollbar-thumb` currently uses `var(--accent)` (lines ~90–100).
      Change to `var(--scroll)` / hover `var(--scroll-hover)` to match the mockup
      (`width:10px; thumb radius 6px; 3px transparent inset border; track transparent`)

### Titlebar (optional — confirm first)
- [ ] Mockup has an in-app 34px titlebar (`.titlebar`, traffic lights + centered "MCPFlo",
      `bg:var(--panel-2)`, bottom border). The real app uses the **native** macOS title bar.
- [ ] **Decision needed:** build a custom frameless titlebar (`titleBarStyle: 'hiddenInset'`
      in the BrowserWindow + a draggable in-app bar) or skip and keep native. Default: **skip**
      unless you want the exact chrome.

---

## Cross-cutting checklist (run after every phase)

- [ ] Light **and** dark both correct (toggle in the rail)
- [ ] No colors introduced outside the token tables
- [ ] Existing behavior intact: prefill, schema/JSON lock, validation, error/executing states,
      refresh/delete server, resource view, prompt view, elicitation & sampling modals
- [ ] Typecheck + lint pass (`npm run typecheck`, `npm run lint`)
- [ ] Component tests still pass (`npm test` → `vitest run`; `*.test.tsx` exist for sidebar/theme)
