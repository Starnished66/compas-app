import { useEffect, useMemo, useState } from 'react';
import { playlistNameIssue } from './playlistName';

export interface PlaylistNameInput {
  name: string;
  setName: (name: string) => void;
  issue: string | null;
  canSubmit: boolean;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function usePlaylistNameInput(
  active: boolean,
  initialName = '',
  takenNames: readonly string[] = [],
  requireChange = true,
): PlaylistNameInput {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (active) setName(initialName);
  }, [active, initialName]);

  const otherNames = useMemo(
    () => takenNames.filter((taken) => !sameName(taken, initialName)),
    [initialName, takenNames],
  );
  const issue = playlistNameIssue(name, otherNames);
  const canSubmit = name.length > 0 && !issue && (!requireChange || name !== initialName);
  return { name, setName, issue, canSubmit };
}
