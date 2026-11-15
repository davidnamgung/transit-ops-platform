import { useCallback, useMemo, useSyncExternalStore } from 'react';

// A tiny hash router: "#/lines/Red?metric=gaps" becomes segs ['lines','Red'] and params {metric:'gaps'}.
// Hash routing means the site works on any static host without server settings, and
// every view has a link you can share.

const getHash = () => window.location.hash.replace(/^#/, '') || '/';
const subscribe = (cb) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function parseHash(hash) {
  const [path, query = ''] = hash.split('?');
  const segs = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { segs, params: new URLSearchParams(query) };
}

export function href(segs = [], params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  const q = new URLSearchParams(entries).toString();
  return '#/' + segs.map(encodeURIComponent).join('/') + (q ? `?${q}` : '');
}

export function navigate(segs, params, { replace = false } = {}) {
  const h = href(segs, params);
  if (replace) {
    history.replaceState(null, '', h);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = h.slice(1);
  }
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '/');
  return useMemo(() => parseHash(hash), [hash]);
}

// Read and update the query-string state of the current page without adding history entries.
export function useQueryState() {
  const { segs, params } = useRoute();
  const update = useCallback(
    (changes) => {
      const current = parseHash(getHash());
      const next = Object.fromEntries(current.params.entries());
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === '') delete next[k];
        else next[k] = v;
      }
      navigate(current.segs, next, { replace: true });
    },
    [],
  );
  return [params, update, segs];
}
