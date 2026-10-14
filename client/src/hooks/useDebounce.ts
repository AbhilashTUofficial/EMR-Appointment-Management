import { useEffect, useState } from "react";

// Returns the value only after it has stopped changing for `delay` ms, so typing doesn't fire a request per key.
export function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
