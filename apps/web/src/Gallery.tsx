import { useState } from "react";
import { Avatar } from "./components/ui/Avatar";
import { Banner } from "./components/ui/Banner";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Chip } from "./components/ui/Chip";
import { Sheet } from "./components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/Tabs";
import { personColor } from "./lib/colors";

/** Preview page for the design system (run `npm run dev -w apps/web`). Replaced by the real app in later issues. */
export function Gallery() {
  const [theme, setTheme] = useState<"light" | "dark">(new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light");
  const [open, setOpen] = useState(false);
  return (
    <div data-theme={theme} className="min-h-dvh bg-bg p-4 text-fg md:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Hoppin design system</h1>
          <Button variant="secondary" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "Dark" : "Light"}
          </Button>
        </div>
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
