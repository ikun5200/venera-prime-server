import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, Card, Switch } from "../components/ui";

const defaultOrder = [
  "search",
  "sync",
  "random",
  "history",
  "readLater",
  "statistics",
  "local",
  "updates",
  "sources",
  "images",
];

const labels: Record<string, string> = {
  search: "Search",
  sync: "Data Sync",
  random: "Random comic",
  history: "History",
  readLater: "Read later",
  statistics: "Reading statistics",
  local: "Local",
  updates: "Follow Updates",
  sources: "Comic Source",
  images: "Image Favorites",
};

export default function HomeLayoutPage() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const layout = (settings.homeLayout ?? {}) as {
    order?: string[];
    hidden?: string[];
  };
  const [order, setOrder] = useState(
    layout.order?.length ? layout.order : defaultOrder,
  );
  const [hidden, setHidden] = useState<Set<string>>(
    new Set(layout.hidden ?? []),
  );
  const [dragging, setDragging] = useState<string | null>(null);

  const persist = async (nextOrder: string[], nextHidden: Set<string>) => {
    try {
      setSettings(
        await api.updateSettings({
          homeLayout: { order: nextOrder, hidden: [...nextHidden] },
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    persist(next, hidden);
  };

  const toggle = (id: string, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(id);
    else next.add(id);
    setHidden(next);
    persist(order, next);
  };

  return (
    <>
      <PageHeader
        title={t("Customize home")}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOrder(defaultOrder);
              setHidden(new Set());
              persist(defaultOrder, new Set());
              toast.success(t("Restored defaults"));
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("Restore defaults")}
          </Button>
        }
      />
      <PageBody className="max-w-[700px]">
        <p className="mb-3 text-[12px] text-muted">
          Long press and drag to reorder. The sync module stays mounted even
          when hidden.
        </p>
        <Card className="divide-y divide-border">
          {order.map((id, index) => (
            <div
              key={id}
              draggable
              onDragStart={() => setDragging(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!dragging || dragging === id) return;
                const from = order.indexOf(dragging);
                move(from, index);
                setDragging(null);
              }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <ArrowDownUp className="h-4 w-4 shrink-0 cursor-grab text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{labels[id] ?? id}</p>
                <p className="text-[11px] text-muted">{id}</p>
              </div>
              <Switch
                checked={!hidden.has(id)}
                onChange={(value) => toggle(id, value)}
                disabled={id === "sync"}
                label={labels[id]}
              />
            </div>
          ))}
        </Card>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => navigate("/")}>
            {t("Back")}
          </Button>
        </div>
      </PageBody>
    </>
  );
}
