import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "./ui/card";
import { Button } from "./ui/button";
import { CheckCircle, XCircle } from "lucide-react";

interface Proposal {
  _id: string;
  type: string;
  payload: string;
  reason: string;
}

interface TriageViewProps {
  proposals?: Proposal[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function TriageView({ proposals = [], onApprove, onReject }: TriageViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Triage</h2>
        <p className="text-muted-foreground">Review and approve agent proposals</p>
      </div>
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No pending proposals
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
                  onClick={() => onApprove?.(proposal._id)}
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onReject?.(proposal._id)}
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
