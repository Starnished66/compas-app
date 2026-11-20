import { createContext } from 'react';
import type { LibraryEntry } from '../../data/types';
import type { VisibleArtwork } from '../visibleArtwork';

export const VisibleLibraryArtworkContext = createContext<VisibleArtwork<LibraryEntry> | null>(null);
