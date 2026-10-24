import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, RefreshCw, Search } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { CatalogEntry } from "../lib/types";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Spinner,
} from "../components/ui";

export default function SourceLibraryPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = "" } = useParams();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["library-catalog", id],
    queryFn: () => api.libraryCatalog(id),
  });
  const install = useMutation({
    mutationFn: (entry: CatalogEntry) =>
      api.installLibraryEntry(id, {
        url: entry.url ?? undefined,
        entryId: entry.id,
      }),
    onSuccess: (result, entry) => {
      toast.success(
        entry.installed ? t("Updated") : t("Installed"),
      );
      queryClient.invalidateQueries({
        queryKey: ["library-catalog", id],
      });
      navigate(`/sources/${result.source.key}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const entries = (query.data?.items ?? []).filter((entry) =>
    search
      ? `${entry.name} ${entry.description}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true,
  );

  return (
    <>
      <PageHeader
        title={query.data?.library.name ?? t("Source libraries")}
        subtitle={query.data?.library.url}
      />
      <PageBody>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search")}
            className="pl-9"
          />
        </div>
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : query.isError ? (
          <EmptyState
            title={t("Error")}
            description={
              query.error instanceof Error
                ? query.error.message
                : String(query.error)
            }
            action={
              <Button onClick={() => query.refetch()}>{t("Retry")}</Button>
            }
          />
        ) : entries.length === 0 ? (
          <EmptyState title={t("No data")} />
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <Card
                key={`${entry.id}-${entry.url}`}
                className="flex items-center gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-medium">
                      {entry.name}
                    </p>
                    {entry.installed ? (
                      <Badge tone={entry.updateAvailable ? "warning" : "success"}>
                        {entry.updateAvailable
                          ? t("Update available")
                          : t("Installed")}
                      </Badge>
                    ) : entry.version ? (
                      <Badge>v{entry.version}</Badge>
                    ) : null}
                  </div>
                  {entry.installed && entry.installedVersion ? (
                    <p className="mt-0.5 text-[11px] text-muted">
                      {t("Installed version @version", {
                        version: entry.installedVersion,
                      })}
                    </p>
                  ) : null}
                  {entry.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">
                      {entry.description}
                    </p>
                  ) : null}
                </div>
                {entry.installed ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!entry.url}
                    loading={
                      install.isPending && install.variables?.id === entry.id
                    }
                    onClick={() => install.mutate(entry)}
                  >
                    {entry.updateAvailable ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {entry.updateAvailable ? t("Update") : t("Reinstall")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!entry.url}
                    loading={
                      install.isPending && install.variables?.id === entry.id
                    }
                    onClick={() => install.mutate(entry)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("Install")}
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
