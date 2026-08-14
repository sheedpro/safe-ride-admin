export function PageLoader({ label = 'Loading operations' }) {
  return <main className="page-loader" role="status" aria-live="polite"><div className="loader-mark"><i/><i/><i/></div><p>{label}</p></main>;
}
