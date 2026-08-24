# Card Colour and Typography Design

## Status

Approved for implementation on 24 August 2026.

## Goal

Restore clear visual distinction between domain cards and improve the reading quality of card typography without adding website permissions, remote services, font files, runtime dependencies, or a new preference schema.

## Card Colour System

Each domain card receives its own local semantic accent roles:

- `--site-accent`: the primary card identity colour.
- `--site-accent-soft`: a low-emphasis marker and hover surface.
- `--site-accent-border`: a restrained border and separator treatment.
- `--site-accent-text`: readable accent text against neutral card surfaces.

The colour appears in a four-pixel full-width top band, the domain marker, hover borders, and subtle row interaction feedback. The card body remains neutral so text contrast and the calm editorial layout are preserved.

The first usable favicon in a domain group is the preferred colour source. The existing rendered image is sampled through a small offscreen canvas after it loads. Transparent pixels and pixels close to pure white or pure black are ignored. The remaining pixels are grouped to select a representative colour with useful chroma and middle-range lightness.

Favicon sampling is opportunistic. Cross-origin restrictions, decode failures, missing images, low-quality colour samples, and canvas security errors must never block rendering. A deterministic domain-colour function provides an immediate fallback before the favicon loads and remains active whenever extraction fails. It hashes the normalized domain key into authored hue families with bounded saturation, lightness, and small hue variations, so a domain keeps the same fallback colour when cards reorder while nearby cards rarely collide.

No favicon service, network fetch, host permission, persistent colour cache, or settings migration is introduced.

## Typography

The interface keeps its editorial pairing while using system-installed fonts only:

- Display roles: `ui-serif`, New York, Iowan Old Style, Georgia, and the generic serif fallback.
- Interface roles: Avenir Next, SF Pro Text, PingFang SC, the Apple system stack, and generic sans-serif.

The greeting and inventory title remain serif. Card titles use approximately 16 px at weight 600. Tab titles use approximately 15 px at weight 500 with a 1.5 line height and the existing two-line clamp. Metadata stays between 12 and 13 px with tabular numerals where values change. Letter spacing is reserved for large headings and small uppercase metadata, not body text.

Font smoothing remains on the root. No `@font-face`, font download, bundled font asset, or new dependency is allowed.

## Data Flow

1. The shelf tree is built from the normalized domain model.
2. Each card receives a deterministic fallback accent from its domain key before DOM rendering.
3. The renderer applies the four local semantic CSS variables to the card.
4. The first favicon image that loads successfully is passed to the colour sampler.
5. A valid sampled colour replaces only that card's local variables.
6. Failure leaves the deterministic fallback unchanged and produces no user-facing error.

Global theme variables continue to own the page background, global controls, focus treatment, destructive actions, and text appearance. Card identity colours never replace those global semantic roles.

## Accessibility and Safety

- Colour is supplementary; domain text, marker letters, favicons, and card structure remain available without colour.
- Card surfaces and primary text colours remain global theme roles with existing contrast protection.
- Sampled accents are normalized to bounded saturation and lightness before use.
- The fallback colour families are bounded for both light-text and dark-text themes.
- Imported strings and favicon URLs are never injected as HTML or CSS text.
- Reduced-motion and keyboard-focus behaviour remain unchanged.

## Testing

- Unit-test stable domain-to-palette mapping and variation across representative domains.
- Unit-test pixel filtering and colour normalization using synthetic pixel arrays without loading remote images.
- Test that empty, transparent, monochrome, and unsafe inputs return the fallback path.
- Test that each card tree carries its domain accent metadata.
- Test that rendered cards receive the four local CSS variables without HTML injection.
- Extend CSS contracts for the full-width colour band and the approved system font stacks, sizes, weights, and line heights.
- Re-run repository audits, Safari contracts, WebKit screenshots, Xcode packaging, signature checks, installed-plugin count, and the public-repository verification.

## Acceptance Criteria

- Adjacent domain cards are visibly distinguishable without colouring the full card body.
- A domain receives the same fallback accent after reorder or reload.
- Favicon extraction improves identity when Safari permits pixel access and fails silently otherwise.
- Card titles and tab titles match the approved system typography hierarchy.
- All automated checks, visual smoke tests, package verification, installation checks, and independence audits pass.
- Safari registers exactly one installed extension instance.
- The public GitHub repository contains the current English documentation and verified implementation.
