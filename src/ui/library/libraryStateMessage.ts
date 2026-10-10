import { ConnectionStatus, ContentStatus, RemoteAction, RemoteUiState } from '../../data/types';
import { LibraryPlaceholderProps } from '../components/LibraryPlaceholder';

interface LibraryStateMessageInput {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  noun: string;
  empty: LibraryPlaceholderProps;
  onRetry?: () => void;
}

export function libraryStateMessage({
  state,
  onAction,
  noun,
  empty,
  onRetry,
}: LibraryStateMessageInput): LibraryPlaceholderProps | null {
  if (state.connectionStatus !== ConnectionStatus.Connected) {
    return {
      title: 'Not connected',
      body: state.connectionMessage || 'Connect to a player to browse its library.',
      actionLabel: 'Connect a player',
      onAction: () => onAction({ type: 'OpenConnection' }),
    };
  }
  if (state.libraryEntries.length > 0) return null;
  switch (state.libraryStatus) {
    case ContentStatus.Loading:
      return { title: `Loading ${noun}…`, loading: true };
    case ContentStatus.Error:
      return {
        title: `Couldn’t load ${noun}`,
        body: state.connectionMessage || state.libraryCountLabel || undefined,
        actionLabel: onRetry ? 'Try again' : undefined,
        onAction: onRetry,
      };
    default:
      return empty;
  }
}

export function inlineLibraryError(state: RemoteUiState): string | null {
  if (state.connectionStatus !== ConnectionStatus.Connected) return null;
  if (state.libraryEntries.length === 0 && state.libraryStatus === ContentStatus.Error) return null;
  return state.connectionMessage || null;
}
