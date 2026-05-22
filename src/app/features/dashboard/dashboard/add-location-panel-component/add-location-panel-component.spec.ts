import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddLocationPanelComponent } from './add-location-panel-component';

describe('AddLocationPanelComponent', () => {
  let component: AddLocationPanelComponent;
  let fixture: ComponentFixture<AddLocationPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddLocationPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AddLocationPanelComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
