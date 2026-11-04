import { buildDay, type Item } from "@hoppin/core";
import { useState } from "react";
import { DayView } from "./components/DayView";
import { BookingDetail } from "./components/BookingDetail";
import { JoinFlow } from "./routes/JoinFlow";
import { AppearanceCard } from "./components/AppearanceCard";
import { Avatar } from "./components/ui/Avatar";
import { Banner } from "./components/ui/Banner";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Chip } from "./components/ui/Chip";
import { Sheet } from "./components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/Tabs";
import { personColor } from "./lib/colors";

const IST = "Asia/Kolkata";
const at = (hhmm: string) => new Date(`2026-12-02T${hhmm}:00+05:30`).toISOString();
function demo(over: Partial<Item> & Pick<Item, "id" | "title" | "startsAt">): Item {
  return { tripId: "t", ownerId: "aman", kind: "activity", visibility: "shared", groupItem: true, endsAt: null, tz: IST, locationUrl: null, details: {}, version: 1, ...over };
}
const demoItems: Item[] = [
  demo({ id: "1", title: "Breakfast at hotel", startsAt: at("08:00"), endsAt: at("09:00") }),
  demo({ id: "2", title: "Old town walking tour", startsAt: at("10:00"), endsAt: at("12:30"), locationUrl: "https://maps.example/old-town" }),
  demo({ id: "3", title: "Museum", startsAt: at("10:30"), groupItem: false, ownerId: "riya", locationUrl: "https://maps.example/museum" }),
  demo({ id: "4", title: "Cafe crawl in the old market lanes", startsAt: at("11:30"), groupItem: false, ownerId: "neha" }),
  demo({ id: "5", title: "Lunch (booked for 10)", startsAt: at("13:00"), endsAt: at("14:30") }),
  demo({ id: "6", title: "Visit ABC place", startsAt: at("15:00"), groupItem: false, visibility: "private" }),
];
const demoPeople = { aman: { name: "Aman", color: personColor(3) }, riya: { name: "Riya", color: personColor(0) }, neha: { name: "Neha", color: personColor(1) } };

/** Preview page for the design system (run `npm run dev -w apps/web`). Replaced by the real app in later issues. */
export function Gallery() {
  const [open, setOpen] = useState(false);
  if (new URLSearchParams(location.search).get("view") === "booking") {
    const flight = demo({
      id: "f1", title: "DEL to GOI (IndiGo 6E 123)", kind: "flight", startsAt: at("10:00"), endsAt: at("12:30"),
      locationUrl: "https://maps.example/airport", details: { notes: "Gate B12. Bags check in closes 45 min before." },
    });
    const docs = [
      { id: "d1", tripId: "t", itemId: "f1", ownerId: "aman", scope: "shared" as const, storagePath: "t/aman/d1-ticket-all.pdf", kind: "ticket", fileName: "ticket-all.pdf" },
      { id: "d2", tripId: "t", itemId: "f1", ownerId: "aman", scope: "personal" as const, storagePath: "t/aman/d2-passport.pdf", kind: "passport", fileName: "passport.pdf" },
    ];
    return (
      <div className="min-h-dvh bg-bg p-4 text-fg">
        <div className="mx-auto max-w-md">
          <BookingDetail
            item={flight}
            member={{ userId: "aman", role: "member", status: "approved", canEditAll: false }}
            documents={docs}
            people={demoPeople}
            onSave={async () => {}}
            onUpload={async () => {}}
            onOpenDocument={() => {}}
          />
        </div>
      </div>
    );
  }
  if (new URLSearchParams(location.search).get("view") === "join") {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <JoinFlow
          token={"a1".repeat(32)}
          signedInUserId={null}
          redirectTo={location.href}
          resetRedirectTo={location.origin}
          auth={{
            signUp: async () => ({ confirmationNeeded: true }),
            signIn: async () => {},
            resendConfirmation: async () => {},
            requestPasswordReset: async () => {},
          }}
          redeem={async () => ({ tripId: "t", status: "pending" })}
          onContinue={() => {}}
        />
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-bg p-4 text-fg md:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Hoppin design system</h1>
        </div>
        <AppearanceCard />
        <Banner kind="offline" text="You're offline. Showing your saved trip." />
        <Banner kind="stale" text="Last synced 2 days ago" />
        <Banner kind="conflict" text="Your edit to Lunch was overwritten by Riya." />
        <Card className="flex flex-col gap-3">
          <p className="font-semibold">Day 3 · Old town</p>
          <div className="rounded-card border-l-4 border-accent bg-raised p-3">10:00 Old town walking tour</div>
          <div className="flex flex-wrap gap-2">
            <Chip initial="R" title="Museum" color={personColor(0)} onOpen={() => setOpen(true)} />
            <Chip initial="A" title="Cafe crawl in the old market lanes" color={personColor(1)} onOpen={() => setOpen(true)} />
          </div>
          <div className="rounded-card border border-dashed border-line p-3 text-muted">15:00 Only you: Visit ABC place</div>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name="Riya" color={personColor(0)} />
            <Avatar name="Aman" color={personColor(1)} />
            <Avatar name="Neha" color={personColor(2)} />
            <Button>Add plan</Button>
            <Button variant="ghost">Cancel</Button>
          </div>
        </Card>
        <DayView
          date="2026-12-02"
          tz={IST}
          layout={buildDay(demoItems, "aman", "2026-12-02", IST)}
          people={demoPeople}
          viewerId="aman"
          goingByItem={{ "3": ["riya"] }}
          onJoin={() => {}}
        />
        <Tabs defaultValue="days">
          <TabsList aria-label="Sections">
            <TabsTrigger value="days">Days</TabsTrigger>
            <TabsTrigger value="docs">Docs</TabsTrigger>
          </TabsList>
          <TabsContent value="days">Day list</TabsContent>
          <TabsContent value="docs">Document list</TabsContent>
        </Tabs>
        <Sheet open={open} onOpenChange={setOpen} title="Museum visit" description="Riya · Day 3, 10:30">
          <p className="mb-4">Old town museum. Anyone interested can join.</p>
          <Button onClick={() => setOpen(false)}>I'm in</Button>
        </Sheet>
      </div>
    </div>
  );
}
