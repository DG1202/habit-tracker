export type HabitStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  totalCheckIns: number;
  checkedInToday: boolean;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  startDate: string;
  status: HabitStatus;
  startsInFuture: boolean;
  stats: HabitStats;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  provider: 'google' | 'github';
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
}

export interface HabitQuery {
  q: string;
  status: HabitStatus | '';
  today: 'done' | 'not_done' | '';
}

export interface HabitInput {
  name: string;
  description: string;
  startDate: string;
}

export interface MonthCheckIns {
  month: string;
  today: string;
  dates: string[];
}

export interface MilestoneMessage {
  type: 'milestone';
  id: string;
  habitId: string;
  habitName: string;
  milestone: number;
  currentStreak: number;
  sentAt: string;
}
