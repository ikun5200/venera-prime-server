import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { ApiTokenInfo } from "../lib/types";
import { copyText, formatDate } from "../lib/utils";
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
  Modal,
  Select,
  Spinner,
} from "../components/ui";

export default function TokensPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["tokens"], queryFn: api.tokens });
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("0");
  const [created, setCreated] = useState<ApiTokenInfo | null>(null);
  const [deleteToken, setDeleteToken] = useState<ApiTokenInfo | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createToken({
        name: name.trim(),
        expiresInDays: Number(expiresInDays) || undefined,
      }),
    onSuccess: (result) => {
      setCreated(result.token);
      setName("");
      setExpiresInDays("0");
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteToken(id),
    onSuccess: () => {
      toast.success(t("Deleted"));
      setDeleteToken(null);
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const tokens = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t("API Tokens")}
        subtitle={t("Use tokens for OPDS readers and scripts.")}
      />
      <PageBody className="max-w-[760px]">
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <Field label={t("Token name")}>
              <Input
                value={name}
                placeholder="KOReader"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label={t("Expires")}>
              <Select
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
              >
                <option value="0">{t("Never")}</option>
                <option value="30">{t("30 days")}</option>
                <option value="90">{t("90 days")}</option>
                <option value="365">{t("365 days")}</option>
              </Select>
            </Field>
            <Button
              variant="primary"
              disabled={!name.trim()}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              <Plus className="h-4 w-4" /> {t("Create")}
            </Button>
          </div>
        </Card>

        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : tokens.length === 0 ? (
          <EmptyState
            title={t("No tokens yet")}
            description={t(
              "Create a token to read the library from an OPDS client.",
            )}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((token) => (
              <Card key={token.id} className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface2 text-muted">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-medium">
                      {token.name}
                    </p>
                    {token.expiresAt ? (
                      <Badge tone="warning">
                        {t("Expires @time", {
                          time: formatDate(token.expiresAt),
                        })}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t("Never")}</Badge>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted">
                    {t("Created @time", { time: formatDate(token.createdAt) })}
                    {token.lastUsedAt
                      ? ` · ${t("Last used @time", {
                          time: formatDate(token.lastUsedAt),
                        })}`
                      : ""}
                  </p>
                </div>
                <IconButton
                  label={t("Delete")}
                  className="hover:text-danger"
                  onClick={() => setDeleteToken(token)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={created !== null}
        onClose={() => setCreated(null)}
        title={t("Token created")}
        footer={
          <Button variant="primary" onClick={() => setCreated(null)}>
            {t("Done")}
          </Button>
        }
      >
        <p className="mb-2 text-[12px] text-muted">
          {t("This token is shown only once. Store it somewhere safe.")}
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={created?.token ?? ""} className="font-mono" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              created?.token &&
              copyText(created.token).then(() => toast.success(t("Copied")))
            }
          >
            <Copy className="h-3.5 w-3.5" /> {t("Copy")}
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          {t(
            "Use it as a Bearer token or as the password of an OPDS Basic Auth login.",
          )}
        </p>
      </Modal>

      <ConfirmDialog
        open={deleteToken !== null}
        onClose={() => setDeleteToken(null)}
        title={t("Delete token @name?", {
          name: deleteToken?.name ?? "",
        })}
        message={t("Applications using this token will stop working.")}
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => deleteToken && remove.mutate(deleteToken.id)}
      />
    </>
  );
}
