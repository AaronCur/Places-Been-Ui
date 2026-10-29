import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FlagComponent } from './flag.component';

@Component({
  imports: [FlagComponent],
  template: `<app-flag [code]="code()" [name]="name()" [size]="size()" />`,
})
class Host {
  code = signal('DE');
  name = signal<string | undefined>(undefined);
  size = signal(40);
}

describe('FlagComponent', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const flag = fixture.nativeElement.querySelector('app-flag') as HTMLElement;
    return { fixture, flag, img: () => flag.querySelector('img') };
  }

  it('shows the round flag image for the code at the requested size', async () => {
    const { flag, img } = await render();

    expect(img()?.getAttribute('src')).toBe('flags/de.svg');
    expect(img()?.getAttribute('alt')).toBe('');
    expect(flag.style.getPropertyValue('--flag-size')).toBe('40px');
  });

  it('falls back to the ISO code when there is no flag file, and retries for a new code', async () => {
    const { fixture, flag, img } = await render();

    img()!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(img()).toBeNull();
    expect(flag.textContent?.trim()).toBe('DE');

    fixture.componentInstance.code.set('FR');
    await fixture.whenStable();
    expect(img()?.getAttribute('src')).toBe('flags/fr.svg');
  });

  it('is decorative when the country name is shown next to it', async () => {
    const { flag } = await render();

    expect(flag.getAttribute('aria-hidden')).toBe('true');
    expect(flag.hasAttribute('role')).toBe(false);
  });

  it('becomes an image with an accessible name when given one', async () => {
    const { fixture, flag } = await render();

    fixture.componentInstance.name.set('Germany');
    fixture.componentInstance.size.set(28);
    await fixture.whenStable();

    expect(flag.getAttribute('role')).toBe('img');
    expect(flag.getAttribute('aria-label')).toBe('Germany');
    expect(flag.hasAttribute('aria-hidden')).toBe(false);
    expect(flag.style.getPropertyValue('--flag-size')).toBe('28px');
  });
});
