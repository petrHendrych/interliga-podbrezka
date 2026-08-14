import * as React from 'react';

export const INSTALL_DISMISSED_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

// Safari sets this instead of matching the standalone display mode.
interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function readIsStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true
  );
}

/**
 * Chrome fires `beforeinstallprompt` once and takes the event away again if it is not
 * captured, so the listener has to preventDefault and stash it for a later click.
 * Safari never fires it at all, which is why iOS gets instructions instead of a button.
 */
export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = React.useState(false);
  const [isIOS, setIsIOS] = React.useState(false);
  const [isDismissed, setIsDismissed] = React.useState(true);

  React.useEffect(() => {
    setIsStandalone(readIsStandalone());
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setIsDismissed(window.localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true');

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = React.useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    setPromptEvent(null);
  }, [promptEvent]);

  const dismiss = React.useCallback(() => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setIsDismissed(true);
  }, []);

  return {
    canPrompt: promptEvent !== null,
    isIOS,
    isStandalone,
    isDismissed,
    promptInstall,
    dismiss,
  };
}
