import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { App } from './app';

describe('App', () => {
  it('renders the router outlet', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SwUpdate, useValue: { isEnabled: false, versionUpdates: new Subject() } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
