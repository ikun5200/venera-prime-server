import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Plus, Trash2, UserX } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { User } from "../lib/types";
import { formatDate } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  PromptDialog,
  Select,
  Spinner,
} from "../components/ui";

export default function AdminUsersPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const current = useAppStore((state) => state.user);
  const query = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.adminUsers,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const create = useMutation({
    mutationFn: () => api.adminCreateUser(username, password, role),
    onSuccess: (result) => {
      toast.success(t("User created"));
      setCreateOpen(false);
      setUsername("");
      setPassword("");
      queryClient.setQueryData<{ items: User[] } | undefined>(
        ["admin-users"],
        (old) =>
          old
            ? {
                items: old.items.some((item) => item.id === result.user.id)
                  ? old.items
                  : [...old.items, result.user],
              }
            : old,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { password?: string; disabled?: boolean; role?: string };
    }) => api.adminUpdateUser(id, body),
    onSuccess: (result) => {
      toast.success(t("Updated"));
      setResetUser(null);
      queryClient.setQueryData<{ items: User[] } | undefined>(
        ["admin-users"],
        (old) =>
          old
            ? {
                items: old.items.map((item) =>
                  item.id === result.user.id ? result.user : item,
                ),
              }
            : old,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.adminDeleteUser(id),
    onSuccess: (_result, id) => {
      toast.success(t("Deleted"));
      setDeleteUser(null);
      queryClient.setQueryData<{ items: User[] } | undefined>(
        ["admin-users"],
        (old) =>
          old ? { items: old.items.filter((item) => item.id !== id) } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const users = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t("Admin")}
        subtitle={t("@count users", { count: users.length })}
        actions={
          <IconButton label={t("Add")} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
          </IconButton>
        }
      />
      <PageBody className="max-w-[800px]">
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <Card key={user.id} className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[13px] font-semibold text-accent">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-medium">
                      {user.username}
                    </p>
                    <Badge tone={user.role === "admin" ? "accent" : "neutral"}>
                      {user.role}
                    </Badge>
                    {user.disabled ? (
                      <Badge tone="warning">{t("Disabled")}</Badge>
                    ) : null}
                    {current?.id === user.id ? (
                      <Badge tone="success">{t("You")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted">
                    {t("Created @time", {
                      time: formatDate(user.createdAt),
                    })}
                  </p>
                </div>
                <Menu
                  trigger={({ onClick, ...rest }) => (
                    <IconButton label={t("More")} onClick={onClick} {...rest}>
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  )}
                  items={[
                    {
                      label: t("Reset password"),
                      icon: <KeyRound className="h-3.5 w-3.5" />,
                      onSelect: () => setResetUser(user),
                    },
                    {
                      label: user.disabled ? t("Enable") : t("Disable"),
                      icon: <UserX className="h-3.5 w-3.5" />,
                      disabled: current?.id === user.id,
                      onSelect: () =>
                        update.mutate({
                          id: user.id,
                          body: { disabled: !user.disabled },
                        }),
                    },
                    {
                      label:
                        user.role === "admin"
                          ? t("Make user")
                          : t("Make admin"),
                      disabled: current?.id === user.id,
                      onSelect: () =>
                        update.mutate({
                          id: user.id,
                          body: {
                            role: user.role === "admin" ? "user" : "admin",
                          },
                        }),
                    },
                    {
                      label: t("Delete"),
                      danger: true,
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      disabled: current?.id === user.id,
                      onSelect: () => setDeleteUser(user),
                    },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("Create user")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!username.trim() || password.length < 6}
              onClick={() => create.mutate()}
            >
              {t("Create")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t("Username")}>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
          <Field label={t("Password")} hint={t("At least 6 characters.")}>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label={t("Role")}>
            <Select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "user" | "admin")
              }
            >
              <option value="user">{t("User")}</option>
              <option value="admin">{t("Administrator")}</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <PromptDialog
        open={resetUser !== null}
        onClose={() => setResetUser(null)}
        title={`Reset password for ${resetUser?.username ?? ""}`}
        label={t("Password")}
        onConfirm={(value) =>
          resetUser &&
          update.mutate({ id: resetUser.id, body: { password: value } })
        }
      />

      <ConfirmDialog
        open={deleteUser !== null}
        onClose={() => setDeleteUser(null)}
        title={t("Delete user @name?", {
          name: deleteUser?.username ?? "",
        })}
        message={t(
          "All favorites, history, sources, uploads and sessions for this user are deleted.",
        )}
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => deleteUser && remove.mutate(deleteUser.id)}
      />
    </>
  );
}
