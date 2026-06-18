import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HerbRecord } from "./db/schema";
import type { BatchLedgerDTO } from "./types";

export interface HerbSuggestion {
  name: string;
  spec: string;
  origin: string;
  category: string;
  unit: string;
  source: "herb" | "batch";
}

interface HerbAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: HerbSuggestion) => void;
  herbs: HerbRecord[];
  batches: BatchLedgerDTO[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  label?: string;
}

function buildSuggestions(
  herbs: HerbRecord[],
  batches: BatchLedgerDTO[]
): HerbSuggestion[] {
  const map = new Map<string, HerbSuggestion>();

  for (const herb of herbs) {
    if (!herb.name || herb.isDeleted) continue;
    const key = herb.name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: herb.name,
        spec: herb.spec,
        origin: herb.origin,
        category: herb.category,
        unit: herb.defaultUnit || "g",
        source: "herb",
      });
    }
  }

  for (const batch of batches) {
    if (!batch.name || batch.isDeleted) continue;
    const key = batch.name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: batch.name,
        spec: batch.spec,
        origin: batch.origin,
        category: batch.category,
        unit: batch.unit || "g",
        source: "batch",
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN")
  );
}

function HerbAutocomplete({
  value,
  onChange,
  onSelect,
  herbs,
  batches,
  placeholder = "输入饮片名称搜索",
  error,
  required,
  label = "饮片名称",
}: HerbAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allSuggestions = useMemo(
    () => buildSuggestions(herbs, batches),
    [herbs, batches]
  );

  const filteredSuggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return allSuggestions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.spec.toLowerCase().includes(q) ||
        s.origin.toLowerCase().includes(q)
    );
  }, [value, allSuggestions]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredSuggestions.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setIsOpen(true);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (suggestion: HerbSuggestion) => {
      onChange(suggestion.name);
      onSelect(suggestion);
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [onChange, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || filteredSuggestions.length === 0) {
        if (e.key === "ArrowDown" && filteredSuggestions.length > 0) {
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (
            filteredSuggestions[highlightIndex] &&
            filteredSuggestions[highlightIndex].name.toLowerCase() ===
              value.trim().toLowerCase()
          ) {
            setIsOpen(false);
          } else if (filteredSuggestions[highlightIndex]) {
            handleSelect(filteredSuggestions[highlightIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filteredSuggestions, highlightIndex, value, handleSelect]
  );

  const handleInputFocus = useCallback(() => {
    if (value.trim() && filteredSuggestions.length > 0) {
      setIsOpen(true);
    }
  }, [value, filteredSuggestions.length]);

  return (
    <div className="herb-autocomplete" ref={containerRef}>
      <label>
        <span>
          {label}
          {required && <span className="required-mark">*</span>}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          className={error ? "input-error" : ""}
          autoComplete="off"
        />
        {error && <span className="error-text">{error}</span>}
      </label>
      {isOpen && filteredSuggestions.length > 0 && (
        <ul className="autocomplete-dropdown">
          {filteredSuggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.name}-${suggestion.spec}`}
              className={`autocomplete-item ${
                index === highlightIndex ? "highlighted" : ""
              }`}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => handleSelect(suggestion)}
            >
              <div className="autocomplete-item-name">{suggestion.name}</div>
              <div className="autocomplete-item-meta">
                <span>{suggestion.spec}</span>
                <span>· {suggestion.origin}</span>
                <span>· {suggestion.category}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HerbAutocomplete;
