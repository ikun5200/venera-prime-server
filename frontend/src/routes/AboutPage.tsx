import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Github, RefreshCw, Send } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Badge, Button, Card, Modal, Spinner } from "../components/ui";

interface Release {
  tag_name: string;
  html_url: string;
  body: string;
  published_at: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export default function AboutPage() {
  const t = useT();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const [checking, setChecking] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);

  const currentVersion = String(health.data?.version ?? "2.6.3");

  const checkUpdate = async () => {
    setChecking(true);
    setRelease(null);
    try {
      const response = await fetch(
        "https://api.github.com/repos/ikun5200/venera-prime-server/releases/latest",
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }
      const data = (await response.json()) as Release;
      if (!data?.tag_name) throw new Error("No release found");
      if (compareVersions(data.tag_name, currentVersion) <= 0) {
        toast.success(t("You are on the latest version"));
      } else {
        setRelease(data);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <PageHeader title={t("About")} />
      <PageBody className="max-w-[700px]">
        <Card className="mb-4 flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-card bg-accent text-2xl font-bold text-white">
            V
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold">
              {t("Venera Prime Server")}
            </h1>
            <p className="text-[12px] text-muted">
              Multi-user web comic reader · server {currentVersion}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone="success">{t("Online")}</Badge>
              <Badge>Uptime {health.data?.uptime ?? 0}s</Badge>
              <Badge>
                {health.data?.initialized ? "Initialized" : "Not initialized"}
              </Badge>
            </div>
          </div>
        </Card>

        <Card className="mb-4 p-4">
          <h2 className="mb-2 text-[15px] font-semibold">{t("Features")}</h2>
          <ul className="grid grid-cols-1 gap-1 text-[13px] text-muted sm:grid-cols-2">
            <li>• Multi-user accounts and isolation</li>
            <li>• JavaScript comic sources (QuickJS)</li>
            <li>• Search, explore, categories and ranking</li>
            <li>• Favorites, history, read later, statistics</li>
            <li>• Server-side downloads and local library</li>
            <li>• Upload, CBZ/PDF/EPUB export</li>
            <li>• WebDAV backup and restore</li>
            <li>• Reader: gallery and continuous modes</li>
          </ul>
        </Card>

        <Card className="mb-4 p-4">
          <h2 className="mb-3 text-[15px] font-semibold">{t("Links")}</h2>
          <div className="flex flex-col gap-2">
            <a
              className="flex items-center gap-2 text-[13px] text-accent hover:underline"
              href="https://github.com/venera-app/venera-prime"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-4 w-4" />{" "}
              {t("Original Venera Prime project")}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              className="flex items-center gap-2 text-[13px] text-accent hover:underline"
              href="https://t.me/venera_app"
              target="_blank"
              rel="noreferrer"
            >
              <Send className="h-4 w-4" /> {t("Telegram group chat")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>

        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[13px] font-medium">{t("Check for updates")}</p>
            <p className="text-[11px] text-muted">
              {t(
                "Server updates are deployed by pulling a new container image.",
              )}
            </p>
          </div>
          <Button size="sm" onClick={checkUpdate} loading={checking}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("Check")}
          </Button>
        </Card>

        <p className="mt-6 text-center text-[11px] text-muted">
          Original app © venera-app contributors. This server port keeps the
          original labels and behavior; see README for deployment details.
        </p>
      </PageBody>

      <Modal
        open={release !== null}
        onClose={() => setRelease(null)}
        title={`New version ${release?.tag_name ?? ""} available`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRelease(null)}>
              {t("Close")}
            </Button>
            {release ? (
              <a
                href={release.html_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setRelease(null)}
              >
                <Button variant="primary">
                  {t("Open release page")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            ) : null}
          </>
        }
      >
        {release ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-muted">
              {t("Released")}{" "}
              {new Date(release.published_at).toLocaleDateString("zh-CN")} ·
              current {currentVersion}
            </p>
            <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded bg-surface2 p-3 text-[12px]">
              {release.body || "No release notes."}
            </pre>
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </Modal>
    </>
  );
}
