/**
 * SmsMessaging Component
 * 
 * UI component for sending and viewing SMS messages.
 * Integrates with Twilio via the sms-messaging edge function.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageSquare, Send, RefreshCw, Phone, Clock, CheckCircle, XCircle, Loader2, AlertTriangle, Settings, Webhook, Sparkles } from 'lucide-react';
import { useSmsMessaging, type SmsMessage, type TwilioNumber } from '@/hooks/useSmsMessaging';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { normalizePhoneNumber, formatPhoneNumber, getPhoneValidationError } from '@/lib/phoneUtils';

const SmsMessaging: React.FC = () => {
  const { isLoading, messages, sendSms, getMessages, getAvailableNumbers, configureWebhook } = useSmsMessaging();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [toNumber, setToNumber] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<TwilioNumber[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [numbers] = await Promise.all([
        getAvailableNumbers(),
        getMessages(),
      ]);
      setAvailableNumbers(numbers);
      if (numbers.length > 0 && !fromNumber) {
        setFromNumber(numbers[0].number);
      }
    } catch (error) {
      console.error('Error loading SMS data:', error);
    }
  };

  const selectedNumber = availableNumbers.find(n => n.number === fromNumber);
  const webhookNotConfigured = selectedNumber && !selectedNumber.webhook_configured;
  const a2pNotRegistered = selectedNumber && !selectedNumber.a2p_registered;
  const notFullyReady = selectedNumber && !selectedNumber.is_ready;

  const handleConfigureWebhook = async () => {
    if (!fromNumber) return;
    setIsConfiguringWebhook(true);
    try {
      const success = await configureWebhook(fromNumber);
      if (success) {
        await loadData(); // Refresh to update webhook status
      }
    } finally {
      setIsConfiguringWebhook(false);
    }
  };

  const handleSendSms = async () => {
    if (!toNumber || !fromNumber || !messageBody.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    // Validate phone number format
    const validationError = getPhoneValidationError(toNumber);
    if (validationError) {
      toast({
        title: 'Invalid Phone Number',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    // Normalize phone number
    const normalizedToNumber = normalizePhoneNumber(toNumber);
    if (!normalizedToNumber) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Could not normalize phone number. Please check the format.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const success = await sendSms({
        to: normalizedToNumber,
        from: fromNumber,
        body: messageBody.trim(),
      });

      if (success) {
        setMessageBody('');
        setToNumber('');
        await getMessages();
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: SmsMessage['status']) => {
    const variants: Record<SmsMessage['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
      pending: { variant: 'secondary', icon: Clock },
      queued: { variant: 'secondary', icon: Clock },
      sent: { variant: 'outline', icon: Send },
      delivered: { variant: 'default', icon: CheckCircle },
      failed: { variant: 'destructive', icon: XCircle },
      received: { variant: 'default', icon: MessageSquare },
    };
    
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                SMS Messaging
              </CardTitle>
              <CardDescription>
                Send and receive text messages through your phone numbers
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/sms-conversations')}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Conversations
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadData}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="send" className="space-y-4">
        <TabsList>
          <TabsTrigger value="send">
            <Send className="h-4 w-4 mr-2" />
            Send Message
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            Message History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <Card>
            <CardHeader>
              <CardTitle>Compose Message</CardTitle>
              <CardDescription>
                Send an SMS message to any phone number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Warning Alerts */}
              {notFullyReady && (
                <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Number Not Fully Configured</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <div className="flex flex-col gap-1">
                      {webhookNotConfigured && (
                        <p className="flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Webhook not configured - replies won't trigger AI auto-responses
                        </p>
                      )}
                      {a2pNotRegistered && (
                        <p className="flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Not A2P registered - SMS may be blocked or filtered
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {webhookNotConfigured && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleConfigureWebhook}
                          disabled={isConfiguringWebhook}
                        >
                          {isConfiguringWebhook ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Configuring...
                            </>
                          ) : (
                            <>
                              <Webhook className="h-4 w-4 mr-2" />
                              Configure Webhook
                            </>
                          )}
                        </Button>
                      )}
                      {a2pNotRegistered && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open('https://console.twilio.com/us1/develop/sms/services', '_blank')}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Setup A2P in Twilio
                        </Button>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from">From Number</Label>
                  {availableNumbers.length > 0 ? (
                    <Select value={fromNumber} onValueChange={setFromNumber}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select sender number" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNumbers.map((num) => (
                          <SelectItem key={num.number} value={num.number}>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              {formatPhoneNumber(num.number)}
                              {num.friendly_name && (
                                <span className="text-muted-foreground">({num.friendly_name})</span>
                              )}
                              {num.is_ready ? (
                                <Badge variant="outline" className="text-green-600 border-green-500 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Ready
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-600 border-amber-500 text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {num.status_details || 'Setup needed'}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 p-3 border rounded-md bg-muted">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        No SMS-enabled numbers available. Import numbers from Twilio first.
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="to">To Number</Label>
                  <Input
                    id="to"
                    placeholder="+1 (555) 123-4567"
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the recipient's phone number with country code
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Type your message here..."
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={4}
                  maxLength={1600}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {messageBody.length > 160 
                      ? `${Math.ceil(messageBody.length / 160)} message segments`
                      : 'Standard SMS (160 characters)'
                    }
                  </span>
                  <span>{messageBody.length} / 1600</span>
                </div>
              </div>

              <Button 
                onClick={handleSendSms}
                disabled={!toNumber || !fromNumber || !messageBody.trim() || isSending}
                className="w-full md:w-auto"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
              <CardDescription>
                View sent and received SMS messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No messages yet</p>
                  <p className="text-sm">Send your first message to see it here</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Direction</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell>
                            <Badge variant={msg.direction === 'outbound' ? 'default' : 'secondary'}>
                              {msg.direction === 'outbound' ? '↑ Out' : '↓ In'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatPhoneNumber(msg.from_number)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatPhoneNumber(msg.to_number)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {msg.body}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(msg.status)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SmsMessaging;
