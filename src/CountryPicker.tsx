import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { matchingCountries, type PhoneCountry } from '../mobile/src/phoneCountries';

type Props = { country: PhoneCountry; onChange: (country: PhoneCountry) => void; disabled?: boolean };

export function CountryPicker({country, onChange, disabled}: Props) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const matches = matchingCountries(search);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() { setOpen(false); trigger.current?.focus(); }
  function choose(next: PhoneCountry) { onChange(next); close(); }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(current + 1, options.length - 1);
    else if (event.key === 'ArrowUp') next = current < 0 ? options.length - 1 : Math.max(0, current - 1);
    else if (event.key === 'Home' && current >= 0) next = 0;
    else if (event.key === 'End' && current >= 0) next = options.length - 1;
    else if (event.key === 'Enter' && event.target === input.current) {
      event.preventDefault(); if (matches.length) choose(matches[0]); return;
    } else return;
    event.preventDefault(); options[next]?.focus();
  }

  return <div className="dial-picker" ref={root} onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" ref={trigger} className="dial-trigger" aria-label={`Country code, ${country.name} ${country.dial}`}
      disabled={disabled} aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open}
      onClick={() => { setSearch(''); setOpen(!open); }}>
      <span className="dial-iso">{country.iso}</span><strong>{country.dial}</strong><span aria-hidden="true">▾</span>
    </button>
    {open && <div id={id} role="dialog" aria-label="Choose a country code" className="dial-menu" onKeyDown={keyboard}>
      <input ref={input} aria-label="Search countries" type="search" placeholder="Country or calling code" autoComplete="off"
        value={search} onChange={event => setSearch(event.target.value)} />
      <div role="listbox" aria-label="Country codes">
        {matches.map(item => <button type="button" role="option" aria-selected={country.iso === item.iso}
          key={item.iso} onClick={() => choose(item)}>
          <span>{item.name}</span><strong>{item.dial}</strong>
        </button>)}
      </div>
      {!matches.length && <p role="status">No matching countries.</p>}
    </div>}
  </div>;
}
