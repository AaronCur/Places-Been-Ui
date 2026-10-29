import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  function create(): ThemeService {
    const service = TestBed.inject(ThemeService);
    TestBed.tick(); // run the effect that writes data-theme
    return service;
  }

  it('follows the system by default and sets no data-theme', () => {
    const service = create();

    expect(service.preference()).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('cycles system → light → dark → system and mirrors it on <html>', () => {
    const service = create();

    service.cycle();
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(service.isDark()).toBe(false);

    service.cycle();
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(service.isDark()).toBe(true);

    service.cycle();
    TestBed.tick();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('remembers the choice for the next visit', () => {
    const service = create();
    service.preference.set('dark');
    TestBed.tick();

    TestBed.resetTestingModule();
    expect(create().preference()).toBe('dark');
  });
});
