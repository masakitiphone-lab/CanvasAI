export function CanvasPlaceholder() {
  return (
    <section className="canvas-shell" aria-label="Canvas placeholder">
      <header className="canvas-shell__header">
        <div>
          <p className="eyebrow">Infinite Canvas</p>
          <h2>Conversation workspace placeholder</h2>
        </div>
        <div className="canvas-shell__actions">
          <button className="ghost-button" type="button">
            Search
          </button>
          <button className="ghost-button" type="button">
            View
          </button>
        </div>
      </header>

      <div className="canvas-shell__body">
        <div className="canvas-grid" />

        <div className="canvas-card canvas-card--primary">
          <p className="eyebrow">Ready For Step 2</p>
          <h3>React Flow will replace this area next</h3>
          <p>
            This is intentionally fake. Step 1 only establishes routing, desktop shell
            layout, and placeholder surfaces.
          </p>
        </div>

        <div className="canvas-card canvas-card--secondary">
          <span className="canvas-card__label">Future canvas behavior</span>
          <ul>
            <li>Right-click empty canvas to create a new chat root</li>
            <li>Black-and-white desktop-first composition</li>
            <li>Viewport, nodes, and edges are not wired yet</li>
          </ul>
        </div>

        <div className="canvas-chip-group" aria-hidden="true">
          <span className="canvas-chip">Sidebar</span>
          <span className="canvas-chip">Canvas</span>
          <span className="canvas-chip">Nodes later</span>
        </div>
      </div>
    </section>
  );
}
