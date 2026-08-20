import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { classifyIncomingFile } from '@/lib/incomingFile';

/**
 * Route files iOS hands the app into the upload screen.
 *
 * Covers "Open in trip-os" from Files/Mail/Safari and AirDrop from a Mac —
 * declared via CFBundleDocumentTypes in app.config.ts. We take the raw URL
 * stream rather than expo-router's deep-link handling because a `file://` URL
 * matches no route; anything that isn't a file we recognise is left alone for
 * router / OAuth to handle.
 *
 * Mounted once, in the root layout. `enabled` gates on migrations having
 * finished — the root layout renders a splash instead of the navigator until
 * then, and a push into a navigator that isn't mounted is silently dropped.
 */
export function useIncomingFileRouter(enabled: boolean): void {
  const router = useRouter();
  // iOS can deliver the same launch URL to both getInitialURL() and the 'url'
  // listener; without this the upload screen would be pushed twice.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const handle = (url: string | null): void => {
      if (!url || cancelled || handled.current === url) return;
      const file = classifyIncomingFile(url);
      if (!file) return;
      handled.current = url;
      router.push({
        pathname: '/upload',
        params: { incomingUri: file.uri, incomingKind: file.kind },
      });
    };

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router, enabled]);
}
