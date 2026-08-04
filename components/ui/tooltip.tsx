'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';

export function Tooltip({
  children,
  content,
  className,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger
          onClick={() => {
            // For mobile support, toggle open state on click
            setOpen((prev) => !prev);
          }}
        >
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          {/* The blurred sticky filter bar makes its own stacking context, so the
              positioner has to carry a z-index above the header, not just the popup. */}
          <TooltipPrimitive.Positioner side="bottom" sideOffset={6} className="z-[60]">
            <TooltipPrimitive.Popup
              className={cn(
                'max-w-xs rounded-lg border bg-popover p-3 text-popover-foreground text-xs shadow-lg outline-none animate-in fade-in-0 zoom-in-95',
                className,
              )}
            >
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
