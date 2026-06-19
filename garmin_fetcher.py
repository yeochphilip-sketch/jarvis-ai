#!/usr/bin/env python3
"""Fetch daily health data from Garmin Connect."""

import json
import os
from datetime import datetime
from garminconnect import Garmin

EMAIL = os.getenv("GARMIN_EMAIL")
PASSWORD = os.getenv("GARMIN_PASSWORD")

def fetch_today():
    if not EMAIL or not PASSWORD:
        print("Error: Set GARMIN_EMAIL and GARMIN_PASSWORD")
        exit(1)
    
    client = Garmin(EMAIL, PASSWORD)
    client.login()
    
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Fetch data with available methods
    data = {
        "date": today,
        "sleep": client.get_sleep_data(today),
        "activities": client.get_activities(0, 1),
    }
    
    # Try to get stats from user summary
    try:
        summary = client.get_user_summary(today)
        if summary:
            data["resting_hr"] = summary.get("restingHeartRate")
            data["body_battery"] = summary.get("bodyBattery")
            data["stress"] = summary.get("averageStressLevel")
    except Exception as e:
        print(f"Warning: user summary failed: {e}")
    
    # Try training status
    try:
        data["training_status"] = client.get_training_status(today)
    except Exception as e:
        print(f"Warning: training status failed: {e}")
    # In garmin_fetcher.py
    try:
        hrv = client.get_hrv_data(today)
        data["hrv"] = hrv
    except:
        pass
    os.makedirs("data/health", exist_ok=True)
    with open(f"data/health/{today}.json", "w") as f:
        json.dump(data, f, indent=2, default=str)
    
    print(f"Health data saved for {today}")
    return data

if __name__ == "__main__":
    fetch_today()
