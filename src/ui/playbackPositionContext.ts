import { createContext } from 'react';
import { PlaybackPositionStore } from '../session/PlaybackPositionStore';

export const PlaybackPositionContext = createContext<PlaybackPositionStore>(new PlaybackPositionStore());
