import { inputClass } from "../lib/forms";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { useSignOut } from "../app/useSignOut";
import { useUser } from "../app/user";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";
import { clearAllLocalData } from "../offline/sync";

/** The person's own details: name, email, sign out, and deleting the account. */
export function AccountScreen() {
  const { actions, db, auth } = useServices();
  const { email } = useUser();
  const online = useOnline();
  const signOut = useSignOut();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    actions.getProfile().then(
      (p) => alive && (setName(p.displayName), setLoaded(true)),
      () => alive && setLoaded(true),
    );
    return () => {
      alive = false;
    };
  }, [actions]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setSaveFailed(false);
    if (!name.trim()) return setNameError("Enter your name");
    setNameError(null);
    setSaving(true);
    try {
      await actions.updateDisplayName(name.trim());
      setSaved(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await actions.deleteAccount();
    } catch (error) {
      setDeleteError(error instanceof Error && error.message ? error.message : "Couldn't delete the account. Check your connection and try again.");
      setDeleting(false);
      return;
    }
    await clearAllLocalData(db);
    await auth.signOut().catch(() => {}); // the account is gone; ending the session is just tidying up
    navigate("/sign-in", { replace: true });
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Link to="/" className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
        Back to your trips
      </Link>
      <h1 className="font-display text-4xl font-extrabold">Account</h1>
      {!online && <p className="text-sm text-muted">Connect to the internet to change your details.</p>}

      <Card>
        <form onSubmit={save} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="account-name" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="account-name"
              autoComplete="name"
              value={name}
              disabled={!loaded}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            {nameError && <span className="text-sm text-danger-fg">{nameError}</span>}
            <span className="text-xs text-muted">This is how other people in your trips see you.</span>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!online || saving || !loaded}>
              Save name
            </Button>
            {saved && <span role="status" className="text-sm text-muted">Saved</span>}
          </div>
          {saveFailed && <p role="alert" className="text-sm text-danger-fg">Couldn't save. Please try again.</p>}
        </form>
      </Card>

      <Card className="flex flex-col gap-1">
        <p className="text-sm font-medium">Email</p>
        <p>{email ?? "Not available"}</p>
        <p className="text-xs text-muted">You sign in with a link sent to this address. There is no password.</p>
      </Card>

      <div>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>

      <Card className="flex flex-col gap-3 border-danger-fg/30">
        <h2 className="font-display text-lg font-bold">Delete account</h2>
        <p className="text-sm text-muted">Removes you from every trip and deletes your account for good.</p>
        <div>
          <Button variant="secondary" disabled={!online} onClick={() => { setTyped(""); setDeleteError(null); setConfirming(true); }}>
            Delete my account
          </Button>
        </div>
      </Card>

      <Sheet
        open={confirming}
        onOpenChange={(open) => !deleting && setConfirming(open)}
        title="Delete your account?"
        description="Deletes your account, your private plans and personal documents, and takes you out of every trip. Group plans and bookings you added stay for the group. This can't be undone."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="confirm-delete" className="text-sm font-medium">
              Type delete to confirm
            </label>
            <input
              id="confirm-delete"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={inputClass}
            />
          </div>
          {deleteError && <p role="alert" className="text-sm text-danger-fg">{deleteError}</p>}
          <div className="flex gap-2">
            <Button disabled={typed.trim().toLowerCase() !== "delete" || deleting} onClick={() => void deleteAccount()}>
              Delete my account
            </Button>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
