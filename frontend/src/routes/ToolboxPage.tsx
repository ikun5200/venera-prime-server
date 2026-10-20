import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Link2, Search } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, Card, Field, Input } from "../components/ui";

export default function ToolboxPage() {
  const t = useT();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");

  const resolve = useMutation({
    mutationFn: () => api.resolveLink(url.trim()),
    onSuccess: (result) => {
      if (result.result) {
        navigate(`/comic/${result.result.source}/${result.result.comicId}`);
      } else {
        toast.error(t("No matching source for this link"));
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const tools = [
    {
      name: "Image search [Search by Image Bot]",
      url: "https://t.me/SearchByImageBot",
      description: t("Find the source of an image in Telegram."),
    },
    {
      name: "Image search [SauceNAO]",
      url: "https://saucenao.com/",
      description: t("Reverse image search for artwork."),
    },
  ];

  return (
    <>
      <PageHeader title={t("Toolbox")} />
      <PageBody className="max-w-[800px]">
        <Card className="mb-4 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Link2 className="h-4 w-4" /> {t("Open comic link")}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field
                label={t("Comic URL")}
                hint={t("The link is matched against installed sources.")}
              >
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://mangadex.org/title/..."
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && url.trim()) resolve.mutate();
                  }}
                />
              </Field>
            </div>
            <Button
              variant="primary"
              loading={resolve.isPending}
              disabled={!url.trim()}
              onClick={() => resolve.mutate()}
            >
              <Search className="h-4 w-4" /> {t("Open")}
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          {tools.map((tool) => (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <Card className="flex items-center gap-3 p-4 transition-colors hover:border-accent/40 hover:bg-accent/5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{tool.name}</p>
                  <p className="text-[12px] text-muted">{tool.description}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted" />
              </Card>
            </a>
          ))}
        </div>

        <p className="mt-6 text-[12px] text-muted">
          The in-app webview is not available in the server build. Links open in
          a new browser tab.
        </p>
      </PageBody>
    </>
  );
}
