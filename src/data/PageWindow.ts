export interface PageSlice<T> {
  items: T[];
  loaded: number;
  total: number;
  hasMore: boolean;
}

export class PageWindow<T> {
  readonly items: T[];
  readonly pageSize: number;
  readonly loaded: number;

  constructor(items: T[], pageSize: number, loaded: number = 0) {
    if (pageSize <= 0) {
      throw new Error('pageSize must be > 0');
    }
    if (loaded < 0 || loaded > items.length) {
      throw new Error(`loaded must be between 0 and ${items.length}`);
    }
    this.items = items;
    this.pageSize = pageSize;
    this.loaded = loaded;
  }

  get hasMore(): boolean {
    return this.loaded < this.items.length;
  }

  next(): PageSlice<T> {
    const end = Math.min(this.loaded + this.pageSize, this.items.length);
    const sliceItems = this.items.slice(this.loaded, end);
    return {
      items: sliceItems,
      loaded: end,
      total: this.items.length,
      hasMore: end < this.items.length,
    };
  }

  withLoaded(loaded: number): PageWindow<T> {
    return new PageWindow(this.items, this.pageSize, loaded);
  }
}
