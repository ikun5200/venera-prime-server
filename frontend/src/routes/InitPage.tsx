import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { Button, Card, Field, Input } from "../components/ui";

export default function InitPage() {
  const navigate = useNavigate();
  const setUser = useAppStore((state) => state.setUser);
  const setInitialized = useAppStore((state) => state.setInitialized);
  const setSettings = useAppStore((state) => state.setSettings);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.init(username, password);
      const login = await api.login(username, password);
      setUser(login.user);
      setInitialized(true);
      try {
        setSettings(await api.settings());
      } catch {
        // Settings load is best-effort during first boot.
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4 py-10">
      <Card className="w-full max-w-md p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-accent text-lg font-bold text-white">
            V
          </div>
          <div>
            <h1 className="text-lg font-semibold">Welcome to Venera Prime</h1>
            <p className="text-[13px] text-muted">
              Create the administrator account to get started.
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Username">
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              required
            />
          </Field>
          <Field label="Password" hint="At least 6 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </Field>
          <Field label="Confirm password">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </Field>
          {error ? (
            <p className="rounded bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="mt-1 justify-center"
          >
            Create administrator
          </Button>
        </form>
      </Card>
    </div>
  );
}
