import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import {
  getScrollPosition,
  restoreScrollPosition,
  saveScrollPosition,
} from '../lib/scrollRestoration';

/**
 * Merkt sich die Scroll-Position pro History-Eintrag (laufend beim Scrollen)
 * und stellt sie bei POP (Zurück/Vor) wieder her.
 */
export default function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const activeKeyRef = useRef(location.key);

  useEffect(() => {
    activeKeyRef.current = location.key;
  }, [location.key]);

  useEffect(() => {
    const persist = () => saveScrollPosition(activeKeyRef.current);

    persist();
    window.addEventListener('scroll', persist, { passive: true });
    window.addEventListener('pagehide', persist);

    return () => {
      window.removeEventListener('scroll', persist);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, []);

  useLayoutEffect(() => {
    if (navigationType === 'POP') {
      const saved = getScrollPosition(location.key);
      if (saved) {
        return restoreScrollPosition(saved.y, saved.x);
      }
      return;
    }

    if (navigationType === 'PUSH' || navigationType === 'REPLACE') {
      window.scrollTo(0, 0);
    }
  }, [location.key, navigationType]);

  return null;
}
