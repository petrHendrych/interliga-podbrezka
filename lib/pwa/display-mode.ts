/** Safari sets this instead of matching the standalone display mode. */
interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function isStandaloneDisplay() {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true
  );
}
