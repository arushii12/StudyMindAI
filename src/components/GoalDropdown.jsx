import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Reusable dropdown used for goals and moving PDFs between folders.
export function GoalDropdown({ className = "", disabled = false, label, options, placeholder = "", value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value) || null;
  const triggerLabel = selectedOption?.label || placeholder || options[0]?.label || "Select";

  // Closes the dropdown when the user clicks outside it.
  useEffect(() => {
    function handlePointerDown(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Applies the selected dropdown option.
  function handleSelect(option) {
    if (disabled) {
      return;
    }

    onChange(option.value);
    setIsOpen(false);
  }

  return (
    <div className={`goal-dropdown ${className}${isOpen ? " is-open" : ""}`} ref={dropdownRef}>
      <button
        className="goal-dropdown-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{triggerLabel}</span>
        <ChevronDown size={16} />
      </button>
      {isOpen && !disabled && (
        <div className="goal-dropdown-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === selectedOption?.value;

            return (
              <button
                className={selected ? "selected" : ""}
                key={option.value}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => handleSelect(option)}
              >
                <span>{option.label}</span>
                {selected && <strong aria-hidden="true">✓</strong>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Folder-specific wrapper around the shared dropdown component.
export function MoveFolderDropdown({ disabled = false, label, onChange, options, placeholder, value }) {
  return (
    <GoalDropdown
      className="move-folder-dropdown"
      disabled={disabled}
      label={label}
      onChange={onChange}
      options={options.map((option) => ({ label: option.name, value: option.id }))}
      placeholder={placeholder}
      value={value}
    />
  );
}
