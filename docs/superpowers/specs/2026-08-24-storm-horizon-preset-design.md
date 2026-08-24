# Storm Horizon Theme Preset Design

## Status

Approved for implementation on 24 August 2026.

## Goal

Add a fifth authored Tab Shelf theme that captures the mood of a dark navy storm above a warm coral horizon and cool cyan water. The implementation must remain an original, CSS-only product asset with no copied image, lettering, logo, signature, watermark, or third-party runtime material.

## Visual Direction

The preset is named **Storm Horizon** and uses the settings note **Navy sky, coral horizon**.

Its page background is a vertical six-stop linear gradient:

| Position | Colour | Role |
| --- | --- | --- |
| 0% | `#061923` | Deep navy upper sky |
| 46% | `#092b39` | Subtle blue-green storm depth |
| 58% | `#302631` | Muted plum cloud transition |
| 65% | `#ff6255` | Narrow coral horizon glow |
| 74% | `#2189a5` | Cyan water illumination |
| 100% | `#072638` | Deep lower water |

The gradient uses the existing `linear` background kind at `180deg`. Closely spaced middle stops create a clear horizon instead of blending the warm and cool hues across the whole page.

The page uses light text, enhanced contrast, a dark navy overlay at 14%, and dark cards at 84% opacity. The global accent is warm amber `#f2b632`, echoing light at the horizon while remaining distinct from destructive red and the domain-specific card identity colours.

## Product Integration

`THEME_PRESETS` receives a `storm-horizon` entry using the existing Version 1 preference schema. No schema migration or new preference key is needed. `PRESET_META` receives the visible English name and note, so the existing settings renderer automatically creates a fifth selectable card and preview swatch.

Selecting the preset follows the current data flow:

1. The settings page clones the authored preset.
2. The current preference validator admits the six gradient stops and existing semantic options.
3. `themeCssVariables` renders the vertical gradient and light appearance roles.
4. Safari local extension storage persists the selected preset.
5. New shelf pages apply it through the existing theme runtime.

The optional personal background-image field stays `null`. No image file, data URL, fetch, permission, dependency, storage increase, or package resource is added.

## Accessibility and Responsive Behaviour

- Primary and secondary interface text use the existing tested light-text palette.
- Contrast boost remains enabled for separators and secondary labels.
- Card surfaces stay neutral and dark; colour is decorative rather than the only information carrier.
- The warm global accent is used only by existing interactive and focus roles.
- The background is generated at render time and scales without cropping at every viewport.
- Reduced-motion, keyboard focus, multilingual typography, and domain-specific card accents remain unchanged.

## Documentation and Testing

- Update preset tests from four to five authored themes.
- Add a focused runtime test for the exact six-stop `180deg` gradient, light text, 84% card opacity, no image, and amber accent.
- Extend settings contracts to require the visible Storm Horizon metadata.
- Update English README and acceptance records from four to five themes.
- Run the complete automated test and repository audit suite.
- Render the desktop and compact WebKit acceptance viewports with Storm Horizon selected and inspect colour separation, text readability, card alignment, and overflow.
- Rebuild and install the macOS Safari App, then verify the packaged resources, signatures, bundle identifiers, and single registered extension instance.
- Sync the verified English source and documentation to the public GitHub `main` branch.

## Acceptance Criteria

- Theme Studio shows a fifth preset named **Storm Horizon** with the note **Navy sky, coral horizon**.
- Selecting it produces a recognizable navy, coral, and cyan horizon without using the reference bitmap.
- Shelf text is light and readable, cards remain calm and dark, and the amber accent does not compete with domain card colours.
- Selection persists through the current Safari local-storage path and remains exportable under the unchanged Version 1 schema.
- No new image, external asset, network request, host permission, dependency, or third-party attribution is introduced.
- Automated checks, visual QA, packaging, installation, single-instance registration, independence audit, and GitHub verification pass.
