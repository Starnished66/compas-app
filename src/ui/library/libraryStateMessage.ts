import { ConnectionStatus, ContentStatus, RemoteAction, RemoteUiState } from '../../data/types';
import { LibraryPlaceholderProps } from '../components/LibraryPlaceholder';
import { localizedCountLabel } from '../localizedLabels';
import { translate as translateEnglish } from '../../i18n/translate';

interface LibraryStateMessageInput {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  noun: string;
  empty: LibraryPlaceholderProps;
  onRetry?: () => void;
  translate?: (source: string, variables?: Record<string, string | number>) => string;
}

export function libraryStateMessage({
  state,
  onAction,
  empty,
  onRetry,
  translate = (source, variables) => translateEnglish(source, 'en', variables),
}: LibraryStateMessageInput): LibraryPlaceholderProps | null {
  if (state.connectionStatus !== ConnectionStatus.Connected) {
    return {
      title: translate('Not connected'),
      body: state.connectionMessage ? translate(state.connectionMessage) : translate('Connect to a player to browse its library.'),
      actionLabel: translate('Connect a player'),
      onAction: () => onAction({ type: 'OpenConnection' }),
    };
  }
  if (state.libraryEntries.length > 0) return null;
  switch (state.libraryStatus) {
    case ContentStatus.Loading:
      return { title: translate('Loading…'), loading: true };
    case ContentStatus.Error:
      return {
        title: translate('Couldn’t load this list'),
        body: state.connectionMessage ? translate(state.connectionMessage) : localizedCountLabel(state.libraryCountLabel, translate) || undefined,
        actionLabel: onRetry ? translate('Try again') : undefined,
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
