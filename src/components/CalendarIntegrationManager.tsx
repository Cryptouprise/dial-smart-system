import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCalendarIntegration, CalendarIntegration, CalendarAppointment } from '@/hooks/useCalendarIntegration';
import { useGoHighLevel } from '@/hooks/useGoHighLevel';
import { 
  Calendar, Clock, Link, RefreshCw, Plus, Settings, Check, X, 
  Video, MapPin, User, Phone, Mail, Trash2, Edit, ChevronRight,
  CalendarCheck, CalendarX, CalendarClock
} from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'
];

export const CalendarIntegrationManager: React.FC = () => {
  const {
    integrations,
    availability,
    appointments,
    isLoading,
    saveAvailability,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    connectGoogleCalendar,
    syncGHLCalendar,
    loadAppointments,
    disconnectIntegration
  } = useCalendarIntegration();

  const { testConnection: testGHLConnection, getGHLCredentials } = useGoHighLevel();

  const [localAvailability, setLocalAvailability] = useState(availability);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [ghlConnected, setGhlConnected] = useState(false);

  useEffect(() => {
    if (availability) {
      setLocalAvailability(availability);
    }
  }, [availability]);

  useEffect(() => {
    checkGHLConnection();
    
    // Listen for Google Calendar OAuth callback
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-calendar-connected') {
        window.location.reload();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkGHLConnection = async () => {
    const creds = await getGHLCredentials();
    setGhlConnected(!!creds);
  };

  const handleSaveAvailability = () => {
    if (localAvailability) {
      saveAvailability(localAvailability);
    }
  };

  const updateDaySchedule = (day: string, slots: { start: string; end: string }[]) => {
    if (localAvailability) {
      setLocalAvailability({
        ...localAvailability,
        weekly_schedule: {
          ...localAvailability.weekly_schedule,
          [day]: slots
        }
      });
    }
  };

  const googleIntegration = integrations.find(i => i.provider === 'google');
  const ghlIntegration = integrations.find(i => i.provider === 'ghl');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500';
      case 'scheduled': return 'bg-blue-500';
      case 'cancelled': return 'bg-red-500';
      case 'completed': return 'bg-gray-500';
      case 'no_show': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CalendarCheck className="h-4 w-4" />;
      case 'cancelled': return <CalendarX className="h-4 w-4" />;
      default: return <CalendarClock className="h-4 w-4" />;
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDate), i));

  return (
    <div className="space-y-6">
      {/* Integration Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Google Calendar */}
        <Card className={`border-2 ${googleIntegration ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-muted'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                Google Calendar
              </CardTitle>
              {googleIntegration && (
                <Badge variant="default" className="bg-green-600">Connected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {googleIntegration ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{googleIntegration.provider_account_email}</p>
                <p className="text-xs text-muted-foreground">
                  Last sync: {googleIntegration.last_sync_at 
                    ? format(new Date(googleIntegration.last_sync_at), 'MMM d, h:mm a')
                    : 'Never'}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => disconnectIntegration(googleIntegration.id)}>
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={connectGoogleCalendar} className="w-full" disabled={isLoading}>
                <Link className="h-4 w-4 mr-2" />
                Connect Google Calendar
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Go High Level Calendar */}
        <Card className={`border-2 ${ghlConnected ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-muted'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xs">GHL</span>
                </div>
                GHL Calendar
              </CardTitle>
              {ghlConnected && (
                <Badge variant="default" className="bg-green-600">Connected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {ghlConnected ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Synced via Go High Level integration</p>
                <p className="text-xs text-muted-foreground">
                  Last sync: {ghlIntegration?.last_sync_at 
                    ? format(new Date(ghlIntegration.last_sync_at), 'MMM d, h:mm a')
                    : 'Never'}
                </p>
                <Button size="sm" onClick={syncGHLCalendar} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Sync Now
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Connect Go High Level first in the GHL Integration tab
                </p>
                <Button variant="outline" className="w-full" disabled>
                  GHL Not Connected
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outlook/Other */}
        <Card className="border-2 border-muted opacity-75">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              Outlook Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Microsoft Outlook integration</p>
            <Button variant="outline" className="w-full" disabled>
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="availability" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Availability Tab */}
        <TabsContent value="availability">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Weekly Availability
              </CardTitle>
              <CardDescription>
                Set your available hours for each day of the week
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timezone */}
              <div className="flex items-center gap-4">
                <Label className="min-w-24">Timezone</Label>
                <Select
                  value={localAvailability?.timezone || 'America/New_York'}
                  onValueChange={(v) => localAvailability && setLocalAvailability({
                    ...localAvailability,
                    timezone: v
                  })}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Weekly Schedule */}
              <div className="space-y-4">
                {DAYS_OF_WEEK.map((day) => {
                  const daySlots = localAvailability?.weekly_schedule?.[day] || [];
                  const isAvailable = daySlots.length > 0;

                  return (
                    <div key={day} className="flex items-start gap-4 py-2">
                      <div className="min-w-32 flex items-center gap-2">
                        <Switch
                          checked={isAvailable}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              updateDaySchedule(day, [{ start: '09:00', end: '17:00' }]);
                            } else {
                              updateDaySchedule(day, []);
                            }
                          }}
                        />
                        <Label className="capitalize font-medium">{day}</Label>
                      </div>
                      
                      {isAvailable && (
                        <div className="flex-1 space-y-2">
                          {daySlots.map((slot, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={slot.start}
                                onChange={(e) => {
                                  const newSlots = [...daySlots];
                                  newSlots[idx] = { ...slot, start: e.target.value };
                                  updateDaySchedule(day, newSlots);
                                }}
                                className="w-32"
                              />
                              <span className="text-muted-foreground">to</span>
                              <Input
                                type="time"
                                value={slot.end}
                                onChange={(e) => {
                                  const newSlots = [...daySlots];
                                  newSlots[idx] = { ...slot, end: e.target.value };
                                  updateDaySchedule(day, newSlots);
                                }}
                                className="w-32"
                              />
                              {daySlots.length > 1 && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    updateDaySchedule(day, daySlots.filter((_, i) => i !== idx));
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              updateDaySchedule(day, [...daySlots, { start: '13:00', end: '17:00' }]);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add time slot
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button onClick={handleSaveAvailability} disabled={isLoading}>
                Save Availability
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarCheck className="h-5 w-5" />
                    Upcoming Appointments
                  </CardTitle>
                  <CardDescription>
                    View and manage your scheduled appointments
                  </CardDescription>
                </div>
                <Button onClick={() => loadAppointments()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mini Calendar */}
              <div className="mb-6 flex gap-1 overflow-x-auto pb-2">
                {weekDays.map((day) => {
                  const dayAppts = appointments.filter(a => 
                    isSameDay(new Date(a.start_time), day)
                  );
                  const isSelected = isSameDay(day, selectedDate);
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`flex-shrink-0 p-3 rounded-lg text-center min-w-16 transition-colors ${
                        isSelected 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      <div className="text-xs opacity-70">{format(day, 'EEE')}</div>
                      <div className="text-lg font-medium">{format(day, 'd')}</div>
                      {dayAppts.length > 0 && (
                        <div className={`text-xs mt-1 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`}>
                          {dayAppts.length} apt{dayAppts.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Appointments List */}
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {appointments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No appointments scheduled</p>
                    </div>
                  ) : (
                    appointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(apt.status)}`} />
                              <h4 className="font-medium">{apt.title}</h4>
                              <Badge variant="outline" className="text-xs capitalize">
                                {apt.status}
                              </Badge>
                            </div>
                            
                            <div className="text-sm text-muted-foreground space-y-1">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {format(new Date(apt.start_time), 'MMM d, yyyy')} at{' '}
                                {format(new Date(apt.start_time), 'h:mm a')} -{' '}
                                {format(new Date(apt.end_time), 'h:mm a')}
                              </div>
                              
                              {apt.lead && (
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3" />
                                  {apt.lead.first_name} {apt.lead.last_name}
                                  {apt.lead.phone_number && (
                                    <span className="text-xs">• {apt.lead.phone_number}</span>
                                  )}
                                </div>
                              )}
                              
                              {apt.location && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3 w-3" />
                                  {apt.location}
                                </div>
                              )}
                              
                              {apt.meeting_link && (
                                <div className="flex items-center gap-2">
                                  <Video className="h-3 w-3" />
                                  <a href={apt.meeting_link} target="_blank" rel="noopener noreferrer" 
                                     className="text-primary hover:underline">
                                    Join Meeting
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Sync indicators */}
                            <div className="flex gap-2 mt-2">
                              {apt.google_event_id && (
                                <Badge variant="secondary" className="text-xs">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Google
                                </Badge>
                              )}
                              {apt.ghl_appointment_id && (
                                <Badge variant="secondary" className="text-xs">
                                  GHL
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-1">
                            {apt.status !== 'cancelled' && apt.status !== 'completed' && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => updateAppointment(apt.id, { status: 'confirmed' })}
                                  title="Confirm"
                                >
                                  <Check className="h-4 w-4 text-green-500" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => cancelAppointment(apt.id)}
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Booking Settings
              </CardTitle>
              <CardDescription>
                Configure meeting defaults and booking rules
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Default Meeting Duration</Label>
                  <Select
                    value={String(localAvailability?.default_meeting_duration || 30)}
                    onValueChange={(v) => localAvailability && setLocalAvailability({
                      ...localAvailability,
                      default_meeting_duration: parseInt(v)
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Slot Interval</Label>
                  <Select
                    value={String(localAvailability?.slot_interval_minutes || 15)}
                    onValueChange={(v) => localAvailability && setLocalAvailability({
                      ...localAvailability,
                      slot_interval_minutes: parseInt(v)
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">Every 15 minutes</SelectItem>
                      <SelectItem value="30">Every 30 minutes</SelectItem>
                      <SelectItem value="60">Every hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Buffer Before Meeting</Label>
                  <Select
                    value={String(localAvailability?.buffer_before_minutes || 15)}
                    onValueChange={(v) => localAvailability && setLocalAvailability({
                      ...localAvailability,
                      buffer_before_minutes: parseInt(v)
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No buffer</SelectItem>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Buffer After Meeting</Label>
                  <Select
                    value={String(localAvailability?.buffer_after_minutes || 15)}
                    onValueChange={(v) => localAvailability && setLocalAvailability({
                      ...localAvailability,
                      buffer_after_minutes: parseInt(v)
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No buffer</SelectItem>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Minimum Notice</Label>
                  <Select
                    value={String(localAvailability?.min_notice_hours || 2)}
                    onValueChange={(v) => localAvailability && setLocalAvailability({
                      ...localAvailability,
                      min_notice_hours: parseInt(v)
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="4">4 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">48 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Max Days Ahead</Label>
                  <Select
                    value={String(localAvailability?.max_days_ahead || 30)}
                    onValueChange={(v) => localAvailability && setLocalAvailability({
                      ...localAvailability,
                      max_days_ahead: parseInt(v)
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">1 week</SelectItem>
                      <SelectItem value="14">2 weeks</SelectItem>
                      <SelectItem value="30">1 month</SelectItem>
                      <SelectItem value="60">2 months</SelectItem>
                      <SelectItem value="90">3 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Check Calendar Conflicts</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically check connected calendars for busy times
                  </p>
                </div>
                <Switch
                  checked={localAvailability?.check_calendar_conflicts ?? true}
                  onCheckedChange={(v) => localAvailability && setLocalAvailability({
                    ...localAvailability,
                    check_calendar_conflicts: v
                  })}
                />
              </div>

              <Button onClick={handleSaveAvailability} disabled={isLoading}>
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
