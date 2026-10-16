import { DestroyRef, DOCUMENT, ElementRef, inject } from '@angular/core';

// If focus is inside the destroyed component or lost to <body>, move it to `returnTo`, else to <main>.
export function restoreFocusOnDestroy(
  returnTo: Element | null = inject(DOCUMENT).activeElement,
): void {
  const document = inject(DOCUMENT);
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  inject(DestroyRef).onDestroy(() => {
    const active = document.activeElement;
    if (active && active !== document.body && !host.contains(active)) return;
    // An open modal makes the rest of the page inert, so close it before moving focus out.
    host.querySelectorAll('dialog').forEach((dialog) => dialog.close?.());
    for (const target of [returnTo, document.querySelector('main')]) {
      if (!(target instanceof HTMLElement) || !target.isConnected) continue;
      target.focus();
      if (document.activeElement === target) return;
    }
  });
}
