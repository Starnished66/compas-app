import { createContext, useContext } from 'react';
import { LibraryArtworkStore } from '../../session/LibraryArtworkStore';

export const LibraryArtworkContext = createContext(new LibraryArtworkStore());

export function useLibraryArtworkStore(): LibraryArtworkStore {
  return useContext(LibraryArtworkContext);
}
