# FleetFlow Design System

## Direction

FleetFlow uses a dispatch-ledger operating world: information is arranged like a live manifest with ruled lanes, compact status signals and decisive edge actions. It rejects a decorative dashboard of floating statistic cards.

## Palette

- `#102a43` navy: navigation, primary structure and high-emphasis type.
- `#1c64f2` cobalt: primary actions, focus and active route.
- `#eef3f8` cool canvas and `#ffffff` paper surfaces.
- `#627d98` secondary copy; `#d6e0ea` dividers.
- `#d97706` exceptions, `#07865e` completion/availability, red only for destructive or failed states.

The interface is light because dispatchers use it for long daytime sessions under office light; the navy rail anchors the workspace without turning every surface dark.

## Typography

The native Segoe UI Variable workhorse stack provides tabular clarity, distinguishable weights, fast rendering and reliable offline operation. Display headings use 700–800 weight with restrained negative tracking. Labels are small, uppercase only where they represent operational metadata.

## Components

- The sidebar is a stable authority map; mobile turns it into a dismissible drawer.
- Metric strips share edges and dividers rather than floating as independent cards.
- Manifests use full-width rows, strong tracking numbers, muted detail and right-edge status.
- Status pills are compact controls/signals and always include text, never color alone.
- Live-location panels pair the map with a plain-language freshness state and textual last-update readout; preserve the last known position as read-only when sharing stops or the operation ends, and provide a usable non-map fallback.
- Panels have either a subtle offset blur shadow or a rule, not both.
- Forms group by real operational concepts: pickup, destination and package.

## Spacing and shape

Primary rhythm: 8, 12, 16, 24, 32 and 40 pixels. Panel radii are 14–16 pixels; form controls use 9–10 pixels; pills are reserved for status. Dense tables remain readable with 44-pixel minimum interactive targets.

## States and motion

Every data surface has loading, empty and error treatment. Buttons expose disabled state; destructive/state-changing actions require confirmation. Motion is limited to the mobile drawer, loader and native chart transition, and respects reduced-motion preferences.
