import { animate } from "motion/react";
import { useEffect, useRef } from "react";

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  format?: boolean;
  decimals?: number;
}

export function AnimatedCounter({ value, suffix = "", format = true, decimals = 0 }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    const controls = animate(prevValue.current, value, {
      duration: 1,
      ease: "easeOut",
      onUpdate(val) {
        if (ref.current) {
          const displayVal = format 
            ? Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val) 
            : val.toFixed(decimals);
          ref.current.textContent = displayVal + suffix;
        }
      },
    });
    prevValue.current = value;
    return () => controls.stop();
  }, [value, suffix, format, decimals]);

  return (
    <span ref={ref}>
      {format 
        ? Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value) 
        : value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
