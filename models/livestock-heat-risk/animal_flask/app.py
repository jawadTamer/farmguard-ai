import os
import logging
import joblib
import pandas as pd
import numpy as np

from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


#! MODEL PATHS

MODEL_DIR = os.environ.get(
    "MODEL_DIR", os.path.join(os.path.dirname(__file__), "model")
)

MODEL_PATH = os.path.join(MODEL_DIR, "animal_heat_risk_model.pkl")

SCALER_PATH = os.path.join(MODEL_DIR, "feature_scaler.pkl")

FEATURE_COLUMNS_PATH = os.path.join(MODEL_DIR, "feature_columns.pkl")

LABEL_ENCODERS_PATH = os.path.join(MODEL_DIR, "label_encoders.pkl")

TARGET_ENCODER_PATH = os.path.join(MODEL_DIR, "target_encoder.pkl")


#! GLOBAL MODEL OBJECTS

model = None
scaler = None
feature_columns = None
label_encoders = None
target_encoder = None


#! MODEL FEATURES


CATEGORICAL_FEATURES = ["species", "breed", "sex", "physiological_stage"]

NUMERICAL_FEATURES = [
    "age_years",
    "weight_kg",
    "latitude",
    "longitude",
    "temperature_c",
    "humidity_percent",
    "thi",
    "hli",
]


#! Fields required from API request
REQUIRED_FIELDS = [
    "species",
    "breed",
    "sex",
    "physiological_stage",
    "age_years",
    "weight_kg",
    "latitude",
    "longitude",
    "temperature_c",
    "humidity_percent",
]


#! LOAD MODEL ARTIFACTS


def load_artifacts():

    global model
    global scaler
    global feature_columns
    global label_encoders
    global target_encoder

    try:

        model = joblib.load(MODEL_PATH)

        scaler = joblib.load(SCALER_PATH)

        feature_columns = joblib.load(FEATURE_COLUMNS_PATH)

        label_encoders = joblib.load(LABEL_ENCODERS_PATH)

        target_encoder = joblib.load(TARGET_ENCODER_PATH)

        logger.info("Model artifacts loaded successfully")

        logger.info("Model features: %s", feature_columns)

        logger.info("Categorical encoders: %s", list(label_encoders.keys()))

        logger.info("Target classes: %s", list(target_encoder.classes_))

    except FileNotFoundError as e:

        logger.error("Model artifact not found: %s", e)

        raise

    except Exception as e:

        logger.error("Error loading model artifacts: %s", e)

        raise


load_artifacts()


#! THI CALCULATION


def calculate_thi(temperature_c, humidity_percent):
    """
    Calculate Temperature Humidity Index (THI).

    Formula:

    THI = (1.8 × T + 32)
          - ((0.55 - 0.0055 × RH)
          × (1.8 × T - 26))
    """

    thi = (1.8 * temperature_c + 32) - (
        (0.55 - 0.0055 * humidity_percent) * (1.8 * temperature_c - 26)
    )

    return float(thi)


#! HLI CALCULATION


def calculate_hli(temperature_c, humidity_percent):
    """
    Simplified Heat Load Index.

    IMPORTANT:
    This formula MUST match the formula
    used when creating the training dataset.

    This implementation creates a heat-load
    feature using temperature and humidity.
    """

    hli = temperature_c + (0.33 * humidity_percent / 100)

    return float(hli)


#! VALIDATE CATEGORIES


def validate_categories(df):

    for col, encoder in label_encoders.items():

        if col not in df.columns:

            raise ValueError(f"Missing categorical field: '{col}'")

        values = df[col].astype(str)

        known_categories = set(encoder.classes_)

        unseen_categories = set(values) - known_categories

        if unseen_categories:

            raise ValueError(
                f"Unseen categories for '{col}': "
                f"{sorted(unseen_categories)}. "
                f"Known values: "
                f"{sorted(known_categories)}"
            )


#! PREPROCESS DATA


def preprocess(records):

    df = pd.DataFrame(records)

    missing_fields = [field for field in REQUIRED_FIELDS if field not in df.columns]

    if missing_fields:

        raise ValueError(f"Missing required fields: " f"{missing_fields}")

    raw_numeric_fields = [
        "age_years",
        "weight_kg",
        "latitude",
        "longitude",
        "temperature_c",
        "humidity_percent",
    ]

    for col in raw_numeric_fields:

        df[col] = pd.to_numeric(df[col], errors="raise")

    if df["humidity_percent"].lt(0).any():

        raise ValueError("humidity_percent cannot be below 0")

    if df["humidity_percent"].gt(100).any():

        raise ValueError("humidity_percent cannot be greater than 100")

    if df["age_years"].lt(0).any():

        raise ValueError("age_years cannot be negative")

    if df["weight_kg"].le(0).any():

        raise ValueError("weight_kg must be greater than 0")

    df["thi"] = df.apply(
        lambda row: calculate_thi(row["temperature_c"], row["humidity_percent"]), axis=1
    )

    df["hli"] = df.apply(
        lambda row: calculate_hli(row["temperature_c"], row["humidity_percent"]), axis=1
    )

    validate_categories(df)

    for col, encoder in label_encoders.items():

        df[col + "_encoded"] = encoder.transform(df[col].astype(str))

    X = df[feature_columns].copy()

    for col in NUMERICAL_FEATURES:

        X[col] = pd.to_numeric(X[col], errors="raise")

    X_scaled = X.copy()

    X_scaled[NUMERICAL_FEATURES] = scaler.transform(X[NUMERICAL_FEATURES])

    return X_scaled, df


@app.route("/", methods=["GET"])
def home():

    return jsonify(
        {
            "service": "FarmGuard Animal Heat Risk API",
            "status": "running",
            "endpoints": {"health": "/health", "predict": "/predict"},
        }
    )


@app.route("/health", methods=["GET"])
def health():

    if model is None:

        return jsonify({"status": "model_not_loaded"}), 503

    return (
        jsonify(
            {
                "status": "ok",
                "model": "animal_heat_risk_model",
                "classes": list(target_encoder.classes_),
            }
        ),
        200,
    )


@app.route("/predict", methods=["POST"])
def predict():

    if model is None:

        return jsonify({"error": "Model not loaded"}), 503

    payload = request.get_json(silent=True)

    if payload is None:

        return jsonify({"error": ("Request body must contain " "valid JSON")}), 400

    if "records" in payload:

        records = payload["records"]

        if not isinstance(records, list):

            return jsonify({"error": ("'records' must be " "a list")}), 400

        if len(records) == 0:

            return jsonify({"error": ("'records' cannot " "be empty")}), 400

    else:

        records = [payload]

    try:

        X, processed_df = preprocess(records)

        #! Predict encoded class
        predictions_encoded = model.predict(X)

        #! Predict probabilities
        probabilities = model.predict_proba(X)

        #! Convert encoded predictions
        predictions = target_encoder.inverse_transform(predictions_encoded)

        results = []

        for i, prediction in enumerate(predictions):

            probability_dict = {
                str(class_name): float(probability)
                for class_name, probability in zip(
                    target_encoder.classes_, probabilities[i]
                )
            }

            result = {
                "risk_level": str(prediction),
                "probabilities": probability_dict,
                "calculated_features": {
                    "thi": round(float(processed_df.iloc[i]["thi"]), 2),
                    "hli": round(float(processed_df.iloc[i]["hli"]), 2),
                },
            }

            results.append(result)

        return jsonify({"status": "success", "predictions": results}), 200

    except ValueError as e:

        logger.warning("Validation error: %s", e)

        return jsonify({"status": "error", "error": str(e)}), 400

    except Exception as e:

        logger.exception("Prediction failed")

        return (
            jsonify(
                {
                    "status": "error",
                    "error": ("Internal error during " "prediction"),
                    "detail": str(e),
                }
            ),
            500,
        )


if __name__ == "__main__":

    app.run(host="0.0.0.0", port=5000, debug=False)
