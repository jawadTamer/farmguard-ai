# FarmGuard AI

FarmGuard AI is an AI-powered agricultural heat intelligence platform that analyzes temperature conditions across farms and translates them into actionable insights for both crops and livestock.

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution](#2-solution)
3. [Target Users](#3-target-users)
4. [MVP Features](#4-mvp-features)
5. [Tech Stack](#5-tech-stack)
6. [Project Structure](#6-project-structure)
7. [Architecture](#7-architecture)
8. [Setup Instructions](#8-setup-instructions)
9. [Environment Configuration](#9-environment-configuration)
10. [Development](#10-development)
11. [Deployment](#11-deployment)
12. [API Documentation](#12-api-documentation)
13. [Models & Data Structures](#13-models--data-structures)
14. [Edge Functions](#14-edge-functions)
15. [AI Integration](#15-ai-integration)

---

## 1. Problem Statement

Extreme temperatures can have a significant impact on agricultural productivity, affecting both crops and livestock. Farmers often have access to temperature and weather data, but raw temperature values do not clearly tell them how those conditions affect a specific crop, growth stage, or animal group.

A temperature of 40°C, for example, may create different levels of risk for a tomato crop during flowering compared with dairy cattle. Without converting environmental data into meaningful, farm-specific insights, farmers may react too late or make inefficient decisions about irrigation, spraying, livestock care, and resource usage.

FarmGuard AI addresses this gap by transforming temperature intelligence into clear, actionable recommendations for farmers.

---

## 2. Solution

FarmGuard AI integrates FortyGuard temperature intelligence with a farm-specific risk engine. Farmers can define their crops, growth stages, livestock, and farm zones. The system then analyzes current and forecasted temperature conditions to determine heat-stress risk.

Instead of simply showing:
- "Temperature: 41°C"

FarmGuard AI provides:
- "Tomato crop — High Heat Stress Risk."

And explains:
- Why the crop or livestock is at risk
- Which areas of the farm have higher risk
- When irrigation should be performed
- When spraying should be avoided
- What actions should be taken to protect livestock
- When the farmer should receive an alert
- How the risk is expected to change over the coming hours

The goal is to turn temperature data into decisions, helping farmers respond to heat before it causes significant damage.

---

## 3. Target Users

### 🌾 Crop Farmers
Farmers who grow temperature-sensitive crops and need better decisions about irrigation, spraying, and heat-stress management.

### 🐄 Livestock Farmers
Farmers managing cattle, sheep, goats, poultry, or other livestock that can be affected by extreme heat.

---

## 4. MVP Features

### A. Farm Management
Farmers can create and manage their farm profile:
- Farm name
- Location
- Farm zones
- Crop areas
- Livestock areas

### B. 🌡️ Temperature Intelligence
Use FortyGuard to retrieve temperature intelligence for the farm location:
- Current temperature
- Temperature trends
- Forecasted temperature
- Environmental conditions
- Heat-risk indicators

### C. 🗺️ Farm Heat Risk Map
Visualizes temperature conditions across different areas of the farm. Each zone receives a risk level:
- 🟢 Low
- 🟡 Moderate
- 🟠 High
- 🔴 Extreme

### D. 🌾 Crop Heat Intelligence
Farmers can register:
- Crop type
- Growth stage
- Farm zone

The system calculates a crop heat-risk level based on environmental conditions and crop requirements.

### E. 🐄 Livestock Heat Intelligence
Farmers can register livestock groups:
- Dairy cattle
- Sheep
- Goats
- Poultry

The system estimates heat-stress risk and provides practical recommendations.

### F. 🤖 AI Recommendations
The AI converts calculated risk and environmental data into easy-to-understand recommendations:
- 💧 Recommended irrigation period
- 🧴 Recommended spraying period
- 🐄 Livestock protection actions
- 🌳 Shade recommendations
- 💨 Ventilation recommendations
- ⚠️ Heat-risk explanations

### G. 🚨 Smart Alerts
The system alerts farmers when a predefined risk threshold is reached.

### H. 📈 Risk Forecast
The system provides an overview of how heat risk is expected to change over the next several hours.

---

## 5. Tech Stack

### Frontend
- **Angular 19** - Main web dashboard and farm management interface
- **Angular Material** - UI components
- **Bootstrap 5** - Styling framework
- **Leaflet** - Map visualization
- **Chart.js** - Data visualization
- **SweetAlert2** - Alert notifications

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Authentication
  - Edge Functions
  - Row Level Security (RLS)

### Database
- **PostgreSQL** - Stores:
  - Users
  - Farms
  - Farm zones
  - Crops
  - Livestock
  - Risk records
  - Alerts
  - Recommendations

### Temperature Intelligence
- **FortyGuard API** - Primary environmental data source:
  - Temperature intelligence
  - Heatmaps
  - Environmental parameters
  - Forecasted conditions

### AI
- **Gemini API** - Free-tier AI for generating natural-language explanations and recommendations
- **ML API** - Custom machine learning model for crop heat-risk prediction

### Maps
- **Leaflet + OpenStreetMap** - Farm visualization and heat-risk mapping

### Notifications
- **In-App Notifications** - Real-time alerts in the dashboard

### Development & Deployment
- **GitHub** - Version control
- **Git** - Version control system
- **Vercel** - Frontend hosting
- **Supabase** - Backend hosting

---

## 6. Project Structure

```
farmguard-ai/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/           # Data models and interfaces
│   │   │   │   ├── crop-heat-risk.model.ts
│   │   │   │   ├── farm.model.ts
│   │   │   │   ├── temperature.model.ts
│   │   │   │   └── ...
│   │   │   ├── providers/        # Data providers
│   │   │   │   └── fortyguard-temperature.provider.ts
│   │   │   ├── services/         # Angular services
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── crop-heat-risk.service.ts
│   │   │   │   ├── farm.service.ts
│   │   │   │   ├── livestock-heat-risk.service.ts
│   │   │   │   ├── temperature.service.ts
│   │   │   │   └── ...
│   │   │   └── guards/           # Route guards
│   │   ├── features/             # Feature modules
│   │   │   ├── auth/             # Authentication
│   │   │   ├── crops/            # Crop management
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── farms/            # Farm management
│   │   │   ├── heat-intelligence/ # Temperature intelligence
│   │   │   ├── livestock/        # Livestock management
│   │   │   ├── settings/         # User settings
│   │   │   └── zones/            # Zone management
│   │   ├── shared/               # Shared components
│   │   │   ├── components/
│   │   │   ├── directives/
│   │   │   └── pipes/
│   │   ├── environments/         # Environment configuration
│   │   │   ├── environment.ts
│   │   │   └── environment.development.ts
│   │   └── app.component.ts      # Root component
│   ├── assets/                   # Static assets
│   ├── index.html                # Main HTML file
│   ├── main.ts                   # Application entry point
│   └── styles.css                # Global styles
├── supabase/
│   ├── functions/               # Supabase Edge Functions
│   │   ├── ai-advisor/
│   │   │   └── index.ts
│   │   ├── crop-heat-risk/
│   │   │   └── index.ts
│   │   ├── fortyguard-proxy/
│   │   │   └── index.ts
│   │   └── livestock-heat-risk/
│   │       └── index.ts
│   └── migrations/              # Database migrations
├── models/                       # ML model files
├── public/                       # Public assets
├── angular.json                  # Angular configuration
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
├── vercel.json                   # Vercel deployment configuration
└── README.md                     # This file
```

---

## 7. Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Angular Frontend                        │
│  (Dashboard, Farm Management, Risk Assessment, Alerts)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP/REST
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Supabase Backend                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Database                      │   │
│  │  Users, Farms, Zones, Crops, Livestock, Risks       │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Edge Functions                           │   │
│  │  • fortyguard-proxy  (Temperature data)              │   │
│  │  • crop-heat-risk    (ML predictions)                │   │
│  │  • livestock-heat-risk (Livestock risk)              │   │
│  │  • ai-advisor        (AI recommendations)             │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐
│  FortyGuard  │ │   ML API    │ │  Gemini AI  │
│     API      │ │             │ │             │
│              │ │             │ │             │
│ Temperature  │ │ Crop Heat   │ │ Natural     │
│ Intelligence │ │ Risk Model  │ │ Language    │
└──────────────┘ └─────────────┘ └─────────────┘
```

### Data Flow

1. **Temperature Data Flow**
   ```
   Angular → Supabase Edge Function (fortyguard-proxy) → FortyGuard API
   ```

2. **Crop Heat Risk Flow**
   ```
   Angular → Supabase Edge Function (crop-heat-risk) → ML API → Angular
   ```

3. **Livestock Heat Risk Flow**
   ```
   Angular → Supabase Edge Function (livestock-heat-risk) → ML API → Angular
   ```

4. **AI Recommendations Flow**
   ```
   Angular → Supabase Edge Function (ai-advisor) → Gemini AI → Angular
   ```

---

## 8. Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git
- Supabase account
- FortyGuard API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jawadTamer/farmguard-ai.git
   cd farmguard-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Run the database migrations in `supabase/migrations/`
   - Configure Row Level Security (RLS) policies
   - Create the Edge Functions

4. **Configure environment variables**
   - Copy `src/environments/environment.development.ts` to `src/environments/environment.ts`
   - Add your Supabase URL and keys
   - Add your API keys for FortyGuard, ML API, and Gemini AI

5. **Deploy Edge Functions**
   ```bash
   cd supabase/functions
   # Deploy each function to Supabase
   ```

### Demo Credentials

Anyone who wants to try the application can use these demo credentials:

- **Email**: `fortyguard@gmail.com`
- **Password**: `fortyguard2026`

These credentials allow you to explore the application's features without creating an account.

---

## 9. Environment Configuration

### Environment Variables

Create `src/environments/environment.ts`:

```typescript
export const environment = {
  production: true,
  supabase: {
    url: 'https://your-project.supabase.co',
    key: 'your-anon-key'
  },
  fortyguard: {
    apiKey: 'your-fortyguard-api-key'
  },
  cropHeatRisk: {
    apiUrl: 'https://your-project.supabase.co/functions/v1/crop-heat-risk'
  },
  livestockHeatRisk: {
    apiUrl: 'https://your-project.supabase.co/functions/v1/livestock-heat-risk'
  },
  aiAdvisor: {
    apiUrl: 'https://your-project.supabase.co/functions/v1/ai-advisor'
  }
};
```

### Development Environment

Create `src/environments/environment.development.ts`:

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://your-dev-project.supabase.co',
    key: 'your-dev-anon-key'
  },
  fortyguard: {
    apiKey: 'your-dev-fortyguard-api-key'
  },
  cropHeatRisk: {
    apiUrl: 'https://your-dev-project.supabase.co/functions/v1/crop-heat-risk'
  },
  livestockHeatRisk: {
    apiUrl: 'https://your-dev-project.supabase.co/functions/v1/livestock-heat-risk'
  },
  aiAdvisor: {
    apiUrl: 'https://your-dev-project.supabase.co/functions/v1/ai-advisor'
  }
};
```

---

## 10. Development

### Start Development Server

```bash
ng serve
```

Navigate to `http://localhost:4200/`

### Build for Production

```bash
ng build --configuration production
```

### Run Tests

```bash
# Unit tests
ng test

# E2E tests
ng e2e

# Specific test file
ng test --include='**/crop-heat-risk.service.spec.ts'
```

### Generate Components

```bash
ng generate component component-name
ng generate service service-name
ng generate module module-name
```

---

## 11. Deployment

### Frontend Deployment (Vercel)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy to Vercel**
   ```bash
   vercel
   ```

3. **Configure Environment Variables**
   - Add all environment variables in Vercel dashboard

### Edge Functions Deployment

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```

3. **Deploy Functions**
   ```bash
   cd supabase/functions
   supabase functions deploy fortyguard-proxy
   supabase functions deploy crop-heat-risk
   supabase functions deploy livestock-heat-risk
   supabase functions deploy ai-advisor
   ```

---

## 12. API Documentation

### FortyGuard API

**Base URL**: Provided by FortyGuard

**Endpoints**:
- `/v1/heatmap` - Get temperature heatmap
- `/v1/env_params` - Get environmental parameters
- `/v1/status` - Check API status

### Supabase Edge Functions

#### fortyguard-proxy

**Purpose**: Proxy requests to FortyGuard API

**Endpoint**: `/functions/v1/fortyguard-proxy`

**Actions**:
- `current-submit` - Submit current temperature request
- `current-status` - Check current temperature status
- `temperature-trend-submit` - Submit temperature trend request
- `temperature-trend-status` - Check temperature trend status

#### crop-heat-risk

**Purpose**: Calculate crop heat risk using ML model

**Endpoint**: `/functions/v1/crop-heat-risk`

**Request**:
```json
{
  "crop_type": "tomato",
  "growth_stage": "flowering",
  "temperature_c": 35.0,
  "relative_humidity_percent": 70.0,
  "latitude": 37.5,
  "longitude": -77.5
}
```

**Response**:
```json
{
  "predictions": [
    {
      "heat_risk_class": "High",
      "probabilities": {
        "Critical": 0.1,
        "High": 0.6,
        "Low": 0.2,
        "Moderate": 0.1
      }
    }
  ]
}
```

#### livestock-heat-risk

**Purpose**: Calculate livestock heat risk

**Endpoint**: `/functions/v1/livestock-heat-risk`

**Request**:
```json
{
  "livestock_type": "dairy_cattle",
  "temperature_c": 35.0,
  "relative_humidity_percent": 70.0
}
```

**Response**:
```json
{
  "predictions": [
    {
      "heat_risk_class": "High",
      "thi": 85,
      "hli": 78
    }
  ]
}
```

#### ai-advisor

**Purpose**: Generate AI-powered recommendations

**Endpoint**: `/functions/v1/ai-advisor`

**Request**:
```json
{
  "context": "High heat risk for tomato crop",
  "temperature": 35.0,
  "crop_type": "tomato",
  "growth_stage": "flowering"
}
```

**Response**:
```json
{
  "recommendation": "Irrigate during evening hours to reduce heat stress...",
  "actions": [
    "Increase irrigation",
    "Provide shade",
    "Monitor for wilting"
  ]
}
```

---

## 13. Models & Data Structures

### Farm Model

```typescript
interface Farm {
  id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Zone Model

```typescript
interface Zone {
  id: string;
  farmId: string;
  name: string;
  type: 'crop' | 'livestock';
  latitude: number;
  longitude: number;
  area: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Crop Model

```typescript
interface Crop {
  id: string;
  zoneId: string;
  cropType: string;
  growthStage: string;
  plantingDate: Date;
  expectedHarvestDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Livestock Model

```typescript
interface Livestock {
  id: string;
  zoneId: string;
  livestockType: string;
  count: number;
  breed?: string;
  age?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Temperature Model

```typescript
interface TemperatureReading {
  id: string;
  farmId: string;
  zoneId?: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  recordedAt: Date;
  diagnostics?: TemperatureDiagnostics;
}

interface TemperatureDiagnostics {
  heatmapStatus: 'pending' | 'completed' | 'failed';
  temperatureExtractionStatus: 'pending' | 'completed' | 'failed';
  environmentalDataStatus: 'pending' | 'completed' | 'failed';
  heatmapCells?: number;
  lastRecordedAt?: string;
}
```

### Heat Risk Model

```typescript
interface HeatRisk {
  id: string;
  farmId: string;
  zoneId: string;
  entityType: 'crop' | 'livestock';
  entityId: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  temperature: number;
  humidity: number;
  heatIndex?: number;
  thi?: number; // Temperature Humidity Index
  hli?: number; // Heat Load Index
  calculatedAt: Date;
  expiresAt: Date;
}
```

### Alert Model

```typescript
interface Alert {
  id: string;
  farmId: string;
  zoneId: string;
  entityType: 'crop' | 'livestock';
  entityId: string;
  alertType: 'heat_risk' | 'temperature_extreme' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  recommendedActions: string[];
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}
```

---

## 14. Edge Functions

### fortyguard-proxy

**Location**: `supabase/functions/fortyguard-proxy/index.ts`

**Features**:
- Proxy requests to FortyGuard API
- Handle authentication with FortyGuard API key
- Retry logic with exponential backoff
- Timeout handling
- Error logging and reporting

**Circuit Breaker**:
- Opens after 3 consecutive failures
- Stays open for 5 minutes
- Prevents API hammering during outages

**Retry Logic**:
- Up to 3 retries on 5xx errors
- Exponential backoff (1s, 2s, 4s)
- No retry on 4xx client errors

### crop-heat-risk

**Location**: `supabase/functions/crop-heat-risk/index.ts`

**Features**:
- Validate growth stage values (maturity, planted, reproductive, vegetative)
- Build ML request from crop data
- Proxy to external ML API
- Handle timeouts and network errors
- Map ML response to application format

**Growth Stage Validation**:
Only accepts: `maturity`, `planted`, `reproductive`, `vegetative`

### livestock-heat-risk

**Location**: `supabase/functions/livestock-heat-risk/index.ts`

**Features**:
- Calculate Temperature Humidity Index (THI)
- Calculate Heat Load Index (HLI)
- Determine heat risk level
- Provide livestock-specific recommendations

### ai-advisor

**Location**: `supabase/functions/ai-advisor/index.ts`

**Features**:
- Generate natural language recommendations
- Explain risk factors
- Suggest actionable steps
- Use Gemini AI for intelligent responses

---

## 15. AI Integration

### Crop Heat Risk ML Model

**API Endpoint**: `http://51.121.62.104/predict`

**Request Parameters**:
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

**Risk Classes**:
- Low (0-25% probability)
- Moderate (25-50% probability)
- High (50-75% probability)
- Critical (75-100% probability)

### Livestock Heat Risk ML Model

**API Endpoint**: `http://51.121.62.104/livestock-predict`

**Request Parameters**:
```json
{
  "hour": 14,
  "day_of_year": 210,
  "month": 7,
  "temperature_c": 35.0,
  "relative_humidity_percent": 70.0,
  "wind_speed_m_s": 2.5,
  "solar_radiation_w_m2": 850.0,
  "location": "Arkansas",
  "latitude": 37.5,
  "longitude": -77.5,
  "livestock_type": "dairy_cattle",
  "breed": "holstein",
  "age_years": 4,
  "production_stage": "lactating",
  "body_condition_score": 3.0,
  "heat_index_approx": 45.0
}
```

**Response**:
```json
{
  "predictions": [
    {
      "heat_risk_class": "High",
      "probabilities": {
        "Critical": 0.15,
        "High": 0.55,
        "Low": 0.20,
        "Moderate": 0.10
      },
      "thi": 85,
      "hli": 78,
      "respiratory_rate_predicted": 85,
      "milk_production_impact_percent": -15
    }
  ],
  "status": "success"
}
```

**Risk Classes**:
- Low (THI < 72)
- Moderate (THI 72-79)
- High (THI 79-88)
- Critical (THI > 88)

**Key Metrics**:
- **THI (Temperature Humidity Index)**: Measures combined effect of temperature and humidity
- **HLI (Heat Load Index)**: Accounts for solar radiation and wind speed
- **Respiratory Rate**: Predicted breaths per minute under current conditions
- **Milk Production Impact**: Expected percentage change in milk yield

**Livestock Types Supported**:
- Dairy cattle
- Beef cattle
- Sheep
- Goats
- Poultry
- Swine

### Gemini AI Integration

**Purpose**: Generate natural language explanations and recommendations

**Use Cases**:
- Explain why a crop is at risk
- Suggest irrigation timing
- Recommend livestock protection measures
- Provide heat-stress mitigation strategies

---

## 16. User Journey

### Step 1 — Create Farm
The farmer opens FarmGuard AI and creates a farm profile:
- Farm Name
- Location
- Farm Zones

### Step 2 — Add Crops & Livestock
The farmer defines what exists on the farm:
- Zone A: 🌾 Tomatoes (Growth Stage: Flowering)
- Zone B: 🐄 Dairy Cattle (Animals: 120)

### Step 3 — Get Environmental Intelligence
FarmGuard AI retrieves temperature and environmental data through FortyGuard.

### Step 4 — Analyze Risk
The system combines:
- Temperature
- Environmental Conditions
- Crop
- Growth Stage
- Livestock Type

To calculate heat stress scores for each entity.

### Step 5 — View the Farm Heat Map
The farmer opens the dashboard and immediately sees which areas are safe and which require attention.

### Step 6 — Receive AI Recommendations
The system explains the situation in simple language with actionable recommendations.

### Step 7 — Take Action
The farmer uses the recommendations to make decisions about irrigation, spraying, livestock care, etc.

### Step 8 — Receive Alerts
If the risk becomes critical, FarmGuard AI sends an alert via Telegram or in-app notification.

---

## 17. Troubleshooting

### Common Issues

**Issue**: 404 errors on Vercel deployment
- **Solution**: Ensure `vercel.json` has correct `outputDirectory` and Vercel project settings match

**Issue**: FortyGuard API timeouts
- **Solution**: Circuit breaker and retry logic are implemented. Check API status and fallback to cached data

**Issue**: ML API connectivity
- **Solution**: Edge Function handles timeouts. Check if ML server is reachable from Supabase

**Issue**: Authentication errors
- **Solution**: Verify Supabase keys and RLS policies are correctly configured

---

## 18. Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 19. License

Copyright © 2024 Ur fav duo

This project is licensed under the MIT License - see the LICENSE file for details.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 20. Contact

For questions or support, please contact the project maintainers.

---

## 21. Additional Resources

- [Angular Documentation](https://angular.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [FortyGuard API Documentation](https://fortyguard.com/docs)
- [Leaflet Documentation](https://leafletjs.com)
- [Vercel Documentation](https://vercel.com/docs)
