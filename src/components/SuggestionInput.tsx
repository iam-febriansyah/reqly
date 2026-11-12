import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { Variable, Sparkles } from "lucide-react";
import type { SuggestionItem } from "../constants/suggestions";
import { extractVariableQuery } from "../constants/suggestions";

interface SuggestionInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  suggestions: SuggestionItem[];
  onSelect?: (item: SuggestionItem) => void;
  onFocusNext?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  setInputRef?: (el: HTMLInputElement | null) => void;
}

export const SuggestionInput: React.FC<SuggestionInputProps> = ({
  value,
  onChange,
  placeholder = "",
  className = "kv-input mono-input",
  suggestions,
  onSelect,
  onFocusNext,
  inputRef: externalInputRef,
  setInputRef,
}) => {
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUpward: boolean;
  }>({
    top: 0,
    left: 0,
    width: 280,
    openUpward: false,
  });

  const getActiveInput = useCallback(() => {
    return externalInputRef?.current || localInputRef.current;
  }, [externalInputRef]);

  const updatePosition = useCallback(() => {
    const el = getActiveInput();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dropdownHeight = Math.min(240, Math.max(80, suggestions.length * 36 + 12));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Open upward if cramped below and more space above
    const openUpward = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;

    setCoords({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
      width: Math.max(rect.width, 320),
      openUpward,
    });
  }, [getActiveInput, suggestions.length]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition, value]);

  // Keep dropdown aligned if user scrolls
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Ensure active element is scrolled into view in dropdown
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  const handleSelectItem = (item: SuggestionItem) => {
    const varCheck = extractVariableQuery(value);
    let nextVal = item.value;

    if (varCheck.isVariable) {
      // Replace the unclosed {{... part with the chosen {{VAR}}
      nextVal = `${varCheck.prefix}${item.value}`;
    }

    onChange(nextVal);
    setIsOpen(false);
    if (onSelect) {
      onSelect(item);
    } else if (onFocusNext) {
      onFocusNext();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown") {
        setIsOpen(true);
        setActiveIndex(0);
        updatePosition();
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (suggestions[activeIndex]) {
        e.preventDefault();
        handleSelectItem(suggestions[activeIndex]);
      }
    } else if (e.key === "Tab") {
      if (suggestions[activeIndex]) {
        e.preventDefault();
        handleSelectItem(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    }
  };

  return (
    <div className="suggestion-input-wrapper">
      <input
        ref={(el) => {
          localInputRef.current = el;
          if (externalInputRef && "current" in externalInputRef) {
            (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          }
          if (setInputRef) {
            setInputRef(el);
          }
        }}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          updatePosition();
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onClick={() => {
          updatePosition();
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 200);
        }}
        onKeyDown={handleKeyDown}
      />

      {isOpen &&
        suggestions.length > 0 &&
        createPortal(
          <div
            ref={listRef}
            className={`suggestion-dropdown-menu ${
              coords.openUpward ? "open-upward" : "open-downward"
            }`}
            style={{
              position: "fixed",
              top: coords.openUpward ? "auto" : `${coords.top}px`,
              bottom: coords.openUpward
                ? `${window.innerHeight - coords.top}px`
                : "auto",
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
          >
            {suggestions.map((item, idx) => {
              const isSelected = idx === activeIndex;
              const isVariable = item.category === "variable";

              return (
                <div
                  key={`${item.value}-${idx}`}
                  className={`suggestion-item ${isSelected ? "active" : ""} ${
                    isVariable ? "is-var" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectItem(item);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <div className="suggestion-item-left">
                    {isVariable ? (
                      <span className="suggestion-icon-var" title="Environment Variable">
                        <Variable size={12} />
                      </span>
                    ) : item.category === "header" ? (
                      <span className="suggestion-icon-header">
                        <Sparkles size={11} />
                      </span>
                    ) : null}
                    <span className="suggestion-value-text">{item.value}</span>
                  </div>

                  {item.description && (
                    <span className="suggestion-desc-text" title={item.description}>
                      {item.description}
                    </span>
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
