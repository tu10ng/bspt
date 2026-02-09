import { useState, useCallback, useRef, useEffect, memo } from "react";

interface InputOverlayProps {
  history: string[];
  currentInput: string;
  onSubmit: (command: string) => void;
  onInputChange: (input: string) => void;
  visible: boolean;
}

export const InputOverlay = memo(function InputOverlay({
  history,
  currentInput,
  onSubmit,
  onInputChange,
  visible,
}: InputOverlayProps) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter history based on current input
  const suggestions = currentInput.length > 0
    ? history
        .filter((cmd) =>
          cmd.toLowerCase().startsWith(currentInput.toLowerCase())
        )
        .filter((cmd) => cmd !== currentInput)
        .slice(0, 5) // Limit suggestions
    : [];

  // Ghost text for autocomplete preview
  const ghostText = selectedIndex >= 0 && selectedIndex < suggestions.length
    ? suggestions[selectedIndex].slice(currentInput.length)
    : suggestions.length > 0
    ? suggestions[0].slice(currentInput.length)
    : "";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          if (currentInput.trim()) {
            onSubmit(currentInput);
            setSelectedIndex(-1);
            setShowSuggestions(false);
          }
          break;

        case "Tab":
          e.preventDefault();
          // Accept current suggestion
          if (suggestions.length > 0) {
            const suggestion =
              selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0];
            onInputChange(suggestion);
            setSelectedIndex(-1);
            setShowSuggestions(false);
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (suggestions.length > 0) {
            setShowSuggestions(true);
            setSelectedIndex((prev) =>
              prev <= 0 ? suggestions.length - 1 : prev - 1
            );
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (suggestions.length > 0) {
            setShowSuggestions(true);
            setSelectedIndex((prev) =>
              prev >= suggestions.length - 1 ? 0 : prev + 1
            );
          }
          break;

        case "Escape":
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [currentInput, suggestions, selectedIndex, onSubmit, onInputChange]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onInputChange(e.target.value);
      setSelectedIndex(-1);
      setShowSuggestions(e.target.value.length > 0);
    },
    [onInputChange]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      onInputChange(suggestion);
      onSubmit(suggestion);
      setSelectedIndex(-1);
      setShowSuggestions(false);
    },
    [onInputChange, onSubmit]
  );

  // Focus input when visible
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="input-overlay">
      <div className="input-wrapper">
        <span className="input-prompt">$</span>
        <div className="input-container">
          <input
            ref={inputRef}
            type="text"
            className="input-field-overlay"
            value={currentInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {ghostText && (
            <span className="input-ghost">
              {currentInput}
              <span className="ghost-text">{ghostText}</span>
            </span>
          )}
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="suggestions-list">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className={`suggestion-item ${
                index === selectedIndex ? "suggestion-selected" : ""
              }`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <span className="suggestion-match">
                {suggestion.slice(0, currentInput.length)}
              </span>
              <span className="suggestion-rest">
                {suggestion.slice(currentInput.length)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default InputOverlay;
