import { TestBed } from '@angular/core/testing';
import { StatsCardsComponent } from './stats-cards-component';

describe('StatsCardsComponent', () => {
  async function render({ landShare = 0.078 as number | null, visited = 6 } = {}) {
    const fixture = TestBed.createComponent(StatsCardsComponent);
    fixture.componentRef.setInput('stats', { totalCountries: 7, totalCities: 1234 });
    fixture.componentRef.setInput('countriesVisited', visited);
    fixture.componentRef.setInput('countriesTotal', 195);
    fixture.componentRef.setInput('landShare', landShare);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('shows the country and city counts', async () => {
    const el = await render();
    const cards = [...el.querySelectorAll('.card:not(.share)')].map((card) => [
      text(card.querySelector('.value')),
      text(card.querySelector('.label')),
    ]);

    expect(cards).toEqual([
      ['7', 'Countries'],
      ['1,234', 'Cities'],
    ]);
  });

  it('shows the share of the 195 countries visited, with a bar and the raw count', async () => {
    const el = await render({ visited: 6 });
    const card = el.querySelector('.countries');

    expect(text(card!.querySelector('.value'))).toBe('3.1%');
    expect(text(card!.querySelector('.label'))).toBe('of countries · 6 of 195');
    expect(card!.querySelector('mat-progress-bar')?.getAttribute('aria-valuenow')).toBe('3.1');
  });

  it('shows the land share as a percentage with a bar', async () => {
    const el = await render({ landShare: 0.0781 });
    const card = el.querySelector('.land');

    expect(text(card!.querySelector('.value'))).toBe('7.8%');
    expect(card!.querySelector('mat-progress-bar')?.getAttribute('aria-valuenow')).toBe('7.8');
  });

  it('shows a dash while the land share is unknown', async () => {
    const el = await render({ landShare: null });

    expect(text(el.querySelector('.land .value'))).toBe('–');
  });
});
