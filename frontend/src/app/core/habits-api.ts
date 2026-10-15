import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Habit, HabitInput, HabitQuery, HabitStatus, MonthCheckIns } from './models';

@Injectable({ providedIn: 'root' })
export class HabitsApi {
  private readonly http = inject(HttpClient);

  list(query: HabitQuery): Observable<Habit[]> {
    let params = new HttpParams();
    if (query.q.trim()) params = params.set('q', query.q.trim());
    if (query.status) params = params.set('status', query.status);
    if (query.today) params = params.set('today', query.today);
    return this.http.get<Habit[]>('/api/habits', { params });
  }

  get(id: string): Observable<Habit> {
    return this.http.get<Habit>(`/api/habits/${encodeURIComponent(id)}`);
  }

  create(input: HabitInput): Observable<Habit> {
    return this.http.post<Habit>('/api/habits', input);
  }

  update(id: string, patch: Partial<HabitInput> & { status?: HabitStatus }): Observable<Habit> {
    return this.http.patch<Habit>(`/api/habits/${encodeURIComponent(id)}`, patch);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/habits/${encodeURIComponent(id)}`);
  }

  checkIn(id: string): Observable<Habit> {
    return this.http.post<Habit>(`/api/habits/${encodeURIComponent(id)}/check-ins`, {});
  }

  undoCheckIn(id: string): Observable<Habit> {
    return this.http.delete<Habit>(`/api/habits/${encodeURIComponent(id)}/check-ins/today`);
  }

  month(id: string): Observable<MonthCheckIns> {
    return this.http.get<MonthCheckIns>(`/api/habits/${encodeURIComponent(id)}/check-ins`);
  }
}
