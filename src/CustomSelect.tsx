import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };
type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
};

export default function CustomSelect({ value, options, onChange, placeholder = "Pilih opsi", ariaLabel, className = "" }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(0, options.findIndex(option => option.value === value)));
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex(option => option.value === value)));
  }, [open, options, value]);

  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return <div ref={root} className={`caleris-custom-select ${className}`}>
    <button
      type="button"
      className="caleris-custom-select-trigger"
      role="combobox"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen(current => !current)}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          setActive(current => Math.min(options.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1))));
        }
        if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
      }}
    >
      <span className={selected ? "" : "is-placeholder"}>{selected?.label ?? placeholder}</span>
      <ChevronDown size={15} aria-hidden="true" className={open ? "is-open" : ""}/>
    </button>
    {open && <div id={id} className="caleris-custom-select-menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option, index) => <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        className={`caleris-custom-select-option ${option.value === value ? "is-selected" : ""} ${active === index ? "is-active" : ""}`}
        key={option.value}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(option)}
      >
        <span>{option.label}</span>
        {option.value === value && <Check size={14}/>}
      </button>)}
    </div>}
  </div>;
}
