import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, Zap } from 'lucide-react';

interface AutomationRule {
  id: string;
  name: string;
  rule_type: string;
  enabled: boolean;
  days_of_week: string[] | null;
  time_windows: Array<{ start: string; end: string }> | null;
  campaign_id?: string | null;
}

interface AutomationTimelineProps {
  rules: AutomationRule[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MAP: Record<string, number> = {
  'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
  'friday': 4, 'saturday': 5, 'sunday': 6
};

const COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500'
];

const AutomationTimeline: React.FC<AutomationTimelineProps> = ({ rules }) => {
  const enabledRules = rules.filter(r => r.enabled);

  const timelineData = useMemo(() => {
    const grid: Record<string, Array<{ rule: AutomationRule; color: string }>> = {};
    
    DAYS.forEach(day => {
      HOURS.forEach(hour => {
        grid[`${day}-${hour}`] = [];
      });
    });

    enabledRules.forEach((rule, index) => {
      const color = COLORS[index % COLORS.length];
      const activeDays = rule.days_of_week || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      const timeWindows = rule.time_windows || [{ start: '09:00', end: '17:00' }];

      activeDays.forEach(day => {
        const dayIndex = DAY_MAP[day.toLowerCase()];
        if (dayIndex === undefined) return;
        const dayLabel = DAYS[dayIndex];

        timeWindows.forEach(window => {
          const startHour = parseInt(window.start.split(':')[0]);
          const endHour = parseInt(window.end.split(':')[0]);

          for (let h = startHour; h <= endHour; h++) {
            const key = `${dayLabel}-${h}`;
            if (grid[key] && !grid[key].some(r => r.rule.id === rule.id)) {
              grid[key].push({ rule, color });
            }
          }
        });
      });
    });

    return grid;
  }, [enabledRules]);

  const currentHour = new Date().getHours();
  const currentDayIndex = (new Date().getDay() + 6) % 7; // Monday = 0
  const currentDayLabel = DAYS[currentDayIndex];

  if (enabledRules.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No active automation rules to display</p>
          <p className="text-sm">Create and enable rules to see them on the timeline</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5" />
          Weekly Automation Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {enabledRules.map((rule, index) => (
            <Badge 
              key={rule.id} 
              variant="outline" 
              className={`${COLORS[index % COLORS.length]} text-white border-0`}
            >
              {rule.name}
            </Badge>
          ))}
        </div>

        {/* Timeline Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Hour headers */}
            <div className="flex">
              <div className="w-12 flex-shrink-0" />
              {HOURS.filter(h => h % 2 === 0).map(hour => (
                <div 
                  key={hour} 
                  className="flex-1 text-xs text-muted-foreground text-center min-w-[40px]"
                >
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day rows */}
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="flex items-center mt-1">
                <div className={`w-12 flex-shrink-0 text-xs font-medium ${
                  day === currentDayLabel ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {day}
                </div>
                <div className="flex-1 flex">
                  {HOURS.map(hour => {
                    const cellRules = timelineData[`${day}-${hour}`] || [];
                    const isCurrentCell = day === currentDayLabel && hour === currentHour;
                    
                    return (
                      <div
                        key={`${day}-${hour}`}
                        className={`h-6 flex-1 min-w-[20px] border-l border-border/30 relative group ${
                          isCurrentCell ? 'ring-2 ring-primary ring-inset' : ''
                        }`}
                        title={cellRules.map(r => r.rule.name).join(', ') || 'No rules'}
                      >
                        {cellRules.length > 0 && (
                          <div className="absolute inset-0 flex">
                            {cellRules.map((item, idx) => (
                              <div
                                key={item.rule.id}
                                className={`flex-1 ${item.color} opacity-70 hover:opacity-100 transition-opacity`}
                                style={{ 
                                  marginLeft: idx > 0 ? '1px' : 0,
                                }}
                              />
                            ))}
                          </div>
                        )}
                        {isCurrentCell && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Zap className="h-3 w-3 text-primary animate-pulse" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Time scale */}
            <div className="flex mt-1 border-t border-border/50 pt-1">
              <div className="w-12 flex-shrink-0" />
              <div className="flex-1 flex justify-between text-[10px] text-muted-foreground">
                <span>12 AM</span>
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>12 AM</span>
              </div>
            </div>
          </div>
        </div>

        {/* Current time indicator */}
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-primary" />
          <span>Current time: {new Date().toLocaleTimeString()} ({currentDayLabel})</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutomationTimeline;
