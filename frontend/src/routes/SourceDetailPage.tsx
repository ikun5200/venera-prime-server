import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LogOut, RefreshCw, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { SourceSettingDef } from "../lib/types";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
} from "../components/ui";

type Tab = "overview" | "settings" | "account" | "edit" | "check";

export default function SourceDetailPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { key = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const query = useQuery({
    queryKey: ["source", key],
    queryFn: () => api.source(key),
  });
  const settingsQuery = useQuery({
    queryKey: ["source-settings", key],
    queryFn: () => api.sourceSettings(key),
    enabled: tab === "settings",
  });
  const libraries = useQuery({
    queryKey: ["source-libraries"],
    queryFn: api.libraries,
  });
  const [bindLibrary, setBindLibrary] = useState("");
  const [script, setScript] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cookieValues, setCookieValues] = useState<Record<string, string>>({});
  const [cookieDomain, setCookieDomain] = useState("");
  const [cookieHeader, setCookieHeader] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [check, setCheck] = useState<{ loading: boolean; data: unknown }>({
    loading: false,
    data: null,
  });

  const source = query.data?.source;

  useEffect(() => {
    if (source?.script) setScript(source.script);
  }, [source?.script]);
  useEffect(() => {
    if (settingsQuery.data) setValues(settingsQuery.data.values);
  }, [settingsQuery.data]);

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.updateSourceSettings(key, patch),
    onSuccess: (result) => {
      setValues(result.values);
      toast.success(t("Saved"));
      queryClient.invalidateQueries({ queryKey: ["source-settings", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const saveScript = useMutation({
    mutationFn: () => api.updateSource(key, script),
    onSuccess: () => {
      toast.success(t("Saved"));
      queryClient.invalidateQueries({ queryKey: ["source", key] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const updateFromUrl = useMutation({
    mutationFn: () => api.updateSourceFromUrl(key),
    onSuccess: () => {
      toast.success(t("Updated"));
      queryClient.invalidateQueries({ queryKey: ["source", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const loginPassword = useMutation({
    mutationFn: () => api.loginSource(key, username, password),
    onSuccess: () => {
      toast.success(t("Logged in"));
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["source", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const loginCookies = useMutation({
    mutationFn: () => api.loginSourceCookies(key, cookieValues),
    onSuccess: () => {
      toast.success(t("Logged in"));
      queryClient.invalidateQueries({ queryKey: ["source", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const importCookies = useMutation({
    mutationFn: () => {
      const cookies = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const index = part.indexOf("=");
          return {
            name: index >= 0 ? part.slice(0, index) : part,
            value: index >= 0 ? part.slice(index + 1) : "",
            domain: cookieDomain.trim(),
            path: "/",
            hostOnly: true,
          };
        })
        .filter((cookie) => cookie.name && cookie.domain);
      if (cookies.length === 0)
        throw new Error(t("Enter a domain and cookie values"));
      return api.importSourceCookies(key, cookies);
    },
    onSuccess: () => {
      toast.success(t("Cookies imported"));
      setCookieHeader("");
      queryClient.invalidateQueries({ queryKey: ["source", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const logout = useMutation({
    mutationFn: () => api.logoutSource(key),
    onSuccess: () => {
      toast.success(t("Logged out"));
      queryClient.invalidateQueries({ queryKey: ["source", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const bind = useMutation({
    mutationFn: () => api.bindSource(key, bindLibrary, `${key}.js`),
    onSuccess: () => {
      toast.success(t("Source bound"));
      queryClient.invalidateQueries({ queryKey: ["source", key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteSource = useMutation({
    mutationFn: () => api.deleteSource(key),
    onSuccess: () => {
      toast.success(t("Deleted"));
      navigate("/sources");
    },
    onError: (error) => toast.error(error.message),
  });

  const runCheck = async () => {
    setCheck({ loading: true, data: null });
    try {
      setCheck({ loading: false, data: await api.checkSource(key) });
    } catch (error) {
      setCheck({
        loading: false,
        data: {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const cookieFields = useMemo(() => {
    const raw = source?.capabilities.cookieFields;
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [source?.capabilities.cookieFields]);
  const webviewUrl = String(source?.capabilities.webviewLoginUrl ?? "");

  if (query.isLoading) {
    return (
      <PageBody>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </PageBody>
    );
  }

  if (!source) {
    return (
      <PageBody>
        <EmptyState
          title={t("Error")}
          description={
            query.error instanceof Error
              ? query.error.message
              : String(query.error)
          }
        />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title={source.name}
        subtitle={`${source.key} · v${source.version}`}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              loading={updateFromUrl.isPending}
              disabled={!source.url}
              onClick={() => updateFromUrl.mutate()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("Update")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />
      <div className="sticky top-0 z-20 border-b border-border bg-bg/85 px-4 backdrop-blur-md md:px-6">
        <div className="mx-auto max-w-[1000px]">
          <Tabs
            items={[
              { value: "overview", label: t("Overview") },
              { value: "settings", label: t("Source settings") },
              { value: "account", label: t("Log in") },
              { value: "edit", label: t("Edit") },
              { value: "check", label: t("Check readability") },
            ]}
            value={tab}
            onChange={(value) => setParams({ tab: value }, { replace: true })}
          />
        </div>
      </div>
      <PageBody className="max-w-[1000px]">
        {tab === "overview" ? (
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <h2 className="mb-3 text-[15px] font-semibold">
                {t("Information")}
              </h2>
              <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                <Info label={t("Key")} value={source.key} />
                <Info label={t("Version")} value={source.version} />
                <Info
                  label={t("Min app version")}
                  value={source.minAppVersion || "—"}
                />
                <Info
                  label={t("Account")}
                  value={
                    source.account.loggedIn
                      ? (source.account.kind ?? t("logged in"))
                      : t("not logged in")
                  }
                />
                <Info label={t("Update URL")} value={source.url || "—"} />
                <Info
                  label={t("Enabled")}
                  value={source.enabled ? t("yes") : t("no")}
                />
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-[15px] font-semibold">
                {t("Source library")}
              </h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field
                    label={t("Bind to library")}
                    hint={t("Enables update checks from the selected catalog.")}
                  >
                    <Select
                      value={bindLibrary}
                      onChange={(event) => setBindLibrary(event.target.value)}
                    >
                      <option value="">{t("Select a library")}</option>
                      {(libraries.data?.items ?? []).map((library) => (
                        <option key={library.id} value={library.id}>
                          {library.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button
                  variant="secondary"
                  disabled={!bindLibrary}
                  loading={bind.isPending}
                  onClick={() => bind.mutate()}
                >
                  {t("Bind source")}
                </Button>
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-[15px] font-semibold">
                {t("Capabilities")}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(source.capabilities)
                  .filter(([, value]) => value === true)
                  .map(([name]) => (
                    <Badge key={name} tone="accent">
                      {t(name)}
                    </Badge>
                  ))}
              </div>
            </Card>
          </div>
        ) : null}

        {tab === "settings" ? (
          settingsQuery.isLoading ? (
            <Spinner />
          ) : (
            <Card className="flex flex-col gap-4 p-4">
              {Object.keys(settingsQuery.data?.definitions ?? {}).length ===
              0 ? (
                <p className="text-[13px] text-muted">
                  {t("This source has no settings.")}
                </p>
              ) : (
                Object.entries(settingsQuery.data?.definitions ?? {}).map(
                  ([name, definition]) => (
                    <SettingControl
                      key={name}
                      name={name}
                      definition={definition}
                      value={values[name]}
                      onChange={(value) =>
                        saveSettings.mutate({ [name]: value })
                      }
                      onCallback={() =>
                        api
                          .sourceSettingCallback(key, name)
                          .then(() => toast.success(t("Done")))
                          .catch((error) => toast.error(error.message))
                      }
                    />
                  ),
                )
              )}
            </Card>
          )
        ) : null}

        {tab === "account" ? (
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{t("Log in")}</h2>
                  <p className="text-[12px] text-muted">
                    {source.account.loggedIn
                      ? "This source is logged in."
                      : "This source is not logged in."}
                  </p>
                </div>
                {source.account.loggedIn ? (
                  <Button
                    variant="secondary"
                    loading={logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    <LogOut className="h-4 w-4" /> {t("Log out")}
                  </Button>
                ) : null}
              </div>
            </Card>

            {source.capabilities.passwordLogin === true ? (
              <Card className="p-4">
                <h3 className="mb-3 text-[14px] font-semibold">
                  {t("Log in")}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("Username")}>
                    <Input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  </Field>
                  <Field label={t("Password")}>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </Field>
                </div>
                <Button
                  variant="primary"
                  className="mt-3"
                  loading={loginPassword.isPending}
                  disabled={!username || !password}
                  onClick={() => loginPassword.mutate()}
                >
                  {t("Log in")}
                </Button>
              </Card>
            ) : null}

            {cookieFields.length > 0 ? (
              <Card className="p-4">
                <h3 className="mb-3 text-[14px] font-semibold">
                  {t("Login with cookies")}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {cookieFields.map((field) => (
                    <Field key={field} label={field}>
                      <Input
                        value={cookieValues[field] ?? ""}
                        onChange={(event) =>
                          setCookieValues({
                            ...cookieValues,
                            [field]: event.target.value,
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <Button
                  variant="primary"
                  className="mt-3"
                  loading={loginCookies.isPending}
                  onClick={() => loginCookies.mutate()}
                >
                  {t("Log in")}
                </Button>
              </Card>
            ) : null}

            {webviewUrl || source.capabilities.webviewLogin === true ? (
              <Card className="p-4">
                <h3 className="mb-2 text-[14px] font-semibold">
                  {t("Paste cookies")}
                </h3>
                <p className="mb-3 text-[12px] text-muted">
                  WebView login is not available on a server. Log in on the
                  source website in your browser, then paste the Cookie header
                  here.
                  {webviewUrl ? ` Login URL: ${webviewUrl}` : ""}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
                  <Field label={t("Domain")}>
                    <Input
                      value={cookieDomain}
                      onChange={(event) => setCookieDomain(event.target.value)}
                      placeholder="forums.mangadex.org"
                    />
                  </Field>
                  <Field label={t("Cookie header")}>
                    <Input
                      value={cookieHeader}
                      onChange={(event) => setCookieHeader(event.target.value)}
                      placeholder="name=value; other=value"
                    />
                  </Field>
                </div>
                <Button
                  variant="primary"
                  className="mt-3"
                  loading={importCookies.isPending}
                  onClick={() => importCookies.mutate()}
                >
                  {t("Save")}
                </Button>
              </Card>
            ) : null}

            {source.capabilities.registerWebsite ? (
              <Card className="p-4">
                <p className="text-[13px]">
                  Create an account at{" "}
                  <a
                    className="text-accent hover:underline"
                    href={String(source.capabilities.registerWebsite)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {String(source.capabilities.registerWebsite)}
                  </a>
                </p>
              </Card>
            ) : null}
          </div>
        ) : null}

        {tab === "edit" ? (
          <Card className="p-4">
            <Field
              label={t("Source script")}
              hint={t("The class name and key must stay unchanged.")}
            >
              <Textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                className="min-h-[480px] font-mono text-[12px]"
              />
            </Field>
            <Button
              variant="primary"
              className="mt-3"
              loading={saveScript.isPending}
              onClick={() => saveScript.mutate()}
            >
              <Save className="h-4 w-4" /> {t("Save")}
            </Button>
          </Card>
        ) : null}

        {tab === "check" ? (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">
                  {t("Check readability")}
                </h2>
                <p className="text-[12px] text-muted">
                  Runs catalog, details, pages and image stages against the live
                  source.
                </p>
              </div>
              <Button
                variant="primary"
                loading={check.loading}
                onClick={runCheck}
              >
                <CheckCircle2 className="h-4 w-4" /> {t("Check")}
              </Button>
            </div>
            {check.data ? (
              <div className="mt-4">
                <CheckResult data={check.data} />
              </div>
            ) : null}
          </Card>
        ) : null}
      </PageBody>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete comic source '${source.name}' ?`}
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => deleteSource.mutate()}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="break-all text-[13px]">{value}</p>
    </div>
  );
}

function SettingControl({
  name,
  definition,
  value,
  onChange,
  onCallback,
}: {
  name: string;
  definition: SourceSettingDef;
  value: unknown;
  onChange: (value: unknown) => void;
  onCallback: () => void;
}) {
  const t = useT();
  const label = definition.title ?? name;
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value]);

  if (definition.type === "switch") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px]">{label}</span>
        <Switch checked={value === true} onChange={onChange} />
      </div>
    );
  }
  if (definition.type === "select") {
    return (
      <Field label={label}>
        <Select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {(definition.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.text}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (definition.type === "callback") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px]">{label}</span>
        <Button size="sm" onClick={onCallback}>
          {definition.buttonText ?? t("Run")}
        </Button>
      </div>
    );
  }
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="sm" onClick={() => onChange(draft)}>
          {t("Save")}
        </Button>
      </div>
    </Field>
  );
}

function CheckResult({ data }: { data: unknown }) {
  const t = useT();
  const result = data as {
    status?: string;
    stage?: string;
    message?: string;
    stages?: Record<string, unknown>;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge tone={result.status === "readable" ? "success" : "danger"}>
          {t(result.status ?? "unknown")}
        </Badge>
        {result.stage ? (
          <span className="text-[12px] text-muted">
            {t("stage")}: {t(result.stage)}
          </span>
        ) : null}
      </div>
      {result.message ? (
        <p className="rounded bg-danger/10 px-3 py-2 text-[12px] text-danger">
          {result.message}
        </p>
      ) : null}
      {Object.entries(result.stages ?? {}).map(([stage, value]) => (
        <div
          key={stage}
          className="flex justify-between rounded border border-border px-3 py-2 text-[12px]"
        >
          <span>{stage}</span>
          <span>{t(String(value))}</span>
        </div>
      ))}
    </div>
  );
}
