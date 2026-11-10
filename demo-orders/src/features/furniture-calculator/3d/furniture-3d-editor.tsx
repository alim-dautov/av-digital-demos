"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Box,
  Camera,
  Copy,
  DoorOpen,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RotateCcw,
  Ruler,
  Settings2,
  Trash2,
  Undo2,
} from "lucide-react";
import type { FurnitureFacadeMaterial, FurnitureModule, FurnitureRoom } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, generateId } from "@/lib/utils";
import {
  COUNTERTOP_OVERHANG,
  COUNTERTOP_THICKNESS,
  DEFAULT_ROOM,
  FACADE_THICKNESS,
  freeSpace,
  freezeLayout,
  moduleGeometry,
  placeModules,
  resolveDragX,
  resolveModuleX,
  type ModuleGeometry,
  type PlacedModule,
} from "@/lib/domain/furniture/layout3d";
import { CabinetMesh, UNIT_BOX, type GroupHandlers } from "./cabinet-mesh";
import { Room } from "./room";
import { DimensionLabels } from "./dimension-labels";
import { SCENE_SCALE, useDragAlongWall } from "./use-drag-along-wall";
import { useSceneMaterials } from "./use-scene-materials";
import { DEFAULT_CARCASS_FINISH, defaultFacadeFinish } from "./finishes";

type ViewPreset = "3d" | "front" | "top";

const VIEW_LABELS: Record<ViewPreset, string> = { "3d": "3D", front: "Спереди", top: "Сверху" };
const HISTORY_LIMIT = 30;

export type Furniture3DEditorProps = {
  modules: FurnitureModule[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onModulesChange: (next: FurnitureModule[]) => void;
  room?: FurnitureRoom;
  onRoomChange: (room: FurnitureRoom) => void;
  carcassColor?: string;
  facadeColor?: string;
  facadeMaterial: FurnitureFacadeMaterial;
  showCountertop: boolean;
  labelFor: (m: FurnitureModule, index: number) => string;
  canWrite: boolean;
};

function CameraRig({ view, token, room }: { view: ViewPreset; token: number; room: FurnitureRoom }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const L = room.length * SCENE_SCALE;
    const cx = L / 2;
    const dist = Math.max(L, 3) * 1.3;
    const target = new THREE.Vector3(cx, view === "top" ? 0 : 1.2, view === "top" ? 0.8 : 0.3);
    if (view === "front") camera.position.set(cx, 1.35, dist * 1.05);
    else if (view === "top") camera.position.set(cx, dist * 1.35, 0.81);
    else camera.position.set(cx + dist * 0.35, 2.1, dist * 0.95);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }
    invalidate();
  }, [view, token, room.length, camera, controls, invalidate]);

  return null;
}

function Lights({ room }: { room: FurnitureRoom }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  const L = room.length * SCENE_SCALE;
  const half = Math.max(L, 3) / 2 + 1;
  return (
    <>
      <hemisphereLight args={["#ffffff", "#d8d2c8", 1.1]} />
      <primitive object={target} position={[L / 2, 0, 0.5]} />
      <directionalLight
        target={target}
        position={[L / 2 + 1.5, 3.8, 3.2]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />
    </>
  );
}

function Scene({
  modules,
  activeId,
  onSelect,
  onCommit,
  room,
  runLength,
  carcassColor,
  facadeColor,
  facadeMaterial,
  showCountertop,
  showDims,
  transparent,
  doorsOpen,
  canWrite,
  reduceMotion,
}: {
  modules: FurnitureModule[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (next: FurnitureModule[]) => void;
  room: FurnitureRoom;
  runLength: number;
  carcassColor: string;
  facadeColor: string;
  facadeMaterial: FurnitureFacadeMaterial;
  showCountertop: boolean;
  showDims: boolean;
  transparent: boolean;
  doorsOpen: boolean;
  canWrite: boolean;
  reduceMotion: boolean;
}) {
  const mats = useSceneMaterials(carcassColor, facadeColor);
  const { viewModules, dragging, bind } = useDragAlongWall({
    modules,
    roomLength: room.length,
    activeId,
    canWrite,
    onSelect,
    onCommit,
  });
  const placement = useMemo(() => placeModules(viewModules), [viewModules]);
  const withFacades = facadeMaterial !== "none";
  const geometries = useMemo(() => {
    const map = new Map<string, ModuleGeometry>();
    for (const m of viewModules) map.set(m.id, moduleGeometry(m, withFacades));
    return map;
  }, [viewModules, withFacades]);

  useEffect(() => {
    document.body.style.cursor = dragging ? "grabbing" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [dragging]);

  const handlersFor = (p: PlacedModule, selected: boolean): GroupHandlers => ({
    ...bind(p.module.id, p.bottom),
    onPointerOver: (e) => {
      e.stopPropagation();
      if (!dragging) document.body.style.cursor = selected && canWrite ? "grab" : "pointer";
    },
    onPointerOut: () => {
      if (!dragging) document.body.style.cursor = "";
    },
  });

  return (
    <>
      <Lights room={room} />
      <group scale={SCENE_SCALE}>
        <Room room={room} runLength={runLength} />
        {placement.items.map((p) => {
          const geometry = geometries.get(p.module.id);
          if (!geometry) return null;
          const selected = p.module.id === activeId;
          return (
            <CabinetMesh
              key={p.key}
              placed={p}
              geometry={geometry}
              mats={mats}
              transparent={transparent}
              doorsOpen={doorsOpen}
              selected={selected}
              reduceMotion={reduceMotion}
              handlers={handlersFor(p, selected)}
            />
          );
        })}
        {showCountertop &&
          placement.items
            .filter((p) => p.module.kind === "base")
            .map((p) => {
              const depth = p.module.depth + FACADE_THICKNESS + COUNTERTOP_OVERHANG;
              return (
                <mesh
                  key={`ct-${p.key}`}
                  geometry={UNIT_BOX}
                  material={mats.countertop}
                  position={[p.x + p.module.width / 2, p.top + COUNTERTOP_THICKNESS / 2, depth / 2]}
                  scale={[p.module.width, COUNTERTOP_THICKNESS, depth]}
                  castShadow
                  receiveShadow
                  {...handlersFor(p, p.module.id === activeId)}
                />
              );
            })}
        {showDims && <DimensionLabels placement={placement} room={room} activeId={activeId} />}
      </group>
    </>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 gap-1.5 px-2.5 text-neutral-700 hover:bg-black/[0.06] hover:text-neutral-900",
        active && "bg-black/[0.08] text-neutral-900",
      )}
    >
      {children}
      <span className="hidden 2xl:inline">{label}</span>
    </Button>
  );
}

export function Furniture3DEditor({
  modules,
  activeId,
  onSelect,
  onModulesChange,
  room: roomProp,
  onRoomChange,
  carcassColor,
  facadeColor,
  facadeMaterial,
  showCountertop,
  labelFor,
  canWrite,
}: Furniture3DEditorProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const runLength = useMemo(() => placeModules(modules).length, [modules]);
  // Until the user enters real room sizes, the default wall grows so modules never stick through it.
  const room = useMemo<FurnitureRoom>(
    () =>
      roomProp ?? {
        ...DEFAULT_ROOM,
        length: Math.max(DEFAULT_ROOM.length, Math.ceil(runLength / 100) * 100),
      },
    [roomProp, runLength],
  );
  const overflow = runLength > room.length;
  const [view, setView] = useState<ViewPreset>("3d");
  const [cameraToken, setCameraToken] = useState(0);
  const [showDims, setShowDims] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [history, setHistory] = useState<FurnitureModule[][]>([]);
  const stateRef = useRef<RootState | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const change = useCallback(
    (next: FurnitureModule[]) => {
      setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), modules]);
      onModulesChange(next);
    },
    [modules, onModulesChange],
  );

  function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onModulesChange(prev);
  }

  const active = modules.find((m) => m.id === activeId) ?? null;
  const activeIndex = active ? modules.indexOf(active) : -1;
  const space = active ? freeSpace(modules, active.id, room.length) : null;
  const hasPinned = modules.some((m) => m.x != null);

  function duplicate(id: string) {
    const base = hasPinned ? freezeLayout(modules) : modules;
    const idx = base.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const copy: FurnitureModule = { ...base[idx], id: generateId("mod"), x: null };
    change([...base.slice(0, idx + 1), copy, ...base.slice(idx + 1)]);
    onSelect(copy.id);
  }

  function remove(id: string) {
    change(modules.filter((m) => m.id !== id));
    onSelect(null);
  }

  function nudge(id: string, delta: number) {
    const base = freezeLayout(modules);
    const x0 = resolveModuleX(base)[id] ?? 0;
    const x = resolveDragX(base, id, x0 + delta, room.length);
    if (x !== x0) {
      change(base.map((m) => (m.id === id ? { ...m, x } : m)));
      return;
    }
    toast.info(delta < 0 ? "Слева нет свободного места" : "Справа нет свободного места", {
      id: "nudge-blocked",
      description: "Освободите место или увеличьте длину стены в «Помещение»",
    });
  }

  function autoArrange() {
    change(modules.map((m) => ({ ...m, x: null })));
  }

  function takePhoto() {
    const s = stateRef.current;
    if (!s) return;
    s.gl.render(s.scene, s.camera);
    const url = s.gl.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `mebeldemo-3d-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  useEffect(() => {
    stateRef.current?.invalidate();
  }, [fullscreen]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!active || !canWrite) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 100 : 10;
      nudge(active.id, e.key === "ArrowLeft" ? -step : step);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(active.id);
    }
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="3D-редактор модулей. Стрелки сдвигают выбранный модуль, Delete удаляет."
      className={cn(
        "relative overflow-hidden bg-[#e7e5e0] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        fullscreen ? "fixed inset-0 z-50 h-dvh" : "h-[440px] rounded-lg sm:h-[540px]",
      )}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ fov: 40, near: 0.05, far: 100, position: [2.5, 2, 5] }}
        gl={{ antialias: true }}
        onCreated={(s) => {
          stateRef.current = s;
        }}
        onPointerMissed={(e) => {
          if (e.button === 0) onSelect(null);
        }}
        onPointerDownCapture={() => wrapperRef.current?.focus({ preventScroll: true })}
        className="touch-none"
      >
        <color attach="background" args={["#e7e5e0"]} />
        <Scene
          modules={modules}
          activeId={activeId}
          onSelect={onSelect}
          onCommit={change}
          room={room}
          runLength={runLength}
          carcassColor={carcassColor ?? DEFAULT_CARCASS_FINISH}
          facadeColor={facadeColor ?? defaultFacadeFinish(facadeMaterial)}
          facadeMaterial={facadeMaterial}
          showCountertop={showCountertop}
          showDims={showDims}
          transparent={transparent}
          doorsOpen={doorsOpen}
          canWrite={canWrite}
          reduceMotion={reduceMotion}
        />
        <OrbitControls
          makeDefault
          minDistance={0.8}
          maxDistance={18}
          maxPolarAngle={Math.PI / 2 - 0.02}
          enableDamping={!reduceMotion}
        />
        <CameraRig view={view} token={cameraToken} room={room} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-lg bg-white/85 p-1 shadow-md backdrop-blur">
          <ToolbarButton label="Размеры" active={showDims} onClick={() => setShowDims((v) => !v)}>
            <Ruler />
          </ToolbarButton>
          <ToolbarButton
            label="Прозрачный корпус"
            active={transparent}
            onClick={() => setTransparent((v) => !v)}
          >
            <Box />
          </ToolbarButton>
          <ToolbarButton
            label={doorsOpen ? "Закрыть двери" : "Открыть двери"}
            active={doorsOpen}
            onClick={() => setDoorsOpen((v) => !v)}
          >
            <DoorOpen />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
          {(Object.keys(VIEW_LABELS) as ViewPreset[]).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setCameraToken((t) => t + 1);
              }}
              className={cn(
                "h-8 px-2.5 text-neutral-700 hover:bg-black/[0.06] hover:text-neutral-900",
                view === v && "bg-black/[0.08] text-neutral-900",
              )}
            >
              {VIEW_LABELS[v]}
            </Button>
          ))}
          <ToolbarButton label="Сбросить камеру" onClick={() => setCameraToken((t) => t + 1)}>
            <RotateCcw />
          </ToolbarButton>
        </div>

        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg bg-white/85 p-1 shadow-md backdrop-blur">
          {canWrite && (
            <>
              <ToolbarButton label="Отменить" onClick={undo} disabled={history.length === 0}>
                <Undo2 />
              </ToolbarButton>
              <ToolbarButton label="Авторасстановка" onClick={autoArrange} disabled={!hasPinned}>
                <LayoutGrid />
              </ToolbarButton>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Размеры помещения"
                    aria-label="Размеры помещения"
                    className="h-8 gap-1.5 px-2.5 text-neutral-700 hover:bg-black/[0.06] hover:text-neutral-900"
                  >
                    <Settings2 />
                    <span className="hidden 2xl:inline">Помещение</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-3">
                  <p className="text-sm font-medium">Помещение, мм</p>
                  {(
                    [
                      ["length", "Длина стены", 500, 50_000],
                      ["height", "Высота потолка", 1500, 6000],
                      ["depth", "Глубина комнаты", 500, 50_000],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <div key={key} className="grid grid-cols-[1fr_7rem] items-center gap-2">
                      <Label htmlFor={`room-${key}`} className="text-xs text-muted-foreground">
                        {label}
                      </Label>
                      <Input
                        id={`room-${key}`}
                        type="number"
                        inputMode="numeric"
                        min={min}
                        max={max}
                        step={50}
                        defaultValue={room[key]}
                        key={`${key}-${room[key]}`}
                        className="h-8 tabular-nums"
                        onBlur={(e) => {
                          const v = Math.round(Number(e.target.value));
                          if (!Number.isFinite(v)) return;
                          const clamped = Math.min(max, Math.max(min, v));
                          if (clamped !== room[key]) onRoomChange({ ...room, [key]: clamped });
                        }}
                      />
                    </div>
                  ))}
                  {runLength > room.length && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        onRoomChange({ ...room, length: Math.ceil(runLength / 50) * 50 })
                      }
                    >
                      Подогнать стену под модули
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            </>
          )}
          <ToolbarButton label="Фото" onClick={takePhoto}>
            <Camera />
          </ToolbarButton>
          <ToolbarButton
            label={fullscreen ? "Свернуть" : "На весь экран"}
            active={fullscreen}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </ToolbarButton>
        </div>
        {overflow && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-md bg-white/95 py-1 pl-2 pr-1 text-xs text-red-700 shadow-sm">
            <span>
              Не помещается: {runLength} мм на стене {room.length} мм
            </span>
            {canWrite && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => onRoomChange({ ...room, length: Math.ceil(runLength / 50) * 50 })}
              >
                Подогнать стену
              </Button>
            )}
          </div>
        )}
      </div>

      {modules.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-white/85 px-4 py-2 text-sm text-neutral-700 shadow-md">
            Добавьте модуль, он появится у стены
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2">
        {active && space ? (
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white/90 px-3 py-2 text-neutral-800 shadow-md backdrop-blur">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{labelFor(active, activeIndex)}</p>
              <p className="text-xs tabular-nums text-neutral-500">
                {active.width}×{active.height}×{active.depth} мм · свободно слева {space.left}, справа{" "}
                {space.right}
              </p>
            </div>
            {canWrite && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => duplicate(active.id)}
                  className="h-8 text-neutral-700 hover:bg-black/[0.06] hover:text-neutral-900"
                >
                  <Copy />
                  Копия
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(active.id)}
                  className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                  Удалить
                </Button>
              </div>
            )}
          </div>
        ) : (
          <span />
        )}
        {modules.length > 0 && (
          <p className="hidden rounded-sm bg-white/80 px-2 py-1 text-xs text-neutral-600 sm:block">
            {canWrite
              ? "Нажмите на модуль, затем тяните вдоль стены · стрелки ← → сдвигают"
              : "Нажмите на модуль, чтобы выбрать"}
          </p>
        )}
      </div>
    </div>
  );
}
