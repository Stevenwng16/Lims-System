import Link from "next/link";
import { jobApi } from "@/lib/jobs";
import { getOrgSettings } from "@/lib/mock-db";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveJobActor } from "./actions";

export const metadata = { title: "Jobs — LIMS" };

// Minimal job list (US-C1). The full overview with filters is US-C2; this
// gives creation + a way in to each job's detail.
export default async function JobsPage() {
  const actor = await resolveJobActor();
  const jobs = await jobApi.listJobs(actor);
  const jobLabel = getOrgSettings(actor.orgId).jobLabel; // configurable term (US-A7 AC 5)
  const canCreate = actor.role === "admin" || actor.role === "lab-manager";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{jobLabel}s</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{jobLabel}s</h1>
        {canCreate && (
          <Button size="sm" render={<Link href="/jobs/new" />}>
            + New {jobLabel.toLowerCase()}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{jobLabel} no.</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Lab</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-right">Samples</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-mono font-medium">
                  <Link href={`/jobs/${job.id}`} className="underline-offset-4 hover:underline">
                    {job.id}
                  </Link>
                </TableCell>
                <TableCell>{job.customer}</TableCell>
                <TableCell>{job.labName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {job.receivedAt.replace("T", " ")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{job.sampleCount}</TableCell>
                <TableCell>
                  {job.voided ? (
                    <Badge variant="secondary">voided</Badge>
                  ) : job.awaitingDecision > 0 ? (
                    <Badge variant="destructive">{job.awaitingDecision} awaiting decision</Badge>
                  ) : (
                    <Badge variant="outline">registered</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No {jobLabel.toLowerCase()}s in your lab(s) yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
