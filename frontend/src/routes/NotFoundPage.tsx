import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";
import { PageBody } from "../components/PageHeader";
import { Button, EmptyState } from "../components/ui";

export default function NotFoundPage() {
  const t = useT();
  return (
    <PageBody>
      <EmptyState
        title={t("Page not found")}
        description={t("The page you are looking for does not exist.")}
        action={
          <Link to="/">
            <Button variant="primary">{t("Home")}</Button>
          </Link>
        }
      />
    </PageBody>
  );
}
