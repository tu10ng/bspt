import * as Slider from "@radix-ui/react-slider";
import { useThemeStore, ThemeMode } from "../stores/themeStore";

export function ThemeControls() {
  const { mode, opacity, blur, setMode, setOpacity, setBlur } = useThemeStore();

  const modes: { value: ThemeMode; label: string }[] = [
    { value: "glass", label: "Glass" },
    { value: "solid", label: "Solid" },
    { value: "image", label: "Image" },
  ];

  return (
    <div className="theme-controls">
      {/* Theme Mode Selection */}
      <div className="theme-control-group">
        <label className="theme-control-label">Mode</label>
        <div className="flex gap-2">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                mode === m.value
                  ? "bg-blue-500 text-white"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opacity Slider */}
      <div className="theme-control-group">
        <label className="theme-control-label">
          Opacity: {Math.round(opacity * 100)}%
        </label>
        <Slider.Root
          className="slider-root"
          value={[opacity * 100]}
          onValueChange={([value]) => setOpacity(value / 100)}
          max={100}
          step={1}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" aria-label="Opacity" />
        </Slider.Root>
      </div>

      {/* Blur Slider */}
      <div className="theme-control-group">
        <label className="theme-control-label">Blur: {blur}px</label>
        <Slider.Root
          className="slider-root"
          value={[blur]}
          onValueChange={([value]) => setBlur(value)}
          max={50}
          step={1}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" aria-label="Blur" />
        </Slider.Root>
      </div>
    </div>
  );
}
