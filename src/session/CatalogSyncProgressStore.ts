type Listener = () => void;

export class CatalogSyncProgressStore {
  private message: string | null = null;
  private readonly listeners = new Set<Listener>();

  getSnapshot = () => this.message;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  set = (message: string | null) => {
    if (this.message === message) return;
    this.message = message;
    this.listeners.forEach((listener) => listener());
  };
}
