import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Loading, Spinner } from "../src/components/ui/Spinner";

describe("the hop loader", () => {
  it("shows Hop while a screen is still opening", () => {
    render(<Loading label="Loading" />);
    const status = screen.getByRole("status", { name: "Loading" });
    expect(status.querySelector(".hp-hop")).not.toBeNull();
    expect(status.querySelector(".hp-dot")).toBeNull();
  });

  it("uses the same hop for a small wait inside a page", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector(".hp-hop")).not.toBeNull();
  });
});
