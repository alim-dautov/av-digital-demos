"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
  type TargetAndTransition,
} from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FADE, SPRING, project } from "@/lib/motion";
import {
  PresenceRoot,
  useDialogPresence,
  useReturnFocus,
} from "@/components/ui/dialog-presence";

const Sheet = PresenceRoot;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const DISMISS_DISTANCE_RATIO = 0.35;
const DISMISS_VELOCITY = 500;
const SUPPRESS_CLICK_DISTANCE = 6;
const RESIST = 0.08;

type Side = "top" | "bottom" | "left" | "right";

const SIDE_MOTION: Record<
  Side,
  { axis: "x" | "y"; closeSign: 1 | -1; hidden: TargetAndTransition }
> = {
  top: { axis: "y", closeSign: -1, hidden: { y: "-100%" } },
  bottom: { axis: "y", closeSign: 1, hidden: { y: "100%" } },
  left: { axis: "x", closeSign: -1, hidden: { x: "-100%" } },
  right: { axis: "x", closeSign: 1, hidden: { x: "100%" } },
};

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} forceMount asChild {...props}>
    <motion.div
      className={cn("scrim fixed inset-0 z-50", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FADE}
    />
  </DialogPrimitive.Overlay>
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-panel border-border p-6 shadow-lg will-change-transform",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b rounded-b-lg",
        bottom: "inset-x-0 bottom-0 border-t rounded-t-lg pb-safe",
        left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side, className, children, onCloseAutoFocus, ...props }, ref) => {
  const resolvedSide: Side = side ?? "right";
  const { open, setOpen } = useDialogPresence();
  const handleCloseAutoFocus = useReturnFocus(open, onCloseAutoFocus);
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const draggedRef = React.useRef(false);

  const { axis, closeSign, hidden } = SIDE_MOTION[resolvedSide];
  const swipeable = resolvedSide !== "top" && !reduceMotion;
  const fromHandle = resolvedSide === "bottom";

  const hiddenState = reduceMotion ? { opacity: 0 } : { ...hidden, opacity: 1 };
  const shownState = reduceMotion ? { opacity: 1 } : { x: 0, y: 0, opacity: 1 };

  function handleDragEnd(_: PointerEvent, info: PanInfo) {
    const offset = info.offset[axis] * closeSign;
    const velocity = info.velocity[axis] * closeSign;
    const panel = panelRef.current;
    const size = panel
      ? axis === "y"
        ? panel.offsetHeight
        : panel.offsetWidth
      : 0;
    setTimeout(() => {
      draggedRef.current = false;
    }, 0);
    const projected = offset + project(velocity);
    if (projected > size * DISMISS_DISTANCE_RATIO || velocity > DISMISS_VELOCITY) {
      setOpen(false);
    }
  }

  const elastic = {
    top: closeSign === -1 ? 1 : RESIST,
    bottom: closeSign === 1 ? 1 : RESIST,
    left: closeSign === -1 ? 1 : RESIST,
    right: closeSign === 1 ? 1 : RESIST,
  };

  return (
    <AnimatePresence>
      {open && (
        <SheetPortal forceMount key="sheet">
          <SheetOverlay />
          <DialogPrimitive.Content
            ref={ref}
            forceMount
            asChild
            onCloseAutoFocus={handleCloseAutoFocus}
            {...props}
          >
            <motion.div
              ref={panelRef}
              className={cn(sheetVariants({ side: resolvedSide }), className)}
              initial={hiddenState}
              animate={shownState}
              exit={hiddenState}
              transition={SPRING}
              drag={swipeable ? axis : false}
              dragListener={swipeable && !fromHandle}
              dragControls={dragControls}
              dragDirectionLock
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              dragElastic={elastic}
              dragMomentum={false}
              dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
              onDragStart={() => {
                draggedRef.current = false;
              }}
              onDrag={(_, info) => {
                if (Math.abs(info.offset[axis]) > SUPPRESS_CLICK_DISTANCE) {
                  draggedRef.current = true;
                }
              }}
              onDragEnd={handleDragEnd}
              onClickCapture={(event) => {
                if (draggedRef.current) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              {resolvedSide === "bottom" && (
                <div
                  className={cn(
                    "-mx-6 -mt-6 mb-1 flex h-7 items-center justify-center",
                    swipeable && "cursor-grab touch-none active:cursor-grabbing",
                  )}
                  onPointerDown={(event) => {
                    if (swipeable) dragControls.start(event);
                  }}
                  aria-hidden
                >
                  <span className="h-1 w-9 rounded-full bg-foreground/20" />
                </div>
              )}
              {children}
              <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
                <X className="size-4" aria-hidden />
                <span className="sr-only">Закрыть</span>
              </DialogPrimitive.Close>
            </motion.div>
          </DialogPrimitive.Content>
        </SheetPortal>
      )}
    </AnimatePresence>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
