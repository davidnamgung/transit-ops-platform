import { useEffect, useState } from 'react';
import { href } from '../lib/router.js';

// The report is printed to a PDF when the site is built and published next to it. If that file is not
// there (for example while developing), the button opens the same report as a printable page instead.
const PDF_URL = `${import.meta.env.BASE_URL}headway-report.pdf`;

function usePdfAvailable() {
  const [state, setState] = useState('checking');
  useEffect(() => {
    let alive = true;
    fetch(PDF_URL, { method: 'HEAD' })
      .then((r) => alive && setState(r.ok && /pdf/i.test(r.headers.get('content-type') || '') ? 'yes' : 'no'))
      .catch(() => alive && setState('no'));
    return () => { alive = false; };
  }, []);
  return state;
}

const Icon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" />
  </svg>
);

export default function PdfButton({ className = 'btn', label = 'Download PDF report', shortLabel }) {
  const state = usePdfAvailable();
  const words = shortLabel && state !== 'no' ? shortLabel : state === 'no' ? 'Printable report' : label;
  // In the top bar the words are hidden on phones, so the button keeps its name for screen readers.
  const text = (
    <>
      <Icon />
      <span className={className.includes('btn-quiet') ? 'top-label' : undefined}>{words}</span>
    </>
  );
  if (state === 'no') return <a className={className} href={href(['print'])} aria-label={words}>{text}</a>;
  return <a className={className} href={PDF_URL} download="Headway-report.pdf" aria-label={words}>{text}</a>;
}
