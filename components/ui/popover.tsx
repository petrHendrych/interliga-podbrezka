'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';

export function Popover({
  children,
  content,
  className,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger>
        {children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" sideOffset={6}>
          <PopoverPrimitive.Popup
            className={cn(
              'z-50 max-w-xs rounded-lg border bg-popover p-3 text-popover-foreground text-xs shadow-lg outline-none animate-in fade-in-0 zoom-in-95',
              className,
            )}
          >
            {content}
            <PopoverPrimitive.Arrow className="fill-popover" />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
