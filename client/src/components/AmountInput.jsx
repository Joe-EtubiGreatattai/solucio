import { useLayoutEffect, useRef } from 'react';
import { formatAmountInput } from '../utils/money';

// A money input that adds thousands separators while you type and keeps the caret in place. It owns no state:
// the parent holds the (comma-formatted) string, and reads kobo from it with nairaToKobo on submit.
export default function AmountInput({ value, onChange, ...props }) {
  const ref = useRef(null);
  const caretDigits = useRef(null);

  const handleChange = (event) => {
    const el = event.target;
    // Remember how many digits (and the dot) sat before the caret, so we can restore it after reformatting.
    caretDigits.current = el.value.slice(0, el.selectionStart).replace(/[^\d.]/g, '').length;
    onChange(formatAmountInput(el.value));
  };

  useLayoutEffect(() => {
    if (caretDigits.current == null || !ref.current) return;
    const target = caretDigits.current;
    caretDigits.current = null;
    const text = ref.current.value;
    let pos = 0;
    for (let seen = 0; pos < text.length && seen < target; pos += 1) {
      if (/[\d.]/.test(text[pos])) seen += 1;
    }
    ref.current.setSelectionRange(pos, pos);
  });

  return <input ref={ref} inputMode="decimal" {...props} value={formatAmountInput(value)} onChange={handleChange} />;
}
