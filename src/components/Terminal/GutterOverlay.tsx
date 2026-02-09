import { memo, useMemo } from "react";
import { BlockMarker } from "../../types/session";
import { GutterRow } from "./GutterRow";

interface GutterOverlayProps {
  markers: BlockMarker[];
  scrollTop: number;
  cellHeight: number;
  viewportHeight: number;
  onToggleMarker: (markerId: string) => void;
  onClickMarker?: (markerId: string) => void;
}

export const GutterOverlay = memo(function GutterOverlay({
  markers,
  scrollTop,
  cellHeight,
  viewportHeight,
  onToggleMarker,
  onClickMarker,
}: GutterOverlayProps) {
  // Calculate visible range for virtualization
  const visibleRange = useMemo(() => {
    const startLine = Math.floor(scrollTop / cellHeight);
    const endLine = startLine + Math.ceil(viewportHeight / cellHeight) + 1;
    return { startLine, endLine };
  }, [scrollTop, cellHeight, viewportHeight]);

  // Filter markers to only show those in visible range
  const visibleMarkers = useMemo(() => {
    return markers.filter((marker) => {
      // A marker is visible if its start line is in range OR
      // if it spans across the visible range
      const markerEnd = marker.endLine ?? marker.startLine;
      return (
        marker.startLine <= visibleRange.endLine &&
        markerEnd >= visibleRange.startLine
      );
    });
  }, [markers, visibleRange]);

  // Get collapsed markers with their overlay dimensions
  const collapsedMarkers = useMemo(() => {
    return visibleMarkers.filter(
      (m) => m.collapsed && m.endLine !== null && m.endLine > m.startLine + 1
    );
  }, [visibleMarkers]);

  return (
    <div
      className="gutter-overlay"
      style={{
        transform: `translateY(-${scrollTop}px)`,
      }}
    >
      {visibleMarkers.map((marker) => (
        <GutterRow
          key={marker.id}
          marker={marker}
          cellHeight={cellHeight}
          onToggle={() => onToggleMarker(marker.id)}
          onClick={onClickMarker ? () => onClickMarker(marker.id) : undefined}
        />
      ))}

      {/* Collapsed summary overlay - covers hidden lines */}
      {collapsedMarkers.map((marker) => {
        // Calculate hidden lines: exclude command line (startLine) and next prompt (endLine)
        const hiddenLines = (marker.endLine ?? 0) - marker.startLine - 1;
        // Overlay covers from line after command to line before next prompt
        const overlayHeight = hiddenLines * cellHeight;
        const overlayTop = (marker.startLine + 1) * cellHeight;

        return (
          <div
            key={`collapsed-${marker.id}`}
            className="collapsed-summary-overlay"
            style={{
              position: "absolute",
              top: overlayTop,
              height: overlayHeight,
              left: "var(--gutter-width, 60px)",
              right: 0,
            }}
            onClick={() => onToggleMarker(marker.id)}
          >
            <span className="collapsed-summary-text">
              ... ({hiddenLines} lines hidden) ...
            </span>
          </div>
        );
      })}
    </div>
  );
});

export default GutterOverlay;
