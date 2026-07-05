# NOTE: This script is no longer used by the pipeline.
# Classification is now handled by zero-shot inference in
# app/services/ml_classifier_service.py (cross-encoder/nli-MiniLM2-L6-H768).
# This file is kept for reference only.

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


# Training dataset (kept for reference)
TRAINING_DATA = [
    ("Invoice No 123 Vendor Amazon Total Amount", "invoice"),
    ("Bill Payment Due Amount GST", "invoice"),
    ("Bank Statement Account Balance Credit Debit", "bank_statement"),
    ("Transaction History IFSC Account Number", "bank_statement"),
    ("Employment Offer Letter Salary Joining Date", "offer_letter"),
    ("Congratulations you are selected Position Role", "offer_letter"),
]


def train():
    texts = [t[0] for t in TRAINING_DATA]
    labels = [t[1] for t in TRAINING_DATA]

    vectorizer = TfidfVectorizer()
    X = vectorizer.fit_transform(texts)

    model = LogisticRegression()
    model.fit(X, labels)

    joblib.dump(model, "app/ml/model.joblib")
    joblib.dump(vectorizer, "app/ml/vectorizer.joblib")

    print("✅ Model trained and saved")


if __name__ == "__main__":
    train()