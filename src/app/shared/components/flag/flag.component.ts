import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';

// Round country flag by ISO code (design: round SVG flags, since flag emoji don't render on Windows).
// The square 1x1 SVGs from flag-icons are copied to /flags at build time (angular.json assets), so only the
// flags on screen are downloaded. A code without a flag file falls back to a badge with the code itself.
@Component({
  selector: 'app-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (failed()) {
      {{ code() }}
    } @else {
      <img [src]="src()" alt="" loading="lazy" decoding="async" (error)="failed.set(true)" />
    }
  `,
  host: {
    '[attr.role]': 'name() ? "img" : null',
    '[attr.aria-label]': 'name()',
    '[attr.aria-hidden]': 'name() ? null : "true"',
    '[style.--flag-size.px]': 'size()',
    '[style.font-size.px]': 'fontSize()',
  },
  styles: `
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: var(--flag-size);
      height: var(--flag-size);
      border-radius: 50%;
      overflow: hidden;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font-weight: 500;
      letter-spacing: 0.5px;
      user-select: none;
    }

    /* A hairline ring over the image keeps white-edged flags (Japan, Poland) visible on light surfaces */
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
      pointer-events: none;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  `,
})
export class FlagComponent {
  /** ISO 3166-1 alpha-2 code, e.g. "DE" */
  readonly code = input.required<string>();
  /** Accessible name (the country); leave empty when the name is already shown next to the flag */
  readonly name = input<string>();
  readonly size = input(40);

  protected readonly src = computed(() => `flags/${this.code().toLowerCase()}.svg`);
  protected readonly fontSize = computed(() => Math.round(this.size() * 0.36));
  // Set when the image fails to load; starts again as false whenever the code changes
  protected readonly failed = linkedSignal({ source: this.code, computation: () => false });
}
