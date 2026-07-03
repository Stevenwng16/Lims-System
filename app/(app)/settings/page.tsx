import Link from "next/link";
import { labApi } from "@/lib/labs";
import { settingsApi } from "@/lib/settings";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminOrgId } from "./actions";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings — LIMS" };

// Admin ▸ Settings (US-A7): Security, Identifiers & labels, Lab settings.
// Every value here was seeded with a safe default at provisioning (AC 1).
export default async function SettingsPage() {
  const orgId = await requireAdminOrgId(); // redirects when not admin

  const settings = await settingsApi.getSettings(orgId);
  const labs = (await labApi.listLabs(orgId)).filter((lab) => lab.status === "active");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Admin</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisation-wide configuration and per-lab options. Every change is recorded in the
          audit log with its old and new value.
        </p>
      </div>

      <SettingsClient
        settings={{
          security: settings.security,
          identifiers: settings.identifiers,
          jobLabel: settings.jobLabel,
          sampleTypes: settings.sampleTypes,
          resultQualifiers: settings.resultQualifiers,
          barcode: settings.barcode,
        }}
        labs={labs.map((lab) => ({
          id: lab.id,
          name: lab.name,
          analystsMayCreateBatches: lab.analystsMayCreateBatches,
          reviewerMustDiffer: lab.reviewerMustDiffer,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Vendor support access</CardTitle>
          <CardDescription>
            Grant or revoke time-limited support access for the vendor (US-A2).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/support-access"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Open support access →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
