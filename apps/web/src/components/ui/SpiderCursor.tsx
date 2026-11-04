import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";

type Props = ComponentProps<typeof import("./silk-spider-cursor").default>;

// The 3D mascot is big (it carries three.js), so it loads on its own after the screen is usable, is not saved for
// offline use, and simply doesn't appear if it can't be loaded (for example with no signal).
const Spider = lazy<ComponentType<Props>>(() => import("./silk-spider-cursor").catch(() => ({ default: () => null })));

export function SpiderCursor(props: Props) {
  return (
    <Suspense fallback={null}>
      <Spider {...props} />
    </Suspense>
  );
}
