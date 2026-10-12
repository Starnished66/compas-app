import { memo, ReactNode } from 'react';

interface FrozenWhileInactiveProps {
  active: boolean;
  children: ReactNode;
}

function FrozenContent({ children }: FrozenWhileInactiveProps) {
  return children;
}

export const FrozenWhileInactive = memo(FrozenContent, (_previous, next) => !next.active);
