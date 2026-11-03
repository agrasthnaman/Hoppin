import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import * as axeMatchers from "vitest-axe/matchers";
import { afterEach, expect } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";

expect.extend(axeMatchers);
configure({ asyncUtilTimeout: 3000 }); // slower or busy machines should not make tests flaky
MotionGlobalConfig.skipAnimations = true; // animations finish instantly in tests
afterEach(() => cleanup());
