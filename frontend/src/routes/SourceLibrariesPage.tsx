import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderGit2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { formatDate } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  Spinner,
  Switch,
} from "../components/ui";

export default function SourceLibrariesPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["source-libraries"],
    queryFn: api.libraries,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.addLibrary(name || url, url),
    onSuccess: () => {
      toast.success(t("Added"));
      setAddOpen(false);
      setName("");
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["source-libraries"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const patch = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patchLibrary(id, { enabled }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["source-libraries"] }),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteLibrary(id),
    onSuccess: () => {
      toast.success(t("Source library removed"));
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["source-libraries"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const libraries = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t("Source libraries")}
        subtitle={`${libraries.length} libraries`}
        actions={
          <IconButton label={t("Add library")} onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
          </IconButton>
        }
      />
      <PageBody>
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : libraries.length === 0 ? (
          <EmptyState
            title={t("No source libraries")}
            description={t("Add a catalog URL to install and update sources.")}
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                {t("Add library")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {libraries.map((library) => (
              <Card key={library.id} className="flex items-center gap-3 p-3.5">
                <FolderGit2 className="h-5 w-5 shrink-0 text-muted" />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/sources/libraries/${library.id}`)}
                >
                  <p className="truncate text-[14px] font-medium">
                    {library.name}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {library.url}
                  </p>
                  <p className="text-[10px] text-muted">
                    Last checked:{" "}
                    {library.lastChecked
                      ? formatDate(library.lastChecked)
                      : "Never"}
                  </p>
                </button>
                <Badge tone={library.enabled ? "success" : "warning"}>
                  {library.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={library.enabled}
                  onChange={(enabled) =>
                    patch.mutate({ id: library.id, enabled })
                  }
                />
                <Menu
                  trigger={({ onClick, ...rest }) => (
                    <IconButton label={t("More")} onClick={onClick} {...rest}>
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  )}
                  items={[
                    {
                      label: t("View source catalog"),
                      onSelect: () =>
                        navigate(`/sources/libraries/${library.id}`),
                    },
                    {
                      label: t("Delete library"),
                      danger: true,
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      onSelect: () => setDeleteId(library.id),
                    },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("Add library")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={add.isPending}
              disabled={!url.trim()}
              onClick={() => add.mutate()}
            >
              {t("Add")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t("Library name")}>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("My sources")}
            />
          </Field>
          <Field label={t("Catalog URL")}>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/index.json"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={t("Delete library")}
        message="Installed sources are kept."
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => deleteId && remove.mutate(deleteId)}
      />
    </>
  );
}
