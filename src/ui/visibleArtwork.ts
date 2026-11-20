type Listener = () => void;
type VisibleCover = { read: () => string | null; uri: string };

export class VisibleArtwork<Row extends { id: string }> {
  private covers = new Map<string, VisibleCover>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly reference: (row: Row) => VisibleCover['read'] | undefined) {}

  get(entry: Row): string | undefined {
    const cover = this.covers.get(entry.id);
    return cover && cover.read === this.reference(entry) ? cover.uri : undefined;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setVisible(entries: readonly Row[]): void {
    const next = new Map<string, VisibleCover>();
    for (const entry of entries) {
      const read = this.reference(entry);
      if (!read) continue;
      const previous = this.covers.get(entry.id);
      if (previous?.read === read) {
        next.set(entry.id, previous);
      } else {
        const uri = read();
        if (uri) next.set(entry.id, { read, uri });
      }
    }
    // Keep the displayed cover only for this visibility period.
    const changed = next.size !== this.covers.size ||
      [...next].some(([id, cover]) => this.covers.get(id) !== cover);
    this.covers = next;
    if (changed) for (const listener of [...this.listeners]) listener();
  }
}
