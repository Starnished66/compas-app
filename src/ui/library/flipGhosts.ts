import { FlipGhostBatch } from './flipGhostBatch';
import type { FlipGhostSpec } from './flipRegistry';

export class FlipGhosts {
  private ghosts = new FlipGhostBatch<FlipGhostSpec>();
  private ghostListeners = new Set<(ghosts: FlipGhostSpec[]) => void>();
  private nextGhostId = 1;
  private collectingGhosts = false;
  private collectedGhosts = false;

  allocateId(): number {
    return this.nextGhostId++;
  }

  collect(run: () => void) {
    this.collectingGhosts = true;
    this.collectedGhosts = false;
    try {
      run();
    } finally {
      this.collectingGhosts = false;
    }
    if (this.collectedGhosts) this.publishGhosts();
  }

  subscribeGhosts(listener: (ghosts: FlipGhostSpec[]) => void): () => void {
    this.ghostListeners.add(listener);
    listener(this.ghosts.current);
    return () => {
      this.ghostListeners.delete(listener);
    };
  }

  private publishGhosts() {
    const ghosts = this.ghosts.current;
    this.ghostListeners.forEach((listener) => listener(ghosts));
  }

  add(ghosts: FlipGhostSpec[]) {
    if (!ghosts.length) return;
    this.ghosts.add(ghosts);
    if (this.collectingGhosts) this.collectedGhosts = true;
    else this.publishGhosts();
  }

  finish(id: number) {
    if (this.ghosts.finish(id)) this.publishGhosts();
  }
}
