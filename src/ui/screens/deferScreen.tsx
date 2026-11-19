import React, { ComponentType, memo, useRef } from 'react';

export function deferScreen<Props extends object>(
  load: () => ComponentType<Props>,
  open?: (props: Props) => boolean,
) {
  let Screen: ComponentType<Props> | undefined;
  return memo(function DeferredScreen(props: Props) {
    const visited = useRef(false);
    if (!visited.current && open && !open(props)) return null;
    visited.current = true;
    Screen ??= load();
    return <Screen {...props} />;
  });
}
