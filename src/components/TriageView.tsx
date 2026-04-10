import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "./ui/card";
import { Button } from "./ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { QueryErrorBoundary } from "./QueryErrorBoundary";

export function TriageView() {
  const { t } = useTranslation();
  const proposals = useQuery(api.proposals.listPending);
  const approve = useMutation(api.proposals.approve);
  const reject = useMutation(api.proposals.reject);

  const handleApprove = async (id: string) => {
    try {
      await approve({ id });
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await reject({ id });
    } catch (error) {
      console.error("Failed to reject:", error);
    }
  };

  if (proposals === undefined) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
          <p className="text-muted-foreground">{t("triage.description")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("triage.loading")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (proposals === null) {
    return (
      <QueryErrorBoundary>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
            <p className="text-muted-foreground">{t("triage.description")}</p>
          </div>
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("triage.loading")}
            </CardContent>
          </Card>
        </div>
      </QueryErrorBoundary>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
        <p className="text-muted-foreground">{t("triage.description")}</p>
      </div>
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("triage.noProposals")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <Card key={proposal._id}>
              <CardHeader>
                <CardTitle className="text-base">{proposal.type.replace("_", " ")}</CardTitle>
                <CardDescription>{proposal.reason}</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  {JSON.stringify(JSON.parse(proposal.payload), null, 2)}
                </pre>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleApprove(proposal._id)}
                >
                  <CheckCircle className="h-4 w-4" />
                  {t("triage.approve")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleReject(proposal._id)}
                >
                  <XCircle className="h-4 w-4" />
                  {t("triage.reject")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
