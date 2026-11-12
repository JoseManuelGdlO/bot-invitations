import * as React from "react";

const SHORT_HEIGHT_BREAKPOINT = 500;

export function useIsShortHeight() {
  const [isShortHeight, setIsShortHeight] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-height: ${SHORT_HEIGHT_BREAKPOINT}px)`,
    );
    const onChange = () => {
      setIsShortHeight(window.innerHeight <= SHORT_HEIGHT_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsShortHeight(window.innerHeight <= SHORT_HEIGHT_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isShortHeight;
}
