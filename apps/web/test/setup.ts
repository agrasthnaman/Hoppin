import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import * as axeMatchers from "vitest-axe/matchers";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";

expect.extend(axeMatchers);
MotionGlobalConfig.skipAnimations = true; // animations finish instantly in tests
afterEach(() => cleanup());
