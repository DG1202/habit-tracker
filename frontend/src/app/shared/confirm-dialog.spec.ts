import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let fixture: ComponentFixture<ConfirmDialog>;
  let cancelled: ReturnType<typeof vi.fn<() => void>>;
  const dialog = () => (fixture.nativeElement as HTMLElement).querySelector('dialog')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ConfirmDialog] });
    fixture = TestBed.createComponent(ConfirmDialog);
    fixture.componentRef.setInput('title', 'Delete habit?');
    fixture.componentRef.setInput('message', 'This cannot be undone.');
    cancelled = vi.fn<() => void>();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    await fixture.whenStable();
  });

  it('cancels on a backdrop click', () => {
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('does not cancel on a click inside the dialog body', () => {
    dialog().querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('cancels on Esc', () => {
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});
