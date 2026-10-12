export class FlipGhostBatch<T extends { id: number }> {
  private ghosts: T[] = [];
  private running = new Set<number>();

  get current(): T[] {
    return this.ghosts;
  }

  add(ghosts: T[]): T[] {
    if (!ghosts.length) return this.ghosts;
    for (const ghost of ghosts) this.running.add(ghost.id);
    this.ghosts = [...this.ghosts, ...ghosts];
    return this.ghosts;
  }

  finish(id: number): boolean {
    if (!this.running.delete(id) || this.running.size) return false;
    this.ghosts = [];
    return true;
  }
}
