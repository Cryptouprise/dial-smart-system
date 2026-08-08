import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Plug,
  RefreshCw,
  Terminal,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const APP_NAME = "Dial Smart";
const APP_SLUG = "dial-smart";

function useMcpUrl() {
  return useMemo(() => {
    const ref = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "emonjusymdripmkvtttc";
    return `https://${ref}.supabase.co/functions/v1/mcp`;
  }, []);
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 shrink-0">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="group relative mt-2 rounded-lg border bg-muted/50 p-3 pr-12">
      <code className="block overflow-x-auto text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
        {children}
      </code>
      <div className="absolute right-2 top-2">
        <CopyButton value={children} label="" />
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium">{title}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open ? <div className="space-y-4 p-4 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="pt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}

export default function AgentConnect() {
  const mcpUrl = useMcpUrl();
  const claudeConnectUrl = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(APP_NAME)}&connectorUrl=${encodeURIComponent(mcpUrl)}`;
  const claudeInstallCmd = `claude mcp add --scope user --transport http ${APP_SLUG} '${mcpUrl}'`;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Plug className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Connect an AI agent to {APP_NAME}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Let ChatGPT, Claude, or another MCP-compatible assistant read your campaigns,
            leads, and call data. You sign in once and the agent works as your account.
          </p>
        </div>

        {/* Server URL */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">MCP server URL</CardTitle>
            <CardDescription>Paste this into your AI assistant's connector settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2.5 text-xs text-foreground/90">
                {mcpUrl}
              </code>
              <CopyButton value={mcpUrl} label="Copy URL" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              This endpoint is protected with OAuth. The assistant will ask you to sign in to {APP_NAME} the first time it connects.
            </p>
          </CardContent>
        </Card>

        {/* Connect section */}
        <h2 className="mb-3 text-lg font-semibold">Connect</h2>
        <div className="mb-8 space-y-2.5">
          {/* ChatGPT */}
          <Section title="ChatGPT" icon={ExternalLink}>
            <Step n={1}>
              Open{" "}
              <a
                href="https://chatgpt.com/#settings/Connectors/Advanced"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                ChatGPT Connectors (Advanced)
              </a>{" "}
              and enable <strong>Developer mode</strong>. Heed the risk notice shown there. If Developer mode is unavailable, ask a ChatGPT admin to enable it.
            </Step>
            <Step n={2}>
              Then open{" "}
              <a
                href={`https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                the New Connector dialog
              </a>{" "}
              directly.
            </Step>
            <Step n={3}>
              Paste <strong>{APP_NAME}</strong> into the name field and the MCP URL above into the URL field.
            </Step>
            <Step n={4}>
              Review the details, check <em>&ldquo;I understand and want to continue&rdquo;</em> (ChatGPT shows this for every custom MCP server), then click <strong>Create</strong>.
            </Step>
            <Step n={5}>
              Enable {APP_NAME} from the chat composer, then ask ChatGPT to use {APP_NAME}.
            </Step>
          </Section>

          {/* Claude */}
          <Section title="Claude" icon={ExternalLink}>
            <Step n={1}>
              Open{" "}
              <a
                href={claudeConnectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Claude's custom connector dialog
              </a>{" "}
              — the name and URL are already filled in.
            </Step>
            <Step n={2}>Review the details and click <strong>Add</strong>.</Step>
            <Step n={3}>
              If the prefilled form does not open, go to{" "}
              <a
                href="https://claude.ai/customize/connectors"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Claude Connectors
              </a>
              , choose <strong>Add custom connector</strong>, then name it <strong>{APP_NAME}</strong> and paste the MCP URL above.
            </Step>
            <Step n={4}>
              Enable the connector from the chat composer, then ask Claude to use {APP_NAME}.
            </Step>
          </Section>

          {/* Claude Code */}
          <Section title="Claude Code" icon={Terminal}>
            <p className="font-medium text-foreground">One-line install (terminal):</p>
            <CodeBlock>{claudeInstallCmd}</CodeBlock>
            <Step n={1}>
              Run the command above in a terminal. The <code>--scope user</code> flag lets the connection work from any directory.
            </Step>
            <Step n={2}>
              Start Claude Code and run <code className="rounded bg-muted/60 px-1.5 py-0.5 text-xs">/mcp</code> to confirm {APP_NAME} is connected. Claude Code asks you to sign in from that menu only when the server protects its tools.
            </Step>
            <Step n={3}>Ask Claude Code to use {APP_NAME}.</Step>
          </Section>

          {/* Other MCP clients */}
          <Section title="Other MCP clients" icon={Plug}>
            <Step n={1}>Open your assistant's MCP server or custom connector settings.</Step>
            <Step n={2}>Create a new <strong>remote</strong> MCP server connection.</Step>
            <Step n={3}>Name the connection <strong>{APP_NAME}</strong> and paste the MCP URL above.</Step>
            <Step n={4}>Complete any sign-in or authorization prompts.</Step>
            <Step n={5}>Enable the connection, then ask your assistant to use {APP_NAME}.</Step>
          </Section>
        </div>

        {/* Refresh section */}
        <h2 className="mb-3 text-lg font-semibold">Refresh after the app changes</h2>
        <div className="mb-8 space-y-2.5">
          <Section title="ChatGPT" icon={RefreshCw}>
            <Step n={1}>Open ChatGPT's Plugins page and select {APP_NAME}.</Step>
            <Step n={2}>Scroll down to <strong>Information</strong> and click <strong>Refresh</strong>.</Step>
            <Step n={3}>
              ChatGPT can't update an existing connector's URL — if it changed, delete {APP_NAME} from Plugins and repeat the connect steps above with the latest URL.
            </Step>
            <Step n={4}>Start a new chat and ask ChatGPT to use {APP_NAME}.</Step>
          </Section>

          <Section title="Claude" icon={RefreshCw}>
            <Step n={1}>Open the Connectors page and select the {APP_NAME} connector.</Step>
            <Step n={2}>Refresh or update the connector's tools.</Step>
            <Step n={3}>
              Claude can't update an existing connector's URL — if it changed, remove the connector and repeat the connect steps above with the latest URL.
            </Step>
            <Step n={4}>Ask Claude to use {APP_NAME}.</Step>
          </Section>

          <Section title="Claude Code" icon={RefreshCw}>
            <Step n={1}>Start a new Claude Code session — it loads {APP_NAME}'s latest tools when it connects.</Step>
            <Step n={2}>
              If the URL changed, run <code className="rounded bg-muted/60 px-1.5 py-0.5 text-xs">claude mcp remove {APP_SLUG}</code>, then run the install command again with the latest quoted URL.
            </Step>
            <Step n={3}>Ask Claude Code to use {APP_NAME}.</Step>
          </Section>

          <Section title="Other MCP clients" icon={RefreshCw}>
            <Step n={1}>Open the client's MCP server or connector settings.</Step>
            <Step n={2}>Select the connection created for {APP_NAME}.</Step>
            <Step n={3}>Refresh the tool list, reload the server, or reconnect it.</Step>
            <Step n={4}>If the URL changed, paste the latest URL from above.</Step>
            <Step n={5}>Start a new chat or session and ask the assistant to use {APP_NAME}.</Step>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
          <span className="text-muted-foreground">
            Need help? Read the <Link to="/help" className="font-medium text-primary underline-offset-2 hover:underline">Help Center</Link>.
          </span>
          <span className="text-xs text-muted-foreground">Protected with Supabase OAuth 2.1</span>
        </div>
      </main>
    </div>
  );
}
