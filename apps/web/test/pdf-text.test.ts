import { describe, expect, it } from "vitest";
import { draftBookingsFromText } from "../src/lib/booking-draft";
import { linesFromWords } from "../src/lib/pdf-text";

describe("linesFromWords", () => {
  it("keeps the departure and arrival of one drawn row on the same line", () => {
    const text = linesFromWords([
      { text: "SQ-511", x: 35, y: 273, height: 16 },
      { text: "BLR", x: 244, y: 230, height: 16 },
      { text: "23:10", x: 290, y: 230, height: 16 },
      { text: "SIN", x: 772, y: 230, height: 16 },
      { text: "06:15", x: 820, y: 230, height: 16 },
      { text: "SAT, 27 MAR '27", x: 244, y: 263, height: 16 },
    ]);
    const drafts = draftBookingsFromText("ticket.pdf", text);
    expect(drafts[0]).toMatchObject({ kind: "flight", title: "SQ-511 BLR to SIN", startsOn: "2027-03-27", startsAtTime: "23:10", unread: false });
  });
});
