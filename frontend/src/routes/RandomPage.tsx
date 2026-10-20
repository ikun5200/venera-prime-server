import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shuffle } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { HistoryItem } from "../lib/types";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, Card, Field, Select } from "../components/ui";
import { comicPath } from "../lib/links";

export default function RandomPage() {
  const t = useT();
  const navigate = useNavigate();
  const folders = useQuery({
    queryKey: ["favorite-folders"],
    queryFn: api.favoriteFolders,
  });
  const [from, setFrom] = useState<"favorites" | "history" | "local">(
    "favorites",
  );
  const [folderId, setFolderId] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState("any");
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    setLoading(true);
    try {
      let candidates: { sourceKey: string; id: string; localId?: number }[] =
        [];
      if (from === "favorites") {
        const result = await api.favorites({
          folderId,
          status:
            status === "any"
              ? undefined
              : status === "inProgress"
                ? "uncompleted"
                : status,
          page: 1,
        });
        candidates = result.items.map((item) => ({
          sourceKey: item.sourceKey ?? "",
          id: item.id,
        }));
      } else if (from === "history") {
        const result = await api.history({ page: 1 });
        candidates = result.items
          .filter((item: HistoryItem) => {
            if (status === "any") return true;
            const max = item.maxPage ?? 0;
            const completed = max > 0 && item.page >= max;
            if (status === "completed") return completed;
            if (status === "notStarted") return item.page <= 1;
            return !completed;
          })
          .map((item) => ({ sourceKey: item.sourceKey, id: item.id }));
      } else {
        const result = await api.localComics();
        candidates = result.items.map((item) => ({
          sourceKey: "local",
          id: String(item.id),
          localId: item.id,
        }));
      }
      if (candidates.length === 0) {
        toast.error(t("No random comic candidate"));
        return;
      }
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      if (chosen.sourceKey === "local" && chosen.localId) {
        navigate(`/reader/local/${chosen.localId}`);
      } else {
        navigate(comicPath(chosen.sourceKey, chosen.id));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title={t("Random comic")} />
      <PageBody className="max-w-[560px]">
        <Card className="flex flex-col gap-4 p-5">
          <Field label={t("From")}>
            <Select
              value={from}
              onChange={(event) => setFrom(event.target.value as typeof from)}
            >
              <option value="favorites">{t("Favorites")}</option>
              <option value="history">{t("History")}</option>
              <option value="local">{t("Local")}</option>
            </Select>
          </Field>
          {from === "favorites" ? (
            <Field label={t("Folder")}>
              <Select
                value={folderId ?? ""}
                onChange={(event) =>
                  setFolderId(
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
              >
                <option value="">{t("All")}</option>
                {(folders.data?.items ?? []).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t("Status")}>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="any">{t("Any")}</option>
              <option value="notStarted">{t("Not started")}</option>
              <option value="inProgress">{t("In progress")}</option>
              <option value="completed">{t("Completed")}</option>
            </Select>
          </Field>
          <Button variant="primary" size="lg" loading={loading} onClick={pick}>
            <Shuffle className="h-4 w-4" /> {t("Pick")}
          </Button>
        </Card>
      </PageBody>
    </>
  );
}
