import { describe, expect, it } from "vitest";
import { draftBookingFromText, draftBookingsFromText, tripSpan } from "../src/lib/booking-draft";

const ticket = `
INDIGO E-TICKET
Passenger: Aman
Flight 6E 204
From: Delhi (DEL)
To: Goa (GOI)
Departure: 12 Dec 2026 09:40
`;

const hotel = `
Booking confirmation
Hotel: Beach House Calangute
Address: Calangute, Goa
Check-in: 12 December 2026
Check-out: 15 December 2026
`;

describe("draftBookingFromText", () => {
  it("reads a ticket as a flight on the departure day", () => {
    const draft = draftBookingFromText("ticket.pdf", ticket);
    expect(draft.kind).toBe("flight");
    expect(draft.unread).toBe(false);
    expect(draft.startsOn).toBe("2026-12-12");
    expect(draft.startsAtTime).toBe("09:40");
    expect(draft.title).toBe("Delhi (DEL) to Goa (GOI)");
    expect(draft.fileName).toBe("ticket.pdf");
  });

  it("reads a hotel booking as a stay on those nights, with the place", () => {
    const draft = draftBookingFromText("hotel.pdf", hotel);
    expect(draft.kind).toBe("stay");
    expect(draft.unread).toBe(false);
    expect(draft.title).toBe("Beach House Calangute");
    expect(draft.place).toBe("Calangute, Goa");
    expect(draft.startsOn).toBe("2026-12-12");
    expect(draft.endsOn).toBe("2026-12-15");
  });

  it("reads an Airbnb stay whose dates omit the year", () => {
    const text = `
Check-in Checkout
Sat, 3 Apr Tue, 6 Apr
3:00 pm 11:00 am
Property name: Abu Villa
Address: Jalan Segara Perancak No.9, Canggu, Bali
03/11/2026, 00:12 Your trip overview
`;
    const draft = draftBookingFromText("Villa Abu.pdf", text);
    expect(draft.kind).toBe("stay");
    expect(draft.unread).toBe(false);
    expect(draft.title).toBe("Abu Villa");
    expect(draft.place).toBe("Jalan Segara Perancak No.9, Canggu, Bali");
    expect(draft.startsOn).toBe("2027-04-03");
    expect(draft.endsOn).toBe("2027-04-06");
    expect(draft.startsAtTime).toBe("15:00");
    expect(draft.endsAtTime).toBe("11:00");
  });

  it("keeps a file it cannot read, so the organizer can fill it in", () => {
    const draft = draftBookingFromText("scan.pdf", "   ");
    expect(draft.kind).toBe("plan");
    expect(draft.unread).toBe(true);
    expect(draft.title).toBe("scan.pdf");
    expect(draft.startsOn).toBeNull();
  });
});

describe("draftBookingsFromText", () => {
  it("reads each leg when the ticket prints both airports and times on a line", () => {
    const text = `
New Delhi to Ranchi Sat, 16 Aug 2025
Air India Express DEL 16:25 18:20 IXR
IX - 1204 Sat, 16 Aug 2025
Bengaluru BLR 23:10 Singapore SIN 06:15
SAT, 27 MAR '27 SUN, 28 MAR '27
SQ-511
Singapore SIN 08:20 Bali DPS 11:00
SUN, 28 MAR '27
SQ-936
`;
    const drafts = draftBookingsFromText("ticket.pdf", text);
    expect(drafts.map((draft) => draft.title)).toEqual(["IX-1204 New Delhi to Ranchi", "SQ-511 BLR to SIN", "SQ-936 SIN to DPS"]);
    expect(drafts.map((draft) => [draft.startsOn, draft.startsAtTime])).toEqual([
      ["2025-08-16", "16:25"],
      ["2027-03-27", "23:10"],
      ["2027-03-28", "08:20"],
    ]);
    expect(drafts.every((draft) => draft.kind === "flight" && !draft.unread)).toBe(true);
  });

  it("reads a drawn ticket whose letters come back a little rough", () => {
    const text = `
BLR 23:10 = SIN 06:15
Singapore Air
SQ-511 SAT, 27 MAR 27 7h 5m SUN, 28 MAR 27
SIN 08:20 + DPS 11:00
Singapore Air
$Q-936 SUN, 28 MAR "27 2h 40m SUN, 28 MAR 27
DPS 13:20 = SIN 16:05
Singapore Air
$Q-939 TUE, 06 APR 27 2h 45m TUE, 06 APR 27
SIN 20:05 = BLR 21:50
Singapore Air
$Q-510 TUE, 06 APR 27 1h 45m TUE, 06 APR 27
`;
    const drafts = draftBookingsFromText("ticket (2).pdf", text);
    expect(drafts.map((draft) => [draft.title, draft.startsOn, draft.startsAtTime])).toEqual([
      ["SQ-511 BLR to SIN", "2027-03-27", "23:10"],
      ["SQ-936 SIN to DPS", "2027-03-28", "08:20"],
      ["SQ-939 DPS to SIN", "2027-04-06", "13:20"],
      ["SQ-510 SIN to BLR", "2027-04-06", "20:05"],
    ]);
  });

  it("still reads a labelled ticket or a hotel as one booking", () => {
    expect(draftBookingsFromText("ticket.pdf", ticket)).toEqual([draftBookingFromText("ticket.pdf", ticket)]);
    expect(draftBookingsFromText("hotel.pdf", hotel)).toEqual([draftBookingFromText("hotel.pdf", hotel)]);
  });
});

describe("tripSpan", () => {
  it("spans the ticket dates and the hotel nights", () => {
    const span = tripSpan([draftBookingFromText("ticket.pdf", ticket), draftBookingFromText("hotel.pdf", hotel)]);
    expect(span).toEqual({ startDate: "2026-12-12", endDate: "2026-12-15" });
  });

  it("uses a return ticket as the trip end", () => {
    const outbound = draftBookingFromText("out.pdf", "Flight 6E 1\nDeparture: 1 Dec 2026\nFrom: Delhi\nTo: Goa");
    const back = draftBookingFromText("back.pdf", "Flight 6E 2\nDeparture: 10 Dec 2026\nFrom: Goa\nTo: Delhi");
    expect(tripSpan([outbound, back])).toEqual({ startDate: "2026-12-01", endDate: "2026-12-10" });
  });
});
