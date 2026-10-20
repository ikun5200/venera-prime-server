import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, Card, IconButton, Input } from "../components/ui";

export default function BlockedWordsPage({
  kind = "words" as "words" | "comments",
}) {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const key = kind === "words" ? "blockedWords" : "blockedCommentWords";
  const words = (settings[key] as string[]) ?? [];
  const [draft, setDraft] = useState("");

  const persist = async (next: string[]) => {
    try {
      setSettings(await api.updateSettings({ [key]: next }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (words.includes(value)) {
      toast.error(t("Keyword already exists"));
      return;
    }
    persist([...words, value]);
    setDraft("");
  };

  return (
    <>
      <PageHeader
        title={t(
          kind === "words"
            ? t("Keyword blocking")
            : t("Comment keyword blocking"),
        )}
      />
      <PageBody className="max-w-[700px]">
        <div className="mb-4 flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
            placeholder={t("Add keyword")}
          />
          <Button variant="primary" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" /> {t("Add")}
          </Button>
        </div>
        <Card className="divide-y divide-border">
          {words.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-muted">{t("No data")}</p>
          ) : (
            words.map((word) => (
              <div key={word} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {word}
                </span>
                <IconButton
                  label={t("Delete")}
                  onClick={() => persist(words.filter((item) => item !== word))}
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))
          )}
        </Card>
        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            onClick={() => navigate("/settings/explore")}
          >
            {t("Back")}
          </Button>
        </div>
      </PageBody>
    </>
  );
}
