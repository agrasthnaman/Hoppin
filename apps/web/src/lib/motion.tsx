import { LazyMotion, MotionConfig, type Transition } from "motion/react";
import type { ReactNode } from "react";

/** Snappy and slightly bouncy: sheets, pills, things that follow a finger. */
export const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
/** Calmer: page and list entrances. */
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 28 };

const loadFeatures = () => import("./motion-features").then((m) => m.default);

/**
 * All animation in the app goes through here. The engine loads lazily after the first paint. `reducedMotion="user"`
 * means people who ask their phone for less motion get no movement animations anywhere. Components must use `m.*`
 * (not `motion.*`): `strict` turns a slip into an error.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={spring}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
