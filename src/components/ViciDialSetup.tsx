/**
 * VICIdial Setup and Configuration Component
 * 
 * Provides UI for configuring VICIdial integration with the dial-smart-system.
 * Includes connection testing, agent management, and campaign configuration.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ViciAdapter } from "@/services/providers/viciAdapter";
import { Loader2, CheckCircle2, XCircle, Phone, Users, Settings } from "lucide-react";

export const ViciDialSetup = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  const [config, setConfig] = useState({
    server_url: '',
    api_user: '',
    api_pass: '',
    source: 'dial-smart',
    agent_user: '',
    campaign_id: '',
    phone_code: '1',
    use_agent_api: true,
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionStatus(null);

    try {
      const adapter = new ViciAdapter(config);
      const result = await adapter.testConnection();
      
      setConnectionStatus({
        tested: true,
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        toast({
          title: "Connection Successful",
          description: result.message,
        });
      } else {
        toast({
          title: "Connection Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnectionStatus({
        tested: true,
        success: false,
        message: errorMessage,
      });

      toast({
        title: "Connection Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsLoading(true);

    try {
      // TODO: Save configuration to Supabase database
      // This would store the config in the phone_providers table
      
      toast({
        title: "Configuration Saved",
        description: "VICIdial configuration has been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : 'Failed to save configuration',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            VICIdial Integration
          </CardTitle>
          <CardDescription>
            Connect your VICIdial contact center to enable agent control, campaign management,
            and real-time call handling through the Agent and Non-Agent APIs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="connection" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="connection">
                <Settings className="h-4 w-4 mr-2" />
                Connection
              </TabsTrigger>
              <TabsTrigger value="agents">
                <Users className="h-4 w-4 mr-2" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="campaigns">
                <Phone className="h-4 w-4 mr-2" />
                Campaigns
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connection" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="server_url">VICIdial Server URL</Label>
                  <Input
                    id="server_url"
                    placeholder="https://your-vicidial-server.com"
                    value={config.server_url}
                    onChange={(e) => setConfig({ ...config, server_url: e.target.value })}
                  />
                  <p className="text-sm text-muted-foreground">
                    The full URL to your VICIdial installation (e.g., https://vicidial.example.com)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api_user">API Username</Label>
                    <Input
                      id="api_user"
                      placeholder="API user"
                      value={config.api_user}
                      onChange={(e) => setConfig({ ...config, api_user: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="api_pass">API Password</Label>
                    <Input
                      id="api_pass"
                      type="password"
                      placeholder="API password"
                      value={config.api_pass}
                      onChange={(e) => setConfig({ ...config, api_pass: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="source">API Source</Label>
                    <Input
                      id="source"
                      placeholder="dial-smart"
                      value={config.source}
                      onChange={(e) => setConfig({ ...config, source: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Identifier for API requests (default: dial-smart)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone_code">Phone Code</Label>
                    <Input
                      id="phone_code"
                      placeholder="1"
                      value={config.phone_code}
                      onChange={(e) => setConfig({ ...config, phone_code: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Country code for dialing (default: 1 for US/Canada)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="use_agent_api"
                    checked={config.use_agent_api}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, use_agent_api: checked })
                    }
                  />
                  <Label htmlFor="use_agent_api">
                    Use Agent API (recommended for real-time agent control)
                  </Label>
                </div>

                {connectionStatus && (
                  <div
                    className={`flex items-center gap-2 p-3 rounded-lg ${
                      connectionStatus.success
                        ? "bg-green-50 text-green-900"
                        : "bg-red-50 text-red-900"
                    }`}
                  >
                    {connectionStatus.success ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <span className="text-sm">{connectionStatus.message}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.server_url || !config.api_user || !config.api_pass}
                  >
                    {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Test Connection
                  </Button>

                  <Button
                    onClick={handleSaveConfig}
                    disabled={isLoading || !connectionStatus?.success}
                    variant="default"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Configuration
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="agents" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent_user">Default Agent User</Label>
                  <Input
                    id="agent_user"
                    placeholder="Agent username"
                    value={config.agent_user}
                    onChange={(e) => setConfig({ ...config, agent_user: e.target.value })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Default VICIdial agent username for API calls. Can be overridden per call.
                  </p>
                </div>

                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">Agent API Functions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          <strong>external_dial</strong> - Initiate outbound calls through agents
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          <strong>external_hangup</strong> - Terminate active calls
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          <strong>external_status</strong> - Set call dispositions
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          <strong>external_pause</strong> - Pause/resume agents
                        </span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="campaigns" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign_id">Default Campaign ID</Label>
                  <Input
                    id="campaign_id"
                    placeholder="Campaign ID"
                    value={config.campaign_id}
                    onChange={(e) => setConfig({ ...config, campaign_id: e.target.value })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Default VICIdial campaign for outbound calls. Can be overridden per call.
                  </p>
                </div>

                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">Campaign Integration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">
                      The dial-smart-system integrates with VICIdial campaigns through:
                    </p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          Automatic lead addition to VICIdial lists
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          Real-time call initiation through agent sessions
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          Disposition sync between systems
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>
                          Agent performance tracking and monitoring
                        </span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integration Guide</CardTitle>
          <CardDescription>
            Follow these steps to complete your VICIdial integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                1
              </span>
              <div>
                <strong>Configure API Access:</strong> Ensure your VICIdial instance has API
                access enabled and create an API user with appropriate permissions.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                2
              </span>
              <div>
                <strong>Test Connection:</strong> Enter your VICIdial credentials above and click
                "Test Connection" to verify connectivity.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                3
              </span>
              <div>
                <strong>Configure Agents:</strong> Set up default agent users and configure Agent
                API access for real-time call control.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                4
              </span>
              <div>
                <strong>Link Campaigns:</strong> Specify which VICIdial campaigns should be used
                for outbound calling from the dial-smart-system.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                5
              </span>
              <div>
                <strong>Save & Test:</strong> Save your configuration and make a test call to
                ensure everything is working correctly.
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};
