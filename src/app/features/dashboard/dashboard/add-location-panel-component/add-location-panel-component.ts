import { Component, inject, OnInit, model, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

// Material Imports
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import {TravelService} from '../../../../core/services/travel.service';

interface LocationFormStructure {
  countryMode: FormControl<'existing' | 'new'>;
  countryId: FormControl<string>;
  newCountryName: FormControl<string>;
  cityName: FormControl<string>;
}

@Component({
  selector: 'app-add-location-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSidenavModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule
  ],
  templateUrl: './add-location-panel-component.html',
  styleUrls: ['./add-location-panel-component.css']
})
export class AddLocationPanelComponent implements OnInit {
  // Services (Modern Inject token pattern)
  private travelService = inject(TravelService);

  private fb = inject(FormBuilder).nonNullable;
  private http = inject(HttpClient);

  // Components I/O Signals (v17/v18 primitive models)
  isOpen = model(false);
  locationAdded = output<void>();

  // State Management
  locationForm!: FormGroup<LocationFormStructure>;
  existingCountries: Array<{ id: string; name: string }> = [];
  isNewCountry = false;

  ngOnInit(): void {
    this.initForm();
    this.loadCountries();
  }

  private initForm(): void {
    this.locationForm = this.fb.group<LocationFormStructure>({
      countryMode: this.fb.control<'existing' | 'new'>('existing'),
      countryId: this.fb.control('', { validators: [Validators.required] }),
      newCountryName: this.fb.control(''),
      cityName: this.fb.control('', { validators: [Validators.required, Validators.minLength(2)] })
    });

    // React to form changes Reactively
    this.locationForm.controls.countryMode.valueChanges.subscribe(mode => {
      this.isNewCountry = mode === 'new';
      const { countryId, newCountryName } = this.locationForm.controls;

      if (this.isNewCountry) {
        newCountryName.setValidators([Validators.required, Validators.minLength(2)]);
        countryId.clearValidators();
      } else {
        countryId.setValidators([Validators.required]);
        newCountryName.clearValidators();
      }
      countryId.updateValueAndValidity();
      newCountryName.updateValueAndValidity();
    });
  }

  loadCountries(): void {
    this.http.get<Array<{ id: string; name: string }>>(`http/localhost:8080/api/countries`)
      .subscribe({
        next: (data) => this.existingCountries = data,
        error: (err) => console.error('Failed to resolve active country collection listings', err)
      });
  }

  onSubmit(): void {
    if (this.locationForm.invalid) return;

    const rawValues = this.locationForm.getRawValue();

    const payload = {
      name: rawValues.cityName,
      country: this.isNewCountry ? rawValues.newCountryName : null,
      latitude: 0.002,
      longitude: 0.002
    };

    this.http.post(`http://localhost:8080/api/cities`, payload).subscribe({
      next: () => {
        this.locationAdded.emit();
        this.onClose();
        this.locationForm.reset({ countryMode: 'existing' });
      },
      error: (err) => console.error('Data-state write collision error', err)
    });
  }

  onClose(): void {
    this.isOpen.set(false); // Mutates the state directly up to the parent component seamlessly
  }
}
