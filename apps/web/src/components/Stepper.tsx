export function Stepper({
  value,
  onChange,
  foil = false,
  min = 0,
}: {
  value: number;
  onChange: (next: number) => void;
  foil?: boolean;
  min?: number;
}) {
  return (
    <div className="stepper">
      <button aria-label="decrease" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className={`qty ${value === 0 ? 'zero' : ''} ${foil ? 'foil' : ''}`}>{value}</span>
      <button aria-label="increase" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
