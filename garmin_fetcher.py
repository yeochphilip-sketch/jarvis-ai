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
        print("Error: Set GARMIN_EMAIL and GARMIN_PASSWORD environment variables")
        exit(1)
    
    client = Garmin(EMAIL, PASSWORD)
    client.login()
    
    today = datetime.now().strftime("%Y-%m-%d")
    
    data = {
        "date": today,
        "sleep": client.get_sleep_data(today),
        "body_battery": client.get_body_battery(today),
        "stress": client.get_stress_data(today),
        "resting_hr": client.get_resting_heart_rate(today),
        "activities": client.get_activities(0, 1),
        "training_status": client.get_training_status(),
    }
    
    os.makedirs("data/health", exist_ok=True)
    with open(f"data/health/{today}.json", "w") as f:
        json.dump(data, f, indent=2, default=str)
    
    print(f"Health data saved for {today}")
    return data

if __name__ == "__main__":
    fetch_today()
