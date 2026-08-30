"""
Heat Risk Classification API
Flask API serving the trained XGBoost heat-risk model.
"""

import os
import logging

import joblib
import pandas as pd

from flask import Flask, request, jsonify

#! LOGGING

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


#! FLASK APP

app = Flask(__name__)


#! CONFIG

MODEL_DIR = os.environ.get(
    "MODEL_DIR", os.path.join(os.path.dirname(__file__), "model")
)

MODEL_PATH = os.path.join(MODEL_DIR, "heat_risk_model.pkl")

FEATURE_COLUMNS_PATH = os.path.join(MODEL_DIR, "feature_columns.pkl")

LABEL_ENCODERS_PATH = os.path.join(MODEL_DIR, "label_encoders.pkl")

TARGET_ENCODER_PATH = os.path.join(MODEL_DIR, "target_encoder.pkl")


# LOAD MODEL ARTIFACTS

model = None
feature_columns = None
label_encoders = None
target_encoder = None


def load_artifacts():

    global model
    global feature_columns
    global label_encoders
    global target_encoder

    try:

        model = joblib.load(MODEL_PATH)

        feature_columns = joblib.load(FEATURE_COLUMNS_PATH)

        label_encoders = joblib.load(LABEL_ENCODERS_PATH)

        target_encoder = joblib.load(TARGET_ENCODER_PATH)

        logger.info("Model artifacts loaded successfully from %s", MODEL_DIR)

        logger.info("Model features: %s", feature_columns)

        logger.info("Categorical encoders: %s", list(label_encoders.keys()))

    except FileNotFoundError as e:

        logger.error("Could not find model artifact: %s", e)

        raise

    except Exception as e:

        logger.error("Error loading model artifacts: %s", e)

        raise


#! Load once when API starts
load_artifacts()


#! REQUIRED RAW INPUT FIELDS

REQUIRED_FIELDS = [
    "hour",
    "day_of_year",
    "month",
    "temperature_c",
    "relative_humidity_percent",
    "ghi_w_m2",
    "dni_w_m2",
    "dhi_w_m2",
    "location",
    "latitude",
    "longitude",
    "days_since_planting",
    "growth_stage",
    "heat_index_approx",
]


#! PREPROCESS FUNCTION


def preprocess(records):

    # Convert JSON records to DataFrame
    df = pd.DataFrame(records)

    # CHECK REQUIRED FIELDS

    missing = [field for field in REQUIRED_FIELDS if field not in df.columns]

    if missing:

        raise ValueError(f"Missing required fields: {missing}")

    # ENCODE CATEGORICAL FEATURES

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

        # Create encoded column
        df[col + "_encoded"] = encoder.transform(values)

    # BUILD FEATURES
    # EXACT SAME ORDER AS TRAINING

    X = df[feature_columns].copy()

    # ENSURE NUMERIC VALUES

    for col in X.columns:

        X[col] = pd.to_numeric(X[col], errors="raise")

    # CHECK MISSING VALUES

    if X.isnull().any().any():

        missing_values = X.isnull().sum()

        missing_values = missing_values[missing_values > 0].to_dict()

        raise ValueError(f"Missing values in features: " f"{missing_values}")

    return X


#! HEALTH CHECK


@app.route("/health", methods=["GET"])
def health():

    if model is None:

        return jsonify({"status": "model_not_loaded"}), 503

    return (
        jsonify({"status": "ok", "model_loaded": True, "features": feature_columns}),
        200,
    )


#! PREDICTION ENDPOINT


@app.route("/predict", methods=["POST"])
def predict():

    # CHECK MODEL

    if model is None:

        return jsonify({"error": "Model not loaded"}), 503

    # GET JSON

    payload = request.get_json(silent=True)

    if payload is None:

        return jsonify({"error": "Request body must be valid JSON"}), 400

    # HANDLE MULTIPLE RECORDS

    if "records" in payload:

        records = payload["records"]

        if not isinstance(records, list) or not records:

            return jsonify({"error": "'records' must be a non-empty list"}), 400

    else:

        records = [payload]

    # PREDICTION

    try:

        # Preprocess data
        X = preprocess(records)

        # Predict encoded classes
        preds_encoded = model.predict(X)

        # Convert back to class names
        preds = target_encoder.inverse_transform(preds_encoded.astype(int))

        # Prediction probabilities
        probabilities = model.predict_proba(X)

        # Class names
        classes = target_encoder.classes_

        results = []

        for i, prediction in enumerate(preds):

            class_probabilities = {
                str(class_name): float(probability)
                for class_name, probability in zip(classes, probabilities[i])
            }

            results.append(
                {
                    "heat_risk_class": str(prediction),
                    "probabilities": class_probabilities,
                }
            )

        return jsonify({"status": "success", "predictions": results}), 200

    # VALIDATION ERROR

    except ValueError as e:

        logger.warning("Validation error: %s", e)

        return jsonify({"status": "error", "error": str(e)}), 400

    # INTERNAL ERROR

    except Exception as e:

        logger.exception("Prediction failed")

        return (
            jsonify({"status": "error", "error": "Internal error during prediction"}),
            500,
        )


#! RUN APP


if __name__ == "__main__":

    app.run(host="0.0.0.0", port=5000, debug=False)
