"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

type DialogPresenceValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogPresenceContext = React.createContext<DialogPresenceValue>({
  open: false,
  setOpen: () => {},
});

/** Open state of the nearest Dialog/Sheet root, needed to drive exit animations and swipe-to-dismiss. */
export function useDialogPresence(): DialogPresenceValue {
  return React.useContext(DialogPresenceContext);
}

export function useReturnFocus(
  open: boolean,
  onCloseAutoFocus?: (event: Event) => void,
): (event: Event) => void {
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);

  return React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const target = returnFocusRef.current;
      if (target?.isConnected) {
        event.preventDefault();
        target.focus({ preventScroll: true });
      }
    },
    [onCloseAutoFocus],
  );
}

export function PresenceRoot({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <DialogPresenceContext.Provider value={value}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </DialogPresenceContext.Provider>
  );
}
