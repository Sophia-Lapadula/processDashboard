import { createClient } from "@/lib/supabase/server";
import SlackDestinationsView from "./SlackDestinationsView";

export default async function SlackSettingsPage() {
  const supabase = await createClient();
  const { data: destinations } = await supabase
    .from("slack_destinations")
    .select("id, name, kind, enabled, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Slack</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Destinos pra notificação ao final de execuções. Use Slack Incoming Webhook
          (criado em api.slack.com/messaging/webhooks).
        </p>
      </div>
      <SlackDestinationsView destinations={destinations ?? []} />
    </div>
  );
}
