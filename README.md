# FarmGuard AI

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.15.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Crop Heat-Risk ML Integration

FarmGuard includes an AI-powered crop heat-risk assessment feature that uses machine learning to predict heat stress levels for crops.

### Architecture

The integration follows a secure proxy pattern:

```
Angular Application
       ↓
Supabase Edge Function (crop-heat-risk)
       ↓
External ML API (http://51.121.62.104/predict)
       ↓
ML Response
       ↓
Supabase Edge Function
       ↓
Angular Application
```

### Key Components

- **Angular Service**: `src/app/core/services/crop-heat-risk.service.ts`
  - Builds ML requests from crop, zone, farm, and weather data
  - Calls the Supabase Edge Function
  - Handles response mapping and error handling

- **Supabase Edge Function**: `supabase/functions/crop-heat-risk/index.ts`
  - Validates incoming requests (including growth_stage validation)
  - Proxies requests to the external ML API
  - Handles timeouts and network errors
  - Returns clean JSON responses to Angular
  - Configured with proper CORS headers

- **TypeScript Models**: `src/app/core/models/crop-heat-risk.model.ts`
  - Defines request/response interfaces matching the ML API contract

### Growth Stage Values

The ML model accepts only these exact growth stage values:
- `maturity`
- `planted`
- `reproductive`
- `vegetative`

### Weather Data Handling

FarmGuard currently does not have reliable GHI/DNI/DHI (solar radiation) values. The service uses documented placeholder values:
- GHI (Global Horizontal Irradiance): 850.0 W/m²
- DNI (Direct Normal Irradiance): 900.0 W/m²
- DHI (Diffuse Horizontal Irradiance): 150.0 W/m²

These are isolated in the `buildRequestFromCropData` method and should be replaced with actual weather data when available.

### ML API Contract

**Request** (POST to http://51.121.62.104/predict):
```json
{
  "hour": 14,
  "day_of_year": 210,
  "month": 7,
  "temperature_c": 35.0,
  "relative_humidity_percent": 70.0,
  "ghi_w_m2": 850.0,
  "dni_w_m2": 900.0,
  "dhi_w_m2": 150.0,
  "location": "Arkansas",
  "latitude": 37.5,
  "longitude": -77.5,
  "days_since_planting": 70,
  "growth_stage": "vegetative",
  "heat_index_approx": 45.0
}
```

**Response**:
```json
{
  "predictions": [
    {
      "heat_risk_class": "Low",
      "probabilities": {
        "Critical": 0.000003,
        "High": 0.00013,
        "Low": 0.9988,
        "Moderate": 0.00105
      }
    }
  ],
  "status": "success"
}
```

### Testing

The integration includes comprehensive unit tests in `src/app/core/services/crop-heat-risk.service.spec.ts`:
- Valid request handling
- Growth stage validation (all 4 valid stages)
- Invalid growth stage rejection
- Missing required values
- ML API failure handling
- Timeout/network failure handling
- Successful response mapping
- Probability mapping

Run the tests:
```bash
ng test --include='**/crop-heat-risk.service.spec.ts'
```

### Important Notes

- The ML server at `http://51.121.62.104/predict` is external and may have connectivity issues
- The Edge Function acts as a secure proxy, hiding the ML API details from the browser
- No direct calls to the ML API are made from the Angular application
- The integration is structured correctly and will work once the ML server is reachable from Supabase Edge Functions

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
