# Components Module

Frontend React components for BSPT terminal interface.

## Patterns

### Component Structure
- Functional components with hooks
- TypeScript for all components
- Import stores from `../stores/`

### Styling
- **Tailwind CSS** for utility classes
- **CSS variables** in `index.css` for theming
- Custom component classes (e.g., `.theme-controls`, `.slider-root`)

### UI Libraries
- **Radix UI** for accessible primitives (`@radix-ui/react-slider`)

## Current Components

### ThemeControls.tsx
Theme customization panel with:
- Mode selector: glass | solid | image
- Opacity slider (0-100%)
- Blur slider (0-50px)

Uses `useThemeStore` hook for state management.

## Planned Components

### Terminal/
xterm.js wrapper with block-based interaction:
- WebGL renderer required
- `allowTransparency: true` for glass effect
- RingBuffer for 100k+ line performance

### Sidebar/
Session tree navigation:
- Router nodes (Management IP)
- Board children (Linux IPs)
- Protocol indicators (SSH/Telnet)

### Panel/
React Flow visualization for topology/tracing.

## Guidelines
- Keep components focused and composable
- Use Zustand stores for shared state (not prop drilling)
- See root `CLAUDE.md` for xterm.js transparency setup
