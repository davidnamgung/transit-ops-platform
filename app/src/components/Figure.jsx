// Every chart in the app sits in a Figure: a title that states the point, a one-line question
// it answers, then the chart, then plain-language help. The chart is never left to explain itself.
export function Figure({ title, lede, children, legend, guide, takeaway, wide = false }) {
  return (
    <figure className={`figure${wide ? ' figure-wide' : ''}`}>
      <figcaption className="figure-head">
        <h3 className="figure-title">{title}</h3>
        {lede && <p className="figure-lede">{lede}</p>}
      </figcaption>
      <div className="figure-body">{children}</div>
      {legend}
      {(guide || takeaway) && (
        <div className="figure-help">
          {guide && (
            <div className="guide">
              <h4>How to read this</h4>
              <p>{guide}</p>
            </div>
          )}
          {takeaway && (
            <div className="takeaway">
              <h4>What it shows</h4>
              <p>{takeaway}</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
