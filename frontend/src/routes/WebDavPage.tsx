import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Download, QrCode, RefreshCw, Upload, Copy } from "lucide-react";
import { api, backupExportUrl, downloadUrl, importBackup } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { copyText } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Spinner,
  Switch,
} from "../components/ui";

export default function WebDavPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["webdav"], queryFn: api.webdav });
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [path, setPath] = useState("/");
  const [autoSync, setAutoSync] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setUrl(data.url);
    setUsername(data.username);
    setPath(data.path || "/");
    setAutoSync(data.autoSync);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      api.saveWebdav({
        url: url.trim(),
        username: username.trim(),
        password: password || undefined,
        path,
        autoSync,
      }),
    onSuccess: () => {
      toast.success("Saved");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["webdav"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: api.testWebdav,
    onSuccess: () => toast.success("Connection OK"),
    onError: (error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: api.uploadWebdav,
    onSuccess: (result) => {
      toast.success(`Uploaded ${result.file}`);
      queryClient.invalidateQueries({ queryKey: ["webdav"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const download = useMutation({
    mutationFn: api.downloadWebdav,
    onSuccess: (result) => {
      toast.success(`Restored ${result.file}`);
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const showQr = async () => {
    const payload = JSON.stringify({ url, username });
    setQr(await QRCode.toDataURL(payload, { margin: 1, width: 320 }));
    setQrOpen(true);
  };

  const importFile = async (file: File) => {
    try {
      await importBackup(file);
      toast.success("Imported");
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <PageHeader title={t("Data Sync")} />
      <PageBody className="max-w-[760px]">
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4 p-4">
              <Field label="WebDAV URL" hint="A valid WebDAV directory URL.">
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/remote.php/dav/files/user/"
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("Username")}>
                  <Input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </Field>
                <Field
                  label={t("Password")}
                  hint="Leave empty to keep the stored password."
                >
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Remote path">
                <Input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
              </Field>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                {t("Auto Sync Data")}
                <Switch checked={autoSync} onChange={setAutoSync} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {t("Save")}
                </Button>
                <Button
                  variant="secondary"
                  loading={test.isPending}
                  onClick={() => test.mutate()}
                >
                  {t("Test connection")}
                </Button>
                <Button variant="secondary" onClick={showQr}>
                  <QrCode className="h-4 w-4" /> Config QR code
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-[15px] font-semibold">{t("Sync Data")}</h2>
              <p className="text-[12px] text-muted">
                Upload creates a versioned backup on the WebDAV server and keeps
                the ten newest. Download restores the newest backup for this
                account.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={upload.isPending}
                  disabled={!query.data?.configured}
                  onClick={() => upload.mutate()}
                >
                  <Upload className="h-4 w-4" /> {t("Upload")}
                </Button>
                <Button
                  variant="secondary"
                  loading={download.isPending}
                  disabled={!query.data?.configured}
                  onClick={() => download.mutate()}
                >
                  <RefreshCw className="h-4 w-4" /> {t("Download")}
                </Button>
              </div>
              {query.data?.lastBackupName ? (
                <p className="text-[11px] text-muted">
                  Last backup: {query.data.lastBackupName} · version{" "}
                  {query.data.dataVersion}
                </p>
              ) : null}
            </Card>

            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-[15px] font-semibold">Local backup</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadUrl(backupExportUrl(), "venera-backup.zip")
                  }
                >
                  <Download className="h-4 w-4" /> {t("Export App Data")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> {t("Import App Data")}
                </Button>
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
              </div>
            </Card>
          </div>
        )}
      </PageBody>

      <Modal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title="Config QR code"
      >
        {qr ? (
          <div className="flex flex-col items-center gap-3">
            <img src={qr} alt="WebDAV config QR code" className="h-64 w-64" />
            <p className="text-center text-[12px] text-muted">
              Contains the URL and username only. The password is never returned
              by the server.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copyText(qr).then(() => toast.success("Copied"))}
            >
              <Copy className="h-3.5 w-3.5" /> {t("Copy")}
            </Button>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
