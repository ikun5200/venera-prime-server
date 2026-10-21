import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Play, Trash2 } from "lucide-react";
import { api, backupExportUrl, downloadUrl, importBackup } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { formatBytes, copyText } from "../lib/utils";
import {
  effectiveReaderSettings,
  getDeviceId,
  isDeviceSpecificEnabled,
  readerSettingKeys,
  withDeviceSpecificSetting,
  withoutDeviceSpecificSettings,
} from "../lib/readerSettings";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
} from "../components/ui";

type Item =
  | { kind: "switch"; key: string; label: string; hint?: string }
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      hint?: string;
    }
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      format?: (value: number) => string;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      hint?: string;
      suffix?: string;
    }
  | {
      kind: "text";
      key: string;
      label: string;
      hint?: string;
      placeholder?: string;
    }
  | { kind: "link"; label: string; to: string; hint?: string }
  | {
      kind: "action";
      label: string;
      action: string;
      hint?: string;
      danger?: boolean;
    }
  | { kind: "custom"; key: string; label: string; hint?: string };

const titles: Record<string, string> = {
  explore: "Explore",
  reading: "Reading",
  appearance: "Appearance",
  "local-favorites": "Local Favorites",
  app: "APP",
  network: "Network",
  about: "About",
  debug: "Debug",
  "image-processing": "Custom Image Processing",
};

const readerModes = [
  ["galleryLeftToRight", "Gallery (Left to Right)"],
  ["galleryRightToLeft", "Gallery (Right to Left)"],
  ["galleryTopToBottom", "Gallery (Top to Bottom)"],
  ["continuousLeftToRight", "Continuous (Left to Right)"],
  ["continuousRightToLeft", "Continuous (Right to Left)"],
  ["continuousTopToBottom", "Continuous (Top to Bottom)"],
];

export default function SettingsCategoryPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const queryClient = useQueryClient();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const user = useAppStore((state) => state.user);
  const category = location.pathname.endsWith("/image-processing")
    ? "image-processing"
    : (params.category ?? "explore");
  const deviceId = getDeviceId();
  const deviceSpecific =
    category === "reading" && isDeviceSpecificEnabled(settings, deviceId);
  const displayedSettings =
    category === "reading"
      ? effectiveReaderSettings(settings, "", deviceId)
      : settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [jsCode, setJsCode] = useState("1 + 1");
  const [jsResult, setJsResult] = useState("");
  const [processing, setProcessing] = useState(
    String(settings.customImageProcessing ?? ""),
  );

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources,
    enabled: category === "explore",
  });
  const folders = useQuery({
    queryKey: ["favorite-folders"],
    queryFn: api.favoriteFolders,
    enabled: category === "local-favorites",
  });
  const cache = useQuery({
    queryKey: ["cache-size"],
    queryFn: api.cacheSize,
    enabled: category === "app",
  });
  const storage = useQuery({
    queryKey: ["storage-path"],
    queryFn: api.storagePath,
    enabled: category === "app",
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    enabled: category === "about",
  });

  useEffect(() => {
    setProcessing(String(settings.customImageProcessing ?? ""));
  }, [settings.customImageProcessing]);

  const save = async (key: string, value: unknown) => {
    try {
      const normalized =
        [
          "readerScreenPicNumberForPortrait",
          "readerScreenPicNumberForLandscape",
          "serverPrefetchImageCount",
          "cacheRetentionDays",
        ].includes(key) &&
        typeof value === "string" &&
        value.trim() !== ""
          ? Number(value)
          : value;
      if (
        category === "reading" &&
        deviceSpecific &&
        readerSettingKeys.has(key)
      ) {
        setSettings(
          await api.updateSettings({
            deviceSpecificSettings: withDeviceSpecificSetting(
              settings,
              deviceId,
              key,
              normalized,
            ),
          }),
        );
        return;
      }
      setSettings(await api.updateSettings({ [key]: normalized }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const runAction = async (action: string) => {
    try {
      switch (action) {
        case "export":
          await downloadUrl(backupExportUrl(), "venera-backup.zip");
          break;
        case "import":
          fileRef.current?.click();
          break;
        case "clear-cache":
          await api.clearCache();
          toast.success(t("Cache cleared"));
          queryClient.invalidateQueries({ queryKey: ["cache-size"] });
          break;
        case "refresh-library":
          await api.refreshLocalLibrary();
          toast.success(t("Refreshed"));
          queryClient.invalidateQueries({ queryKey: ["local-comics"] });
          break;
        case "reload-sources":
          await api.debugReload();
          toast.success(t("Configs reloaded"));
          break;
        case "open-logs":
          navigate("/settings/logs");
          break;
        case "check-update":
          toast.success(t("You are on the latest version"));
          break;
        case "delete-unavailable": {
          const result = await api.deleteUnavailableFavorites();
          toast.success(
            t("Deleted @count favorite items", { count: result.removed }),
          );
          queryClient.invalidateQueries({ queryKey: ["favorites"] });
          queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
          break;
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const importFile = async (file: File) => {
    try {
      const result = await importBackup(file);
      toast.success(t("Imported"));
      queryClient.invalidateQueries();
      void result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const items = buildItems(category);

  return (
    <>
      <PageHeader title={t(titles[category] ?? "Settings")} />
      <PageBody className="max-w-[900px]">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.venera,application/zip,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importFile(file);
            event.target.value = "";
          }}
        />
        {category === "image-processing" ? (
          <Card className="mb-4 border-warning/30 bg-warning/5 p-4">
            <p className="text-[13px] text-fg">
              Custom image processing scripts run in the original Flutter
              client. This server returns images unmodified; the script is
              stored for reference and for clients that support it.
            </p>
          </Card>
        ) : null}
        <Card className="divide-y divide-border">
          {items.map((item, index) => (
            <div key={`${item.kind}-${index}`} className="px-4 py-3.5">
              {item.kind === "switch" ? (
                <Row
                  label={t(item.label)}
                  hint={item.hint ? t(item.hint) : undefined}
                >
                  <Switch
                    checked={displayedSettings[item.key] === true}
                    onChange={(value) => save(item.key, value)}
                  />
                </Row>
              ) : item.kind === "select" ? (
                <Row
                  label={t(item.label)}
                  hint={item.hint ? t(item.hint) : undefined}
                >
                  <Select
                    value={String(displayedSettings[item.key] ?? "")}
                    onChange={(event) => save(item.key, event.target.value)}
                    className="w-[220px]"
                  >
                    {item.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.label)}
                      </option>
                    ))}
                  </Select>
                </Row>
              ) : item.kind === "slider" ? (
                <SliderRow
                  label={item.label}
                  value={Number(displayedSettings[item.key] ?? item.min)}
                  min={item.min}
                  max={item.max}
                  step={item.step ?? 1}
                  format={item.format}
                  onSave={(value) => save(item.key, value)}
                />
              ) : item.kind === "number" ? (
                <NumberRow
                  label={item.label}
                  hint={item.hint}
                  suffix={item.suffix}
                  value={Number(displayedSettings[item.key] ?? 0)}
                  onSave={(value) => save(item.key, value)}
                />
              ) : item.kind === "text" ? (
                <TextRow
                  label={item.label}
                  hint={item.hint}
                  placeholder={item.placeholder}
                  value={String(displayedSettings[item.key] ?? "")}
                  onSave={(value) => save(item.key, value)}
                />
              ) : item.kind === "link" ? (
                <Row
                  label={t(item.label)}
                  hint={item.hint ? t(item.hint) : undefined}
                >
                  {item.to.startsWith("http") ? (
                    <a
                      href={item.to}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-surface px-3 text-[13px] font-medium hover:bg-surface2"
                    >
                      {t("Open")}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(item.to)}
                    >
                      {t("Open")}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </Row>
              ) : item.kind === "action" ? (
                <Row
                  label={t(item.label)}
                  hint={item.hint ? t(item.hint) : undefined}
                >
                  <Button
                    size="sm"
                    variant={item.danger ? "danger" : "secondary"}
                    onClick={() => runAction(item.action)}
                  >
                    {item.action === "export"
                      ? "Export"
                      : item.action === "import"
                        ? "Import"
                        : "Run"}
                  </Button>
                </Row>
              ) : item.kind === "custom" &&
                item.key === "deviceSpecificSettings" ? (
                <DeviceSpecificRow
                  label={item.label}
                  hint={item.hint}
                  settings={settings}
                  deviceId={deviceId}
                  onSave={save}
                />
              ) : (
                <CustomRow
                  itemKey={item.key}
                  label={item.label}
                  hint={item.hint}
                  settings={settings}
                  sources={sources.data?.items ?? []}
                  folders={folders.data?.items ?? []}
                  cacheBytes={cache.data?.bytes}
                  storagePath={storage.data?.path}
                  serverVersion={health.data?.version}
                  jsCode={jsCode}
                  setJsCode={setJsCode}
                  jsResult={jsResult}
                  processing={processing}
                  setProcessing={setProcessing}
                  onSave={save}
                  onRunJs={async () => {
                    try {
                      const result = await api.debugEval(jsCode);
                      setJsResult(JSON.stringify(result.result, null, 2));
                    } catch (error) {
                      setJsResult(
                        error instanceof Error ? error.message : String(error),
                      );
                    }
                  }}
                  onImport={() => fileRef.current?.click()}
                />
              )}
            </div>
          ))}
        </Card>
        {category === "about" ? (
          <p className="mt-4 text-center text-[11px] text-muted">
            Venera Prime Server {health.data?.version ?? ""} · signed in as{" "}
            {user?.username}
          </p>
        ) : null}
      </PageBody>
    </>
  );
}

function DeviceSpecificRow({
  label,
  hint,
  settings,
  deviceId,
  onSave,
}: {
  label: string;
  hint?: string;
  settings: Record<string, unknown>;
  deviceId: string;
  onSave: (key: string, value: unknown) => void;
}) {
  const t = useT();
  const enabled = isDeviceSpecificEnabled(settings, deviceId);
  return (
    <div className="flex flex-col gap-2">
      <Row label={t(label)} hint={hint ? t(hint) : undefined}>
        <Switch
          checked={enabled}
          onChange={(value) =>
            onSave(
              "deviceSpecificSettings",
              withDeviceSpecificSetting(settings, deviceId, "enabled", value),
            )
          }
        />
      </Row>
      {enabled ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() =>
            onSave(
              "deviceSpecificSettings",
              withoutDeviceSpecificSettings(settings, deviceId),
            )
          }
        >
          {t("Clear specific reader settings for this device")}
        </Button>
      ) : null}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{t(label)}</p>
        {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onSave,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onSave: (value: number) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium">{t(label)}</p>
        <span className="text-[12px] tabular text-muted">
          {format ? format(draft) : draft}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => onSave(draft)}
        onKeyUp={() => onSave(draft)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-[rgb(var(--accent))]"
      />
    </div>
  );
}

function NumberRow({
  label,
  hint,
  suffix,
  value,
  onSave,
}: {
  label: string;
  hint?: string;
  suffix?: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Row label={t(label)} hint={hint ? t(hint) : undefined}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onSave(Number(draft) || 0)}
          className="w-24 text-right"
        />
        {suffix ? (
          <span className="text-[12px] text-muted">{suffix}</span>
        ) : null}
      </div>
    </Row>
  );
}

function TextRow({
  label,
  hint,
  placeholder,
  value,
  onSave,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label={t(label)} hint={hint ? t(hint) : undefined}>
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onSave(draft)}
      />
    </Field>
  );
}

function CustomRow({
  itemKey,
  label,
  hint,
  settings,
  sources,
  folders,
  cacheBytes,
  storagePath,
  serverVersion,
  jsCode,
  setJsCode,
  jsResult,
  processing,
  setProcessing,
  onSave,
  onRunJs,
  onImport,
}: {
  itemKey: string;
  label: string;
  hint?: string;
  settings: Record<string, unknown>;
  sources: { key: string; name: string }[];
  folders: { id: number; name: string }[];
  cacheBytes?: number;
  storagePath?: string;
  serverVersion?: string;
  jsCode: string;
  setJsCode: (value: string) => void;
  jsResult: string;
  processing: string;
  setProcessing: (value: string) => void;
  onSave: (key: string, value: unknown) => void;
  onRunJs: () => void;
  onImport: () => void;
}) {
  const t = useT();
  if (itemKey === "defaultSearchTarget") {
    return (
      <Field label={t(label)} hint={hint ? t(hint) : undefined}>
        <Select
          value={String(settings.defaultSearchTarget ?? "")}
          onChange={(event) =>
            onSave("defaultSearchTarget", event.target.value || null)
          }
        >
          <option value="">{t("Default")}</option>
          <option value="_aggregated_">{t("Aggregated")}</option>
          {sources.map((source) => (
            <option key={source.key} value={source.key}>
              {source.name}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (itemKey === "quickFavorite") {
    return (
      <Field label={t(label)} hint={hint ? t(hint) : undefined}>
        <Select
          value={String(settings.quickFavorite ?? "")}
          onChange={(event) =>
            onSave("quickFavorite", event.target.value || null)
          }
        >
          <option value="">{t("None")}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.name}>
              {folder.name}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (itemKey === "cacheInfo") {
    return (
      <Row label={t(label)} hint={hint ? t(hint) : undefined}>
        <span className="text-[13px] tabular text-muted">
          {cacheBytes === undefined ? "…" : formatBytes(cacheBytes)}
        </span>
      </Row>
    );
  }
  if (itemKey === "storagePath") {
    return (
      <Row label={t(label)} hint={hint ? t(hint) : undefined}>
        <div className="flex items-center gap-2">
          <code className="rounded bg-surface2 px-2 py-1 text-[11px] text-muted">
            {storagePath ?? "…"}
          </code>
          <Button
            size="sm"
            variant="ghost"
            disabled={!storagePath}
            onClick={() =>
              storagePath
                ? copyText(storagePath).then(() => toast.success(t("Copied")))
                : undefined
            }
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Row>
    );
  }
  if (itemKey === "serverVersion") {
    return (
      <Row label={t(label)} hint={hint ? t(hint) : undefined}>
        <span className="text-[13px] tabular text-muted">
          {serverVersion ?? "…"}
        </span>
      </Row>
    );
  }
  if (itemKey === "jsEvaluator") {
    return (
      <div>
        <p className="mb-2 text-[13px] font-medium">{t(label)}</p>
        <Textarea
          value={jsCode}
          onChange={(event) => setJsCode(event.target.value)}
          className="min-h-[120px] font-mono text-[12px]"
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" onClick={onRunJs}>
            <Play className="h-3.5 w-3.5" /> {t("Run")}
          </Button>
        </div>
        {jsResult ? (
          <pre className="mt-2 max-h-60 overflow-auto rounded bg-surface2 p-3 text-[11px]">
            {jsResult}
          </pre>
        ) : null}
      </div>
    );
  }
  if (itemKey === "imageProcessing") {
    return (
      <div>
        <p className="mb-2 text-[13px] font-medium">{t(label)}</p>
        <Textarea
          value={processing}
          onChange={(event) => setProcessing(event.target.value)}
          className="min-h-[240px] font-mono text-[12px]"
        />
        <Button
          size="sm"
          variant="primary"
          className="mt-2"
          onClick={() => onSave("customImageProcessing", processing)}
        >
          {t("Save")}
        </Button>
      </div>
    );
  }
  if (itemKey === "importBackup") {
    return (
      <Row label={t(label)} hint={hint ? t(hint) : undefined}>
        <Button size="sm" variant="secondary" onClick={onImport}>
          {t("Import")}
        </Button>
      </Row>
    );
  }
  if (itemKey === "deleteUnavailable") {
    return (
      <Row label={t(label)} hint={hint ? t(hint) : undefined}>
        <Button
          size="sm"
          variant="danger"
          onClick={() => onSave("__noop", null)}
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("Delete")}
        </Button>
      </Row>
    );
  }
  return null;
}

function buildItems(category: string): Item[] {
  const commonLanguage = {
    kind: "select" as const,
    key: "language",
    label: "Language",
    options: [
      { value: "system", label: "System" },
      { value: "zh-CN", label: "简体中文" },
      { value: "zh-TW", label: "繁體中文" },
      { value: "en-US", label: "English" },
    ],
  };

  switch (category) {
    case "explore":
      return [
        {
          kind: "select",
          key: "comicDisplayMode",
          label: "Display mode of comic tile",
          options: [
            { value: "detailed", label: "Detailed" },
            { value: "brief", label: "Brief" },
          ],
        },
        {
          kind: "slider",
          key: "comicTileScale",
          label: "Size of comic tile",
          min: 0.5,
          max: 1.5,
          step: 0.05,
          format: (value) => `${value.toFixed(2)}x`,
        },
        {
          kind: "switch",
          key: "showFavoriteStatusOnTile",
          label: "Show favorite status on comic tile",
        },
        {
          kind: "switch",
          key: "showHistoryStatusOnTile",
          label: "Show history on comic tile",
        },
        {
          kind: "switch",
          key: "reverseChapterOrder",
          label: "Reverse default chapter order",
        },
        {
          kind: "custom",
          key: "defaultSearchTarget",
          label: "Default Search Target",
        },
        {
          kind: "select",
          key: "autoAddLanguageFilter",
          label: "Auto Language Filters",
          options: [
            { value: "none", label: "None" },
            { value: "chinese", label: "Chinese" },
            { value: "english", label: "English" },
            { value: "japanese", label: "Japanese" },
          ],
        },
        {
          kind: "select",
          key: "initialPage",
          label: "Initial Page",
          options: [
            { value: "0", label: "Home" },
            { value: "1", label: "Favorites" },
            { value: "2", label: "Explore" },
            { value: "3", label: "Categories" },
          ],
        },
        {
          kind: "select",
          key: "comicListDisplayMode",
          label: "Display mode of comic list",
          options: [
            { value: "paging", label: "Paging" },
            { value: "continuous", label: "Continuous" },
          ],
        },
        { kind: "link", label: "Explore Pages", to: "/settings/explore-pages" },
        {
          kind: "link",
          label: "Category Pages",
          to: "/settings/category-pages",
        },
        {
          kind: "link",
          label: "Network Favorite Pages",
          to: "/settings/favorites-pages",
        },
        {
          kind: "link",
          label: "Search Sources",
          to: "/settings/search-sources",
        },
        {
          kind: "link",
          label: "Keyword blocking",
          to: "/settings/blocked-words",
        },
        {
          kind: "link",
          label: "Comment keyword blocking",
          to: "/settings/blocked-comments",
        },
      ];
    case "reading":
      return [
        {
          kind: "custom",
          key: "deviceSpecificSettings",
          label: "Enable device specific settings",
          hint: "Reader changes apply only to this browser until cleared.",
        },
        {
          kind: "select",
          key: "readerMode",
          label: "Reading mode",
          options: readerModes.map(([value, label]) => ({ value, label })),
        },
        {
          kind: "switch",
          key: "readerTwoPageSpread",
          label: "Two-page spread",
        },
        {
          kind: "switch",
          key: "readerPageMarginEnabled",
          label: "Page margin",
        },
        {
          kind: "slider",
          key: "readerPageMarginPercent",
          label: "Page margin size",
          min: 0,
          max: 40,
          step: 0.5,
          format: (value) => `${value}%`,
        },
        {
          kind: "select",
          key: "readerScreenPicNumberForPortrait",
          label: "Images per screen (portrait)",
          options: [1, 2, 3, 4, 5].map((value) => ({
            value: String(value),
            label: String(value),
          })),
        },
        {
          kind: "select",
          key: "readerScreenPicNumberForLandscape",
          label: "Images per screen (landscape)",
          options: [1, 2, 3, 4, 5].map((value) => ({
            value: String(value),
            label: String(value),
          })),
        },
        {
          kind: "switch",
          key: "enableTapToTurnPages",
          label: "Tap to turn Pages",
        },
        {
          kind: "switch",
          key: "reverseTapToTurnPages",
          label: "Reverse tap to turn Pages",
        },
        { kind: "switch", key: "enablePageAnimation", label: "Page animation" },
        {
          kind: "switch",
          key: "flashWhiteScreenOnPageTurn",
          label: "Flash white screen on page turn",
        },
        {
          kind: "slider",
          key: "autoPageTurningInterval",
          label: "Auto page turning interval",
          min: 1,
          max: 20,
          format: (value) => `${value}s`,
        },
        {
          kind: "switch",
          key: "showSingleImageOnFirstPage",
          label: "Show single image on first page",
        },
        {
          kind: "slider",
          key: "readerScrollSpeed",
          label: "Mouse scroll speed",
          min: 0.5,
          max: 3,
          step: 0.1,
          format: (value) => value.toFixed(1),
        },
        {
          kind: "switch",
          key: "enableDoubleTapToZoom",
          label: "Double tap to zoom",
        },
        {
          kind: "switch",
          key: "enableLongPressToZoom",
          label: "Long press to zoom",
        },
        {
          kind: "select",
          key: "longPressZoomPosition",
          label: "Long press zoom position",
          options: [
            { value: "press", label: "Press position" },
            { value: "center", label: "Screen center" },
          ],
        },
        { kind: "switch", key: "limitImageWidth", label: "Limit image width" },
        {
          kind: "switch",
          key: "enableTurnPageByVolumeKey",
          label: "Turn page by volume keys",
        },
        {
          kind: "switch",
          key: "enableClockAndBatteryInfoInReader",
          label: "Display time & battery info in reader",
        },
        {
          kind: "switch",
          key: "showSystemStatusBar",
          label: "Show system status bar",
        },
        {
          kind: "select",
          key: "quickCollectImage",
          label: "Quick collect image",
          options: [
            { value: "No", label: "Not enable" },
            { value: "DoubleTap", label: "Double Tap" },
            { value: "Swipe", label: "Swipe" },
          ],
        },
        {
          kind: "slider",
          key: "preloadImageCount",
          label: "Number of images preloaded",
          min: 1,
          max: 16,
        },
        {
          kind: "select",
          key: "serverPrefetchImageCount",
          label: "Server chapter prefetch",
          options: [
            { value: "0", label: "Off" },
            { value: "10", label: "10" },
            { value: "20", label: "20" },
            { value: "30", label: "30" },
            { value: "50", label: "50" },
            { value: "100", label: "100" },
            { value: "-1", label: "Whole chapter" },
          ],
        },
        {
          kind: "switch",
          key: "showPageNumberInReader",
          label: "Show Page Number",
        },
        {
          kind: "switch",
          key: "removeReadLaterOnComplete",
          label: "Remove from Read Later when complete",
        },
        {
          kind: "switch",
          key: "showChapterComments",
          label: "Show Chapter Comments",
        },
        {
          kind: "switch",
          key: "showChapterCommentsAtEnd",
          label: "Show Comments at Chapter End",
        },
        {
          kind: "switch",
          key: "hideDuplicateChapters",
          label: "Hide Duplicate Chapters",
        },
        {
          kind: "select",
          key: "readerBackground",
          label: "Reader background",
          options: [
            { value: "theme", label: "Theme" },
            { value: "white", label: "White" },
            { value: "gray", label: "Gray" },
            { value: "black", label: "Black" },
            { value: "sepia", label: "Sepia" },
          ],
        },
        {
          kind: "select",
          key: "readerNightMode",
          label: "Night mode",
          options: [
            { value: "none", label: "Off" },
            { value: "warm", label: "Warm" },
            { value: "dark", label: "Dark" },
            { value: "red", label: "Red" },
          ],
        },
        {
          kind: "slider",
          key: "readerNightModeIntensity",
          label: "Night mode intensity",
          min: 0,
          max: 0.8,
          step: 0.05,
          format: (value) => value.toFixed(2),
        },
        {
          kind: "select",
          key: "readerOrientationBehavior",
          label: "Reader screen orientation behavior",
          options: [
            {
              value: "keepAfterExit",
              label: "Keep rotation after leaving reader",
            },
            {
              value: "sessionOnly",
              label: "Restore pre-rotation state after leaving reader",
            },
            { value: "rememberGlobally", label: "Remember for all comics" },
            {
              value: "rememberPerComic",
              label: "Remember separately for each comic",
            },
          ],
        },
        {
          kind: "switch",
          key: "enableCustomImageProcessing",
          label: "Custom Image Processing",
        },
        {
          kind: "link",
          label: "Edit image processing script",
          to: "/settings/reading/image-processing",
        },
      ];
    case "appearance":
      return [
        {
          kind: "select",
          key: "theme_mode",
          label: "Theme Mode",
          options: [
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ],
        },
        {
          kind: "select",
          key: "color",
          label: "Theme Color",
          options: [
            { value: "system", label: "System" },
            { value: "red", label: "Red" },
            { value: "pink", label: "Pink" },
            { value: "purple", label: "Purple" },
            { value: "green", label: "Green" },
            { value: "orange", label: "Orange" },
            { value: "blue", label: "Blue" },
          ],
        },
        { kind: "link", label: "Customize home", to: "/settings/home-layout" },
        commonLanguage,
      ];
    case "local-favorites":
      return [
        {
          kind: "switch",
          key: "localFavoritesFirst",
          label: "Show local favorites before network favorites",
        },
        {
          kind: "switch",
          key: "autoCloseFavoritePanel",
          label: "Auto close favorite panel after operation",
        },
        {
          kind: "select",
          key: "favoriteFolderTitleAction",
          label: "Tap favorite folder name",
          options: [
            { value: "openSidebar", label: "Open folder sidebar" },
            {
              value: "returnToOverview",
              label: "Return to favorites overview",
            },
          ],
        },
        {
          kind: "select",
          key: "newFavoriteAddTo",
          label: "Add new favorite to",
          options: [
            { value: "start", label: "Start" },
            { value: "end", label: "End" },
          ],
        },
        {
          kind: "select",
          key: "moveFavoriteAfterRead",
          label: "Move favorite after reading",
          options: [
            { value: "none", label: "None" },
            { value: "end", label: "End" },
            { value: "start", label: "Start" },
          ],
        },
        { kind: "custom", key: "quickFavorite", label: "Quick Favorite" },
        {
          kind: "select",
          key: "onClickFavorite",
          label: "Click favorite",
          options: [
            { value: "viewDetail", label: "View Detail" },
            { value: "read", label: "Read" },
          ],
        },
        {
          kind: "action",
          label: "Delete all unavailable local favorite items",
          action: "delete-unavailable",
          danger: true,
        },
      ];
    case "app":
      return [
        {
          kind: "switch",
          key: "showBackgroundTaskButton",
          label: "Floating task button",
        },
        { kind: "link", label: "Background tasks", to: "/tasks" },
        { kind: "custom", key: "cacheInfo", label: "Cache Size" },
        { kind: "action", label: "Clear Cache", action: "clear-cache" },
        { kind: "custom", key: "storagePath", label: "Storage path" },
        {
          kind: "number",
          key: "cacheSize",
          label: "Cache Limit",
          suffix: "MB",
        },
        {
          kind: "select",
          key: "cacheRetentionDays",
          label: "Keep unused cache",
          options: [
            { value: "0", label: "Never" },
            { value: "1", label: "1 day" },
            { value: "3", label: "3 days" },
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
          ],
        },
        commonLanguage,
        {
          kind: "switch",
          key: "convertTraditionalToSimplified",
          label: "Convert Traditional Chinese to Simplified",
        },
        {
          kind: "switch",
          key: "recordReadingStatistics",
          label: "Record reading statistics",
        },
        { kind: "link", label: "Reading statistics", to: "/statistics" },
        { kind: "link", label: "Data Sync", to: "/settings/webdav" },
        { kind: "action", label: "Export App Data", action: "export" },
        { kind: "custom", key: "importBackup", label: "Import App Data" },
        {
          kind: "action",
          label: "Refresh local library",
          action: "refresh-library",
        },
        {
          kind: "switch",
          key: "authorizationRequired",
          label: "Authorization Required",
        },
      ];
    case "network":
      return [
        {
          kind: "text",
          key: "proxy",
          label: "Proxy",
          hint: "system, direct, or host:port (optionally user:pass@host:port)",
          placeholder: "system",
        },
        {
          kind: "switch",
          key: "enableDnsOverrides",
          label: "Enable DNS Overrides",
        },
        { kind: "switch", key: "sni", label: "Server Name Indication" },
        {
          kind: "slider",
          key: "downloadThreads",
          label: "Download Threads",
          min: 1,
          max: 16,
        },
        {
          kind: "switch",
          key: "ignoreBadCertificate",
          label: "Ignore Certificate Errors",
        },
      ];
    case "about":
      return [
        { kind: "custom", key: "serverVersion", label: "Server version" },
        {
          kind: "switch",
          key: "checkUpdateOnStart",
          label: "Check for updates on startup",
        },
        {
          kind: "switch",
          key: "autoUpdateComicSources",
          label: "Automatically update comic sources",
        },
        { kind: "action", label: "Check for updates", action: "check-update" },
        {
          kind: "link",
          label: "GitHub",
          to: "https://github.com/venera-app/venera-prime",
        },
        {
          kind: "link",
          label: "Telegram group chat",
          to: "https://t.me/venera_app",
        },
      ];
    case "debug":
      return [
        { kind: "action", label: "Reload Configs", action: "reload-sources" },
        { kind: "action", label: "Open Log", action: "open-logs" },
        {
          kind: "switch",
          key: "ignoreBadCertificate",
          label: "Ignore Certificate Errors",
        },
        { kind: "custom", key: "jsEvaluator", label: "JS Evaluator" },
      ];
    case "image-processing":
      return [
        { kind: "switch", key: "enableCustomImageProcessing", label: "Enable" },
        { kind: "custom", key: "imageProcessing", label: "Script" },
      ];
    default:
      return [];
  }
}
