import { RemoteScreen } from '../data/types';

export function findSavedLibraryScreen(
  current: RemoteScreen,
  backStack: Iterable<RemoteScreen>
): (RemoteScreen & { type: 'Library' }) | null {
  if (current.type === 'Library') {
    return current;
  }
  const array = Array.from(backStack);
  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i].type === 'Library') {
      return array[i] as RemoteScreen & { type: 'Library' };
    }
  }
  return null;
}

export function shouldPreserveSavedLibraryLoad(
  current: RemoteScreen,
  backStack: Iterable<RemoteScreen>
): boolean {
  if (current.type === 'Library') return false;
  for (const screen of backStack) {
    if (screen.type === 'Library') return true;
  }
  return false;
}
